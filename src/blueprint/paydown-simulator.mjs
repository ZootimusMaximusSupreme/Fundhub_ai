// Paydown simulator — split cash across cards; show approval before/after.
//
// Uses UnderwriteIQ numbers already on the latest pull. Does not run a second
// engine; partial paydown interpolates between preapproval_now and
// preapproval_after from the stored tier output.

import {
  rankedRevolving,
  paydownAmt,
  openRevolving,
  paydownCards
} from "../deliverables/derive.mjs";
import {
  buildBlackReportClient,
  hasBlackReportSource,
  mergeStoredUnderwrite
} from "../underwrite/black-report-client.mjs";
import { runTierEngineFromCrsResult } from "../finance/crs-tier.mjs";
import { personalFromClient, readBusinessOnFile } from "../underwrite/letter-pack.mjs";

function parseMoney(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Greedy allocation: highest paydown_amt first (same cards the roadmap names). */
export function allocateCashToCards(revolvingRows, cashDollars) {
  const cash = parseMoney(cashDollars);
  if (cash == null || cash < 0) {
    return { ok: false, error: "cash_on_hand must be a non-negative number", allocations: [] };
  }
  let remaining = cash;
  const cards = paydownCards(openRevolving({ revolving: revolvingRows || [] }));
  const allocations = [];

  for (const row of cards) {
    const need = paydownAmt(row);
    if (need == null || need <= 0) continue;
    const pay = Math.min(remaining, need);
    if (pay <= 0) break;
    allocations.push({
      account: row[0],
      payDollars: pay,
      balanceBefore: parseMoney(row[2]),
      targetBalance: parseMoney(row[3]) ?? null
    });
    remaining -= pay;
  }

  const applied = cash - remaining;
  const totalNeed = cards.reduce((sum, row) => sum + (paydownAmt(row) ?? 0), 0);
  return {
    ok: true,
    cashOnHand: cash,
    cashApplied: applied,
    cashUnallocated: remaining,
    totalPaydownNeeded: totalNeed,
    allocations
  };
}

export function projectedApprovalAfterCash({ preapprovalNow, preapprovalAfter, cashApplied, totalPaydownNeeded }) {
  const now = parseMoney(preapprovalNow);
  const after = parseMoney(preapprovalAfter);
  if (now == null && after == null) return null;
  if (after == null) return now;
  if (now == null) return after;
  const need = parseMoney(totalPaydownNeeded) ?? 0;
  const applied = parseMoney(cashApplied) ?? 0;
  if (need <= 0) return now;
  const ratio = Math.min(1, Math.max(0, applied / need));
  return Math.round(now + (after - now) * ratio);
}

/**
 * simulatePaydown — pure plan + numbers from latest crs_results when present.
 */
export function simulatePaydownFromClientDict(client, cashOnHand) {
  const alloc = allocateCashToCards(rankedRevolving(client), cashOnHand);
  if (!alloc.ok) return alloc;

  const before = client.preapproval_now;
  const afterFull = client.preapproval_after ?? client.preapproval_now;
  const projected = projectedApprovalAfterCash({
    preapprovalNow: before,
    preapprovalAfter: afterFull,
    cashApplied: alloc.cashApplied,
    totalPaydownNeeded: alloc.totalPaydownNeeded
  });

  return {
    ok: true,
    preapprovalBefore: before,
    preapprovalAfterFull: afterFull,
    preapprovalProjected: projected,
    ...alloc
  };
}

export async function loadPaydownSimulation(db, { orgId, clientId, cashOnHand }) {
  if (!orgId || !clientId) {
    return { ok: false, error: "orgId and clientId are required" };
  }

  const clientRow = await db.query(
    `SELECT first_name, last_name, custom_fields FROM clients WHERE id = $1 AND org_id = $2`,
    [clientId, orgId]
  );
  const row = clientRow.rows[0];
  if (!row) return { ok: false, error: "no such client" };

  const crs = await db.query(
    `SELECT result, created_at
       FROM crs_results
      WHERE client_id = $1 AND org_id = $2
        AND COALESCE(is_demo, false) IS NOT TRUE
      ORDER BY created_at DESC
      LIMIT 1`,
    [clientId, orgId]
  );
  const storedCrs = crs.rows[0]?.result ?? null;
  if (!storedCrs || !hasBlackReportSource(storedCrs)) {
    return { ok: false, error: "no_credit_file", hasPull: false };
  }

  const personal = personalFromClient(row);
  let engine;
  try {
    engine = runTierEngineFromCrsResult(storedCrs, {
      submittedName: personal.name,
      submittedAddress: personal.address
    });
  } catch (e) {
    return { ok: false, error: "engine_error", detail: String(e?.message || e) };
  }

  const source = mergeStoredUnderwrite(engine, storedCrs);
  if (!source || !hasBlackReportSource(source)) {
    return { ok: false, error: "incomplete_pull", hasPull: true };
  }
  const business = await readBusinessOnFile(db, { clientId, customFields: row.custom_fields });
  const client = buildBlackReportClient({ crsResult: source, personal, business });
  const sim = simulatePaydownFromClientDict(client, cashOnHand);
  return {
    ...sim,
    hasPull: true,
    pulledAt: crs.rows[0]?.created_at ?? null
  };
}

export default loadPaydownSimulation;
