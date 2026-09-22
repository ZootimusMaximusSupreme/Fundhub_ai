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
// A LIVE order that is not paid stores identity + consent and does NOT start
// the pull, with or without defer_pull: the Commas payment starts it (see
// src/slo/pull.mjs WHEN THE PULL STARTS). A paid live order starts it now. A
// demo order starts the pull now, with no money event. Each new pull after a
// failed one is a new attempt (src/slo/pull.mjs ATTEMPTS).
//
// Body (2026-09-22): first/middle/last name, suffix, dob, ssn, address, apt,
// city, state, zip, moved_recently + prev_* (previous address), businesses[]
// ({ name, address, city, state, zip, ein?, phone?, started }), consent,
// address_confirmed (true = take the address as typed after the
// address_unverified warning).
// A refusal carries errors: [{ field, code, message }] — one per bad box.
//
//   409 existing_account    the email's client already has an identity on
//                           file or has paid us, and this order is not paid
//   422 address_unverified  the geocoder could not find the address; the
//                           warnings name the box. Pay again with
//                           address_confirmed:true to use it as typed.

import { db } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import { parseSloPullBody, runSloPull } from "../../src/slo/pull.mjs";
import { answerPreflight, applySloCors } from "../../src/slo/cors.mjs";
import { isSloDemoPay, SLO_BOOK_PAGE_URL } from "../../src/slo/offer.mjs";
import { checkSloAddresses } from "../../src/slo/address-check.mjs";

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
  existing_account: 409,
  address_unverified: 422,
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

  /* DEMO, NO PULL (owner-set 2026-09-22: "make it work but no soft pull").
     With SLO_DEMO_PAY=1 the form is checked exactly as live (fields, then the
     address check) and then NOTHING is written: no identity, no consent, no
     client fields, no businesses, no pull, no pack. The widget goes straight
     to the booking page. Because nothing is stored, an email typed here can
     never change or reveal anyone's record. */
  const env = deps.env || process.env;
  if ((deps.demo ?? isSloDemoPay(env)) === true) {
    if (!parsed.addressConfirmed) {
      const addresses = Array.isArray(parsed.addresses) && parsed.addresses.length ? parsed.addresses : [parsed.address];
      const unverified = await (deps.checkAddresses || checkSloAddresses)(addresses);
      if (unverified.length) {
        return res.status(STATUS.address_unverified).json({
          ok: false, error: "address_unverified",
          warnings: [...unverified, ...(Array.isArray(parsed.warnings) ? parsed.warnings : [])]
        });
      }
    }
    return res.status(200).json({
      ok: true, demo: true, deferred: false, pull_requested: false, stored: false,
      next: "book", book_url: SLO_BOOK_PAGE_URL,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    });
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
      priorFile: deps.priorFile,
      checkAddresses: deps.checkAddresses,
      stampSlo: deps.stampSlo,
      markIdentity: deps.markIdentity,
      orderPulls: deps.orderPulls,
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
