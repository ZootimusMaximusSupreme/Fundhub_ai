-- 378_ad_video_metrics.sql — where people stop watching an ad, stored.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE PROBLEM, IN ONE SENTENCE
--
-- Meta already counts how far into a video ad each person got, and we throw
-- every one of those numbers away. api/campaigns/sync.mjs:242 asks Meta for
-- "spend,impressions,clicks,ctr,actions,purchase_roas,date_start" and nothing
-- else, so the drop-off curve arrives nowhere and lands in no column. The gap
-- was written down on 2026-09-08 at docs/journeys/ad-label-spine-flow.md:152-156
-- and again in 377_marketing_label_spine.sql:50-51, which said only "no ad-level
-- video tracking" and left it for this file.
--
-- Nothing has to be measured on our side to fix it. No pixel, no beacon, no
-- player, no new service. It is seven extra field names on a request we already
-- make every sync.
--
--   (The VSL on our own funnel page is a DIFFERENT problem and is not this file.
--    No ad platform can see inside a video hosted on our own page — see
--    docs/specs/marketing-e2e/THE-TARGET.md, "Answer 3". This migration is only
--    about the video INSIDE a Meta ad.)
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES
--
-- Seven nullable bigint columns on ad_metrics_daily (046_ad_platforms.sql:432).
-- No new table, no new index, no new trigger, no backfill. Additive and
-- idempotent: every ADD COLUMN is IF NOT EXISTS and the CHECK is created only
-- when it is not already there, so running this twice is a no-op.
--
--   video_3sec_watched      got past the first 3 seconds
--   video_p25_watched       reached a quarter of the way in
--   video_p50_watched       reached halfway
--   video_p75_watched       reached three quarters
--   video_p95_watched       nearly finished
--   video_p100_watched      watched the whole thing
--   video_thruplay_watched  watched 15 seconds, or all of it if it is shorter
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NULLABLE, WITH NO DEFAULT. THIS IS THE WHOLE POINT OF THE FILE.
--
-- A video ad that nobody watched has ZERO. A photo ad has NOTHING — there is no
-- video, so there is no such number and there never will be. Those are two
-- different facts about two different ads and they must not look the same.
--
-- DEFAULT 0 would destroy that difference permanently and silently: every photo
-- ad in the table would read "nobody watched it", which is not false so much as
-- meaningless, and no later migration could tell the invented zeros from the
-- real ones. So these seven columns are the opposite shape to their neighbours
-- spend_cents / impressions / clicks / conversions, which are NOT NULL DEFAULT 0
-- (046:440-448) because every ad has those whether or not it moved.
--
-- The same rule is already written down for the two stats tables in
-- 302_analytics_connections.sql: NULL means "the platform did not answer",
-- never 0. This file follows it.
--
--   ⚠️ FOR ANYONE WRITING A SCREEN ON THESE: an empty cell means we do not know.
--      Do not COALESCE it to 0 on the way out, and do not print "0" for it. A
--      rate calculated from a NULL is NULL, not zero.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NO HOOK RATE AND NO HOLD RATE HERE, ON PURPOSE
--
-- The two numbers everyone in paid media actually reads are hook rate
-- (3-second views ÷ impressions) and hold rate (p75 ÷ 3-second views). Neither
-- is a column here and neither is a view here. They are arithmetic over numbers
-- this file stores, and a rate defined in two places is how two different
-- answers to the same question appear on two different screens. One definition,
-- built once, on top of these columns.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: NOTHING TO DO, AND HERE IS THE PROOF
--
-- ad_metrics_daily already has row-level security, applied by
-- 046_ad_platforms.sql:735 calling fundhub_apply_partner_rls('ad_metrics_daily').
-- That function (045_creative_factory.sql:59-72) enables RLS, FORCEs it, and
-- installs ONE policy for ALL commands keyed on the row's partner_id:
--
--     USING      (partner_id = fundhub_current_partner() OR fundhub_is_staff())
--     WITH CHECK (partner_id = fundhub_current_partner() OR fundhub_is_staff())
--
-- A Postgres row policy filters ROWS, not columns. It has no column list, so a
-- column added to a table is covered by that table's policy from the moment it
-- exists — there is nothing to re-grant and no policy to re-issue. A partner who
-- cannot see the row cannot see these seven values on it either.
--
-- Column privileges are the other half of that, and they are also untouched:
-- nothing in db/ has ever issued a per-column GRANT on ad_metrics_daily, so the
-- app role's table-level grant covers the new columns automatically.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--   * No backfill. Meta's insights endpoint will serve history on the next sync
--     for the window that sync asks for (7 days, api/campaigns/sync.mjs:239).
--     Rows already stored keep NULL, which is honest: we did not ask, so we do
--     not know.
--   * No average-watch-time or video-play-count column. Meta reports those too,
--     but nothing named them as needed and a column nobody fills is worse than
--     no column. Adding one later is one ALTER TABLE.
--   * No unique index or key change. The upsert target stays (ad_id, date),
--     046:461.
--   * No change to the CHECK on the existing columns. Its constraint name is
--     ad_metrics_daily_nonneg_ck (046:454) and it is left exactly as it is —
--     these seven get their own, separately named, so neither can be dropped by
--     accident while trying to change the other.


