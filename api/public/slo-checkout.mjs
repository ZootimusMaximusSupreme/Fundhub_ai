// GET/POST/OPTIONS /api/public/slo-checkout — the $297 SLO diagnostic till.
//
// Owner-set 2026-09-17: pay, then pull, then pack, then book.
// Owner-set 2026-09-22: the checkout is a two-step widget ON the /roadmap
// sales page (https://apply.fundhub.ai/roadmap), not separate pages. The
// widget calls this door cross-site, so it answers OPTIONS and echoes
// Access-Control-Allow-Origin for the allow-listed origins only
// (src/slo/cors.mjs). Never "*".
//
// NO AUTH. A stranger off an ad, same class as api/public/optimize.mjs.
// NO outbound SMS or email from this handler.
// Never POST /public-api/products/create. Title is the keep Assessment string.
//
// GET  — price, whether checkout is on, whether this is DEMO pay. No earnings
//        figure. ?businesses=n prices the order bump: first business free,
//        each extra $15 (owner-set 2026-09-22). Every figure is the server's.
//        mapsBrowserKey: GOOGLE_MAPS_BROWSER_KEY, or null when unset. The
//        widget loads Google address autocomplete only when it is not null.
//        Never the server key (GOOGLE_MAPS_API_KEY).
// POST — { email, first_name?, last_name?, phone?, businesses?, business_count?,
//          return_url?, utm_*? }
//        The amount is $297 + $15 × (n − 1), n = businesses on the order.
//        phone is optional; when sent it must be a 10-digit US number and is
//        stored as +1XXXXXXXXXX on a client this checkout creates.
//
// AN EMAIL IS NOT A LOGIN (2026-09-22 review). The buyer is found by email,
// and anyone can type anyone's email. So when the email already belongs to a
// client, this door writes NOTHING to that client: no name, phone, account,
// ad tags, businesses or slo_ref. It records the order row only (the ref and
// the business count). What that order may later write is decided by
// src/slo/pull.mjs. A client this checkout creates is its own, and gets the
// account, ad tags and businesses as before.
//
// DEMO PAY (SLO_DEMO_PAY="1", src/slo/offer.mjs isSloDemoPay). The order is
// recorded exactly as a real one — the buyer, the account, the ad tags, the
// businesses, the checkout_started event, and a payment_links row with the
// real amount — but the row is stamped is_demo = true and Commas is NEVER
// called. The answer is { ok, demo: true, ref, client_id, ... } and no card
// page exists. Unset or anything but "1" is the real path below, unchanged.
//
// THE AMOUNT VARIES, THE TITLE DOES NOT. Each real POST mints its own Commas
// session through createCheckoutSession, which takes any positive integer
// amount, so the extras are charged on the same card page. The title stays the
// keep title. The Commas webhook routes on payment_links.purpose, never on the
// amount (src/adapters/commas.mjs productOf), so a bigger total still fires
// diagnostic.paid.

import crypto from "node:crypto";
import { db } from "../../src/db.mjs";
import { resolveDefaultOrg } from "../../src/auth/org.mjs";
import { emit } from "../../src/events/bus.mjs";
import { safeError } from "../../src/http/health.mjs";
import { checkoutConfig, createCheckoutSession } from "../../src/payments/commas-api.mjs";
import { formatCents } from "../../src/config/offers.mjs";
import {
  SLO_BOOK_URL,
  SLO_KEEP_TITLE,
  SLO_PULL_PATH,
  SLO_SOURCE,
  isSloDemoPay,
  sloPullSuccessUrl
} from "../../src/slo/offer.mjs";
import {
  SLO_FREE_BUSINESSES,
  SLO_MAX_BUSINESSES,
  sloBusinessPricingPublic,
  sloCheckoutTotalCents
} from "../../src/finance/slo-business-pricing.mjs";
import {
  ensureSloAccount,
  recordSloPaymentLink,
  resolveDiagnosticProductId,
  resolveSloBuyer
} from "../../src/slo/buyer.mjs";
import { parseSloBusinesses, replaceSloBusinesses } from "../../src/slo/businesses.mjs";
import { answerPreflight, applySloCors, sloReturnUrl } from "../../src/slo/cors.mjs";
import { pickAttribution } from "../../src/ads/attribution-keys.mjs";
import { upsertClientAdAttribution } from "../../src/ads/store.mjs";
import { mergeCustomFields } from "../../src/workflows/custom-fields.mjs";

const METHODS = "GET, POST, OPTIONS";

function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req?.body === "string" ? req.body : (typeof req?.rawBody === "string" ? req.rawBody : "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const cleanStr = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** A US phone as +1XXXXXXXXXX. Blank → { value: null }. Not 10 digits (or 11
 *  starting with 1) → { error }. Formatting characters are ignored. */
export function parseSloPhone(raw) {
  const typed = cleanStr(raw, 40);
  if (!typed) return { value: null };
  let digits = typed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) {
    return { error: { field: "phone", code: "phone_invalid", message: "Use a 10-digit phone number." } };
  }
  return { value: `+1${digits}` };
}

