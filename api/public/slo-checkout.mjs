// GET/POST /api/public/slo-checkout — the $297 SLO diagnostic till.
//
// Owner-set 2026-09-17: pay, then pull, then pack, then book.
// Commas is the card API. Success URL is /roadmap/pull.html so they never land
// on a generic thank-you and wonder what to do next.
//
// NO AUTH. A stranger off an ad, same class as api/public/optimize.mjs.
// NO outbound SMS or email from this handler.
// Never POST /public-api/products/create. Title is the keep Assessment string.
//
// GET  — price, next path, whether checkout is on. No earnings figure.
// POST — { email, first_name, last_name, optional utm_* } → Commas checkout URL + ref.

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
  SLO_PRICE_CENTS,
  SLO_PULL_PATH,
  SLO_SOURCE,
  sloPullSuccessUrl
} from "../../src/slo/offer.mjs";
import {
  ensureSloAccount,
  recordSloPaymentLink,
  resolveDiagnosticProductId,
  resolveSloBuyer,
  stampSloRef
} from "../../src/slo/buyer.mjs";
import { pickAttribution } from "../../src/ads/attribution-keys.mjs";
import { upsertClientAdAttribution } from "../../src/ads/store.mjs";
import { mergeCustomFields } from "../../src/workflows/custom-fields.mjs";

function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req?.body === "string" ? req.body : (typeof req?.rawBody === "string" ? req.rawBody : "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const cleanStr = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function newSloRef() {
  return `slo_${crypto.randomBytes(12).toString("hex")}`;
}

export function sloPageConfig(env = process.env) {
  const cents = SLO_PRICE_CENTS;
  return {
    ok: true,
    name: "Complete Funding Diagnostic",
    priceCents: cents,
    priceDisplay: formatCents(cents),
    next: SLO_PULL_PATH,
    bookUrl: SLO_BOOK_URL,
    checkout: { ready: checkoutConfig(env).ok === true },
    /* Said on the page, not only in a comment. No earnings figure. */
    notices: {
      charge: "Your card is charged once, today, for $297.",
      pull: "We run a soft pull only after you fill out the next form. It does not change your score.",
      keep: "The pack is yours to keep."
    }
  };
}

export function parseSloCheckoutBody(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const email = cleanStr(body.email, 160).toLowerCase();
  if (!isEmail(email)) return { ok: false, error: "email_required" };
  const first = cleanStr(body.first_name ?? body.firstName, 80);
  const last = cleanStr(body.last_name ?? body.lastName, 80);
  const name = [first, last].filter(Boolean).join(" ").trim() || null;
  return {
    ok: true,
    email,
    name,
    firstName: first || null,
    lastName: last || null,
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
  const amountCents = SLO_PRICE_CENTS;
  if ((deps.checkoutConfig || checkoutConfig)(env).ok !== true) {
    return { ok: false, error: "checkout_not_configured" };
  }

  const ref = deps.ref || newSloRef();
  const orgId = deps.orgId || (await resolveDefaultOrg(dbh));
  const successUrl = (deps.successUrl || sloPullSuccessUrl)(env);

  const clientId = await (deps.resolveBuyer || resolveSloBuyer)(dbh, {
    orgId, email: parsed.email, name: parsed.name
  });
  if (!clientId) return { ok: false, error: "buyer_missing" };

  await (deps.ensureAccount || ensureSloAccount)(dbh, {
    orgId, clientId, email: parsed.email, name: parsed.name
  });
  if (parsed.attribution) {
    await (deps.upsertAttribution || upsertClientAdAttribution)(dbh, {
      orgId, clientId, attribution: parsed.attribution
    });
    await (deps.mergeFields || mergeCustomFields)(dbh, clientId, parsed.attribution);
  }
  const productId = await (deps.resolveProduct || resolveDiagnosticProductId)(dbh, orgId);

  await (deps.emit || emit)(
    dbh,
    "slo.checkout_started",
    {
      ref,
      source: SLO_SOURCE,
      amount_cents: amountCents,
      currency: "USD",
      email: parsed.email,
      name: parsed.name,
      client_id: clientId,
      occurredAt: new Date().toISOString()
    },
    { orgId, clientId, allowNonCanonical: true, idempotencyKey: `slo-checkout:${ref}` }
  );

  const metadata = {
    link_ref: ref,
    client_id: clientId,
    source: SLO_SOURCE
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
    orgId, clientId, productId, ref, checkoutUrl, amountCents, commasSessionId
  });
  await (deps.stampSlo || stampSloRef)(dbh, clientId, ref);

  return {
    ok: true,
    checkoutUrl,
    ref,
    priceCents: amountCents,
    next: SLO_PULL_PATH
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const method = String(req.method || "GET").toUpperCase();

  if (method === "GET") {
    return res.status(200).json(sloPageConfig(process.env));
  }
  if (method !== "POST") {
    res.setHeader("allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const parsed = parseSloCheckoutBody(readBody(req));
  if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });

  try {
    const result = await runSloCheckout(parsed);
    if (!result.ok) {
      const status = result.error === "checkout_not_configured" ? 503 : 502;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
