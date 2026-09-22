// Where a $297 buyer's soft pull stands, for the /roadmap widget.
//
// Read only. Never writes, never emits, never charges. The answer carries no
// tier name, no score, no email and no bureau data — only:
//
//   state        'running' | 'done' | 'failed'
//   started      true once a pull request or a result exists for this order
//   demo         the order was a DEMO order (nothing charged)
//   bucket       'funding' | 'repair' | null   (only when done)
//   pa           whole dollars | null           (only when done AND funding)
//   bureaus      { TU, EX, EQ } each 'pending' | 'file_returned' | 'frozen'
//                | 'no_file' | 'error' | null (null = not asked / not known)
//   book_url     the booking page; with ?pa= on the funding path
//   repair_offer null | { plans, book_url }     (only when done AND repair)
//
// ONLY THIS ORDER COUNTS. A returning buyer can have older pulls on file. Only
// a request and a result made at or after this order's payment_links row was
// created are read, so an old result is never shown as this order's answer.
//
// DONE means the pull was stored AND the tier engine's decision was recorded:
// the decision.rendered event for that crs_results row, keyed
// `crs-result:<id>:decision.rendered:v1` (src/finance/crs-pull.mjs finishStored).
// That event row is written before any handler runs, so its figures are the
// pull's own, not a custom field that a handler may not have written yet.
//
// BUCKET, as owner-set 2026-09-22: isRepairOnlyPath(clients.outcome_tier ??
// latest crs_results.outcome_tier) → 'repair'; isFundingPath → 'funding';
// anything else (MANUAL_REVIEW, FRAUD_HOLD, none) → null. A simulated or
// sandbox-fenced pull may write only crs_results, hence the fallback.
//
// PA — THE FUNDING AMOUNT OUR SYSTEM COMPUTED. The tier engine's
// preapprovals.totalCombined, carried on decision.rendered as fundingEstimate
// (src/finance/crs-pull.mjs), which is the same figure the pack prints as the
// pre-approval (src/underwrite/black-report-client.mjs preapproval_now) and the
// portal shows as the pre-qual (analyzer_prequal_amount). Whole dollars,
// rounded. Unknown, zero or negative → null. Never invented, never defaulted.

import { isFundingPath, isRepairOnlyPath } from "../config/product-path.mjs";
import { sloRoadmapBookUrl } from "./offer.mjs";
import { sloRepairOffer } from "./repair-offer.mjs";

export const BUREAU_KEYS = Object.freeze(["TU", "EX", "EQ"]);
const BUREAU_STATUSES = new Set(["file_returned", "frozen", "no_file", "error"]);
const OPEN = new Set(["queued", "processing"]);
const CLOSED_BAD = new Set(["failed", "cancelled"]);

/** The decision.rendered key for a stored result. One place, one spelling. */
export function decisionKeyFor(crsResultId) {
  return `crs-result:${crsResultId}:decision.rendered:v1`;
}

/** Whole dollars from the engine figure, or null. */
export function paFromEstimate(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // The engine answers in dollars; the booking page wants whole dollars.
  const dollars = Math.round(n);
  return Number.isSafeInteger(dollars) && dollars > 0 ? dollars : null;
}

export function bucketForTier(tier) {
  if (isRepairOnlyPath(tier)) return "repair";
  if (isFundingPath(tier)) return "funding";
  return null;
}

/**
 * Per-bureau words off a FAILED request's reason, when nothing was stored.
 * src/finance/crs-pull.mjs writes "no bureau returned a report — TU: … | EQ:
 * [frozen] …". A bureau named with a [tag] gets the tag; named without one is
 * 'error'; not named at all is left out (unknown).
 */
export function bureausFromFailReason(reason) {
  const out = {};
  const text = String(reason || "");
  const dash = text.indexOf("—");
  const body = dash >= 0 ? text.slice(dash + 1) : text;
  for (const seg of body.split(" | ")) {
    const m = seg.trim().match(/^(TU|EX|EQ): (?:\[([a-z_]+)\] )?/);
    if (!m || m[1] in out) continue;
    out[m[1]] = m[2] && BUREAU_STATUSES.has(m[2]) ? m[2] : "error";
  }
  return out;
}

function asList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function asObj(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; }
  }
  return {};
}

/** Per-bureau words off a stored result. */
export function bureausFromResult(crs) {
  const given = asObj(crs?.bureau_status);
  const pulled = new Set(asList(crs?.bureaus_pulled).map(String));
  const errors = asObj(crs?.bureau_errors);
  const out = {};
  for (const b of BUREAU_KEYS) {
    if (BUREAU_STATUSES.has(given[b])) out[b] = given[b];
    else if (pulled.has(b)) out[b] = "file_returned";
    else if (errors[b]) out[b] = "error";
    else out[b] = null;
  }
  return out;
}