export function newSloRef() {
  return `slo_${crypto.randomBytes(12).toString("hex")}`;
}

/**
 * Business count off a body or a query string. Missing or blank → 1 (the free
 * one). Anything that is not a whole number 1–20 → null (refused, not rounded).
 */
export function parseBusinessCount(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return SLO_FREE_BUSINESSES;
  const s = String(raw).trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= SLO_FREE_BUSINESSES && n <= SLO_MAX_BUSINESSES ? n : null;
}

export function sloPageConfig(env = process.env, { businesses = SLO_FREE_BUSINESSES } = {}) {
  const count = parseBusinessCount(businesses) ?? SLO_FREE_BUSINESSES;
  const base = sloCheckoutTotalCents(SLO_FREE_BUSINESSES);
  const cents = sloCheckoutTotalCents(count);
  const display = formatCents(cents);
  const demo = isSloDemoPay(env);
  return {
    ok: true,
    name: "Complete Funding Diagnostic",
    priceCents: cents,
    priceDisplay: display,
    basePriceCents: base,
    basePriceDisplay: formatCents(base),
    business: sloBusinessPricingPublic(count),
    next: SLO_PULL_PATH,
    bookUrl: SLO_BOOK_URL,
    /* demo: true means Pay records the order and charges nothing. The widget
       reads this; it never decides the mode itself. */
    demo,
    checkout: { ready: demo || checkoutConfig(env).ok === true },
    /* The browser key only (a key meant to be seen by a page). null → the
       widget loads nothing from Google and the address boxes are plain. */
    mapsBrowserKey: String(env?.GOOGLE_MAPS_BROWSER_KEY ?? "").trim() || null,
    /* Said on the page, not only in a comment. No earnings figure. The charge
       line is built from the same total as priceDisplay, so they cannot drift. */
    notices: {
      charge: demo
        ? "Demo checkout: your card is not charged."
        : `Your card is charged once, today, for ${display}.`,
      pull: "We run a soft pull only after you fill out the next form. It does not change your score.",
      keep: "The pack is yours to keep."
    }
  };
}

/**
 * The POST body → { ok, ... } or { ok:false, error, errors:[{field,code,message}] }.
 *
 * businesses: EITHER an array of business rows (validated by
 * src/slo/businesses.mjs, stored on the order) OR business_count, a whole
 * number 1–20. With an array the count is its length, and never less than 1
 * because the base price includes the first business.
 */
export function parseSloCheckoutBody(body, { now = new Date() } = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const errors = [];

  const email = cleanStr(body.email, 160).toLowerCase();
  if (!isEmail(email)) {
    errors.push({ field: "email", code: "email_required", message: "Please enter a real email address." });
  }
  const first = cleanStr(body.first_name ?? body.firstName, 80);
  const last = cleanStr(body.last_name ?? body.lastName, 80);
  const name = [first, last].filter(Boolean).join(" ").trim() || null;
  const phone = parseSloPhone(body.phone);
  if (phone.error) errors.push(phone.error);

  let businesses = SLO_FREE_BUSINESSES;
  let businessRows = null;
  if (Array.isArray(body.businesses)) {
    const biz = parseSloBusinesses(body.businesses, { now });
    errors.push(...biz.errors);
    businessRows = biz.businesses;
    businesses = Math.max(SLO_FREE_BUSINESSES, biz.businesses.length);
  } else {
    const count = parseBusinessCount(body.business_count ?? body.businesses);
    if (count == null) {
      errors.push({
        field: "business_count",
        code: "businesses_invalid",
        message: `Pick between ${SLO_FREE_BUSINESSES} and ${SLO_MAX_BUSINESSES} businesses.`
      });
    } else {
      businesses = count;
    }
  }

  if (errors.length) return { ok: false, error: errors[0].code, errors };
  return {
    ok: true,
    email,
    name,
    firstName: first || null,
    lastName: last || null,
    phone: phone.value ?? null,
    businesses,
    businessRows,
    // null unless https on an allow-listed origin; see src/slo/cors.mjs.
    returnUrl: sloReturnUrl(body.return_url ?? body.returnUrl),
    attribution: pickAttribution(body)
  };
}

/**
 * Record the ask, then mint the link.
 * Minting first would leave a payable URL this system has never heard of.
 */
