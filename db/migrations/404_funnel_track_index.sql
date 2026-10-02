-- 404 — the index the funnel tracking cap needs
--
-- WHY THIS EXISTS
--
-- POST /api/public/slo-interest kind "track" (src/funnel/track.mjs) saves one
-- events row per funnel event: scroll, video, click, time on page, and the
-- rest in docs/tracking/tracking-spec.md. Before every save it counts how many
-- rows that one browser session saved in the last day (cap: 500):
--
--     WHERE org_id = $1
--       AND idempotency_key LIKE 'funnel-track:%'
--       AND idempotency_key LIKE 'funnel-track:<session>:%'
--       AND created_at > now() - interval '1 day'
--
-- Neither index on events answers that cheaply:
--
--   * idx_events_idem (org_id, idempotency_key) uses the default text
--     ordering. Postgres turns LIKE 'prefix%' into an index range on such an
--     index only when the column's collation is "C". Otherwise it reads every
--     keyed event in the org and tests each one.
--   * idx_events_name (org_id, name, created_at) needs one name. Track rows are
--     spread over about twenty names (funnel.scroll, funnel.video, ...).
--
-- The count runs on every tracked event, so it sits on the busiest path the
-- funnel has, and track rows are the fastest-growing rows in the table.
--
-- WHAT THIS DOES
--
-- A partial btree over track rows only, on (org_id, idempotency_key) with
-- text_pattern_ops. text_pattern_ops compares byte by byte, so
-- LIKE 'funnel-track:<session>:%' becomes an index range under ANY collation.
-- The cap query repeats the literal `idempotency_key LIKE 'funnel-track:%'`
-- (TRACK_CAP_SQL in src/funnel/track.mjs) because Postgres can only use a
-- partial index when the query carries its WHERE; it cannot work out that one
-- LIKE pattern implies another.
--
-- It changes no data and no behaviour. Every count is the same with or without
-- it; only the time taken moves.
--
-- CONCURRENTLY is deliberately NOT used: db/migrate.mjs runs each file inside a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run in one (same as 202 and
-- 237). The plain form blocks writes to events while it builds. It only indexes
-- rows whose key starts 'funnel-track:', and none exist until kind "track"
-- ships, so the build is a single read of the table.

CREATE INDEX IF NOT EXISTS idx_events_funnel_track
  ON events (org_id, idempotency_key text_pattern_ops)
  WHERE idempotency_key LIKE 'funnel-track:%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_events_funnel_track') THEN
    RAISE NOTICE '404: idx_events_funnel_track present';
  ELSE
    RAISE EXCEPTION '404: idx_events_funnel_track was not created';
  END IF;
END $$;
