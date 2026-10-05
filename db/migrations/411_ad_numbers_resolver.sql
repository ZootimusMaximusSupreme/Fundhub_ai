-- 411_ad_numbers_resolver.sql — marketing machine M0 step 5: every lead gets its
-- ad number. Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 5.
-- Lane A migration range 406-415; 412 adds the tag views and the lead level.
--
-- WHY THIS EXISTS. The live ads were loaded by hand with Meta's dynamic
-- parameters: utm_campaign is the campaign NAME, utm_content is the ad NAME
-- ("oVid: SLO2") and utm_term is META'S ad id. fundhub_ad_id() (286:81-84) reads
-- only leading digits of utm_content, so client_ad_attribution.ad_id is empty
-- for every live-ad lead (ops/workflows/roadmap-marketing-2026-10-04.json:
-- 2030-2063). The resolver below tries three things in order:
--
--   1. utm_content's leading digits                 (the ads the machine loads, 10.3)
--   2. a utm_term of 15+ digits = ads.external_id   → that ad's fundhub_ad_number
--   3. utm_content = ads.name (trimmed, any case)   → that ad's fundhub_ad_number
--
-- NUMBERS ARE COMPARED AS INTEGERS: '043' and '43' are one ad
-- (api/read/ad-spine.mjs AD_NUMBER_MATCH). Both sides are CHECKed to one-to-nine
-- digits (286:116-117, 377:569), so the ::int casts cannot raise.
--
-- NEVER A GUESS. Steps 2 and 3 answer only when every matching ads row agrees
-- on ONE number. Two rows with the same name and different numbers answer
-- nothing, and the lead stays unmatched (it then shows on the Ads tab with Link).
--
-- ROW-LEVEL SECURITY. `ads` forces partner RLS (045/046). The function and the
-- views here are SECURITY INVOKER, so they see exactly the ads rows the caller
-- may see. Every marketing reader runs them inside asStaff() (spec §4 trap 3).
-- A bare query sees no ads rows, so only step 1 can answer there.
--
-- This file writes no ads / ad_scripts / campaigns rows except the one-time
-- backfill of fundhub_ad_number_source below. `ads` FORCEs row-level security,
-- so the actor is set to staff first, transaction-local, exactly as 377 Part 0
-- does (is_local = true: migrate.mjs wraps each file in BEGIN/COMMIT).

SELECT set_config('fundhub.actor', 'staff', true);

-- ─── 1. ads: one number may run in several ad sets ──────────────────────────
-- ads_fundhub_number_uq (377:575) allowed one Meta ad per number. A number that
-- runs in two ad sets is two Meta ads, and a v2 load would fail on it. The
-- number stays the bridge to leads; a plain index keeps the join fast.
DROP INDEX IF EXISTS public.ads_fundhub_number_uq;
CREATE INDEX IF NOT EXISTS ads_fundhub_number_idx
  ON public.ads (org_id, fundhub_ad_number) WHERE fundhub_ad_number IS NOT NULL;

