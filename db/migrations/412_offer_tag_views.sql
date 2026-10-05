-- 412_offer_tag_views.sql — marketing machine M0 step 5: the tag views and the
-- lead level. Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 5, §11.1
-- (Lead → tag, Lead level) and §17 decisions 9 and 10.
-- Lane A migration range 406-415. Needs 407 (marketing_offers, ad_offer_tags)
-- and 411 (fundhub_resolve_ad_number, v_client_ad_number, ads.landing_url).
--
-- Views only, plus three helper functions. Nothing here writes a row.
--
-- WHERE A TAG COMES FROM, IN ORDER (first answer wins):
--   1. the ad number → its live script's offer_key        (source 'script')
--   2. the ad number → ad_offer_tags                       (source 'ad_offer_tags')
--   3. the Meta campaign → marketing_offers.meta_campaign_ids (source 'campaign')
--   4. the landing page → an offer's step pages            (source 'landing_page')
--
-- A TAG IS NEVER A GUESS. offer_key counts only when it is a real tag in
-- marketing_offers for that org. Steps 3 and 4 answer only when exactly one
-- offer matches: two offers may share a page (§2 item 18; /watch is both Direct
-- Book's and Blueprint's first page, §17 decision 8), and a page two offers
-- share tags nobody. A retired offer still tags its old ads: the tag is
-- permanent (407 trigger).
--
-- ROW-LEVEL SECURITY. ads, campaigns and ad_scripts FORCE partner RLS. Every
-- function and view here is SECURITY INVOKER, so run them inside asStaff()
-- (spec §4 trap 3). A bare query sees no ads, campaigns or scripts.

-- ─── helpers ────────────────────────────────────────────────────────────────

