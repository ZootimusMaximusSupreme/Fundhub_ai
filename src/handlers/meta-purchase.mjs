// Meta Purchase — the server copy of a payment (Phase 4, unit M4).
//
// Contract: the "Phase 4 contract" section of docs/tracking/meta-events.md.
// The browser cannot report a payment that clears minutes later in a webhook,
// and Safari / in-app browsers often block the pixel anyway. So when money
// actually clears, the server tells Meta, through the one sender
// (src/messaging/providers/meta-capi.mjs, sendMetaEvents).
//
// ── WHO FIRES WHAT ──────────────────────────────────────────────────────────
// Every trigger is a Commas payment that has already been through the inbox
// (src/adapters/commas.mjs processCommasInboxRow). Only payloads with
// source "commas" count: the SLO pull form also emits a diagnostic.paid (a
// pull request, not a payment — src/slo/pull.mjs), and it must never look like
// a purchase.
//
//   $297 /roadmap order   payment.received, link_ref "slo_*". Registered after
//                         src/handlers/payment-links.mjs, which marks the order
//                         paid on that same event. event_id "purchase.<ref>" —
//                         the id the browser fires on checkout:success, so
//                         Meta counts the two once.
//   The six sorting-hat offers (src/config/offers.mjs), one trigger each —
//   the semantic event Commas maps that product to, or payment.received where
//   commas.mjs maps it to none (OFFER_PURCHASE_TRIGGER below; a test runs the
//   adapter's own mapToCanonical so the two cannot drift).
//                         event_id "purchase.<payment id>" (or the event id).
//
// ── WHAT GOES TO META ───────────────────────────────────────────────────────
// value: the money that moved. Integer cents through src/commissions/money.mjs,
// then dollars. The order row's amount for the $297 order; the payment's own
// amount for an offer, the offer's catalogue price only when the payment
// carries no amount. currency USD.
// user_data: SHA-256 email and phone (src/meta/user-data.mjs), external_id =
// SHA-256 of our client id, fbc / fbp kept from the checkout or on the client
// (src/ads/meta-match.mjs), and for the $297 order the checkout request's IP
// and user agent. Never a raw email or phone, card, SSN, date of birth, survey
// answer or soft-pull value — nothing here reads any of those.
//
// ── WHO IS SKIPPED ──────────────────────────────────────────────────────────
// Demo orders (payment_links.is_demo), demo clients (clients.is_demo), and
// agents: company / test emails and bot browsers (src/slo/visitor.mjs).
//
// ── IT NEVER BREAKS A PAYMENT ───────────────────────────────────────────────
// This runs in the inbox sweeper, after Commas already has its 200. It never
// throws: a sender failure, a missing row or a database error is caught and
// written on the event row as payload.meta, the same place src/meta/track-send.mjs
// records funnel sends. A replay of an event already sent ok sends nothing.

import { on } from "../events/registry.mjs";
import { OFFERS } from "../config/offers.mjs";
import { fromCents, toCents } from "../commissions/money.mjs";
import { classifyVisitor } from "../slo/visitor.mjs";
import { isSloCheckoutLinkRef } from "../slo/buyer.mjs";
import { buildUserData, sha256 } from "../meta/user-data.mjs";
import { CURRENCY } from "../meta/map.mjs";
import { clientMetaClickIds } from "../ads/meta-match.mjs";
import { sendMetaEvents } from "../messaging/providers/meta-capi.mjs";

/** Where the $297 order is bought. */
export const SLO_PURCHASE_URL = "https://apply.fundhub.ai/roadmap";

/** The six client offers the sorting hat routes to (src/config/offers.mjs OfferKey). */
export const SORTING_HAT_OFFER_KEYS = Object.freeze([
  "SOFT_PULL",
  "FUNDING_DFY",
  "REPAIR_DFY",
  "REPAIR_TRIAL",
  "UWIQ_DELIVERABLES",
  "FUNDING_MASTERY"
]);

/* Which bus event sends each offer's Purchase. Exactly one per payment:
   commas.mjs emits payment.received for every payment, plus diagnostic.paid /
   deposit.paid / sale.closed for the three products it has a bucket for
   (PRODUCT_CODE_BUCKET). The other three get payment.received only, so that is
   their trigger. */
