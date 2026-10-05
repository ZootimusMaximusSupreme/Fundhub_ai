-- 416_ad_video_states_v2.sql — the new video pipeline states (marketing machine §9.1).
--
-- Spec: docs/specs/marketing-machine-2026-10-04.md §9.1 "The state machine".
-- Code twin: src/ad-videos/states.mjs (STATES, TRANSITIONS). The two lists must
-- match, and src/http/ad-videos.pg.test.mjs checks that they do.
--
-- THE NEW ORDER. The cut is now made from the script before Submagic sees the
-- film (owner decision 10), and our animations go on last (owner decision 9):
--
--   raw_landed → prepared → transcribed → matched → cut → staged → editing
--     → rendered → animated → awaiting_approval → approved → delivered → loaded
--
-- New states: prepared, cut, animated, merged, loaded, superseded.
--
-- Rows already in flight under the old order (Submagic before the match) are
-- moved by scripts/ad-videos-move-in-flight-9-1.mjs, after a dry run. This
-- file does not move a single row. That is why two of the locks below are
-- written so they cannot break a deploy on a database that still holds old rows:
--
--   * ad_videos_identified_ck is added NOT VALID and validated only when no
--     existing row breaks it. New writes are checked either way.
--   * ad_videos_one_master_uq is built only when no ad already has two
--     masters. The move script builds it after it runs.
--
-- Both are checked again by the move script, which says out loud if either is
-- still missing.

-- ─── 1. the states ─────────────────────────────────────────────────────────
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_status_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_status_ck CHECK (status IN (
  'scripted', 'filming', 'raw_landed', 'prepared', 'transcribed', 'matched',
  'cut', 'staged', 'editing', 'rendered', 'animated', 'awaiting_approval',
  'approved', 'delivered', 'loaded', 'rejected', 'failed', 'merged', 'superseded'
));

-- ─── 2. the 4K law and the approval stamp cover every finished state ──────
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_4k_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_4k_ck CHECK (
  status NOT IN ('approved', 'delivered', 'loaded', 'superseded')
  OR video_kind <> 'not_ad'
  OR (height IS NOT NULL AND height >= 2160)
);

ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_approved_state_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_approved_state_ck CHECK (
  status NOT IN ('approved', 'delivered', 'loaded', 'superseded')
  OR approved_at IS NOT NULL
);

-- ─── 3. which states may still be anonymous ────────────────────────────────
-- Before the match a take has no ad number. staged and editing are no longer
-- on this list: in the new order Submagic only ever sees a matched, cut master.
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_identified_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_identified_ck CHECK (
  status IN ('scripted', 'filming', 'raw_landed', 'prepared', 'transcribed', 'failed')
  OR (ad_id IS NOT NULL AND take_no IS NOT NULL)
) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ad_videos
     WHERE status NOT IN ('scripted', 'filming', 'raw_landed', 'prepared', 'transcribed', 'failed')
       AND (ad_id IS NULL OR take_no IS NULL)
  ) THEN
    ALTER TABLE ad_videos VALIDATE CONSTRAINT ad_videos_identified_ck;
  ELSE
    RAISE NOTICE '416: ad_videos_identified_ck left NOT VALID — old in-flight rows have no ad number. Run scripts/ad-videos-move-in-flight-9-1.mjs.';
  END IF;
END $$;

-- ─── 4. one finished video per ad, now including loaded ────────────────────
DROP INDEX IF EXISTS ad_videos_one_finished_uq;
CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_one_finished_uq
  ON ad_videos (org_id, ad_id)
  WHERE status IN ('approved', 'delivered', 'loaded');

-- ─── 5. one master per ad while it is being made ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ad_videos
     WHERE status IN ('cut', 'staged', 'editing', 'rendered', 'animated', 'awaiting_approval')
     GROUP BY org_id, ad_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_one_master_uq
      ON ad_videos (org_id, ad_id)
      WHERE status IN ('cut', 'staged', 'editing', 'rendered', 'animated', 'awaiting_approval');
  ELSE
    RAISE NOTICE '416: ad_videos_one_master_uq not built — an ad already has two takes in a master state. Run scripts/ad-videos-move-in-flight-9-1.mjs.';
  END IF;
END $$;

