// The seven keys Creative Factory / 06-utm-hidden-fields writes.
// utm_content leading digits = FundHub ad id (fundhub_ad_id in 286).

export const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "landing_path", "referrer_domain"
];

/* Meta's click id. Dropped until 2026-10-02: this file was "raw UTMs only"
   (Creative Factory's wire format) and nothing downstream used a click id.
   The Phase 4 contract (docs/tracking/meta-events.md, "fbclid / fbc / fbp")
   keeps it now. It is NOT one of the seven above: it is never stamped on a
   ClickFunnels form and never a client_ad_attribution column.

   The safety the old drop gave is kept: a value is bounded (500 at most) and
   must look like a click id (letters, digits, "_" and "-"). Anything else is
   dropped whole, never cut — a cut click id is a wrong one, and an email or a
   phone can never ride in under this key. */
export const CLICK_ID_KEYS = ["fbclid"];
const CLICK_ID = /^[A-Za-z0-9_-]{1,500}$/;

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 512) : null;
}

function cleanClickId(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return CLICK_ID.test(s) ? s : null;
}

/** UTMs plus fbclid (when it looks like one). Empty → null. */
export function pickAttribution(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = clean(obj[k]);
    if (v) out[k] = v;
  }
  for (const k of CLICK_ID_KEYS) {
    const v = cleanClickId(obj[k]);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
