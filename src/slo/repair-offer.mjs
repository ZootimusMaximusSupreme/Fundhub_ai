// The repair offer inside the /roadmap widget, and its checkout.
//
// Owner-set 2026-09-22:
//   - Nothing about repair shows on the lander before a pull result. This
//     offer is only ever handed out by /api/public/slo-status once the pull is
//     done AND the buyer is on the repair path (isRepairOnlyPath). The
//     checkout below refuses anyone else (not_offered).
//   - The plans are the EXISTING catalogue offers, REPAIR_TRIAL ($200) and
//     REPAIR_DFY ($1,000), read from src/config/offers.mjs. No price, name or
//     title is typed here.
//   - What Commas sees is the offer's existing "Consulting Services ..." title
//     (commasProductTitle on the offer) and nothing else. The plan names go to
//     the widget only.
//
// DEMO PAY (SLO_DEMO_PAY="1") or a demo diagnostic order: the choice is
// recorded as a demo payment_links row (is_demo, not charged) and Commas is
// never called. Otherwise the link is minted through createPaymentLink, the
// same door the closer deck uses for these two offers.

import { emit } from "../events/bus.mjs";
import { formatCents, getOffer } from "../config/offers.mjs";
import { createPaymentLink, generateLinkRef, markSent } from "../payment-links/index.mjs";
import { checkoutConfig } from "../payments/commas-api.mjs";
import { recordSloDemoLink, resolveProductIdByCode } from "./buyer.mjs";
import { isSloDemoPay, sloRoadmapBookUrl, SLO_SOURCE } from "./offer.mjs";

export const SLO_REPAIR_PLAN_KEYS = Object.freeze(["REPAIR_TRIAL", "REPAIR_DFY"]);

/** The two plans, straight off the catalogue. */
export function sloRepairPlans() {
  return SLO_REPAIR_PLAN_KEYS.map((key) => {
    const offer = getOffer(key);
    return {
      key: offer.key,
      name: offer.name,
      price_cents: offer.priceCents,
      display: formatCents(offer.priceCents)
    };
  });
}

/** What slo-status hands the widget on the repair path. */
export function sloRepairOffer() {
  return { plans: sloRepairPlans(), book_url: sloRoadmapBookUrl() };
}

export function parseSloRepairPlan(raw) {
  const key = String(raw == null ? "" : raw).trim().toUpperCase();
  return SLO_REPAIR_PLAN_KEYS.includes(key) ? key : null;
}

/**
 * runSloRepairCheckout — one plan for one SLO buyer already on the repair path.
 *
 * `found` is the findSloOrder row (ref + client_id already proved).
 * `status` is the slo-status answer for that order.
 */
export async function runSloRepairCheckout({ found, status, plan, orderRef }, deps = {}) {
  const dbh = deps.db;
  const env = deps.env || process.env;
  if (!found) return { ok: false, error: "not_found" };
  if (!status || status.state !== "done" || status.bucket !== "repair") {
    return { ok: false, error: "not_offered" };
  }
  const offer = getOffer(plan);
  if (!offer || !SLO_REPAIR_PLAN_KEYS.includes(offer.key)) return { ok: false, error: "plan_invalid" };

  const orgId = found.org_id;
  const clientId = found.id;
  const envDemo = typeof deps.demo === "boolean" ? deps.demo : isSloDemoPay(env);
  const demo = envDemo || found.order_is_demo === true;
  const out = {
    plan: offer.key,
    price_cents: offer.priceCents,
    price_display: formatCents(offer.priceCents)
  };

  if (demo) {
    const linkRef = (deps.newLinkRef || generateLinkRef)();
    const productId = await (deps.resolveProduct || resolveProductIdByCode)(dbh, orgId, offer.productCode);
    await (deps.recordDemoLink || recordSloDemoLink)(dbh, {
      orgId,
      clientId,
      productId,
      ref: linkRef,
      amountCents: offer.priceCents,
      purpose: offer.paymentPurpose,
      description: `${offer.name} (demo, not charged)`
    });
    await audit(dbh, deps, { orgId, clientId, orderRef, linkRef, offer, demo: true });
    return { ok: true, demo: true, ...out };
  }

  if ((deps.checkoutConfig || checkoutConfig)(env).ok !== true) {
    return { ok: false, error: "checkout_not_configured" };
  }

  let link;
  try {
    link = await (deps.createPaymentLink || createPaymentLink)(dbh, {
      orgId,
      clientId,
      purpose: offer.paymentPurpose,
      description: offer.name,
      commasProductTitle: offer.commasProductTitle,
      amountCents: offer.priceCents,
      productCode: offer.productCode,
      env
    });
  } catch (err) {
    return { ok: false, error: err?.code || "checkout_failed" };
  }
  if (!link?.checkout_url) return { ok: false, error: "checkout_failed" };
  await (deps.markSent || markSent)(dbh, { id: link.id, orgId });
  await audit(dbh, deps, { orgId, clientId, orderRef, linkRef: link.link_ref, offer, demo: false });
  return { ok: true, demo: false, checkoutUrl: String(link.checkout_url), ...out };
}

async function audit(dbh, deps, { orgId, clientId, orderRef, linkRef, offer, demo }) {
  await (deps.emit || emit)(
    dbh,
    "slo.repair_checkout_started",
    {
      source: SLO_SOURCE,
      ref: orderRef || null,
      link_ref: linkRef || null,
      offer_key: offer.key,
      amount_cents: offer.priceCents,
      demo,
      occurredAt: new Date().toISOString()
    },
    {
      orgId,
      clientId,
      allowNonCanonical: true,
      idempotencyKey: linkRef ? `slo-repair-checkout:${linkRef}` : null
    }
  );
}
