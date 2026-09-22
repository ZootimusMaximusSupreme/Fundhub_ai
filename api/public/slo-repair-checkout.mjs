// POST/OPTIONS /api/public/slo-repair-checkout — the repair plan a $297 buyer
// picks inside the /roadmap widget, after the pull, on the repair path only.
//
// Body: { ref, client_id, plan: "REPAIR_TRIAL" | "REPAIR_DFY" }
//
// NO AUTH. Same stranger class and the same credential as
// api/public/slo-pull.mjs: ref + client_id already stamped on that buyer
// (findSloOrder). The org comes from the matched client row, never the request.
//
// REFUSED unless /api/public/slo-status would show this buyer the offer right
// now: pull done AND bucket 'repair' (owner-set 2026-09-22 — nothing about
// repair before a pull result). Anyone else gets not_offered.
//
// Prices, names and the Commas title all come from src/config/offers.mjs
// (REPAIR_TRIAL $200 "Consulting Services Trial", REPAIR_DFY $1,000
// "Consulting Services Standard"). Commas never sees a credit word.
//
// DEMO (SLO_DEMO_PAY="1", or a demo diagnostic order): the choice is recorded
// as a demo payment_links row and Commas is never called → { ok, demo: true }.
// Otherwise → { ok, demo: false, checkoutUrl } minted by createPaymentLink.
//
// Cross-site: allow-listed origins only (src/slo/cors.mjs). Never "*".
// GET answers 405: this door mints a payable link, so it is POST only.

import { db } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import { asUuid } from "../../src/slo/connections.mjs";
import { findSloOrder } from "../../src/slo/pull.mjs";
import { loadSloStatus } from "../../src/slo/status.mjs";
import { parseSloRepairPlan, runSloRepairCheckout } from "../../src/slo/repair-offer.mjs";
import { answerPreflight, applySloCors } from "../../src/slo/cors.mjs";

const METHODS = "POST, OPTIONS";

const STATUS = {
  invalid_json: 400,
  ref_required: 400,
  client_required: 400,
  plan_invalid: 400,
  not_found: 404,
  not_offered: 409,
  checkout_not_configured: 503,
  commas_not_configured: 503
};

function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req?.body === "string" ? req.body : (typeof req?.rawBody === "string" ? req.rawBody : "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function parseSloRepairCheckoutBody(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const ref = String(body.ref == null ? "" : body.ref).trim().slice(0, 120);
  if (!ref) return { ok: false, error: "ref_required" };
  const clientId = asUuid(body.client_id ?? body.clientId);
  if (!clientId) return { ok: false, error: "client_required" };
  const plan = parseSloRepairPlan(body.plan);
  if (!plan) {
    return {
      ok: false,
      error: "plan_invalid",
      errors: [{ field: "plan", code: "plan_invalid", message: "Pick one of the two plans." }]
    };
  }
  return { ok: true, ref, clientId, plan };
}

export default async function handler(req, res, deps = {}) {
  applySloCors(req, res, METHODS);
  res.setHeader("Cache-Control", "no-store");
  if (answerPreflight(req, res, METHODS)) return;
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.setHeader("allow", METHODS);
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const parsed = parseSloRepairCheckoutBody(readBody(req));
  if (!parsed.ok) {
    const out = { ok: false, error: parsed.error };
    if (parsed.errors) out.errors = parsed.errors;
    return res.status(STATUS[parsed.error] || 400).json(out);
  }

  const dbh = deps.db || db;
  try {
    const found = await (deps.findOrder || findSloOrder)(dbh, {
      clientId: parsed.clientId, ref: parsed.ref
    });
    if (!found) return res.status(404).json({ ok: false, error: "not_found" });
    const status = await (deps.loadStatus || loadSloStatus)(dbh, found);
    const result = await runSloRepairCheckout(
      { found, status, plan: parsed.plan, orderRef: parsed.ref },
      { ...deps, db: dbh, env: deps.env || process.env }
    );
    if (!result.ok) return res.status(STATUS[result.error] || 502).json(result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
