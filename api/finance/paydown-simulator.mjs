// POST /api/finance/paydown-simulator — cash split + projected approval.
//
//   POST { client_id, cash_on_hand }
//        → { ok, preapprovalBefore, preapprovalProjected, allocations, ... }
//
// Gated on finance-os entitlement (Blueprint buyers receive it on pay).

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid, CLIENT_DATA_ERRORS } from "../../src/http/read-api.mjs";
import { requireClientInOrg } from "../../src/http/client-scope.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { financeOsEntitlement } from "../../src/finance/finance-os-entitlement.mjs";
import { loadPaydownSimulation } from "../../src/blueprint/paydown-simulator.mjs";

const PAYDOWN_ROLES = ROLE_SETS.STAFF;

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, PAYDOWN_ROLES)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const body = req.body || {};
  if (!isUuid(body.client_id)) {
    return res.status(400).json({ ok: false, error: "client_id must be a uuid" });
  }
  const clientId = String(body.client_id).trim();
  const cash = body.cash_on_hand ?? body.cashOnHand;

  try {
    if (!(await requireClientInOrg(res, database, staff, clientId))) return;

    const entitlement = await financeOsEntitlement(database, { orgId, clientId });
    if (!entitlement.entitled) {
      return res.status(403).json({
        ok: false,
        error: "not_entitled",
        entitled: false,
        reason: entitlement.reason
      });
    }

    const sim = await (deps.loadPaydownSimulation ?? loadPaydownSimulation)(database, {
      orgId,
      clientId,
      cashOnHand: cash
    });

    if (!sim.ok && sim.error === "no_credit_file") {
      return res.status(200).json({
        ok: true,
        entitled: true,
        hasPull: false,
        subscriptionId: entitlement.subscriptionId
      });
    }
    if (!sim.ok) {
      const status = sim.error === "no such client" ? 404 : 400;
      return res.status(status).json({ ok: false, error: sim.error, detail: sim.detail ?? null });
    }

    return res.status(200).json({
      ok: true,
      entitled: true,
      subscriptionId: entitlement.subscriptionId,
      ...sim
    });
  } catch (e) {
    if (CLIENT_DATA_ERRORS.has(e?.code)) return dbDown(res, e);
    throw e;
  }
}