function allBureaus(value) {
  return Object.fromEntries(BUREAU_KEYS.map((b) => [b, value]));
}

function newer(a, b) {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(ta)) return false;
  if (!Number.isFinite(tb)) return true;
  return ta > tb;
}

/**
 * sloStatusFromRows — the pure half. Every input is a row this module read.
 *
 * @param {object} rows
 * @param {object|null} rows.request   latest soft_pull_requests row for the order
 * @param {object|null} rows.crs       latest crs_results row for the order
 * @param {string|null} rows.clientTier clients.outcome_tier
 * @param {object|null} rows.decision  { outcome_tier, funding_estimate } off the event
 * @param {boolean}     rows.demo      the order is a demo order
 */
export function sloStatusFromRows({ request = null, crs = null, clientTier = null, decision = null, demo = false } = {}) {
  const started = Boolean(request || crs);
  const base = {
    ok: true,
    state: "running",
    started,
    demo: demo === true,
    bucket: null,
    pa: null,
    bureaus: allBureaus("pending"),
    book_url: null,
    repair_offer: null
  };

  if (request && OPEN.has(request.status)) return base;

  if (request && CLOSED_BAD.has(request.status) && (!crs || newer(request.requested_at, crs.created_at))) {
    return {
      ...base,
      state: "failed",
      bureaus: { ...allBureaus(null), ...bureausFromFailReason(request.state_reason) },
      book_url: sloRoadmapBookUrl()
    };
  }

  if (crs && decision) {
    const tier = clientTier ?? crs.outcome_tier ?? decision.outcome_tier ?? null;
    const bucket = bucketForTier(tier);
    const pa = bucket === "funding" ? paFromEstimate(decision.funding_estimate) : null;
    return {
      ...base,
      state: "done",
      bucket,
      pa,
      bureaus: bureausFromResult(crs),
      book_url: sloRoadmapBookUrl(pa),
      repair_offer: bucket === "repair" ? sloRepairOffer() : null
    };
  }

  // Stored, tier being decided — or nothing yet. Either way: keep polling.
  if (crs) return { ...base, bureaus: bureausFromResult(crs) };
  return base;
}

/**
 * loadSloStatus — the reads, then sloStatusFromRows.
 * `found` is the findSloOrder row (src/slo/pull.mjs): ref + client_id proved,
 * org taken from the matched client, never from the request.
 */
export async function loadSloStatus(db, found) {
  const orgId = found.org_id;
  const clientId = found.id;
  const since = found.order_created_at || null;

  const reqRes = await db.query(
    `SELECT id, status, state_reason, crs_result_id, requested_at
       FROM soft_pull_requests
      WHERE org_id = $1::uuid AND client_id = $2::uuid
        AND ($3::timestamptz IS NULL OR requested_at >= $3::timestamptz)
      ORDER BY requested_at DESC
      LIMIT 1`,
    [orgId, clientId, since]
  );
  const crsRes = await db.query(
    `SELECT id, outcome_tier, created_at,
            result->'bureausPulled' AS bureaus_pulled,
            result->'bureauErrors'  AS bureau_errors,
            result->'bureauStatus'  AS bureau_status
       FROM crs_results
      WHERE org_id = $1::uuid AND client_id = $2::uuid
        AND ($3::timestamptz IS NULL OR created_at >= $3::timestamptz)
      ORDER BY created_at DESC
      LIMIT 1`,
    [orgId, clientId, since]
  );
  const crs = crsRes.rows[0] || null;

  const tierRes = await db.query(
    `SELECT outcome_tier FROM clients WHERE id = $1::uuid AND org_id = $2::uuid`,
    [clientId, orgId]
  );

  let decision = null;
  if (crs) {
    const ev = await db.query(
      `SELECT payload->>'outcomeTier'     AS outcome_tier,
              payload->>'fundingEstimate' AS funding_estimate
         FROM events
        WHERE org_id = $1::uuid AND idempotency_key = $2 AND name = 'decision.rendered'
        LIMIT 1`,
      [orgId, decisionKeyFor(crs.id)]
    );
    decision = ev.rows[0] || null;
  }

  return sloStatusFromRows({
    request: reqRes.rows[0] || null,
    crs,
    clientTier: tierRes.rows[0]?.outcome_tier ?? null,
    decision,
    demo: found.order_is_demo === true
  });
}
