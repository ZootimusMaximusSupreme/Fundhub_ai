-- 389_ad_videos.sql — one row per filmed take of one ad number.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A NEW TABLE AND NOT AN EXISTING ONE
--
-- `ads` (046_ad_platforms.sql:282) mirrors what is live on Meta and REQUIRES
-- connection_id, campaign_id and ad_set_id. We never publish to Meta — Paul
-- does, from his own Drive folder — so every one of those three would be NULL
-- or invented here. `ad_scripts` (377_marketing_label_spine.sql:160) holds the
-- WORDS, and has no ad number column at all: the ad number lives in
-- utm_content and is read back by fundhub_ad_id() (286). So this table holds
-- the FILM, points at the script, and carries the ad number itself.
--
-- Ground truth for everything below: docs/video-pipeline-plan.md (the states,
-- the locks, the naming) and docs/specs/video-pipeline-api-verification-2026-09-22.md
-- (what Submagic and Drive actually do). The 4K rule is
-- .claude/rules/video-4k-unless-ad.md.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ONE ROW IS ONE TAKE, AND A TAKE IS NEVER OVERWRITTEN
--
-- Same shape ad_scripts uses for rewrites. Chris films take 1, it is rejected,
-- he films take 2 — that is TWO rows, not one row edited twice. The rejected
-- row keeps its reason and its file forever, because "why did we re-film that
-- one" is a question somebody asks three weeks later.
--
-- This is why `rejected` is a dead end on its own row. The plan's diagram draws
-- an arrow from rejected back to filming, and that arrow is a NEW ROW at the
-- next take number — not this row moving backwards. src/ad-videos/states.mjs
-- says the same thing in code and refuses the in-place move.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- FOUR LOCKS THAT LIVE HERE AND NOT IN A SCREEN (CLAUDE.md §3a)
--
--   1. UNIQUE (org_id, ad_id, take_no) — a take number is used once.
--   2. UNIQUE (org_id, ad_id) WHERE status IN ('approved','delivered') —
--      ONE AD NUMBER, ONE FINISHED VIDEO. The database refuses a second one.
--      This is the build rule from the plan's §8, enforced rather than trusted.
--   3. ad_id has NO LEADING ZEROS. fundhub_ad_id() returns TEXT (286:81-84), so
--      '043' and '43' are two different ads and one ad's results would split in
--      half. The folder name pads to three digits so folders sort; the LINK
--      never does. src/ad-videos/naming.mjs holds both halves of that rule.
--   4. The 4K law. A video that is not an ad cannot reach approved or
--      delivered unless its real height is KNOWN and is at least 2160.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE 4K LOCK BITES AT APPROVAL AND NOT AT INSERT
--
-- The plan writes it as CHECK (video_kind <> 'not_ad' OR height IS NULL OR
-- height >= 2160) and explains it as "a 1080p file that is not an ad cannot be
-- saved as FINISHED". Written as a plain table CHECK it would refuse the row
-- outright, and then a 1080p VSL take could not be RECORDED at all — the worker
-- would throw and we would lose the one piece of evidence that says what the
-- camera actually did. The owner decision on 2026-09-22 is to "record the
-- resolution of every take and FLAG a non-ad take that is not 4K", which is the
-- opposite of refusing to write it down.
--
-- So both, at the two different moments they belong to:
--   * resolution_ok — generated, always true for an ad, false for a non-ad take
--     measured below 2160. The flag. Nothing is hidden.
--   * ad_videos_4k_ck — refuses only the move into approved/delivered.
--
-- STRICTER THAN THE PLAN IN ONE PLACE, ON PURPOSE: the plan's "height IS NULL
-- OR" would let a non-ad through with its height never measured. An unmeasured
-- VSL is exactly the defect the rule was written after ("never upscale 1080p
-- and call it 4K"), so approval demands a known height. An ad is unaffected.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- COLUMN NAMES THAT DIFFER FROM THE PLAN'S TABLE, SO NOBODY BUILDS BOTH
--
--   plan's raw_signed_url        → source_url    (storage is not settled; the
--                                                 plan assumed R2/S3 presigned,
--                                                 the build brief points at a
--                                                 Netlify draft deploy. The
--                                                 column is "the public link we
--                                                 hand Submagic", whatever mints
--                                                 it.)
--   plan's submagic_download_url → finished_url
--   plan's drive_final_folder_id → paul_folder_id
--
-- Everything else keeps the plan's name.

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — the token the phone notification carries.
--
-- Chris approves by tapping a link in a phone notification (owner decision 5,
-- 2026-09-22). That link lands on api/public/ad-video-approve.mjs, which is an
-- OPEN DOOR: there is no session on a phone notification. The token in the link
-- IS the credential, and this setting is how one open request reaches exactly
-- one row and nothing else.
--
-- Copied verbatim in shape from fundhub_vsl_visitor() (379:234), for the same
-- reason and with the same trap: never session-scoped. src/db.mjs is a pool, so
-- a session-level setting would leak one request's scope into whichever request
-- borrowed that connection next. set_config(..., true) — transaction-local —
-- every time. src/ad-videos/token.mjs is the only place that sets it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fundhub_ad_video_token() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fundhub.ad_video_token', true), '')
$$;

