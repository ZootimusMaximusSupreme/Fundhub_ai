// $147 is the price the no-reply follow-up offers for the roadmap (owner-set 2026-10-05).
// It is the live page price (src/slo/offer.mjs SLO_PRICE_CENTS). The $297 list price is
// display only. The gift is this price. It goes out when they do not reply.
// The first five texts are a real conversation. A yes means the roadmap is free.

import crypto from "node:crypto";

export const DISCOUNT_CENTS = 14700;

export const DISCOUNT_REF_KEY = "slo_197_ref";

/** Unpredictable id for the $147 checkout link. */
export function newDiscountRef() {
  return `slo197_${crypto.randomBytes(12).toString("hex")}`;
}

/** Roadmap checkout, card step, at $147. Step 1 (name, email, phone) is skipped. */
export function discountCheckoutUrl(ref) {
  const id = encodeURIComponent(String(ref || "").trim());
  return `https://apply.fundhub.ai/roadmap/?offer=147&ref=${id}#fhw`;
}

export const FIRST_FIVE = 5;

export const SLOT_KEY = "slo_text_slot";
export const REPLIED_KEY = "slo_replied_at";
export const DIG_KEY = "slo_dig_sent_at";
export const FREE_KEY = "slo_roadmap_free_at";
export const LOCK_197 = "slo_197_sent_at";

const YES_RE = /^(yes|yeah|yep|yup|sure|ok|okay|i agree|i'm in|im in|let's do it|lets do it|let's go|lets go|i want it|i want the roadmap|do the roadmap)\b/i;

/** True when their reply is a yes to moving forward. A worry is not a yes. */
export function agreesToRoadmap(body) {
  const text = String(body || "").trim();
  if (!text) return false;
  return YES_RE.test(text);
}

const NO_RE = /^(no|nah|nope|no thanks|not interested)\b/i;

/** True when they turned the offer down. A real answer is not a no. */
export function declinesRoadmap(body) {
  const text = String(body || "").trim();
  if (!text) return false;
  return NO_RE.test(text);
}
export function nextTextSlot(usedCount) {
  const n = Number(usedCount);
  if (!Number.isInteger(n) || n < 0) return null;
  if (n >= FIRST_FIVE) return null;
  return n + 1;
}