-- fundhub_url_path(url or path) → the lowercased path, no host, no query, no
-- fragment, no trailing slash. '' and '/' → NULL (the home page tags nothing).
--   'https://apply.fundhub.ai/roadmap?x=1' → '/roadmap'
--   '/roadmap/'                             → '/roadmap'
CREATE OR REPLACE FUNCTION public.fundhub_url_path(u text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(
    rtrim(lower(split_part(split_part(
      regexp_replace(btrim(coalesce(u, '')), '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]*', ''),
      '?', 1), '#', 1)), '/'),
    '')
$$;

-- v_offer_page_tag: each page path that belongs to exactly ONE offer.
-- `ad` and `call` steps have no page by design (408).
CREATE OR REPLACE VIEW public.v_offer_page_tag
WITH (security_invoker = true) AS
SELECT m.org_id,
       fundhub_url_path(s.step->>'url') AS path,
       min(m.tag)                        AS offer_tag
  FROM marketing_offers m
 CROSS JOIN LATERAL jsonb_array_elements(m.steps) AS s(step)
 WHERE fundhub_url_path(s.step->>'url') IS NOT NULL
   AND coalesce(s.step->>'type', '') NOT IN ('ad', 'call')
 GROUP BY m.org_id, fundhub_url_path(s.step->>'url')
HAVING count(DISTINCT m.tag) = 1;

COMMENT ON VIEW public.v_offer_page_tag IS
  'Spec M0 step 5. Page path → offer tag, for paths on exactly one offer''s steps. A page two offers share is left out, so it tags nothing.';

-- fundhub_offer_tag_for_number(org, ad number) → (offer_tag, source)
-- Steps 1 and 2. One row or none.
CREATE OR REPLACE FUNCTION public.fundhub_offer_tag_for_number(p_org uuid, p_number integer)
RETURNS TABLE (offer_tag text, source text)
LANGUAGE sql STABLE AS $$
  SELECT x.tag, x.src
    FROM (
      SELECT s.offer_key AS tag, 'script'::text AS src, 1 AS step
        FROM ad_scripts s
       WHERE s.org_id = p_org
         AND s.archived_at IS NULL
         AND s.ad_id IS NOT NULL
         AND s.ad_id::int = p_number
         AND s.offer_key IS NOT NULL
         AND EXISTS (SELECT 1 FROM marketing_offers m
                      WHERE m.org_id = p_org AND m.tag = s.offer_key)
      UNION ALL
      SELECT t.offer_tag, 'ad_offer_tags', 2
        FROM ad_offer_tags t
       WHERE t.org_id = p_org AND t.ad_number = p_number
    ) x
   WHERE p_number IS NOT NULL
   ORDER BY x.step
   LIMIT 1
$$;

-- fundhub_offer_tag_for_lead(org, ad number, Meta ad id, utm_campaign,
-- landing path) → (offer_tag, source). All four steps for one lead or visitor.
-- The lead's Meta campaigns are: the campaign of any ad matching its Meta ad id
-- or its ad number, any campaign whose name is its utm_campaign, and
-- utm_campaign itself when it is a Meta campaign id.
CREATE OR REPLACE FUNCTION public.fundhub_offer_tag_for_lead(
  p_org uuid, p_number integer, p_meta_ad_id text, p_utm_campaign text, p_landing_path text)
RETURNS TABLE (offer_tag text, source text)
LANGUAGE sql STABLE AS $$
  SELECT x.tag, x.src
    FROM (
      SELECT n.offer_tag AS tag, n.source AS src, 1 AS step
        FROM fundhub_offer_tag_for_number(p_org, p_number) n
      UNION ALL
      SELECT min(m.tag), 'campaign', 2
        FROM marketing_offers m
       WHERE m.org_id = p_org
         AND m.meta_campaign_ids && ARRAY(
               SELECT c.external_id
                 FROM campaigns c
                WHERE c.org_id = p_org
                  AND c.external_id IS NOT NULL
                  AND (c.id IN (SELECT a.campaign_id FROM ads a
                                 WHERE a.org_id = p_org
                                   AND ((p_meta_ad_id IS NOT NULL AND a.external_id = p_meta_ad_id)
                                     OR (p_number IS NOT NULL AND a.fundhub_ad_number IS NOT NULL
                                         AND a.fundhub_ad_number::int = p_number)))
                    OR (btrim(coalesce(p_utm_campaign, '')) <> ''
                        AND lower(btrim(c.name)) = lower(btrim(p_utm_campaign))))
               UNION
               SELECT btrim(p_utm_campaign)
                WHERE btrim(coalesce(p_utm_campaign, '')) ~ '^[0-9]{6,30}$')
      HAVING count(DISTINCT m.tag) = 1
      UNION ALL
      SELECT p.offer_tag, 'landing_page', 3
        FROM v_offer_page_tag p
       WHERE p.org_id = p_org AND p.path = fundhub_url_path(p_landing_path)
    ) x
   WHERE x.tag IS NOT NULL
   ORDER BY x.step
   LIMIT 1
$$;

-- ─── v_ad_offer_tag: each Meta ad's offer tag ───────────────────────────────
-- The planner, the Offers screen and every spend number read this.
CREATE OR REPLACE VIEW public.v_ad_offer_tag
WITH (security_invoker = true) AS
SELECT
  a.id                         AS ad_row_id,
  a.org_id,
  a.partner_id,
  a.fundhub_ad_number::int     AS ad_number,
  a.external_id                AS meta_ad_id,
  a.name                       AS ad_name,
  c.external_id                AS meta_campaign_id,
  a.landing_url,
  coalesce(nt.offer_tag, ct.offer_tag, pt.offer_tag) AS offer_tag,
  CASE
    WHEN nt.offer_tag IS NOT NULL THEN nt.source
    WHEN ct.offer_tag IS NOT NULL THEN 'campaign'
    WHEN pt.offer_tag IS NOT NULL THEN 'landing_page'
  END                          AS offer_tag_source
FROM ads a
LEFT JOIN campaigns c ON c.id = a.campaign_id
LEFT JOIN LATERAL fundhub_offer_tag_for_number(
  a.org_id, CASE WHEN a.fundhub_ad_number IS NOT NULL THEN a.fundhub_ad_number::int END) nt ON true
LEFT JOIN LATERAL (
  SELECT min(m.tag) AS offer_tag
    FROM marketing_offers m
   WHERE m.org_id = a.org_id
     AND c.external_id IS NOT NULL
     AND c.external_id = ANY (m.meta_campaign_ids)
  HAVING count(DISTINCT m.tag) = 1
) ct ON true
LEFT JOIN v_offer_page_tag pt
  ON pt.org_id = a.org_id AND pt.path = fundhub_url_path(a.landing_url);

COMMENT ON VIEW public.v_ad_offer_tag IS
  'Spec M0 step 5. Each Meta ad''s offer tag: its number (live script offer_key, else ad_offer_tags), then its campaign (marketing_offers.meta_campaign_ids), then its landing page (v_offer_page_tag). offer_tag NULL = untagged. Run inside asStaff().';

-- ─── v_client_offer_tag: each lead's offer tag ──────────────────────────────
CREATE OR REPLACE VIEW public.v_client_offer_tag
WITH (security_invoker = true) AS
SELECT
  n.client_id,
  n.org_id,
  n.ad_number,
  n.ad_number_source,
  t.offer_tag,
  t.source AS offer_tag_source
FROM v_client_ad_number n
LEFT JOIN LATERAL fundhub_offer_tag_for_lead(
  n.org_id, n.ad_number, n.meta_ad_id, n.utm_campaign, n.landing_path) t ON true;

COMMENT ON VIEW public.v_client_offer_tag IS
  'Spec M0 step 5 / 11.1. Each lead''s offer tag, starting from v_client_ad_number: ad number → script offer_key or ad_offer_tags, then its Meta campaign, then its landing_path. offer_tag NULL = untagged. Run inside asStaff().';

-- ─── v_client_level: each lead's furthest level (§17 decision 10) ───────────
-- cold → engaged → warm → pulled → client → funded. A level never goes down:
-- it is the highest level any evidence row proves, and evidence rows are never
-- taken back (a refund does not un-pay, a cancelled booking still counts only
-- if its status says it was booked). Demo rows never count as evidence.
-- The mapping to tables is written out in docs/marketing/metrics.md.
CREATE OR REPLACE VIEW public.v_client_level
WITH (security_invoker = true) AS
WITH ev AS (
  SELECT
    cl.id     AS client_id,
    cl.org_id,
    cl.is_demo,
    -- engaged: survey answered
    EXISTS (SELECT 1 FROM events e
             WHERE e.client_id = cl.id AND e.org_id = cl.org_id
               AND e.name = 'survey.submitted' AND e.is_demo IS NOT TRUE) AS survey_answered,
    -- engaged: a call booked (matched by client, or by attendee email)
    EXISTS (SELECT 1 FROM bookings b
             WHERE b.org_id = cl.org_id
               AND b.status IN ('booked', 'rescheduled', 'noshow', 'completed')
               AND (b.client_id = cl.id
                    OR (b.client_id IS NULL AND cl.email IS NOT NULL
                        AND lower(btrim(b.attendee_email)) = lower(btrim(cl.email))))) AS call_booked,
    -- warm: had a sales call (a call_outcomes row that is not a no-show)
    EXISTS (SELECT 1 FROM call_outcomes co
             WHERE co.client_id = cl.id AND co.org_id = cl.org_id
               AND co.outcome <> 'no_show' AND co.is_demo IS NOT TRUE) AS had_call,
    -- pulled: a soft pull on file (a credit report row, or a fulfilled pull request)
    (EXISTS (SELECT 1 FROM crs_results r
              WHERE r.client_id = cl.id AND r.org_id = cl.org_id AND r.is_demo IS NOT TRUE)
     OR EXISTS (SELECT 1 FROM soft_pull_requests sp
                 WHERE sp.client_id = cl.id AND sp.org_id = cl.org_id
                   AND sp.status = 'fulfilled')) AS soft_pull_on_file,
    -- client: paid for anything
    (EXISTS (SELECT 1 FROM transactions tx
              WHERE tx.client_id = cl.id AND tx.org_id = cl.org_id
                AND tx.status = 'succeeded' AND tx.is_demo IS NOT TRUE)
     OR EXISTS (SELECT 1 FROM events e
                 WHERE e.client_id = cl.id AND e.org_id = cl.org_id
                   AND e.name = 'diagnostic.paid' AND e.is_demo IS NOT TRUE)) AS paid,
    -- funded: a funding round closed with money
    EXISTS (SELECT 1 FROM funding_rounds fr
             WHERE fr.client_id = cl.id AND fr.org_id = cl.org_id
               AND fr.status IN ('funded', 'closed')
               AND fr.funded_amount > 0
               AND fr.is_demo IS NOT TRUE) AS funded
  FROM clients cl
)
SELECT
  ev.client_id,
  ev.org_id,
  ev.is_demo,
  CASE
    WHEN ev.funded            THEN 'funded'
    WHEN ev.paid              THEN 'client'
    WHEN ev.soft_pull_on_file THEN 'pulled'
    WHEN ev.had_call          THEN 'warm'
    WHEN ev.survey_answered OR ev.call_booked THEN 'engaged'
    ELSE 'cold'
  END AS level,
  CASE
    WHEN ev.funded            THEN 5
    WHEN ev.paid              THEN 4
    WHEN ev.soft_pull_on_file THEN 3
    WHEN ev.had_call          THEN 2
    WHEN ev.survey_answered OR ev.call_booked THEN 1
    ELSE 0
  END AS level_rank,
  ev.survey_answered,
  ev.call_booked,
  ev.had_call,
  ev.soft_pull_on_file,
  ev.paid,
  ev.funded
FROM ev;

COMMENT ON VIEW public.v_client_level IS
  'Spec 11.1 / §17 decision 10. Each lead''s furthest level: cold, engaged (survey.submitted event or a booked/rescheduled/noshow/completed booking), warm (a call_outcomes row that is not no_show), pulled (a crs_results row or a fulfilled soft_pull_requests row), client (a succeeded transaction or a diagnostic.paid event), funded (a funding_rounds row funded/closed with funded_amount > 0). Demo rows never count. Mapping: docs/marketing/metrics.md.';

-- ─── grants ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT ON public.v_offer_page_tag, public.v_ad_offer_tag,
                    public.v_client_offer_tag, public.v_client_level TO fundhub_app;
    GRANT EXECUTE ON FUNCTION public.fundhub_url_path(text) TO fundhub_app;
    GRANT EXECUTE ON FUNCTION public.fundhub_offer_tag_for_number(uuid, integer) TO fundhub_app;
    GRANT EXECUTE ON FUNCTION public.fundhub_offer_tag_for_lead(uuid, integer, text, text, text) TO fundhub_app;
  END IF;
END $$;