COMMENT ON FUNCTION fundhub_ad_video_token() IS
  'The approval token for the current transaction, from the fundhub.ad_video_token setting. NULL when unset, which makes the token policy on ad_videos deny every row. Set it with withApprovalToken() in src/ad-videos/token.mjs, is_local=true, exactly as src/partners/rls.mjs sets fundhub.partner_id and 379 sets fundhub.vsl_visitor. Never session-scoped: src/db.mjs is a pool.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — the table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ad_videos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id),

  -- NOT NULL for the reason 377:163-165 gives for ad_scripts: a nullable
  -- partner_id is a row no policy matches and nobody owns. Chris's own videos
  -- hang off the house partner (slug 'fundhub-house', created in 377).
  partner_id          uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,

  -- The number that goes in utm_content. TEXT, never padded. See lock 3.
  ad_id               text NOT NULL,
  -- Which filming attempt, counting from 1. Never reused, never renumbered.
  take_no             integer NOT NULL,

  -- The script this was filmed from. NULL until the Claude match names it
  -- (the match is what gives a take its ad number in the first place).
  script_id           uuid REFERENCES ad_scripts(id) ON DELETE RESTRICT,
  -- Where the script text came from when it is a repo file rather than a row.
  -- Most of the written scripts still live under docs/ads/ and have no
  -- ad_scripts row yet; recording the path is how a take stays traceable to its
  -- words before that backfill happens. NULL when script_id is set.
  script_path         text,

  -- Which app filmed it. Owner decision 1 (2026-09-22): BOTH recorders are
  -- supported. Teleprompter.com can be pushed a script by itself; BigVU has no
  -- API at all and the script is pasted by hand. The pipeline starts at "a new
  -- take appeared in Raw" either way, so this column records what happened and
  -- gates nothing. 'other' is deliberate: a phone's own camera is a real case.
  recorder            text,

  -- 'ad' or 'not_ad'. Decides whether 1080p is allowed. See the 4K section.
  video_kind          text NOT NULL DEFAULT 'ad',

  status              text NOT NULL DEFAULT 'scripted',

  -- ─── the raw take, as Drive holds it ─────────────────────────────────────
  drive_raw_file_id   text,
  drive_raw_name      text,
  width               integer,
  height              integer,
  duration_seconds    integer,

  -- The flag. True for every ad. False only for a non-ad take we have MEASURED
  -- below 2160. NULL height = not measured yet = nothing to flag yet, which is
  -- why it reads true; ad_videos_4k_ck is what refuses to finish on an unknown.
  resolution_ok       boolean GENERATED ALWAYS AS (
                        video_kind <> 'not_ad' OR height IS NULL OR height >= 2160
                      ) STORED,

  -- ─── our own copy, and the link we hand Submagic ─────────────────────────
  -- A Drive link CANNOT be given to Submagic: Drive puts a virus-scan page in
  -- front of anything over 25 MB and Submagic refuses share links outright
  -- (the API verification spec, required change 1). So the take is copied
  -- somewhere public-enough and source_url is that link.
  storage_raw_key     text,
  source_url          text,

  -- ─── what the words said, and which script they matched ──────────────────
  transcript          text,
  match_confidence    integer,

  -- ─── Submagic ────────────────────────────────────────────────────────────
  submagic_project_id text,
  finished_url        text,
  storage_final_key   text,
  -- Which cut of THIS take. Re-edit the same take → v2. Re-film → a new take
  -- number, back at v1.
  finished_version    integer NOT NULL DEFAULT 1,

  -- ─── Paul's folder, the end of the line ──────────────────────────────────
  paul_folder_id      text,
  drive_final_file_id text,

  -- ─── the approval tap ────────────────────────────────────────────────────
  approval_token      text,
  approval_expires_at timestamptz,
  approved_at         timestamptz,
  approved_by         text,
  rejected_reason     text,

  failure_reason      text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- ─── the locks ───────────────────────────────────────────────────────────

  -- NO LEADING ZEROS. Exactly the plan's regex. '0' is allowed as an ad number;
  -- '043' is not, because fundhub_ad_id() would read it as a different ad from
  -- '43' and split one ad's results in half.
  CONSTRAINT ad_videos_ad_id_ck CHECK (ad_id ~ '^(0|[1-9][0-9]{0,8})$'),

  CONSTRAINT ad_videos_take_ck CHECK (take_no > 0),
  CONSTRAINT ad_videos_version_ck CHECK (finished_version > 0),

  CONSTRAINT ad_videos_kind_ck CHECK (video_kind IN ('ad', 'not_ad')),

  CONSTRAINT ad_videos_recorder_ck
    CHECK (recorder IS NULL OR recorder IN ('teleprompter', 'bigvu', 'other')),

  -- The thirteen states from docs/video-pipeline-plan.md §2. Text and not an
  -- enum, the same call 385 made: a new state is a new migration either way,
  -- and an enum cannot have a value removed at all.
  CONSTRAINT ad_videos_status_ck CHECK (status IN (
    'scripted', 'filming', 'raw_landed', 'staged', 'transcribed', 'matched',
    'editing', 'rendered', 'awaiting_approval', 'approved', 'delivered',
    'rejected', 'failed'
  )),

  -- THE 4K LAW, at the moment it belongs to. An ad is never touched by this.
  CONSTRAINT ad_videos_4k_ck CHECK (
    status NOT IN ('approved', 'delivered')
    OR video_kind <> 'not_ad'
    OR (height IS NOT NULL AND height >= 2160)
  ),

  -- A picture size is two numbers or neither. One of them alone is a half-read
  -- that would let the 4K check pass on nothing.
  --
  -- WRITTEN NULL-SAFELY, AND IT HAS TO BE. A CHECK passes when its expression
  -- is NULL, not only when it is true. The obvious spelling —
  --   (width IS NULL AND height IS NULL) OR (width > 0 AND height > 0)
  -- — evaluates to FALSE OR (TRUE AND NULL) = NULL for width 1920 with no
  -- height, so Postgres would ACCEPT the half-read this constraint exists to
  -- refuse. `(width IS NULL) = (height IS NULL)` compares two real booleans and
  -- is never NULL, which is what makes the rule bite.
  CONSTRAINT ad_videos_size_ck CHECK (
    (width IS NULL) = (height IS NULL)
    AND (width IS NULL OR (width > 0 AND height > 0))
  ),

  CONSTRAINT ad_videos_duration_ck
    CHECK (duration_seconds IS NULL OR duration_seconds > 0),

  CONSTRAINT ad_videos_confidence_ck
    CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 100),

  -- A failure says why. A status of 'failed' with no reason is the failure mode
  -- this whole table exists to avoid: something broke and nobody wrote it down.
  CONSTRAINT ad_videos_failure_ck
    CHECK (status <> 'failed' OR btrim(coalesce(failure_reason, '')) <> ''),

  -- Same rule for a rejection. Chris taps Reject with a reason or the next take
  -- repeats the same mistake.
  CONSTRAINT ad_videos_rejected_ck
    CHECK (status <> 'rejected' OR btrim(coalesce(rejected_reason, '')) <> ''),

  -- Approved means a person said so. Both halves or neither — an approved_at
  -- with no approved_by is an approval nobody signed.
  CONSTRAINT ad_videos_approved_ck CHECK (
    (approved_at IS NULL AND approved_by IS NULL)
    OR (approved_at IS NOT NULL AND btrim(coalesce(approved_by, '')) <> '')
  ),
  CONSTRAINT ad_videos_approved_state_ck
    CHECK (status NOT IN ('approved', 'delivered') OR approved_at IS NOT NULL),

  -- A token with no expiry never stops working. 32+ hex characters, the shape
  -- src/ad-videos/token.mjs mints.
  CONSTRAINT ad_videos_token_ck CHECK (
    approval_token IS NULL
    OR (approval_token ~ '^[0-9a-f]{32,64}$' AND approval_expires_at IS NOT NULL)
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — the indexes, including the two that ARE the locks.
-- ═══════════════════════════════════════════════════════════════════════════

-- LOCK 1. A take number is used once per ad.
CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_take_uq
  ON ad_videos (org_id, ad_id, take_no);

-- LOCK 2. ONE AD NUMBER, ONE FINISHED VIDEO. Partial, so the eleven working
-- states may hold as many takes as it takes; only finishing is exclusive.
CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_one_finished_uq
  ON ad_videos (org_id, ad_id)
  WHERE status IN ('approved', 'delivered');

-- EVERY WORKER STEP IS SAFE TO RUN TWICE (the plan's §2, step 4). The Drive
-- poll runs every 2-5 minutes and will see the same new file more than once
-- before the first pass finishes writing. Without this, that is two rows for
-- one take; with it, the second insert collides and the worker moves on.
CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_drive_raw_uq
  ON ad_videos (org_id, drive_raw_file_id)
  WHERE drive_raw_file_id IS NOT NULL;

-- The Submagic webhook arrives carrying a projectId and nothing else, so this
-- is the lookup that finds the row. Unique because two rows claiming one
-- Submagic project would make that lookup ambiguous and the webhook would
-- finish the wrong take.
CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_submagic_uq
  ON ad_videos (submagic_project_id)
  WHERE submagic_project_id IS NOT NULL;

-- The token in a phone notification. Unique across the whole table, not per
-- org: it is a credential, and a credential that means two things is a bug.
CREATE UNIQUE INDEX IF NOT EXISTS ad_videos_approval_token_uq
  ON ad_videos (approval_token)
  WHERE approval_token IS NOT NULL;

-- The queue read: GET /api/ad-videos?status=awaiting_approval, newest first.
CREATE INDEX IF NOT EXISTS ad_videos_status_idx
  ON ad_videos (org_id, status, created_at DESC);

-- "Show me everything for ad 43" — the sweepers and the brief both ask this.
CREATE INDEX IF NOT EXISTS ad_videos_ad_idx
  ON ad_videos (org_id, ad_id, take_no DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — updated_at, guarded in the style of 385.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ad_videos_updated_at') THEN
    CREATE TRIGGER trg_ad_videos_updated_at
      BEFORE UPDATE ON ad_videos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — row-level security.
--
-- TWO WAYS IN, AND THE SECOND ONE REACHES EXACTLY ONE ROW.
--
--   staff  — the queue screen, every worker, everything. fundhub_is_staff().
--   token  — the phone tap, and nothing else. The policy is written on
--            approval_token, so an open request carrying a token can see and
--            update THAT row. Not the next one. Not the table.
--
-- The token arm is UPDATE and SELECT only. It can never insert a row and never
-- delete one. What it is allowed to change is narrowed further in code
-- (src/ad-videos/token.mjs decides approve/reject and writes nothing else) —
-- but the policy is the part that holds if the code is wrong.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE ad_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_videos FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_videos_staff ON ad_videos;
CREATE POLICY ad_videos_staff ON ad_videos FOR ALL
  USING (fundhub_is_staff()) WITH CHECK (fundhub_is_staff());

-- When the setting is unset fundhub_ad_video_token() is NULL, `approval_token =
-- NULL` is NULL, and NULL is not true — so this policy denies every row rather
-- than matching them all. Same reasoning as 379:72.
DROP POLICY IF EXISTS ad_videos_by_token ON ad_videos;
CREATE POLICY ad_videos_by_token ON ad_videos FOR SELECT
  USING (approval_token = fundhub_ad_video_token());

DROP POLICY IF EXISTS ad_videos_decide_by_token ON ad_videos;
CREATE POLICY ad_videos_decide_by_token ON ad_videos FOR UPDATE
  USING      (approval_token = fundhub_ad_video_token())
  WITH CHECK (approval_token = fundhub_ad_video_token());

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — grants, stated explicitly the way 385 does, so a database where
-- 104's default privileges do not reach still ends up usable.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_videos TO fundhub_app;
    GRANT EXECUTE ON FUNCTION fundhub_ad_video_token() TO fundhub_app;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — what the columns mean, for whoever opens this table in three months.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE ad_videos IS
  'One row per filmed TAKE of one ad number. A take is never overwritten: a re-film is a new row at the next take_no, and the rejected one keeps its reason forever. Two locks carry the build rule "one ad number, one finished video": a take number is used once, and only one row per ad may sit in approved or delivered. Written and read by src/ad-videos/store.mjs; the state machine that decides which move is legal is src/ad-videos/states.mjs. Ground truth: docs/video-pipeline-plan.md (389).';

COMMENT ON COLUMN ad_videos.ad_id IS
  'The ad number that goes in utm_content. TEXT and NEVER PADDED — fundhub_ad_id() (286:81-84) returns text, so ''043'' and ''43'' are two different ads and one ad''s results would split in half. Folder names pad to three digits so folders sort; links never do. src/ad-videos/naming.mjs holds both halves.';

COMMENT ON COLUMN ad_videos.take_no IS
  'Which filming attempt, counting from 1. Never reused and never renumbered. A rejected take keeps its number; the re-film is a new row at the next one.';

COMMENT ON COLUMN ad_videos.video_kind IS
  '''ad'' or ''not_ad''. An ad may stay 1080p because Meta compresses it anyway; everything else — VSLs, portal videos, testimonials, walkthroughs — must be 4K (.claude/rules/video-4k-unless-ad.md, owner-set 2026-09-22).';

COMMENT ON COLUMN ad_videos.resolution_ok IS
  'The 4K flag, generated. True for every ad. False only for a non-ad take MEASURED below 2160 high. An unmeasured height reads true because nothing has been measured to flag — ad_videos_4k_ck is what refuses to approve on an unknown height.';

COMMENT ON COLUMN ad_videos.recorder IS
  '''teleprompter'' (Teleprompter.com, which can be pushed a script by itself), ''bigvu'' (no API at all, the script is pasted by hand), or ''other'' (a phone''s own camera). Owner decision 2026-09-22: BOTH recorders are supported. This column records what happened and gates nothing — the pipeline starts at "a new take appeared in Raw" either way.';

COMMENT ON COLUMN ad_videos.source_url IS
  'The public link handed to Submagic. NOT a Drive link, ever: Drive puts a virus-scan page in front of anything over 25 MB and Submagic refuses share links outright (docs/specs/video-pipeline-api-verification-2026-09-22.md, required change 1). The plan calls this raw_signed_url.';

COMMENT ON COLUMN ad_videos.finished_url IS
  'The finished .mp4 link from the Submagic webhook. Grab the file the second this lands — how long the link stays valid is undocumented. The plan calls this submagic_download_url.';

COMMENT ON COLUMN ad_videos.paul_folder_id IS
  'The Drive folder for this ad number inside Paul''s shared drive, named by the padded number (043/). Only ONE finished file ever sits in it — a new cut replaces it, old cuts stay in our storage. That is how "one ad number, one video" stays true on Paul''s screen. The plan calls this drive_final_folder_id.';

COMMENT ON COLUMN ad_videos.approval_token IS
  'The credential in the phone notification Chris taps. It IS the authentication for api/public/ad-video-approve.mjs — there is no session on a notification — so it is unique across the whole table and the row-level security policies are written on it. Minted by src/ad-videos/token.mjs, which also sets approval_expires_at; the CHECK refuses a token with no expiry.';

COMMENT ON COLUMN ad_videos.match_confidence IS
  'How sure Claude was that this take is that script, 0-100. NULL means the match has not run. NULL NEVER MEANS ZERO.';

COMMENT ON COLUMN ad_videos.script_path IS
  'The repo path the script text came from, when it is a file rather than an ad_scripts row. Most written scripts still live under docs/ads/ with no row yet; this keeps a take traceable to its words before that backfill. NULL when script_id is set.';

COMMENT ON COLUMN ad_videos.status IS
  'One of the thirteen states in docs/video-pipeline-plan.md §2. Which moves are legal is src/ad-videos/states.mjs, which refuses an illegal one rather than writing it. ''rejected'' and ''delivered'' are dead ends on their own row; a re-film is a NEW row.';
