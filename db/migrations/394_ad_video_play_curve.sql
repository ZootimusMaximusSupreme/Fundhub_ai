-- 394_ad_video_play_curve.sql — Meta's second-by-second watch curve, stored.
--
-- Meta Marketing API field (confirmed 2026-09-27 against
-- developers.facebook.com Graph API Ad Account Insights):
--
--   video_play_curve_actions — "A video-play based curve graph that illustrates
--   the percentage of video plays that reached a given second. Entries 0 to 14
--   represent seconds 0 thru 14. Entries 15 to 17 represent second ranges
--   [15 to 20), [20 to 25), and [25 to 30). Entries 18 to 20 represent second
--   ranges [30 to 40), [40 to 50), and [50 to 60). Entry 21 represents plays
--   over 60 seconds."
--
-- 378 already stores the quartile counts. This column holds the curve itself —
-- a jsonb list of percentages, one entry per Meta bucket. NULL when Meta did
-- not answer (photo ad, or not reported). No default: inventing [] would look
-- like "Meta said nobody watched any second."
--
-- Also: ad_watch_curve_alerts — one row per ad so we text Chris at most once
-- per calendar day when a running ad dies before 25%.

ALTER TABLE ad_metrics_daily
  ADD COLUMN IF NOT EXISTS video_play_curve jsonb;

COMMENT ON COLUMN ad_metrics_daily.video_play_curve IS
  'Meta video_play_curve_actions: percentage of plays still watching at each second bucket (0–14 = seconds 0–14; 15–17 = [15–20),[20–25),[25–30); 18–20 = [30–40),[40–50),[50–60); 21 = over 60s). NULL means not reported.';

CREATE TABLE IF NOT EXISTS ad_watch_curve_alerts (
  ad_id uuid PRIMARY KEY REFERENCES ads (id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  dies_before_25_alerted_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_watch_curve_alerts_partner_idx
  ON ad_watch_curve_alerts (partner_id);

DO $$ BEGIN PERFORM fundhub_apply_partner_rls('ad_watch_curve_alerts'); END $$;
