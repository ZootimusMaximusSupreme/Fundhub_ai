// Meta match keys we keep for a later server-only Purchase.
//
// docs/tracking/meta-events.md, Phase 4 contract, "fbclid / fbc / fbp": the
// browser sends `fbc` and `fbp` on the checkout, and a payment webhook that
// fires minutes or weeks later has no browser to ask. So the server keeps them.
//
//   fbc   Meta's click id cookie, "fb.1.<ms>.<fbclid>". Built from fbclid when
//         the cookie is missing (same rule the browser uses).
//   fbp   Meta's browser id cookie, "fb.1.<ms>.<random>".
//
// WHERE THEY LIVE
//   - On the $297 order: that order's slo.checkout_started event row
//     (payload.meta_match: fbc, fbp, client ip, user agent), written by
//     api/public/slo-checkout.mjs.
//   - On the client: clients.custom_fields.meta_fbc / meta_fbp, FIRST TOUCH.
//     A blank is filled; a value already there is never replaced. Same rule the
//     ad tags follow (src/ads/store.mjs), and for the same reason: anyone can
//     type anyone's email at a public door, so a later stranger must not swap
//     a real client's click id for their own. IP and user agent are NOT kept
//     on the client — they belong to one request, not to a person.
//
// The shape checks are src/meta/user-data.mjs's (cleanFbc / cleanFbp), not a
// second copy. Raw email and phone are never stored here.

import { cleanFbc, cleanFbp } from "../meta/user-data.mjs";

/* fbclid is base64url-ish; same characters cleanFbc accepts after "fb.1.<ms>.". */
const FBCLID_RE = /^[A-Za-z0-9_.-]{1,400}$/;

export function cleanFbclid(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return FBCLID_RE.test(s) ? s : null;
}

/** "fb.1.<ms>.<fbclid>" — Meta's own fbc format. null when fbclid is junk. */
export function fbcFromFbclid(fbclid, ms = Date.now()) {
  const id = cleanFbclid(fbclid);
  const t = Math.floor(Number(ms));
  if (!id || !Number.isFinite(t) || t <= 0) return null;
  return cleanFbc(`fb.1.${t}.${id}`);
}

/** fbclid off a landing URL's query string, or null. */
export function fbclidFromUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(String(rawUrl), "https://apply.fundhub.ai");
    return cleanFbclid(u.searchParams.get("fbclid"));
  } catch {
    return null;
  }
}

/**
 * The click ids in one or more plain objects (a POST body, hidden fields, a
 * form bag). First clean value wins, per key. No fbc but an fbclid (in a bag,
 * or on `fbclidUrl`) → fbc is built from it at `seenAtMs`.
 * → { fbc, fbp } (either may be null).
 */
export function pickMetaClickIds(bags = [], { fbclidUrl = null, seenAtMs = Date.now() } = {}) {
  let fbc = null;
  let fbp = null;
  let fbclid = null;
  for (const bag of bags) {
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) continue;
    if (!fbc) fbc = cleanFbc(bag.fbc);
    if (!fbp) fbp = cleanFbp(bag.fbp);
    if (!fbclid) fbclid = cleanFbclid(bag.fbclid);
  }
  if (!fbclid && fbclidUrl) fbclid = fbclidFromUrl(fbclidUrl);
  if (!fbc && fbclid) fbc = fbcFromFbclid(fbclid, seenAtMs);
  return { fbc, fbp };
}

/**
 * Fill meta_fbc / meta_fbp on the client where blank. Never overwrites.
 * No-op (false) when there is nothing to store. Org-bound.
 */
export async function storeClientMetaClickIds(db, { orgId, clientId, fbc = null, fbp = null } = {}) {
  const c = cleanFbc(fbc);
  const p = cleanFbp(fbp);
  if (!db || !orgId || !clientId || (!c && !p)) return false;
  const r = await db.query(
    `UPDATE clients
        SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
              'meta_fbc', CASE WHEN COALESCE(custom_fields->>'meta_fbc', '') = '' THEN $3::text END,
              'meta_fbp', CASE WHEN COALESCE(custom_fields->>'meta_fbp', '') = '' THEN $4::text END))
      WHERE id = $1::uuid AND org_id = $2::uuid
      RETURNING id`,
    [clientId, orgId, c, p]
  );
  return r.rows.length > 0;
}

/** { fbc, fbp } off a client's custom_fields (already loaded). */
export function clientMetaClickIds(customFields) {
  const cf = customFields && typeof customFields === "object" ? customFields : {};
  return { fbc: cleanFbc(cf.meta_fbc), fbp: cleanFbp(cf.meta_fbp) };
}
