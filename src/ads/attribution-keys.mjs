// The seven keys Creative Factory / 06-utm-hidden-fields writes.
// utm_content leading digits = FundHub ad id (fundhub_ad_id in 286).

export const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "landing_path", "referrer_domain"
];

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 512) : null;
}

/** Raw UTMs only. Empty → null. Never keeps fbclid. */
export function pickAttribution(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = clean(obj[k]);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
