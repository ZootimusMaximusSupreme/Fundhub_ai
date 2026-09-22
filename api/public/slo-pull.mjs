// POST /api/public/slo-pull — identity + checkbox consent, then diagnostic.paid.
// COMPLIANCE REVIEW REQUIRED — credit-pull type/reuse.
//
// NO AUTH. Same stranger class as api/public/slo-checkout.mjs. The credential
// is the pair of ref + client_id already stamped on that buyer. A naked
// client_id is refused. Consent text is server-owned (soft-pull-v1).
//
// GET answers 405 on purpose. Do not ping this with a body — that would store
// identity and fire C-00.
//
// Cross-site (owner-set 2026-09-22): the /roadmap widget on
// https://apply.fundhub.ai posts here, so OPTIONS is answered and
// Access-Control-Allow-Origin is echoed for allow-listed origins only
// (src/slo/cors.mjs). Never "*".
//
// defer_pull: true stores identity + consent and does NOT start the pull; the
// Commas payment starts it (see src/slo/pull.mjs WHEN THE PULL STARTS). A demo
// order starts the pull now, with no money event.
//
// Body (2026-09-22): first/middle/last name, suffix, dob, ssn, address, apt,
// city, state, zip, moved_recently + prev_* (previous address), businesses[]
// ({ name, address, city, state, zip, ein?, phone?, started }), consent.
// A refusal carries errors: [{ field, code, message }] — one per bad box.

import { db } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import { parseSloPullBody, runSloPull } from "../../src/slo/pull.mjs";
import { answerPreflight, applySloCors } from "../../src/slo/cors.mjs";

const METHODS = "POST, OPTIONS";

function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req?.body === "string" ? req.body : (typeof req?.rawBody === "string" ? req.rawBody : "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clientIp(req) {
  const xf = req.headers?.["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.headers?.["x-real-ip"] || null;
}

const STATUS = {
  invalid_json: 400,
  ref_required: 400,
  client_required: 400,
  consent_required: 400,
  name_required: 400,
  dob_required: 400,
  ssn_required: 400,
  address_required: 400,
  not_found: 404,
  no_account: 409,
  order_not_paid: 409,
  encryption_unavailable: 503,
  identity_refused: 400,
  consent_refused: 400,
  db_missing: 500,
  disclosure_missing: 500
};

export default async function handler(req, res, deps = {}) {
  applySloCors(req, res, METHODS);
  res.setHeader("Cache-Control", "no-store");
  if (answerPreflight(req, res, METHODS)) return;
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const parsed = parseSloPullBody(readBody(req));
  if (!parsed.ok) {
    /* errors[] names each field ({ field, code, message }) so the page can put
       the words under the right box. No value the buyer typed is echoed back. */
    const out = { ok: false, error: parsed.error };
    if (Array.isArray(parsed.errors)) out.errors = parsed.errors;
    if (Array.isArray(parsed.warnings) && parsed.warnings.length) out.warnings = parsed.warnings;
    return res.status(STATUS[parsed.error] || 400).json(out);
  }

  try {
    const result = await runSloPull(parsed, {
      db: deps.db || db,
      env: deps.env || process.env,
      emit: deps.emit,
      findOrder: deps.findOrder,
      storeIdentity: deps.storeIdentity,
      captureConsent: deps.captureConsent,
      ensureAccount: deps.ensureAccount,
      replaceBusinesses: deps.replaceBusinesses,
      mergeFields: deps.mergeFields,
      demo: deps.demo,
      startDemoPull: deps.startDemoPull,
      ip: clientIp(req),
      userAgent: req.headers?.["user-agent"] || null
    });
    if (!result.ok) {
      return res.status(STATUS[result.error] || 400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