export const OFFER_PURCHASE_TRIGGER = Object.freeze({
  SOFT_PULL: "diagnostic.paid",
  FUNDING_DFY: "deposit.paid",
  UWIQ_DELIVERABLES: "sale.closed",
  REPAIR_DFY: "payment.received",
  REPAIR_TRIAL: "payment.received",
  FUNDING_MASTERY: "payment.received"
});

export const SLO_PURCHASE_TRIGGER = "payment.received";

export const MONEY_EVENTS = Object.freeze(["payment.received", "diagnostic.paid", "deposit.paid", "sale.closed"]);

/* A payment with no products.code on its link (an old Commas product page) is
   placed by commas.mjs's own bucket. "diy" is the "Consulting Services Package"
   title, which src/config/offers.mjs records as the Capital Blueprint. */
const BUCKET_OFFER = Object.freeze({ crs: "SOFT_PULL", deposit: "FUNDING_DFY", diy: "UWIQ_DELIVERABLES" });

/** The sorting-hat offer a payment bought, or null when it is none of the six. */
export function offerKeyForPayment(payload) {
  const p = payload || {};
  const code = String(p.productCode || "").trim().toLowerCase();
  if (code) return SORTING_HAT_OFFER_KEYS.find((k) => OFFERS[k].productCode === code) || null;
  return BUCKET_OFFER[String(p.product || "").trim().toLowerCase()] || null;
}

/** "purchase.<order ref>" — the browser's checkout:success id. */
export function sloPurchaseEventId(ref) {
  return `purchase.${ref}`;
}

/** "purchase.<payment id>", else the processor ref, else our event id. */
export function offerPurchaseEventId(payload, eventId) {
  const p = payload || {};
  const id = p.paymentId || p.providerRef || eventId;
  return id ? `purchase.${id}` : null;
}

/** Integer cents → Meta's `value` (a number of dollars). */
export function centsToValue(cents) {
  return Number(fromCents(cents));
}

/**
 * The amount an offer payment is reported at, in integer cents.
 * The payment's own amount (commas.mjs normalizes it to dollars) when it is a
 * positive number; else the offer's catalogue price. Unknown is never 0.
 */
export function offerValueCents(payload, offerKey) {
  const amount = payload?.amount;
  if (amount != null && amount !== "") {
    try {
      const cents = toCents(amount);
      if (cents > 0) return { cents, from: "payment" };
    } catch {
      /* not a number — fall back to the catalogue */
    }
  }
  const offer = OFFERS[offerKey];
  return offer ? { cents: offer.priceCents, from: "offer" } : null;
}

/** user_data with external_id = SHA-256 of our client id. */
export function purchaseUserData({ email, phone, clientId, ip, userAgent, fbc, fbp }) {
  const ud = buildUserData({ email, phone, ip, userAgent, fbc, fbp });
  if (clientId) ud.external_id = [sha256(String(clientId))];
  return ud;
}

const nowSeconds = (deps) => Math.floor((deps.now ? deps.now() : Date.now()) / 1000);

// ── reads ───────────────────────────────────────────────────────────────────

async function loadLink(db, { orgId, id, ref }) {
  if (!orgId || (!id && !ref)) return null;
  const { rows } = await db.query(
    id
      ? `SELECT id, org_id, client_id, link_ref, amount_cents, status, is_demo
           FROM payment_links WHERE org_id = $1::uuid AND id = $2::uuid LIMIT 1`
      : `SELECT id, org_id, client_id, link_ref, amount_cents, status, is_demo
           FROM payment_links WHERE org_id = $1::uuid AND link_ref = $2 LIMIT 1`,
    [orgId, id || ref]
  );
  return rows[0] || null;
}

async function loadClient(db, { orgId, clientId, email }) {
  if (!orgId || (!clientId && !email)) return null;
  const { rows } = await db.query(
    clientId
      ? `SELECT id, email, phone, is_demo, custom_fields
           FROM clients WHERE org_id = $1::uuid AND id = $2::uuid LIMIT 1`
      : `SELECT id, email, phone, is_demo, custom_fields
           FROM clients WHERE org_id = $1::uuid AND lower(email) = $2 LIMIT 1`,
    [orgId, clientId || String(email).trim().toLowerCase()]
  );
  return rows[0] || null;
}

/* The $297 order's checkout row: what api/public/slo-checkout.mjs kept from
   that request (payload.meta_match) and who it judged the visitor to be. */