-- ---------------------------------------------------------------------------
-- A. The seven columns
-- ---------------------------------------------------------------------------

-- Got past the first three seconds. This is the "did the opening stop them"
-- number, and it is the denominator of nothing and the numerator of hook rate.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_3sec_watched bigint;

-- Reached a quarter of the way in.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_p25_watched bigint;

-- Reached halfway.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_p50_watched bigint;

-- Reached three quarters. This is the "did the middle hold them" number.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_p75_watched bigint;

-- Nearly finished. Meta reports p95 and not p90; this column is named after the
-- field it is filled from so nobody has to guess which one it is.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_p95_watched bigint;

-- Watched the whole thing.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_p100_watched bigint;

-- ThruPlay: watched 15 seconds, or all of it when the video is shorter than 15
-- seconds. It is Meta's own billing-grade "a real view" number and it is NOT a
-- percentage point on the curve, which is why it is not named p-anything.
ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_thruplay_watched bigint;


-- ---------------------------------------------------------------------------
-- B. The one guard: a count cannot be negative
-- ---------------------------------------------------------------------------
--
-- NULL passes. That is the point of the whole file, so it is spelled out in the
-- constraint rather than left to be inferred: "IS NULL OR >= 0".
--
-- No constraint claims the curve only ever falls (p100 <= p75 <= p50 …). It
-- looks true and it is not reliably true: Meta's numbers are estimated,
-- de-duplicated and restated after the fact, so a day can land with p50 one
-- higher than p25 and that is Meta's arithmetic, not corruption. A CHECK on it
-- would reject a real sync and lose the whole day's row.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ad_metrics_daily_video_nonneg_ck'
       AND conrelid = 'public.ad_metrics_daily'::regclass
  ) THEN
    ALTER TABLE ad_metrics_daily
      ADD CONSTRAINT ad_metrics_daily_video_nonneg_ck
      CHECK (
        (video_3sec_watched     IS NULL OR video_3sec_watched     >= 0) AND
        (video_p25_watched      IS NULL OR video_p25_watched      >= 0) AND
        (video_p50_watched      IS NULL OR video_p50_watched      >= 0) AND
        (video_p75_watched      IS NULL OR video_p75_watched      >= 0) AND
        (video_p95_watched      IS NULL OR video_p95_watched      >= 0) AND
        (video_p100_watched     IS NULL OR video_p100_watched     >= 0) AND
        (video_thruplay_watched IS NULL OR video_thruplay_watched >= 0)
      );
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- C. What each column means, on the column itself
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN ad_metrics_daily.video_3sec_watched IS
  'How many people got past the first 3 seconds of this ad''s video on this day. From Meta''s video_3sec_watched_actions. NULL means Meta did not report it — a photo ad has no such number at all, and a sync that ran before migration 378 never asked. NULL IS NOT ZERO: zero means a video nobody watched, NULL means there is nothing to know. Never COALESCE it to 0.';
COMMENT ON COLUMN ad_metrics_daily.video_p25_watched IS
  'How many people reached a quarter of the way into the video. From Meta''s video_p25_watched_actions. NULL means not reported, which is not the same as zero.';
COMMENT ON COLUMN ad_metrics_daily.video_p50_watched IS
  'How many people reached halfway. From Meta''s video_p50_watched_actions. NULL means not reported, which is not the same as zero.';
COMMENT ON COLUMN ad_metrics_daily.video_p75_watched IS
  'How many people reached three quarters of the way in. From Meta''s video_p75_watched_actions. NULL means not reported, which is not the same as zero.';
COMMENT ON COLUMN ad_metrics_daily.video_p95_watched IS
  'How many people nearly finished the video. From Meta''s video_p95_watched_actions — Meta reports 95%, not 90%. NULL means not reported, which is not the same as zero.';
COMMENT ON COLUMN ad_metrics_daily.video_p100_watched IS
  'How many people watched the whole video. From Meta''s video_p100_watched_actions. NULL means not reported, which is not the same as zero.';
COMMENT ON COLUMN ad_metrics_daily.video_thruplay_watched IS
  'ThruPlays: people who watched at least 15 seconds, or the whole video when it is shorter than 15 seconds. From Meta''s video_thruplay_watched_actions. Not a point on the drop-off curve — it is Meta''s own "a real view" count — which is why it is not named after a percentage. NULL means not reported, which is not the same as zero.';
