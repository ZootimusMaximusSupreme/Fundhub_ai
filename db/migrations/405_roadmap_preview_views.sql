-- 405 — /roadmap sample previews: do they raise the Continue rate?
--
-- Read-only. Two views over the events table, no new table, no data change.
-- Events come from POST /api/public/slo-interest kind "track"
-- (src/funnel/track.mjs, docs/tracking/tracking-spec.md):
--
--   funnel.preview_opened  payload.props.deliverable
--   funnel.preview_closed  payload.props.deliverable, payload.props.open_ms
--   funnel.continue        payload.props.step = 1   (the step-1 Continue button)
--   any funnel.* row with payload.page = '/roadmap' means the visitor saw the page
--
-- Every row carries payload.session_id (the browser's sessionStorage fh_sid),
-- so one visitor's opens and their Continue press join on it.
--
-- Rules, owner-set 2026-10-01:
--   * Only people count (payload.actor = 'person'); our own agents and bots do not.
--   * A day is the UTC day of the visitor's first /roadmap event.
--   * "Continued after opening" means a step-1 Continue pressed at or after the
--     visitor's FIRST preview open. A Continue pressed before any open does not
--     count for the opened group.
--   * Rates are NULL when the group is empty, never 0.
--
-- security_invoker, so events' row-level security still decides who sees what.

CREATE OR REPLACE VIEW v_roadmap_preview_continue_daily
WITH (security_invoker = true) AS
WITH sess AS (
  SELECT
    e.org_id,
    e.payload->>'session_id' AS session_id,
    min(e.created_at) FILTER (WHERE e.payload->>'page' = '/roadmap')                          AS first_seen_at,
    min(e.created_at) FILTER (WHERE e.name = 'funnel.preview_opened')                         AS first_open_at,
    array_agg(e.created_at) FILTER (WHERE e.name = 'funnel.continue'
                                      AND e.payload->'props'->>'step' = '1')                  AS continue_ats
  FROM events e
  WHERE e.name LIKE 'funnel.%'
    AND e.payload->>'page' = '/roadmap'
    AND e.payload->>'actor' = 'person'
    AND e.payload->>'session_id' IS NOT NULL
  GROUP BY e.org_id, e.payload->>'session_id'
),
flag AS (
  SELECT
    org_id,
    (first_seen_at AT TIME ZONE 'UTC')::date AS day,
    first_open_at IS NOT NULL AS opened,
    CASE
      WHEN first_open_at IS NOT NULL
        THEN EXISTS (SELECT 1 FROM unnest(continue_ats) t WHERE t >= first_open_at)
      ELSE COALESCE(cardinality(continue_ats), 0) > 0
    END AS continued
  FROM sess
  WHERE first_seen_at IS NOT NULL
)
SELECT
  org_id,
  day,
  count(*) FILTER (WHERE opened)                                    AS opened_visitors,
  count(*) FILTER (WHERE opened AND continued)                      AS opened_continued,
  round((count(*) FILTER (WHERE opened AND continued))::numeric
        / NULLIF(count(*) FILTER (WHERE opened), 0), 4)             AS opened_continue_rate,
  count(*) FILTER (WHERE NOT opened)                                AS unopened_visitors,
  count(*) FILTER (WHERE NOT opened AND continued)                  AS unopened_continued,
  round((count(*) FILTER (WHERE NOT opened AND continued))::numeric
        / NULLIF(count(*) FILTER (WHERE NOT opened), 0), 4)         AS unopened_continue_rate
FROM flag
GROUP BY org_id, day;

COMMENT ON VIEW v_roadmap_preview_continue_daily IS
  'Per UTC day and org: /roadmap visitors who opened any sample preview vs those who opened none, and how many of each pressed step-1 Continue (opened group: at or after their first open). Rates are NULL on an empty group. People only (405).';

CREATE OR REPLACE VIEW v_roadmap_preview_open_ms_daily
WITH (security_invoker = true) AS
SELECT
  e.org_id,
  (e.created_at AT TIME ZONE 'UTC')::date                          AS day,
  e.payload->'props'->>'deliverable'                               AS deliverable,
  count(*)                                                         AS closes,
  round(avg((e.payload->'props'->>'open_ms')::numeric), 0)         AS avg_open_ms
FROM events e
WHERE e.name = 'funnel.preview_closed'
  AND e.payload->>'actor' = 'person'
  AND e.payload->'props'->>'deliverable' IS NOT NULL
  AND e.payload->'props'->>'open_ms' ~ '^[0-9]+$'
GROUP BY e.org_id, (e.created_at AT TIME ZONE 'UTC')::date, e.payload->'props'->>'deliverable';

COMMENT ON VIEW v_roadmap_preview_open_ms_daily IS
  'Per UTC day, org and deliverable: how many closes were recorded and the average open_ms (milliseconds the sample stayed open). People only (405).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT ON public.v_roadmap_preview_continue_daily TO fundhub_app;
    GRANT SELECT ON public.v_roadmap_preview_open_ms_daily TO fundhub_app;
  END IF;
END $$;
