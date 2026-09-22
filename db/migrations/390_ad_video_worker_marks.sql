-- 390_ad_video_worker_marks.sql — the marks each worker step leaves behind.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS: THREE BUILDERS, TWO SHAPES
--
-- 389_ad_videos.sql built the take record from docs/video-pipeline-plan.md §3,
-- which is a list of WHAT WE KNOW about a take — its ad number, its file, its
-- size, its links. src/ad-videos/pipeline.mjs was built at the same time from
-- the same plan's §2 step 4, which is a list of WHAT HAS ALREADY HAPPENED to a
-- take. Those are not the same list, and on merge the second one had nowhere to
-- be written.
--
-- Every column below is an idempotency key, a count, or a note a step left. Not
-- one of them is new product — they are the answers to "did this already run?"
-- that the plan demands and 389 has no room for.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- *** exported_at IS THE ONE THAT COSTS MONEY ***
--
-- Submagic bills API MINUTES on a render and caps exports at 50 an hour
-- (docs/specs/video-pipeline-api-verification-2026-09-22.md). The sweeper runs
-- every five minutes and a serverless function can be retried mid-flight, so
-- without a written mark placeBrollAndExport() would export the same take again
-- on EVERY pass: twelve renders an hour for one video, a quarter of the hourly
-- budget, billed.
--
-- src/ad-videos/pipeline.mjs:245 already reads `row.exported_at` and skips when
-- it is set. This migration is what makes that read find anything. The guard was
-- written; it just had nothing to stand on.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A NEW FILE AND NOT AN EDIT TO 389
--
-- CLAUDE.md §12: "Editing an applied migration is a silent no-op." migrate.mjs
-- keys schema_migrations on `<dir>/<file>`, so a changed 389 would never re-run
-- anywhere it had already been applied. 389 has not run on production, but the
-- rule does not have an exception for that and does not need one — this is a
-- second file and costs nothing.
--
-- 390 is free: 388 was the previous latest, 389 is the take record, and the
-- 390 that briefly existed on feat/ad-video-approval (a second approval-token
-- table) was dropped at merge along with the second door it served.

-- Everything here is ADD COLUMN IF NOT EXISTS, so this file is safe to re-run
-- and safe on a database where 389 has only just landed.

-- ═══════════════════════════════════════════════════════════════════════════
-- *** PART 0 — A TAKE DOES NOT KNOW ITS AD NUMBER WHEN IT LANDS ***
--
-- This is the defect that stopped the pipeline at step one, and it is worth
-- reading slowly because the fix looks like a loosening and is not.
--
-- 389 made ad_id and take_no NOT NULL. But docs/video-pipeline-plan.md §1 is
-- explicit about where the number comes from:
--
--     step 4  the phone shares the take into the Raw folder
--     step 5  a worker spots the new file
--     step 8  "Match those words to a script. NOW WE KNOW THE AD NUMBER AND
--              THE TAKE NUMBER."
--
-- Chris's phone names the file IMG_4471.mov. Nothing about that file says which
-- ad it is — that is the entire job of the transcribe-and-match steps. So at
-- raw_landed, staged and transcribed the honest value of ad_id is NOT KNOWN,
-- and NOT NULL forced a worker either to refuse the row or to invent a number.
-- Inventing one is worse than refusing: a wrong number is indistinguishable
-- from a right one to everybody downstream, including Paul.
--
-- So the columns go nullable, and the requirement moves to the moment the
-- number is actually learned. Nothing is weakened:
--
--   * Both locks still hold. Postgres treats NULLs as DISTINCT in a unique
--     index, so many unmatched takes coexist under ad_videos_take_uq — which is
--     correct, they are different films — and ad_videos_one_finished_uq only
--     covers approved/delivered, where the number is now REQUIRED below.
--   * ad_videos_ad_id_ck is unchanged and still refuses a padded number the
--     moment one is written.
--   * The new constraint is STRICTER than "NOT NULL at insert" where it counts:
--     a row cannot reach matched, editing, rendered, awaiting_approval,
--     approved or delivered without both numbers. A take cannot be sent to
--     Submagic, shown to Chris, or delivered to Paul anonymously.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ad_videos ALTER COLUMN ad_id   DROP NOT NULL;
ALTER TABLE ad_videos ALTER COLUMN take_no DROP NOT NULL;

/* The six states listed here are the ones BEFORE the match, plus failed. Every
   other state — matched onward — demands both numbers. Written as an explicit
   list rather than "NOT IN (…)" so that a state added in a later migration has
   to be thought about rather than silently inheriting permission to be
   anonymous. */
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_identified_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_identified_ck CHECK (
  status IN ('scripted', 'filming', 'raw_landed', 'staged', 'transcribed', 'editing', 'failed')
  OR (ad_id IS NOT NULL AND take_no IS NOT NULL)
);

COMMENT ON COLUMN ad_videos.ad_id IS
  'The ad number that goes in utm_content. TEXT and NEVER PADDED — fundhub_ad_id() (286:81-84) returns text, so ''043'' and ''43'' are two different ads and one ad''s results would split in half. NULL until the transcript is matched to a script, because that match is what gives a take its number (plan §1 step 8); ad_videos_identified_ck (390) refuses a NULL from `matched` onward. Folder names pad to three digits so folders sort; links never do. src/ad-videos/naming.mjs holds both halves.';