export async function runSloCheckout(parsed, deps = {}) {
  const dbh = deps.db || db;
  const env = deps.env || process.env;
  const demo = typeof deps.demo === "boolean" ? deps.demo : isSloDemoPay(env);
  const businesses = Number.isInteger(parsed.businesses) ? parsed.businesses : SLO_FREE_BUSINESSES;
  const amountCents = sloCheckoutTotalCents(businesses);
  if (!demo && (deps.checkoutConfig || checkoutConfig)(env).ok !== true) {
    return { ok: false, error: "checkout_not_configured" };
  }

  const ref = deps.ref || newSloRef();
  const orgId = deps.orgId || (await resolveDefaultOrg(dbh));

  const buyer = await (deps.resolveBuyer || resolveSloBuyer)(dbh, {
    orgId, email: parsed.email, name: parsed.name, phone: parsed.phone ?? null
  });
  const clientId = buyer?.clientId || null;
  if (!clientId) return { ok: false, error: "buyer_missing" };
  const newClient = buyer.created === true;

  /* Writes to the CLIENT happen only for a client this checkout created. See
     AN EMAIL IS NOT A LOGIN in the header. */
  if (newClient) {
    await (deps.ensureAccount || ensureSloAccount)(dbh, {
      orgId, clientId, email: parsed.email, name: parsed.name
    });
    if (parsed.attribution) {
      await (deps.upsertAttribution || upsertClientAdAttribution)(dbh, {
        orgId, clientId, attribution: parsed.attribution
      });
      await (deps.mergeFields || mergeCustomFields)(dbh, clientId, parsed.attribution);
    }
    /* The businesses the widget sent ride on the order. Rows are the SLO rows
       only (entity_data.source = 'slo'); the staff approve form's rows are
       never touched. The pull form sends the same list again, and that is
       what an existing client's order stores, once it is allowed to. */
    if (Array.isArray(parsed.businessRows)) {
      await (deps.replaceBusinesses || replaceSloBusinesses)(dbh, {
        orgId, clientId, businesses: parsed.businessRows
      });
    }
  }
  const productId = await (deps.resolveProduct || resolveDiagnosticProductId)(dbh, orgId);

  await (deps.emit || emit)(
    dbh,
    "slo.checkout_started",
    {
      ref,
      source: SLO_SOURCE,
      amount_cents: amountCents,
      business_count: businesses,
      currency: "USD",
      email: parsed.email,
      name: parsed.name,
      client_id: clientId,
      demo,
      occurredAt: new Date().toISOString()
    },
    { orgId, clientId, allowNonCanonical: true, idempotencyKey: `slo-checkout:${ref}` }
  );

  if (demo) {
    /* DEMO: the order row, stamped demo, and no Commas call at all. The ref
       and business count live on this row, not on the client. */
    await (deps.recordLink || recordSloPaymentLink)(dbh, {
      orgId, clientId, productId, ref, amountCents, businessCount: businesses, isDemo: true
    });
    return {
      ok: true,
      demo: true,
      ref,
      client_id: clientId,
      priceCents: amountCents,
      priceDisplay: formatCents(amountCents),
      businesses
    };
  }

  const successUrl = parsed.returnUrl || (deps.successUrl || sloPullSuccessUrl)(env);
  const metadata = {
    link_ref: ref,
    client_id: clientId,
    source: SLO_SOURCE,
    business_count: businesses
  };

  const mintOpts = {
    amountCents,
    productTitle: SLO_KEEP_TITLE,
    metadata,
    successUrl,
    env
  };
  if (deps.fetchImpl) mintOpts.fetchImpl = deps.fetchImpl;

  const minted = await (deps.createCheckoutSession || createCheckoutSession)(mintOpts);
  if (!minted?.ok || !minted.paymentLink) {
    return { ok: false, error: "checkout_failed", ref };
  }

  const checkoutUrl = String(minted.paymentLink);
  const commasSessionId = minted.productId != null
    ? String(minted.productId)
    : (minted.checkoutSessionId != null ? String(minted.checkoutSessionId) : null);
  await (deps.recordLink || recordSloPaymentLink)(dbh, {
    orgId, clientId, productId, ref, checkoutUrl, amountCents, commasSessionId,
    businessCount: businesses
  });

  return {
    ok: true,
    demo: false,
    checkoutUrl,
    ref,
    client_id: clientId,
    priceCents: amountCents,
    priceDisplay: formatCents(amountCents),
    businesses,
    next: SLO_PULL_PATH
  };
}

export default async function handler(req, res, deps = {}) {
  applySloCors(req, res, METHODS);
  res.setHeader("Cache-Control", "no-store");
  if (answerPreflight(req, res, METHODS)) return;
  const method = String(req.method || "GET").toUpperCase();
  const env = deps.env || process.env;

  if (method === "GET") {
    const asked = req.query?.businesses;
    if (asked !== undefined && parseBusinessCount(asked) == null) {
      return res.status(400).json({ ok: false, error: "businesses_invalid" });
    }
    return res.status(200).json(sloPageConfig(env, { businesses: asked }));
  }
  if (method !== "POST") {
    res.setHeader("allow", METHODS);
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const parsed = parseSloCheckoutBody(readBody(req));
  if (!parsed.ok) {
    const out = { ok: false, error: parsed.error };
    if (Array.isArray(parsed.errors)) out.errors = parsed.errors;
    return res.status(400).json(out);
  }

  try {
    const result = await runSloCheckout(parsed, { ...deps, env });
    if (!result.ok) {
      const status = result.error === "checkout_not_configured" ? 503 : 502;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
