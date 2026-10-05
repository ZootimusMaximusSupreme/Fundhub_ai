// Ad numbers: reading our number off a Meta ad, and Link (spec M0 step 5).
//
// Two halves:
//   * Pure helpers (no database) the Meta sync uses to fill
//     ads.fundhub_ad_number when it is still empty: the ad's own link
//     utm_content first (source 'utm'), then its name, "SLO Ad 93 — …"
//     (source 'name'). A number a person typed (manual) or the loader set
//     (loader) is never overwritten by the sync.
//   * Link and the unmatched list, run inside asStaff() because `ads` forces
//     partner row-level security (spec §4 trap 3).
//
// Numbers are integers: '043' and '43' are one ad. The database stores text
// (ads.fundhub_ad_number, one to nine digits, 377:569), so we write the
// unpadded integer as text.

/* The same shape fundhub_ad_id() reads (286:81-84): leading digits, then
   optionally -slug or _slug. Anything else is not an ad number. */
const UTM_CONTENT_RE = /^([0-9]{1,9})(?:[-_]\S*)?$/;

/* "SLO Ad 93 — Haynes…", "Ad 7", "ad #12". The word Ad, then the number, and
   the number must end there (so "Ad 2026-10-04" is not ad 2026). */
const NAME_RE = /(?:^|[^a-z0-9])ad\s*#?\s*([0-9]{1,9})(?![0-9-])/i;

/** '043' / 43 / ' 43 ' → 43. Anything not 1-9 digits (after trimming) → null. */
export function normalizeAdNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!/^[0-9]{1,9}$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return n > 0 ? n : null;
}

/** utm_content → our number, or null. "43-ringlights" → 43, "oVid: SLO2" → null. */
export function adNumberFromUtmContent(content) {
  if (content === null || content === undefined) return null;
  const m = UTM_CONTENT_RE.exec(String(content).trim());
  return m ? normalizeAdNumber(m[1]) : null;
}

/** An ad name → our number, or null. "SLO Ad 93 — Haynes" → 93. */
export function adNumberFromName(name) {
  if (typeof name !== "string") return null;
  const m = NAME_RE.exec(name);
  return m ? normalizeAdNumber(m[1]) : null;
}

/* utm_content out of a query string ("utm_source=fb&utm_content=43-x") or a
   full URL. Meta's url_tags is a bare query string. */
function utmContentFrom(queryOrUrl) {
  if (typeof queryOrUrl !== "string" || !queryOrUrl.trim()) return null;
  const s = queryOrUrl.trim();
  const q = s.includes("?") ? s.slice(s.indexOf("?") + 1) : s;
  try {
    return new URLSearchParams(q.split("#")[0]).get("utm_content");
  } catch {
    return null;
  }
}

/** The ad's destination link from Meta's creative, or null. */
export function landingUrlFromCreative(creative) {
  if (!creative || typeof creative !== "object") return null;
  const spec = creative.object_story_spec || {};
  const candidates = [
    creative.link_url,
    spec.link_data?.link,
    spec.video_data?.call_to_action?.value?.link,
    spec.template_data?.link,
    spec.photo_data?.call_to_action?.value?.link
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c.trim())) return c.trim().slice(0, 2000);
  }
  return null;
}

/**
 * Our number for one Meta ad row from the ads list, or null.
 * → { number, source: 'utm' | 'name', landingUrl } — number may be null.
 * utm first (the link is what leads arrive on), then the name.
 */
export function adNumberFromMetaAd(row) {
  const creative = row?.creative || null;
  const landingUrl = landingUrlFromCreative(creative);
  const fromUtm =
    adNumberFromUtmContent(utmContentFrom(creative?.url_tags)) ??
    adNumberFromUtmContent(utmContentFrom(landingUrl));
  if (fromUtm) return { number: fromUtm, source: "utm", landingUrl };
  const fromName = adNumberFromName(row?.name);
  if (fromName) return { number: fromName, source: "name", landingUrl };
  return { number: null, source: null, landingUrl };
}

/** A Meta ad id: 15 to 30 digits (fundhub_meta_ad_id in 411). */
export const META_AD_ID_RE = /^[0-9]{15,30}$/;

/**
 * Link: set the number (source 'manual') on every ads row in the org with that
 * Meta ad id or that name. Run inside asStaff(). → the rows changed.
 */
export async function linkAdNumber(tx, { orgId, adNumber, metaAdId = null, name = null }) {
  const n = normalizeAdNumber(adNumber);
  if (!n) throw Object.assign(new Error("ad_number must be 1 to 9 digits"), { code: "AD_NUMBER_INVALID" });
  const id = metaAdId == null ? null : String(metaAdId).trim();
  const nm = name == null ? null : String(name).trim();
  if (id && !META_AD_ID_RE.test(id)) {
    throw Object.assign(new Error("meta_ad_id must be Meta's ad id (15 to 30 digits)"), { code: "META_AD_ID_INVALID" });
  }
  if (!id && !nm) {
    throw Object.assign(new Error("send meta_ad_id, name, or both"), { code: "NOTHING_TO_LINK" });
  }
  const { rows } = await tx.query(
    `UPDATE ads
        SET fundhub_ad_number = $2,
            fundhub_ad_number_source = 'manual',
            updated_at = now()
      WHERE org_id = $1
        AND (($3::text IS NOT NULL AND external_id = $3)
          OR ($4::text IS NOT NULL AND lower(btrim(name)) = lower(btrim($4))))
      RETURNING id, external_id, name, fundhub_ad_number, fundhub_ad_number_source`,
    [orgId, String(n), id || null, nm || null]
  );
  return rows;
}

/**
 * Unmatched: what leads and SLO visitors arrived on that resolved to no ad
 * number, grouped by (utm_content, Meta ad id), most people first. Run inside
 * asStaff() so the resolver can see the ads rows.
 */
export async function listUnmatched(tx, { orgId, limit = 100 }) {
  const { rows } = await tx.query(
    `WITH refs AS (
       SELECT utm_content, meta_ad_id, 'lead'::text AS kind, captured_at AS seen_at
         FROM v_client_ad_number
        WHERE org_id = $1 AND ad_number IS NULL
          AND (meta_ad_id IS NOT NULL OR btrim(coalesce(utm_content, '')) <> '')
       UNION ALL
       SELECT utm_content, meta_ad_id, 'visitor', first_seen_at
         FROM v_visitor_ad_number
        WHERE org_id = $1 AND ad_number IS NULL
          AND is_demo IS NOT TRUE
          AND coalesce(actor, 'person') = 'person'
          AND (meta_ad_id IS NOT NULL OR btrim(coalesce(utm_content, '')) <> '')
     )
     SELECT r.utm_content, r.meta_ad_id,
            (count(*) FILTER (WHERE r.kind = 'lead'))::int    AS leads,
            (count(*) FILTER (WHERE r.kind = 'visitor'))::int AS visitors,
            min(r.seen_at) AS first_seen_at,
            max(r.seen_at) AS last_seen_at,
            (SELECT count(*)::int FROM ads a
              WHERE a.org_id = $1
                AND ((r.meta_ad_id IS NOT NULL AND a.external_id = r.meta_ad_id)
                  OR (btrim(coalesce(r.utm_content, '')) <> ''
                      AND lower(btrim(a.name)) = lower(btrim(r.utm_content))))) AS ads_known
       FROM refs r
      GROUP BY r.utm_content, r.meta_ad_id
      ORDER BY count(*) DESC, max(r.seen_at) DESC
      LIMIT $2`,
    [orgId, limit]
  );
  return rows;
}