async function loadCheckout(db, { orgId, ref }) {
  const { rows } = await db.query(
    `SELECT payload->'meta_match' AS meta_match, payload->>'actor' AS actor
       FROM events
      WHERE org_id = $1::uuid AND idempotency_key = $2
      LIMIT 1`,
    [orgId, `slo-checkout:${ref}`]
  );
  const r = rows[0];
  const m = r?.meta_match && typeof r.meta_match === "object" ? r.meta_match : {};
  return { match: m, actor: r?.actor || null };
}

export const RECORD_META_SQL =
  `UPDATE events SET payload = payload || $1::jsonb, updated_at = now() WHERE id = $2`;

async function record(db, eventId, note) {
  if (!eventId) return;
  try {
    await db.query(RECORD_META_SQL, [JSON.stringify({ meta: note }), eventId]);
  } catch (err) {
    console.error("meta-purchase: result not recorded —", err?.message || err);
  }
}

// ── the decision ────────────────────────────────────────────────────────────

/**
 * Which Purchase (if any) this bus event is the trigger for. Pure, no reads.
 * → { kind: "slo", ref } | { kind: "offer", offerKey } | { kind: "maybe_slo", offerKey } | null
 *
 * "maybe_slo": a payment.received on the diagnostic product whose ref was not
 * echoed back — only its payment_links row can say whether it was the $297
 * order. Every other payment.received is decided without a query.
 */
export function purchaseTrigger(name, payload) {
  const p = payload || {};
  if (!MONEY_EVENTS.includes(name) || p.source !== "commas") return null;
  const offerKey = offerKeyForPayment(p);
  if (isSloCheckoutLinkRef(p.ref)) {
    return name === SLO_PURCHASE_TRIGGER ? { kind: "slo", ref: p.ref } : null;
  }
  if (name === SLO_PURCHASE_TRIGGER && offerKey === "SOFT_PULL" && p.paymentLinkId) {
    return { kind: "maybe_slo", offerKey };
  }
  if (offerKey && OFFER_PURCHASE_TRIGGER[offerKey] === name) return { kind: "offer", offerKey };
  return null;
}

/* The $297 order → one Meta event, or { skip }. */
async function planSloPurchase(db, event, link, deps) {
  const orgId = event.orgId;
  if (!link || link.org_id !== orgId || !isSloCheckoutLinkRef(link.link_ref)) return { skip: "order_missing" };
  if (link.is_demo === true) return { skip: "demo_order" };
  const client = await loadClient(db, { orgId, clientId: link.client_id });
  if (!client) return { skip: "client_missing" };
  if (client.is_demo === true) return { skip: "demo_client" };
  const { match, actor } = await loadCheckout(db, { orgId, ref: link.link_ref });
  const ua = typeof match.client_user_agent === "string" ? match.client_user_agent : null;
  if (actor === "agent" || classifyVisitor({ email: client.email, userAgent: ua }).actor !== "person") {
    return { skip: "agent" };
  }
  const kept = clientMetaClickIds(client.custom_fields);
  const user_data = purchaseUserData({
    email: client.email,
    phone: client.phone,
    clientId: client.id,
    ip: match.client_ip_address,
    userAgent: ua,
    fbc: match.fbc || kept.fbc,
    fbp: match.fbp || kept.fbp
  });
  const cents = Number(link.amount_cents);
  if (!Number.isInteger(cents) || cents <= 0) return { skip: "amount_unknown" };
  return {
    metaEvent: {
      event_name: "Purchase",
      event_time: nowSeconds(deps),
      event_id: sloPurchaseEventId(link.link_ref),
      event_source_url: SLO_PURCHASE_URL,
      /* Meta needs the browser's user agent for a website event. An order
         placed before the checkout kept one is reported as a system event. */
      action_source: ua ? "website" : "system_generated",
      user_data,
      custom_data: { value: centsToValue(cents), currency: CURRENCY }
    }
  };
}

