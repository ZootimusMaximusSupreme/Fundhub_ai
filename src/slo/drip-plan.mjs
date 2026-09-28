// The roadmap drip. People who do not buy and do not take the free interview
// stay on this list. The lane is how far they have gone, not a guess.
//
// cold — landed, never wrote back
// warm — left info or replied
// hot — started checkout, or said they want funding
// paid — off the list
//
// Each lane is seven emails. The first ones go out a day apart.
// After that, every two or three days. The step wraps, so the list does not end.
// One ask on every email: the $197 roadmap.

import { mergeCustomFields } from "../workflows/custom-fields.mjs";

export const DRIP_ON = "slo_drip_on";
export const DRIP_STEP = "slo_drip_step";
export const DRIP_NEXT = "slo_drip_next_at";
export const DRIP_DAYS = 2;

export const DRIP_LANES = {
  cold: [1, 2, 3, 4, 5, 6, 7].map((n) => `EMAIL-SLO-DRIP-COLD-${n}`),
  warm: [1, 2, 3, 4, 5, 6, 7].map((n) => `EMAIL-SLO-DRIP-WARM-${n}`),
  hot: [1, 2, 3, 4, 5, 6, 7].map((n) => `EMAIL-SLO-DRIP-HOT-${n}`)
};

/** First burst is daily. Then it slows. Cold never starts daily. */
export function dripGapDays(lane, step) {
  const n = Number(step);
  const i = Number.isInteger(n) && n >= 0 ? n : 0;
  if (lane === "hot") return i < 4 ? 1 : 2;
  if (lane === "warm") return i < 3 ? 1 : 2;
  return 2;
}

/** Paid people leave. Deepest step wins. */
export function sloLane({ paid, checkout, replied, contact } = {}) {
  if (paid) return null;
  if (checkout) return "hot";
  if (replied || contact) return "warm";
  return "cold";
}

export function dripTemplate(lane, step) {
  const list = DRIP_LANES[lane];
  if (!list) return null;
  const n = Number(step);
  const i = Number.isInteger(n) && n >= 0 ? n % list.length : 0;
  return list[i];
}

export function nextDripAt(from = new Date(), days = DRIP_DAYS) {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Turn the list on. A second call does not reset the step. */
export async function enrollSloDrip(db, clientId) {
  if (!clientId) return false;
  const r = await db.query(
    `SELECT custom_fields->>$2 AS on FROM clients WHERE id = $1 LIMIT 1`,
    [clientId, DRIP_ON]
  );
  if (r.rows[0]?.on === "1") return false;
  await mergeCustomFields(db, clientId, {
    [DRIP_ON]: "1",
    [DRIP_STEP]: "0",
    [DRIP_NEXT]: new Date().toISOString()
  });
  return true;
}