-- Resolver steps 2 and 3 look ads up by Meta id and by name, within an org.
CREATE INDEX IF NOT EXISTS ads_org_external_idx
  ON public.ads (org_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ads_org_name_lower_idx
  ON public.ads (org_id, lower(btrim(name)));

-- Where the number came from: typed on the Ads tab (manual), set by the M4
-- loader (loader), read off the ad's own link utm_content (utm), or read off the
-- ad's name "… Ad 93 …" (name). NULL = no number.
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS fundhub_ad_number_source text;
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_fundhub_ad_number_source_ck;
ALTER TABLE public.ads ADD CONSTRAINT ads_fundhub_ad_number_source_ck
  CHECK (fundhub_ad_number_source IS NULL
      OR fundhub_ad_number_source IN ('manual', 'loader', 'utm', 'name'));

-- Every number already on file was typed by a person through
-- api/campaigns/link-asset.mjs (the only writer before this step).
UPDATE public.ads
   SET fundhub_ad_number_source = 'manual'
 WHERE fundhub_ad_number IS NOT NULL AND fundhub_ad_number_source IS NULL;

-- The ad's destination link, read from its creative by the sync. Used by
-- v_ad_offer_tag (412) to match the landing page to an offer's steps. NULL =
-- Meta did not say (or the sync has not read it yet).
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS landing_url text;

COMMENT ON COLUMN public.ads.fundhub_ad_number IS
  'OURS. The ad number: the leading digits of utm_content (utm_content=43-ringlights → 43). NULL = not set yet. text so it joins client_ad_attribution.ad_id; compare the two as integers. NOT UNIQUE since 411: one number can run in several ad sets, and every Meta ad carrying it counts toward that one number. The source is in fundhub_ad_number_source.';
COMMENT ON COLUMN public.ads.fundhub_ad_number_source IS
  'Where fundhub_ad_number came from: manual (typed on the Ads tab or the link-asset route), loader (M4 loaded the ad), utm (the ad''s own link utm_content), name (the ad''s name, "SLO Ad 93 — …"). NULL when there is no number. The sync fills utm/name only when the number is NULL, so it never overwrites a person or the loader.';
COMMENT ON COLUMN public.ads.landing_url IS
  'The ad''s destination link as Meta reports it on the creative, read by the sync. Matched to an offer''s step pages by v_ad_offer_tag. NULL = unknown.';

-- ─── 2. ad_metrics_daily.link_clicks ────────────────────────────────────────
-- `clicks` counts every click (likes, profile, see-more). CTR in the numbers
-- (11.1) is link clicks ÷ impressions, from Meta's inline_link_clicks.
-- NULL = Meta did not answer (rows synced before this column existed, too).
ALTER TABLE public.ad_metrics_daily ADD COLUMN IF NOT EXISTS link_clicks bigint;
ALTER TABLE public.ad_metrics_daily DROP CONSTRAINT IF EXISTS ad_metrics_daily_link_clicks_ck;
ALTER TABLE public.ad_metrics_daily ADD CONSTRAINT ad_metrics_daily_link_clicks_ck
  CHECK (link_clicks IS NULL OR link_clicks >= 0);
COMMENT ON COLUMN public.ad_metrics_daily.link_clicks IS
  'Meta inline_link_clicks: clicks on the ad''s link. CTR = link_clicks / impressions (spec 11.1). NULL = Meta did not report it; never defaulted to 0.';

-- ─── 3. the resolver ────────────────────────────────────────────────────────
-- fundhub_meta_ad_id(term) → the utm_term when it looks like a Meta ad id (15+
-- digits), else NULL.
CREATE OR REPLACE FUNCTION public.fundhub_meta_ad_id(term text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN btrim(coalesce(term, '')) ~ '^[0-9]{15,30}$' THEN btrim(term) END
$$;

-- fundhub_resolve_ad_number(org, utm_content, utm_term) → (ad_number, source)
-- One row, or no row when nothing matched. source is utm_content | meta_ad_id |
-- ad_name: which step answered. SECURITY INVOKER (the default), so `ads` is read
-- under the caller's row-level security.
CREATE OR REPLACE FUNCTION public.fundhub_resolve_ad_number(p_org uuid, p_content text, p_term text)
RETURNS TABLE (ad_number integer, source text)
LANGUAGE sql STABLE AS $$
  SELECT x.n, x.src
    FROM (
      SELECT fundhub_ad_id(p_content)::int AS n, 'utm_content'::text AS src, 1 AS step
      UNION ALL
      SELECT min(a.fundhub_ad_number::int), 'meta_ad_id', 2
        FROM ads a
       WHERE a.org_id = p_org
         AND fundhub_meta_ad_id(p_term) IS NOT NULL
         AND a.external_id = fundhub_meta_ad_id(p_term)
         AND a.fundhub_ad_number IS NOT NULL
      HAVING count(DISTINCT a.fundhub_ad_number::int) = 1
      UNION ALL
      SELECT min(a.fundhub_ad_number::int), 'ad_name', 3
        FROM ads a
       WHERE a.org_id = p_org
         AND btrim(coalesce(p_content, '')) <> ''
         AND lower(btrim(a.name)) = lower(btrim(p_content))
         AND a.fundhub_ad_number IS NOT NULL
      HAVING count(DISTINCT a.fundhub_ad_number::int) = 1
    ) x
   WHERE x.n IS NOT NULL
   ORDER BY x.step
   LIMIT 1
$$;

COMMENT ON FUNCTION public.fundhub_resolve_ad_number(uuid, text, text) IS
  'Spec M0 step 5. The ad number for one set of UTMs: 1) utm_content leading digits, 2) a 15+ digit utm_term equal to ads.external_id, 3) utm_content equal to ads.name. Steps 2-3 answer only when every matching ad agrees on one number. Integer, so 043 = 43. Reads ads under the caller''s RLS: run inside asStaff().';

-- ─── 4. v_client_ad_number: each lead's ad number ───────────────────────────
-- One row per client_ad_attribution row (first touch, keyed on client_id).
-- ad_number NULL = unmatched: utm_content / meta_ad_id say what to Link.
CREATE OR REPLACE VIEW public.v_client_ad_number
WITH (security_invoker = true) AS
SELECT
  caa.client_id,
  caa.org_id,
  r.ad_number,
  r.source                           AS ad_number_source,
  fundhub_meta_ad_id(caa.utm_term)   AS meta_ad_id,
  caa.utm_campaign,
  caa.utm_content,
  caa.utm_term,
  caa.landing_path,
  caa.captured_at
FROM client_ad_attribution caa
LEFT JOIN LATERAL fundhub_resolve_ad_number(caa.org_id, caa.utm_content, caa.utm_term) r ON true;

COMMENT ON VIEW public.v_client_ad_number IS
  'Spec M0 step 5. Each lead''s ad number through fundhub_resolve_ad_number (utm_content digits, then Meta ad id in utm_term, then ad name). ad_number NULL = unmatched. security_invoker: run inside asStaff() or the ads steps see nothing.';

-- ─── 5. v_visitor_ad_number: SLO visitors, one row per email ────────────────
-- An SLO visitor becomes a client only at checkout. Their first touch is the
-- earliest slo.contact_started event for that email (one per email per day,
-- api/public/slo-interest.mjs), whose payload.attribution holds the UTMs
-- (src/ads/attribution-keys.mjs pickAttribution).
CREATE OR REPLACE VIEW public.v_visitor_ad_number
WITH (security_invoker = true) AS
WITH first_touch AS (
  SELECT DISTINCT ON (e.org_id, lower(btrim(e.payload->>'email')))
         e.org_id,
         lower(btrim(e.payload->>'email'))                 AS email,
         e.id                                              AS event_id,
         e.client_id,
         e.created_at                                      AS first_seen_at,
         e.payload->>'actor'                               AS actor,
         e.is_demo,
         e.payload->'attribution'->>'utm_campaign'         AS utm_campaign,
         e.payload->'attribution'->>'utm_content'          AS utm_content,
         e.payload->'attribution'->>'utm_term'             AS utm_term,
         coalesce(e.payload->'attribution'->>'landing_path', e.payload->>'landing_path') AS landing_path
    FROM events e
   WHERE e.name = 'slo.contact_started'
     AND btrim(coalesce(e.payload->>'email', '')) <> ''
   ORDER BY e.org_id, lower(btrim(e.payload->>'email')), e.created_at, e.id
)
SELECT
  f.org_id,
  f.email,
  f.event_id,
  f.client_id,
  f.first_seen_at,
  f.actor,
  f.is_demo,
  r.ad_number,
  r.source                         AS ad_number_source,
  fundhub_meta_ad_id(f.utm_term)   AS meta_ad_id,
  f.utm_campaign,
  f.utm_content,
  f.utm_term,
  f.landing_path
FROM first_touch f
LEFT JOIN LATERAL fundhub_resolve_ad_number(f.org_id, f.utm_content, f.utm_term) r ON true;

COMMENT ON VIEW public.v_visitor_ad_number IS
  'Spec M0 step 5. SLO visitors (slo.contact_started events), one row per email at first touch, resolved the same way as v_client_ad_number. actor and is_demo are carried so the numbers can keep only real people.';

-- ─── 6. grants ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT ON public.v_client_ad_number  TO fundhub_app;
    GRANT SELECT ON public.v_visitor_ad_number TO fundhub_app;
    GRANT EXECUTE ON FUNCTION public.fundhub_meta_ad_id(text) TO fundhub_app;
    GRANT EXECUTE ON FUNCTION public.fundhub_resolve_ad_number(uuid, text, text) TO fundhub_app;
  END IF;
END $$;