/* A sorting-hat offer payment → one Meta event, or { skip }. */
async function planOfferPurchase(db, event, offerKey, link, deps) {
  const orgId = event.orgId;
  const p = event.payload || {};
  if (link && link.is_demo === true) return { skip: "demo_order" };
  const client = await loadClient(db, { orgId, clientId: event.clientId || null, email: event.clientId ? null : p.email });
  if (client?.is_demo === true) return { skip: "demo_client" };
  const email = client?.email || p.email || null;
  if (!email && !client) return { skip: "no_user_data" };
  if (classifyVisitor({ email }).actor !== "person") return { skip: "agent" };
  const value = offerValueCents(p, offerKey);
  if (!value) return { skip: "amount_unknown" };
  const eventIdFor = offerPurchaseEventId(p, event.id);
  if (!eventIdFor) return { skip: "no_event_id" };
  const kept = clientMetaClickIds(client?.custom_fields);
  return {
    metaEvent: {
      event_name: "Purchase",
      event_time: nowSeconds(deps),
      event_id: eventIdFor,
      /* Paid on a link a closer sent, with no web session behind it. */
      action_source: "system_generated",
      user_data: purchaseUserData({
        email,
        phone: client?.phone || null,
        clientId: client?.id || null,
        fbc: kept.fbc,
        fbp: kept.fbp
      }),
      custom_data: { value: centsToValue(value.cents), currency: CURRENCY }
    },
    offerKey
  };
}

/**
 * The bus handler. Registered on the four money events. Never throws.
 * deps: sendMetaEvents (stand-in sender), env, fetchImpl, now.
 * → { sent, ok?, skip?, event_id? } — what was decided, for tests and logs.
 */
export async function onMoneyEventForMeta(event, db, deps = {}) {
  try {
    const trigger = purchaseTrigger(event?.name, event?.payload);
    if (!trigger) return { sent: false, skip: "not_a_trigger" };
    if (event.payload?.meta?.ok === true && Number(event.payload.meta.sent) > 0) {
      return { sent: false, skip: "already_sent" };
    }

    const p = event.payload || {};
    const link = trigger.kind !== "offer" || p.paymentLinkId
      ? await loadLink(db, { orgId: event.orgId, id: p.paymentLinkId || null, ref: p.ref || null })
      : null;

    /* The $297 order rides the diagnostic product, so its payment also emits
       diagnostic.paid. Its Purchase is the payment.received one; a $32 soft
       pull's is its diagnostic.paid. When the ref was not echoed back, only
       the payment_links row can tell the two apart. */
    const linkIsSlo = Boolean(link && isSloCheckoutLinkRef(link.link_ref));
    let plan;
    if (trigger.kind === "slo") {
      plan = await planSloPurchase(db, event, link, deps);
    } else if (trigger.kind === "maybe_slo") {
      if (!linkIsSlo) return { sent: false, skip: "not_a_trigger" };
      plan = await planSloPurchase(db, event, link, deps);
    } else {
      if (linkIsSlo) return { sent: false, skip: "not_a_trigger" };
      plan = await planOfferPurchase(db, event, trigger.offerKey, link, deps);
    }

    const at = new Date(deps.now ? deps.now() : Date.now()).toISOString();
    if (plan.skip) {
      await record(db, event.id, { event_name: "Purchase", skipped: plan.skip, at });
      return { sent: false, skip: plan.skip };
    }

    const send = deps.sendMetaEvents || sendMetaEvents;
    let result;
    try {
      result = await send([plan.metaEvent], {
        env: deps.env || process.env,
        db,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {})
      });
    } catch (err) {
      result = { ok: false, sent: 0, error: String(err?.message || err).slice(0, 300) };
    }
    const note = {
      event_name: "Purchase",
      event_id: plan.metaEvent.event_id,
      value: plan.metaEvent.custom_data.value,
      ok: result?.ok === true,
      sent: Number(result?.sent) || 0,
      at
    };
    if (plan.offerKey) note.offer = plan.offerKey;
    if (result?.skipped) note.skipped = result.skipped;
    if (result?.error) note.error = String(result.error).slice(0, 300);
    await record(db, event.id, note);
    return { sent: note.sent > 0, ok: note.ok, event_id: note.event_id, error: note.error };
  } catch (err) {
    console.warn(`meta-purchase: ${event?.name || "?"} not sent — ${String(err?.message || err).slice(0, 200)}`);
    return { sent: false, skip: "error" };
  }
}

/* Four literal on() calls, not a loop: scripts/diagrams/extract.mjs reads
   registrations off the source, and a loop would hide them from the diagrams. */
export function register() {
  on("payment.received", onMoneyEventForMeta);
  on("diagnostic.paid", onMoneyEventForMeta);
  on("deposit.paid", onMoneyEventForMeta);
  on("sale.closed", onMoneyEventForMeta);
}
