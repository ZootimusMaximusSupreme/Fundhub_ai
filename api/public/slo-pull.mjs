// POST /api/public/slo-pull — identity + checkbox consent, then diagnostic.paid.
// COMPLIANCE REVIEW REQUIRED — credit-pull type/reuse.
//
// NO AUTH. Same stranger class as api/public/slo-checkout.mjs. The credential
// is the pair of ref + client_id already stamped on that buyer. A naked
// client_id is refused. Consent text is server-owned (soft-pull-v1).
//
// GET answers 405 on purpose. Do not ping this with a body — that would store
// identity and fire C-00.

import { db } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import { parseSloPullBody, runSloPull } from "../../src/slo/pull.mjs";

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
  encryption_unavailable: 503,
  identity_refused: 400,
  consent_refused: 400,
  db_missing: 500,
  disclosure_missing: 500
};

export default async function handler(req, res, deps = {}) {
  res.setHeader("Cache-Control", "no-store");
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const parsed = parseSloPullBody(readBody(req));
  if (!parsed.ok) {
    return res.status(STATUS[parsed.error] || 400).json({ ok: false, error: parsed.error });
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