-- ─── 6. the new columns ────────────────────────────────────────────────────
ALTER TABLE ad_videos
  -- prepared: what the worker learned from the file itself
  ADD COLUMN IF NOT EXISTS recorded_at             timestamptz,
  ADD COLUMN IF NOT EXISTS audio_storage_key       text,
  ADD COLUMN IF NOT EXISTS silences                jsonb,
  -- the master and the takes merged into it
  ADD COLUMN IF NOT EXISTS source_take_ids         uuid[],
  ADD COLUMN IF NOT EXISTS late                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hold_reason             text,
  -- cut
  ADD COLUMN IF NOT EXISTS cut_plan                jsonb,
  ADD COLUMN IF NOT EXISTS cut_version             integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cut_storage_key         text,
  ADD COLUMN IF NOT EXISTS cut_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS master_duration_seconds numeric(8,3),
  -- captions and animations
  ADD COLUMN IF NOT EXISTS submagic_storage_key    text,
  ADD COLUMN IF NOT EXISTS animation_items         jsonb,
  ADD COLUMN IF NOT EXISTS animated_at             timestamptz,
  ADD COLUMN IF NOT EXISTS caption_fixes           jsonb,
  -- edits and retry
  ADD COLUMN IF NOT EXISTS edit_round              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_good_status        text,
  -- the video worker's claim
  ADD COLUMN IF NOT EXISTS worker_job_id           text,
  ADD COLUMN IF NOT EXISTS worker_job_type         text,
  ADD COLUMN IF NOT EXISTS worker_claimed_at       timestamptz,
  -- Meta (M4)
  ADD COLUMN IF NOT EXISTS meta_video_id           text,
  ADD COLUMN IF NOT EXISTS meta_creative_id        text,
  ADD COLUMN IF NOT EXISTS meta_ad_external_id     text,
  ADD COLUMN IF NOT EXISTS ad_row_id               uuid REFERENCES ads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loaded_at               timestamptz,
  ADD COLUMN IF NOT EXISTS load_error              text;

ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_cut_version_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_cut_version_ck CHECK (cut_version > 0);

ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_edit_round_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_edit_round_ck CHECK (edit_round >= 0);

-- Retry goes back to the last good step, so that step has to be a real one.
-- Never failed itself, and never a dead end.
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_last_good_status_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_last_good_status_ck CHECK (
  last_good_status IS NULL OR last_good_status IN (
    'scripted', 'filming', 'raw_landed', 'prepared', 'transcribed', 'matched',
    'cut', 'staged', 'editing', 'rendered', 'animated', 'awaiting_approval', 'approved'
  )
);

ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_json_shapes_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_json_shapes_ck CHECK (
  (silences IS NULL OR jsonb_typeof(silences) = 'array')
  AND (animation_items IS NULL OR jsonb_typeof(animation_items) = 'array')
  AND (caption_fixes IS NULL OR jsonb_typeof(caption_fixes) = 'array')
  AND (cut_plan IS NULL OR jsonb_typeof(cut_plan) = 'object')
);

ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_master_duration_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_master_duration_ck
  CHECK (master_duration_seconds IS NULL OR master_duration_seconds > 0);

-- A take held before Submagic says why.
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_hold_reason_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_hold_reason_ck
  CHECK (hold_reason IS NULL OR btrim(hold_reason) <> '');

CREATE INDEX IF NOT EXISTS ad_videos_worker_claim_idx
  ON ad_videos (worker_claimed_at)
  WHERE worker_claimed_at IS NOT NULL;

COMMENT ON COLUMN ad_videos.last_good_status IS
  'The state a take was in when it failed. Retry puts it back here (src/ad-videos/store.mjs retryFailed) and clears only the marks from that step on. NULL on a row that failed before 416, which retries from raw_landed.';
COMMENT ON COLUMN ad_videos.cut_version IS
  'Which cut of this master. A late take before approval or a struck line makes a new cut at +1.';
COMMENT ON COLUMN ad_videos.edit_round IS
  'Which round of Chris''s edits this master is on. Each edit moves the same row back (to cut, editing or rendered) with edit_round + 1.';
COMMENT ON COLUMN ad_videos.source_take_ids IS
  'The other takes of this ad merged into this master. Each of them sits at status merged.';
COMMENT ON COLUMN ad_videos.late IS
  'A take that landed after its ad''s master was approved. It parks as "Recut with new take?".';

-- ─── 7. the edits Chris makes from the approval screen ─────────────────────
CREATE TABLE IF NOT EXISTS public.ad_video_edits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id),
  ad_video_id    uuid NOT NULL REFERENCES ad_videos(id) ON DELETE RESTRICT,
  kind           text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  applied_at     timestamptz,
  result_version integer,
  CONSTRAINT ad_video_edits_kind_ck
    CHECK (kind IN ('strike_line', 'restore_line', 'caption_word', 'animation', 'note')),
  CONSTRAINT ad_video_edits_payload_ck CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT ad_video_edits_created_by_ck CHECK (btrim(created_by) <> ''),
  CONSTRAINT ad_video_edits_result_version_ck CHECK (result_version IS NULL OR result_version > 0)
);

CREATE INDEX IF NOT EXISTS ad_video_edits_video_idx
  ON public.ad_video_edits (ad_video_id, created_at);

COMMENT ON TABLE public.ad_video_edits IS
  'One row per edit Chris makes to a finished video (spec §9.6): strike or restore a line, fix a caption word, change an animation, or a free note. applied_at is set when the new round is built; result_version is the cut_version or edit round it produced.';

ALTER TABLE public.ad_video_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_video_edits FORCE ROW LEVEL SECURITY;

-- Staff only, the same door ad_videos uses (389 Part 5). There is no token arm:
-- an edit is made from the signed-in app, never from a phone link.
DROP POLICY IF EXISTS ad_video_edits_app_all ON public.ad_video_edits;
CREATE POLICY ad_video_edits_app_all ON public.ad_video_edits FOR ALL
  USING (fundhub_is_staff()) WITH CHECK (fundhub_is_staff());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_video_edits TO fundhub_app;
  END IF;
END $$;
