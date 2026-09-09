// GET /api/read/finance-os-suggestions?client_id=<uuid> — the "little CFO"
// panel: what the client's most recent credit pull says is costing them money
// and what is not a factor, gated on an active finance-os subscription.
//
// NOT A NEW SUGGESTION ENGINE. costing_you and not_a_factor already exist on
// buildBlackReportClient() (src/underwrite/black-report-client.mjs) — the same
// mapping UnderwriteIQ's funding deliverables already use, unchanged, pointed
// at Finance OS instead of a PDF. personalFromClient() and readBusinessOnFile()
// are the same helpers src/underwrite/letter-pack.mjs uses to assemble the
// engine's inputs from a client row.
//
// ENTITLEMENT, NOT JUST ROLE. Every other endpoint in this directory asks "is
// this a staff session in the right org". This one asks that AND "is this
// client's finance-os subscription active right now" — Finance OS is a paid
// add-on (owner-set 2026-09-09), and a client without one gets 403 with
// entitled:false, not a 200 with empty data. A caller must not be able to tell
// "no subscription" from "no suggestions yet" by the shape of a 200 — they are
// different facts and this endpoint says which one is true.
//
// role gate + org-scope pattern copied from api/read/finance-os.mjs, which
// serves the sibling screen this panel sits beside.

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid, CLIENT_DATA_ERRORS } from "../../src/http/read-api.mjs";
import { requireClientInOrg } from "../../src/http/client-scope.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { financeOsEntitlement } from "../../src/finance/finance-os-entitlement.mjs";
import { runTierEngineFromCrsResult } from "../../src/finance/crs-tier.mjs";
import {
  buildBlackReportClient, hasBlackReportSource, mergeStoredUnderwrite
} from "../../src/underwrite/black-report-client.mjs";
import { personalFromClient, readBusinessOnFile } from "../../src/underwrite/letter-pack.mjs";

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;

  if (req.method && req.method !== "GET") {
    res.setHeader("allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.STAFF)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const query = req.query || {};
  if (!isUuid(query.client_id)) {
    return res.status(400).json({ ok: false, error: "client_id is required and must be a uuid" });
  }
  const clientId = String(query.client_id).trim();

  try {
    if (!(await requireClientInOrg(res, database, staff, clientId))) return;

    const entitlement = await financeOsEntitlement(database, { orgId: staff.org_id, clientId });
    if (!entitlement.entitled) {
      return res.status(403).json({ ok: false, error: "not_entitled", entitled: false, reason: entitlement.reason });
    }

    const clientRow = await database.query(
      `SELECT first_name, last_name, custom_fields FROM clients WHERE id = $1 AND org_id = $2`,
      [clientId, staff.org_id]
    );
    const row = clientRow.rows[0];
    if (!row) {
      return res.status(404).json({ ok: false, error: "no such client" });
    }
    const personal = personalFromClient(row);

    const crs = await database.query(
      `SELECT result, created_at FROM crs_results WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [clientId]
    );
    const storedCrs = crs.rows[0]?.result ?? null;

    // No pull yet is an honest, expected state — the monthly sweeper may not
    // have run, or its request may still be 'queued' with no bureau answer
    // behind it yet (see 380_finance_os_monthly_pull.sql's header). Reported,
    // not defaulted into empty suggestion arrays that would look identical to
    // "we checked and found nothing to say".
    if (!storedCrs) {
      return res.status(200).json({
        ok: true, entitled: true, subscriptionId: entitlement.subscriptionId,
        hasPull: false, pulledAt: null, costingYou: [], notAFactor: []
      });
    }

    let engine;
    try {
      engine = runTierEngineFromCrsResult(storedCrs, {
        submittedName: personal.name,
        submittedAddress: personal.address
      });
    } catch (e) {
      return res.status(200).json({
        ok: true, entitled: true, subscriptionId: entitlement.subscriptionId,
        hasPull: true, pulledAt: crs.rows[0]?.created_at ?? null,
        engineError: String(e?.message || e).slice(0, 240),
        costingYou: [], notAFactor: []
      });
    }

    const source = mergeStoredUnderwrite(engine, storedCrs);
    if (!source || !hasBlackReportSource(source)) {
      return res.status(200).json({
        ok: true, entitled: true, subscriptionId: entitlement.subscriptionId,
        hasPull: true, pulledAt: crs.rows[0]?.created_at ?? null,
        engineError: "pull did not carry all three bureau scores",
        costingYou: [], notAFactor: []
      });
    }

    const business = await readBusinessOnFile(database, { clientId, customFields: row.custom_fields });
    const client = buildBlackReportClient({ crsResult: source, personal, business });

    return res.status(200).json({
      ok: true, entitled: true, subscriptionId: entitlement.subscriptionId,
      hasPull: true, pulledAt: crs.rows[0]?.created_at ?? null,
      costingYou: client.costing_you, notAFactor: client.not_a_factor
    });
  } catch (e) {
    if (CLIENT_DATA_ERRORS.has(e.code)) {
      return res.status(400).json({ ok: false, error: "bad request parameter" });
    }
    if (dbDown(e)) {
      return res.status(503).json({ ok: false, error: "the database is not answering" });
    }
    return res.status(500).json({ ok: false, error: "our code broke" });
  }
}