COMMENT ON COLUMN ad_videos.take_no IS
  'Which filming attempt, counting from 1. Never reused and never renumbered. NULL until the match names it, then required for the rest of the row''s life (ad_videos_identified_ck, 390). A rejected take keeps its number; the re-film is a new row at the next one.';

ALTER TABLE ad_videos
  -- ─── "did this step already run?" — one per step in pipeline.mjs ─────────
  -- stage: the take has a link Submagic can download.
  ADD COLUMN IF NOT EXISTS staged_at         timestamptz,
  -- matchAndRename: the raw file in Drive now carries its ad number.
  ADD COLUMN IF NOT EXISTS renamed_at        timestamptz,
  -- placeBrollAndExport, first half: our own clips are on the timeline.
  ADD COLUMN IF NOT EXISTS broll_placed_at   timestamptz,
  -- placeBrollAndExport, second half. THE BILLED ONE. See the header.
  ADD COLUMN IF NOT EXISTS exported_at       timestamptz,
  -- the render finished, by webhook or by poll.
  ADD COLUMN IF NOT EXISTS rendered_at       timestamptz,
  -- saveFinishedAndNotify: Chris's phone buzzed.
  ADD COLUMN IF NOT EXISTS notified_at       timestamptz,
  -- deliverToPaul: the video and the brief are in Paul's folder.
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz,

  -- ─── what a step found, for the person reading the row later ────────────
  -- How many of our own clips went on. 0 is a real answer and is NOT a
  -- failure: an ad with captions and no B-roll is a finished ad.
  ADD COLUMN IF NOT EXISTS broll_count       integer,
  -- Why a clip did not go on, when one did not.
  ADD COLUMN IF NOT EXISTS broll_notes       text,
  -- Why our own copy of the finished file was not taken. Recorded and NOT
  -- fatal: the Submagic link still works at the moment Chris is watching it.
  ADD COLUMN IF NOT EXISTS save_note         text,
  -- Why the buzz did not go out. The take still waits in awaiting_approval —
  -- a notification that failed must never look like an approval that did not
  -- happen for some other reason.
  ADD COLUMN IF NOT EXISTS notify_error      text,
  -- Why the upload into Paul's folder stopped short. The folder and the brief
  -- may already be there; this is what is missing.
  ADD COLUMN IF NOT EXISTS delivery_note     text,

  -- ─── two more things a step learns ──────────────────────────────────────
  -- The brief that rides with the video in Paul's folder (043_brief.*).
  ADD COLUMN IF NOT EXISTS drive_brief_file_id text,
  -- Submagic's word-level transcript: [{ word, start, end }, …]. It is what
  -- B-roll is placed against, so the clip lands on the word it illustrates
  -- rather than near it. jsonb, because the only question ever asked of it is
  -- "give me the whole list back".
  ADD COLUMN IF NOT EXISTS transcript_words  jsonb;

-- A count is a count. Negative clips is not a state anything can be in, and a
-- NULL means the placer has not run rather than that it placed none.
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_broll_count_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_broll_count_ck
  CHECK (broll_count IS NULL OR broll_count >= 0);

/* WORD TIMINGS ARE A LIST OR THEY ARE NOTHING. jsonb will happily store the
   string "null", the number 7, or an object — and B-roll placement iterates
   this column. A shape check here is cheaper than a worker that throws at
   3am on a value nobody can explain. Written NULL-safely: `jsonb_typeof(NULL)`
   is NULL and a CHECK passes on NULL, so the IS NULL arm is what carries the
   unset case rather than luck. */
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_transcript_words_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_transcript_words_ck
  CHECK (transcript_words IS NULL OR jsonb_typeof(transcript_words) = 'array');

/* THE EXPORT GUARD, SAID TWICE. pipeline.mjs skips when exported_at is set, and
   that is the guard that does the work. This is the one that holds if the
   JavaScript is wrong: a row cannot claim a render finished before one was ever
   asked for. It is the cheapest possible statement of "we did not pay twice". */
ALTER TABLE ad_videos DROP CONSTRAINT IF EXISTS ad_videos_render_order_ck;
ALTER TABLE ad_videos ADD CONSTRAINT ad_videos_render_order_ck
  CHECK (rendered_at IS NULL OR exported_at IS NOT NULL OR submagic_project_id IS NOT NULL);

COMMENT ON COLUMN ad_videos.exported_at IS
  'When the Submagic export was asked for. THE IDEMPOTENCY KEY THAT COSTS MONEY: an export bills API minutes and is capped at 50 an hour, and the sweeper runs every five minutes, so src/ad-videos/pipeline.mjs skips placeBrollAndExport entirely when this is set. Never clear it to force a re-render — make a new cut (finished_version + 1) instead.';
COMMENT ON COLUMN ad_videos.transcript_words IS
  'Submagic''s own word-level transcript, [{ word, start, end }, …]. B-roll is placed against these exact times, which is what removes the timing risk in the plan''s §8 — the timeline never changes because silence-cutting and bad-take removal stay off.';
COMMENT ON COLUMN ad_videos.broll_count IS
  'How many of OUR OWN clips (Submagic user-media) went on the timeline. 0 is a real, fine answer — an ad with captions and no B-roll is finished. NULL means the placer has not run. AI B-roll is never used: 3 credits a clip against 15 a month is five clips for a hundred ads.';
COMMENT ON COLUMN ad_videos.notify_error IS
  'Why the buzz to Chris''s phone did not go out. The take still sits in awaiting_approval and is still approvable from the queue screen — a notification that failed is not a decision.';
