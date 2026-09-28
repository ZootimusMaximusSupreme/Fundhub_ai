-- 395_ad_watch_curve_diagnosis.sql — human curve diagnosis per ad-day.
--
-- Counts and Meta's video_play_curve live on ad_metrics_daily (378, 394).
-- This table records what Chris should film after reading those numbers:
-- opening / middle / ask, fix type, a short film note, and later whether
-- the next take's curve improved (NULL until that next row exists).

CREATE TABLE IF NOT EXISTS ad_watch_curve_diagnoses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES orgs (id),
  partner_id            uuid NOT NULL REFERENCES partners (id) ON DELETE RESTRICT,
  ad_metrics_daily_id   uuid NOT NULL REFERENCES ad_metrics_daily (id) ON DELETE CASCADE,

  diagnosis             text NOT NULL,
  fix_type              text NOT NULL,
  film_note             text NOT NULL,

  -- NULL until a later take's ad_metrics_daily row is scored against this day.
  next_take_improved    boolean,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ad_watch_curve_diagnoses_diagnosis_ck
    CHECK (diagnosis IN ('opening', 'middle', 'ask')),
  CONSTRAINT ad_watch_curve_diagnoses_fix_type_ck
    CHECK (fix_type IN ('visual', 'words', 'both')),
  CONSTRAINT ad_watch_curve_diagnoses_film_note_ck
    CHECK (char_length(trim(film_note)) >= 1 AND char_length(film_note) <= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_watch_curve_diagnoses_metrics_uniq
  ON ad_watch_curve_diagnoses (ad_metrics_daily_id);

CREATE INDEX IF NOT EXISTS ad_watch_curve_diagnoses_partner_date_idx
  ON ad_watch_curve_diagnoses (partner_id, created_at DESC);

COMMENT ON TABLE ad_watch_curve_diagnoses IS
  'One diagnosis per ad_metrics_daily row: where the watch curve broke, how to fix it (visual/words/both), what to film, and whether the next take improved once scored.';

COMMENT ON COLUMN ad_watch_curve_diagnoses.ad_metrics_daily_id IS
  'FK to the Meta sync row holding video_plays, quartiles, thruplay, and video_play_curve for that ad on that date.';

COMMENT ON COLUMN ad_watch_curve_diagnoses.next_take_improved IS
  'NULL until a later take exists; then true/false from comparing the next curve to this one (same ad or explicit successor — app logic).';

DO $$ BEGIN PERFORM fundhub_apply_partner_rls('ad_watch_curve_diagnoses'); END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_ad_watch_curve_diagnoses_updated_at'
         AND tgrelid = 'public.ad_watch_curve_diagnoses'::regclass
    ) THEN
      CREATE TRIGGER trg_ad_watch_curve_diagnoses_updated_at
        BEFORE UPDATE ON ad_watch_curve_diagnoses
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END IF;
END $$;
