-- 379_vsl_watch.sql — somewhere to put what happens INSIDE our own VSL.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE PROBLEM, IN ONE SENTENCE
--
-- The VSL is a plain file on our own server — public/funnel/vsl.mp4, 207.215
-- seconds long — playing in a bare <video> tag on a ClickFunnels page, and
-- NOTHING measures it. Measured 2026-09-08 against the live page and written up
-- in docs/specs/marketing-e2e/vsl-measurement-truth.md. The only script on that
-- page is thirteen lines (docs/workflows/cf-vsl-watch-html-step1.html:128-141)
-- and it sends nothing anywhere. Zero watch data exists. Not "a little". None.
--
-- No platform can fix that for us. Meta cannot see inside a video on our own
-- page — that is what 378_ad_video_metrics.sql covers and it is a DIFFERENT
-- video. YouTube cannot see it either, because the file is in no playlist.
-- video_watch_stats (302_analytics_connections.sql:130) cannot hold it: it is
-- one row per YouTube video per day, four summary numbers, keyed on a
-- youtube_video_id and a YouTube connection. None of those three things exist
-- here.
--
-- So the numbers have to be collected by us, and this file is where they land.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES
--
--   1. fundhub_vsl_visitor()        — who is writing, for the RLS below.
--      fundhub_vsl_recent_count()   — how many viewings started site-wide
--                                     lately. A NUMBER, never rows. It is the
--                                     flood ceiling on the open door.
--   2. fundhub_vsl_positions_ok()      — the shape guard for the curve array.
--      fundhub_vsl_merge_positions()  — how two curves are joined: by union.
--   3. vsl_watch_sessions           — one row per person per viewing.
--   4. vsl_watch_positions          — one row per viewing, holding the curve.
--   5. A BEFORE UPDATE trigger that makes a viewing only ever move FORWARD.
--   6. RLS, grants, and comments.
--
-- Additive and idempotent. Every CREATE is IF NOT EXISTS, every policy and
-- trigger is DROP-then-CREATE, every constraint is guarded by a NOT EXISTS on
-- pg_constraint. Re-running it is a no-op. Nothing existing is altered and
-- nothing is deleted.
--
-- No compliance banner, following 377's stated deviation: §7 was removed
-- owner-set 2026-09-08.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE ONE GENUINELY NEW PROBLEM: THE WRITER HAS NO ACCOUNT
--
-- Every other table in this module is written by staff or by a partner. This
-- one is written by a stranger's browser, mid-video, before anybody has signed
-- in to anything. 302 and 377 both police their tables with fundhub_is_staff(),
-- and under that rule the beacon's INSERT is refused and the table stays empty
-- forever. So "staff only" has to be made true WITHOUT locking out the one
-- writer this table exists for.
--
-- THE ANSWER, AND IT IS THE PATTERN THIS REPO ALREADY USES.
--
-- src/partners/rls.mjs sets a transaction-local setting, fundhub.partner_id,
-- and 045's policies read it back through fundhub_current_partner(). The row a
-- partner may touch is decided by the database, from a value the request
-- declared, for the length of one transaction and no longer.
--
-- This file does exactly that with a second setting, fundhub.vsl_visitor. The
-- beacon endpoint opens a transaction, declares the anonymous visitor id it is
-- writing for, and every policy below then reads:
--
--     staff sees everything  OR  visitor_id = fundhub_vsl_visitor()
--
-- So:
--   * A connection that declares nothing sees NOTHING and writes NOTHING —
--     fundhub_vsl_visitor() returns NULL, `visitor_id = NULL` is NULL, and NULL
--     is not true, so the policy denies. That is the safe default and it is the
--     state every other query in the app is in.
--   * The beacon reaches exactly the rows carrying the visitor id it declared.
--     Those rows ARE that browser's own watch history — the id was generated in
--     that browser and is stored nowhere else. Nobody's data is exposed to
--     anybody.
--   * Everything wider than one visitor is staff-only, which is what 302 and
--     377 mean by "staff-only read".
--
-- WHY IT CANNOT BE A BARE "INSERT ALLOWED, SELECT DENIED" PAIR, which is the
-- obvious first idea. Postgres applies SELECT policies to INSERT ... ON CONFLICT
-- DO UPDATE and to any RETURNING clause. A beacon that could insert but never
-- select could not upsert and could not read back the id it just wrote, so the
-- second beacon of a viewing would fail and the curve would never attach to its
-- session. The visitor-scoped read is not a convenience; it is what makes the
-- write work at all.
--
-- DELETE IS STAFF-ONLY, no visitor branch. A visitor may add to their own row.
-- They may not remove it. Retention sweeps are staff work.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THE VISITOR MAY DO TO THEIR OWN ROW: ADD, NEVER SUBTRACT
--
-- A visitor id is a value the browser made up, so a hostile caller can declare
-- one and reach the rows under it. The blast radius is capped twice:
--
--   * the id has to be GUESSED — the endpoint requires 16-64 characters of
--     [A-Za-z0-9_-] (src/vsl/watch-beacon.mjs), and it is written into no link,
--     no page and no email;
--   * and the trigger in Part 5 makes every update MONOTONIC. Identity columns
--     are frozen to what the first write said. Progress numbers can only rise.
--     A boolean that is already true stays true. So the worst a guesser can do
--     is inflate a stranger's watch numbers upward. They cannot erase, rewrite
--     or shrink anything.
--
-- That is stated plainly rather than papered over. The alternative — no rule at
-- all, an INSERT policy of WITH CHECK (true) as 235_affiliate_link_clicks.sql
-- uses — would let a late or replayed beacon overwrite a finished viewing with
-- "got 4 seconds in", and lose the real number silently.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NULL MEANS UNKNOWN AND MUST SURVIVE (CLAUDE.md §12)
--
-- This table has FOUR different facts that a careless DEFAULT 0 would flatten
-- into one, and the whole file is shaped around keeping them apart:
--
--   finished = true    they watched it to the end
--   finished = false   they did not watch it to the end
--   finished = NULL    we never heard — the browser was closed, the phone
--                      died, the beacon was blocked. We do not know.
--
--   autoplay_blocked = true   the browser refused to start the video
--
-- "Did not finish" and "we have no idea whether they finished" are different
-- facts about different people and they must never look the same on a screen.
-- So every measured column here is NULLABLE WITH NO DEFAULT, and every CHECK is
-- written "IS NULL OR <shape>" so an unknown is always a legal row.
--
--   ⚠️ FOR ANYONE WRITING A SCREEN ON THESE: an empty cell means we do not
--      know. Do not COALESCE it to 0, do not print "0", and do not count a NULL
--      as a non-finisher.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TWO EVENTS THAT ARE NOT THE SAME EVENT, AND THIS IS EASY TO GET WRONG
--
-- The player auto-plays MUTED, and tapping "Tap for sound" sets currentTime=0 —
-- verified at docs/workflows/cf-vsl-watch-html-step1.html:133, which reads
-- `v.muted=false;v.currentTime=0;v.controls=true;`. THE VIDEO RESTARTS FROM
-- ZERO WHEN SOMEBODY CHOOSES TO LISTEN.
--
-- So "the video started" and "a person decided to watch this" are two different
-- things, and a schema that stored only "started" would report a silent
-- autoplay in a background tab as an audience. They are separate columns here:
-- started_at is the player arriving, unmuted is the decision.
--
-- ⚠️ AND THE POSITION HAS TO BE SPLIT THE SAME WAY, OR THE MOST IMPORTANT
--    NUMBER ON THIS TABLE IS SILENTLY WRONG.
--
-- One viewing contains TWO RUNS of the same video: the silent one, and then —
-- if they tap — a second one that starts again at zero. A single "furthest
-- second reached" adds those two runs together and cannot tell them apart.
-- Somebody who lets it run silently to 3:00, taps for sound and then leaves
-- would be stored as "chose to watch, got to 3:00" when they watched none of it
-- after choosing. Nothing on any screen could ever spot that, because the two
-- runs were merged before they were stored.
--
-- So there are two columns:
--
--   max_position_seconds                 furthest second of the WHOLE viewing,
--                                        both runs together.
--   max_position_after_unmute_seconds    furthest second of the SECOND run
--                                        only — after they tapped for sound.
--                                        NULL until they tap, and NULL is
--                                        exactly right for somebody who never
--                                        did.
--
-- A drop-off curve for people who chose to watch is
-- max_position_after_unmute_seconds over rows where unmuted = true, and it is a
-- different curve from max_position_seconds over everybody. Draw them
-- separately or the two audiences are averaged into a number describing nobody.
--
-- A restart to 0 after an unmute is NOT a replay. The endpoint is what knows
-- the difference; replay_count means "reached the end and started again".
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW MANY VIEWERS IS THIS? UNKNOWN, AND THAT IS THE POINT.
--
-- Nothing counts traffic to apply.fundhub.ai/watch today, so the number of rows
-- a day this table will see is UNKNOWN. It is not guessed here. The row shape
-- below is chosen so that it does not matter much either way — see Part 4.
--
-- A drop-off curve drawn from eleven viewers is noise, not a finding. Whatever
-- screen reads this must say how many viewings it is drawing from, next to the
-- curve, always.
--
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--   * NO IP ADDRESS AND NO USER AGENT, not even hashed. 235 stores a salted
--     ip_hash because it needs to count a flood from one place. This table does
--     not, and a column nothing reads is a liability with no upside. There is no
--     column for either and none may be added without it being a fresh decision.
--
--     WHAT GUARDS THE DOOR INSTEAD, since a visitor id is a string the caller
--     makes up for free and a new one every time resets its own allowance:
--     fundhub_vsl_recent_count() in Part 1b counts NEW viewings across the whole
--     site in a short window, and src/vsl/watch-store.mjs refuses a new viewing
--     when that count is over a ceiling set far above any real traffic. It is
--     the sibling of the org-wide flood count in src/hiring/apply-public.mjs:346
--     — the guard that "survives a distributed flood across many addresses and
--     many instances" — and it needed a function because inside the beacon's own
--     transaction a plain count sees only one visitor's rows: the policies in
--     Part 6 hide everything else, on purpose.
--   * No client_id, no join to a person. A viewer has no account. The bridge to
--     a real person is the ad number, below, exactly as it is everywhere else.
--   * No view, no rollup table, no "hook rate" column. A rate defined in two
--     places is how two screens give two answers to one question — 378 states
--     the same rule for the same reason. The curve is arithmetic over these
--     rows, defined once, wherever it is drawn.
--   * No per-second event table. See Part 4.
--   * No retention sweep. Retention is Chris's call and is not invented here.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — WHO IS WRITING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The sibling of fundhub_current_partner() (045_creative_factory.sql:44-50) and
-- shaped the same way: read one transaction-local setting, treat empty as
-- unset, return NULL when nobody declared anything.
--
-- NULL is the safe answer. Every policy below compares visitor_id to this, and
-- `anything = NULL` is NULL, which is not true, which denies. A connection that
-- forgets to declare a visitor reads nothing and writes nothing rather than
-- reading everything.

CREATE OR REPLACE FUNCTION fundhub_vsl_visitor() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('fundhub.vsl_visitor', true), '')
$$;

COMMENT ON FUNCTION fundhub_vsl_visitor() IS
  'The anonymous VSL visitor id for the current transaction, from the fundhub.vsl_visitor setting. NULL when unset, which makes every policy on vsl_watch_sessions and vsl_watch_positions deny. Set it with withVslVisitor() in src/vsl/watch-store.mjs, is_local=true, exactly as src/partners/rls.mjs sets fundhub.partner_id. Never session-scoped: src/db.mjs is a pool and a session-level setting would leak one visitor''s scope into whichever request borrowed that connection next.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — THE SHAPE GUARD FOR THE CURVE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A CHECK constraint cannot contain a subquery, so it cannot look at every
-- element of an array by itself. A function can, and an IMMUTABLE function is
-- legal inside a CHECK — the same move 286_client_ad_attribution.sql:81 makes
-- with fundhub_ad_id().
--
-- The guard is the database's, not the endpoint's, because CLAUDE.md §3a puts
-- constraints in the database. The endpoint refuses junk too; this is the wall
-- behind the door.
--
--   * NULL passes. An unknown curve is a legal row.
--   * 1 to 4000 whole seconds. 4000 is far past this VSL's 207 and still small
--     enough that no single row can be used as free storage.
--   * One dimension only. A nested array is not a curve.
--   * Every value 0 to 86400. A position cannot be negative and cannot be more
--     than a day into a video.

CREATE OR REPLACE FUNCTION fundhub_vsl_positions_ok(pos integer[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT pos IS NULL
      OR (
           array_ndims(pos) = 1
       AND array_length(pos, 1) BETWEEN 1 AND 4000
       AND (SELECT bool_and(v IS NOT NULL AND v >= 0 AND v <= 86400) FROM unnest(pos) v)
         )
$$;

COMMENT ON FUNCTION fundhub_vsl_positions_ok(integer[]) IS
  'True when a vsl_watch_positions.seconds_seen array is a legal curve: NULL, or a one-dimensional array of 1-4000 whole seconds each between 0 and 86400. Exists because a CHECK constraint cannot hold a subquery and therefore cannot examine every element on its own.';

-- ── Merging two curves: a UNION, so a second can never be lost ──────────────
--
-- The beacon fires again and again through one viewing, each time carrying the
-- seconds it has seen since last time. Merging them by UNION rather than by
-- replacement is what makes a resent, delayed or out-of-order beacon harmless:
-- adding a second that is already there changes nothing, and no ordering of
-- arrivals can produce a shorter curve than the one already stored.
--
-- Both sides NULL gives NULL, so an unknown curve stays unknown rather than
-- turning into an empty one the first time somebody touches the row.
--
-- Capped at 4000 to match fundhub_vsl_positions_ok, so a merge can never build
-- an array the CHECK constraint would then reject.
--
-- A FUNCTION AND NOT AN INLINE SUB-SELECT because the merge happens inside an
-- ON CONFLICT DO UPDATE, and one named rule in the database is better than the
-- same rule copied into whichever statements grow up around this table.

CREATE OR REPLACE FUNCTION fundhub_vsl_merge_positions(a integer[], b integer[])
RETURNS integer[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN a IS NULL AND b IS NULL THEN NULL
    ELSE (
      SELECT (array_agg(DISTINCT v ORDER BY v))[1:4000]
        FROM unnest(coalesce(a, '{}'::integer[]) || coalesce(b, '{}'::integer[])) v
    )
  END
$$;

COMMENT ON FUNCTION fundhub_vsl_merge_positions(integer[], integer[]) IS
  'Union of two seconds_seen curves: sorted, de-duplicated, capped at 4000 to match fundhub_vsl_positions_ok. NULL only when both sides are NULL. Used by the ON CONFLICT DO UPDATE in src/vsl/watch-store.mjs so that a beacon arriving twice, late or out of order can never shorten a curve.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — vsl_watch_sessions: ONE ROW PER PERSON PER VIEWING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vsl_watch_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id),

  -- ─── which video ────────────────────────────────────────────────────────
  --
  -- NOT one video. The SLO funnel has its own videos and more will follow, so
  -- nothing here may assume "the VSL" is the only thing being watched. This is
  -- the file's path under public/, without a leading slash — 'funnel/vsl.mp4'
  -- for the one measured on 2026-09-08.
  --
  -- A PATH, NOT AN id REFERENCING A VIDEOS TABLE. There is no videos table and
  -- inventing one to hold a single row would be an abstraction ahead of a
  -- second video. The path is already the thing that identifies the file
  -- everywhere else — in the repo, in the <video> tag, and in the URL.
  video_key     text NOT NULL,

  -- How long the video is, in seconds, as the PLAYER reported it. Nullable
  -- because a browser that never loaded the metadata does not know, and 207.215
  -- must not be written here from this comment — a re-encode changes it and a
  -- hard-coded length would then be silently wrong for every new row.
  video_duration_seconds numeric(10,3),

  -- ─── who, anonymously ───────────────────────────────────────────────────
  --
  -- Both generated in the browser and meaningful nowhere else. visitor_id
  -- persists across visits (it is what makes "came back tomorrow" visible),
  -- session_key is one viewing. NEITHER IS A PERSON: there is no join from
  -- here to clients, users or accounts, and none may be added without that
  -- being a decision somebody makes on purpose.
  --
  -- Both are NOT NULL because a row that names neither can be reached by
  -- nobody, policed by nothing and merged with nothing.
  visitor_id    text NOT NULL,
  session_key   text NOT NULL,

  -- ─── when ───────────────────────────────────────────────────────────────
  --
  -- SERVER TIME, BOTH OF THEM, and deliberately not the browser's clock. A
  -- phone with the wrong date would otherwise file a viewing under 2019 and
  -- quietly bend every date range on every screen.
  --
  -- started_at is when the FIRST beacon of this viewing arrived, which is the
  -- player appearing on the page — see the header: that is not the same event
  -- as somebody choosing to watch. last_beacon_at is the most recent one, moved
  -- forward by the trigger in Part 5.
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_beacon_at timestamptz NOT NULL DEFAULT now(),

  -- ─── how far they got ───────────────────────────────────────────────────
  --
  -- The furthest second reached, and that as a share of the whole video. Both
  -- NULL until something says otherwise — a beacon that only reports "the
  -- player is here" knows neither yet.
  --
  -- watched_fraction is STORED rather than computed on the way out even though
  -- it looks derivable, because it is only derivable when the duration is
  -- known, and the duration is exactly the thing that can be missing. A screen
  -- that divided by video_duration_seconds would produce NULL for a real
  -- viewing whose duration never loaded, and would silently change every
  -- historic number the day the file is re-encoded.
  max_position_seconds numeric(10,3),
  watched_fraction     numeric(6,5),

  -- THE SECOND RUN, ON ITS OWN. Read the header section "TWO EVENTS THAT ARE
  -- NOT THE SAME EVENT" before using either of these.
  --
  -- Tapping for sound sets currentTime=0, so one viewing holds two runs of the
  -- video: the silent one, then the chosen one. max_position_seconds above
  -- covers both together and CANNOT tell them apart. This column is the furthest
  -- second of the second run alone.
  --
  -- Without it, somebody who let the video run silently to 3:00, tapped for
  -- sound and then left is stored as "chose to watch, reached 3:00" — when they
  -- watched none of it after choosing. That row is not merely imprecise, it is
  -- the exact opposite of what happened, and no screen could catch it because
  -- the two runs were added together before they were stored.
  --
  -- NULL means the second run never happened or was never reported, which is
  -- the right answer for everybody who never tapped. It is never 0 for them.
  max_position_after_unmute_seconds numeric(10,3),

  -- ─── what they did ──────────────────────────────────────────────────────
  --
  -- unmuted: they tapped for sound. THE DECISION TO WATCH. Read this before
  -- reading anything else — see the header on why the unmute restarts the
  -- video from zero.
  --
  -- finished: they reached the end. NULL means we never heard, which is not
  -- the same as "no".
  --
  -- autoplay_blocked: the browser refused to start it. Without this column the
  -- people whose player never ran vanish entirely and the funnel looks better
  -- than it is.
  unmuted          boolean,
  finished         boolean,
  autoplay_blocked boolean,

  -- Replays (reached the end, started again), rewinds (jumped backwards) and
  -- skips (jumped forwards). YouTube cannot report any of these three at all;
  -- they are the reason owning the player is worth anything.
  --
  -- NULL, not 0. "Nobody ever told us" and "they rewound nothing" are different
  -- facts, and only one of them is a measurement.
  replay_count  integer,
  rewind_count  integer,
  skip_count    integer,

  -- ─── the join to the label spine — THE WHOLE POINT ──────────────────────
  --
  -- utm_content is the raw parameter off the link, stored exactly as it
  -- arrived. ad_number is the leading digits of it, and it is DERIVED, never
  -- typed twice: same GENERATED ALWAYS shape, same function, same CHECK as
  -- client_ad_attribution.ad_id (286:110, 286:116-117), which is what makes a
  -- watch row and a lead row line up on one number.
  --
  -- fundhub_ad_id() (286:81-84) ignores the slug entirely: '42', '42-phase' and
  -- '42_phase' all resolve to '42', and anything that is not that shape resolves
  -- to NULL rather than to a guess. Ads are identified by id, never by name
  -- (owner-set 2026-09-06), so an ad with no title is not a problem here.
  --
  -- It matches ads.fundhub_ad_number's shape too (377:558, 377:568-569), so
  -- "what did the people who came from ad 42 do" joins straight through to the
  -- angle and the hook 377 gave that ad.
  --
  -- NULL is normal and is not a defect: somebody typed the address in, or the
  -- link carried no utm_content, or ClickFunnels dropped it. Unknown is
  -- unknown.
  utm_content   text,
  ad_number     text GENERATED ALWAYS AS (fundhub_ad_id(utm_content)) STORED,

  -- ─── where ──────────────────────────────────────────────────────────────
  --
  -- The page the player was on, and where the visitor came from. Both free text
  -- and both nullable. The page is stored rather than assumed because the same
  -- video can be pasted onto a second funnel page and then "which page" is the
  -- only way to tell two audiences apart.
  page_url      text,
  referrer      text,

  -- COARSE ON PURPOSE: 'mobile' | 'tablet' | 'desktop', and nothing finer. A
  -- full user-agent string is a fingerprint; this is the one cut that changes
  -- how a video is watched. NULL when the page did not say.
  device_hint   text,

  created_at    timestamptz NOT NULL DEFAULT now(),

  -- One row per viewing. This is the upsert target: a beacon fires again on
  -- page-hide and may well arrive twice, so the second arrival must find the
  -- first row rather than making a new one.
  CONSTRAINT vsl_watch_sessions_uq UNIQUE (visitor_id, session_key),

  -- Looks redundant next to the primary key and is not: it is the target the
  -- foreign key in Part 4 points at, which is what makes a positions row
  -- physically unable to claim a visitor its parent does not have.
  CONSTRAINT vsl_watch_sessions_id_visitor_uq UNIQUE (id, visitor_id)
);

-- ── The shape guards. Every one is "IS NULL OR ..." so unknown stays legal. ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vsl_watch_sessions_shape_ck'
       AND conrelid = 'public.vsl_watch_sessions'::regclass
  ) THEN
    ALTER TABLE vsl_watch_sessions
      ADD CONSTRAINT vsl_watch_sessions_shape_ck
      CHECK (
        -- A path under public/, lowercase, no leading slash, no spaces, no '..'.
        video_key ~ '^[a-z0-9][a-z0-9._/-]{0,119}$'
        AND position('..' in video_key) = 0

        -- Long enough that a session key is not guessable by hand, short enough
        -- that neither column can be used as storage. The endpoint enforces the
        -- same range; this is the wall behind that door.
        AND visitor_id  ~ '^[A-Za-z0-9_-]{16,64}$'
        AND session_key ~ '^[A-Za-z0-9_-]{16,64}$'

        AND (video_duration_seconds IS NULL OR (video_duration_seconds >  0 AND video_duration_seconds <= 86400))
        AND (max_position_seconds   IS NULL OR (max_position_seconds   >= 0 AND max_position_seconds   <= 86400))
        AND (watched_fraction       IS NULL OR (watched_fraction       >= 0 AND watched_fraction       <= 1))
        AND (max_position_after_unmute_seconds IS NULL
             OR (max_position_after_unmute_seconds >= 0
                 AND max_position_after_unmute_seconds <= 86400))

        AND (replay_count IS NULL OR (replay_count BETWEEN 0 AND 10000))
        AND (rewind_count IS NULL OR (rewind_count BETWEEN 0 AND 10000))
        AND (skip_count   IS NULL OR (skip_count   BETWEEN 0 AND 10000))

        -- Same rule as client_ad_attribution_ad_id_ck (286:116-117), stated
        -- here too rather than trusted to the generating function, because the
        -- function can be replaced and the constraint cannot be replaced by
        -- accident.
        AND (ad_number IS NULL OR ad_number ~ '^[0-9]{1,9}$')

        AND (device_hint IS NULL OR device_hint IN ('mobile', 'tablet', 'desktop'))

        AND (utm_content IS NULL OR length(utm_content) <= 200)
        AND (page_url    IS NULL OR length(page_url)    <= 500)
        AND (referrer    IS NULL OR length(referrer)    <= 500)
      );
  END IF;
END $$;

-- ── Indexes: exactly the two questions this table will be asked ─────────────

-- QUESTION ONE: "draw the curve for this video over this date range."
-- video first because a query always names one video, then time descending
-- because a date range is always the recent end.
CREATE INDEX IF NOT EXISTS vsl_watch_sessions_video_started_idx
  ON vsl_watch_sessions (video_key, started_at DESC);

-- QUESTION TWO: "what did the people who came from ad 42 do."
-- PARTIAL, on purpose. Most rows will have no ad number — somebody typing the
-- address in, or a link with no utm_content — and indexing those NULLs would
-- make the index bigger than the answer it gives.
CREATE INDEX IF NOT EXISTS vsl_watch_sessions_ad_started_idx
  ON vsl_watch_sessions (ad_number, started_at DESC)
  WHERE ad_number IS NOT NULL;

-- No third index. The per-visitor rate limiter counts a single visitor's recent
-- rows and the upsert finds one row; both ride vsl_watch_sessions_uq, whose
-- leading column is already visitor_id, and one visitor never has enough rows
-- for the time filter to be worth its own index. The site-wide count in Part 3b
-- rides vsl_watch_sessions_video_started_idx.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3b — THE FLOOD CEILING ON THE OPEN DOOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE HOLE THIS CLOSES. The per-visitor rate limit counts how many viewings one
-- visitor id has opened lately. A visitor id is a string the caller makes up for
-- free, so a script that sends a new one every time gets a fresh allowance every
-- time and can fill this table with invented viewings. There is no address and
-- no user agent stored to tell the junk apart afterwards, so every VSL number
-- drawn after such a flood would be wrong for good.
--
-- src/hiring/apply-public.mjs has three guards and its comment at :336-339 calls
-- the third one the important one — a whole-company count that "survives a
-- distributed flood across many addresses and many instances". This is that
-- guard, for this table.
--
-- WHY IT HAS TO BE A FUNCTION AND CANNOT BE AN ORDINARY COUNT. The beacon's
-- transaction has declared one visitor id, and Part 6's policies then show it
-- ONLY that visitor's rows. A `SELECT count(*) FROM vsl_watch_sessions` inside
-- that transaction returns that one visitor's count, not the site's — it would
-- look like it worked and would never fire. SECURITY DEFINER lets this run as
-- the owner, which sees the whole table.
--
-- WHAT IT CAN GIVE BACK, AND THAT IS THE WHOLE SAFETY ARGUMENT: an integer. Not
-- a row, not an id, not a visitor, not a column. There is no shape of call to
-- this function that returns anything about anybody. The one thing a caller can
-- learn is roughly how busy the site has been, and a caller who is flooding it
-- already knows that.
--
--   * `minutes` is clamped to 1..1440, so nobody can turn this into a count over
--     all history and make it expensive.
--   * search_path is pinned, which is the standard requirement for any SECURITY
--     DEFINER function: without it a caller could point the table name at a
--     table of their own.
--   * EXECUTE is taken away from PUBLIC and given to fundhub_app only.
--
-- IT IS DECLARED HERE AND NOT UP WITH fundhub_vsl_visitor() FOR ONE PLAIN
-- REASON: Postgres parses a LANGUAGE sql body when the function is created, so a
-- function naming vsl_watch_sessions cannot exist before the table does.

CREATE OR REPLACE FUNCTION fundhub_vsl_recent_count(minutes int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int
    FROM vsl_watch_sessions
   WHERE started_at > now()
       - (LEAST(GREATEST(coalesce(minutes, 10), 1), 1440) * interval '1 minute')
$$;

REVOKE ALL ON FUNCTION fundhub_vsl_recent_count(int) FROM PUBLIC;

COMMENT ON FUNCTION fundhub_vsl_recent_count(int) IS
  'How many VSL viewings started site-wide in the last N minutes (N clamped to 1-1440). Returns a NUMBER and never a row, so it exposes nothing about anybody. SECURITY DEFINER because the beacon''s own transaction is scoped to one visitor by the policies on vsl_watch_sessions, and an ordinary count there would silently return only that visitor''s rows. Called by checkVisitorRate() in src/vsl/watch-store.mjs as the whole-site flood ceiling on an endpoint anyone on the internet can post to — the sibling of the org-wide count in src/hiring/apply-public.mjs:346-356.';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — vsl_watch_positions: THE CURVE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ONE ROW PER VIEWING, HOLDING AN ARRAY. Not one row per position sample. This
-- was a real choice and here is the arithmetic behind it.
--
-- The video is 207 seconds. Sampling every 5 seconds gives about 42 samples for
-- a full watch, and sampling every second gives 207. As separate rows:
--
--     1,000 viewings a day  ×  42 samples   =    42,000 rows a day
--     1,000 viewings a day  ×  207 samples  =   207,000 rows a day
--                                            ≈ 75 million rows a year
--
-- ...to answer a question that is always an aggregate and never a row lookup.
-- Nobody will ever ask "what was sample 31 of viewing 4b2f". They ask "how many
-- were still watching at 0:48", which means reading all of it either way.
--
-- As one array per viewing it is 1,000 rows a day, about a kilobyte each, and
-- the curve is one unnest at read time. Same answer, a two-hundredth of the
-- rows, and no partitioning conversation in a year's time. That is the choice.
--
-- WHAT IS LOST: you cannot ask "when, in wall-clock terms, did they reach 0:48"
-- because the array holds positions and not timestamps. Nothing needs that, and
-- if something ever does it is a new table and not a rewrite of this one.
--
-- WORTH KNOWING BEFORE READING THIS TABLE AT ALL: the ordinary drop-off curve —
-- "how many got at least this far" — needs NOTHING from here. It is
-- max_position_seconds on vsl_watch_sessions, counted. This table answers the
-- narrower question of WHICH SECONDS WERE ACTUALLY SEEN, which differs from the
-- first only because people skip and rewind. Draw the cheap curve from
-- sessions; come here for coverage.

CREATE TABLE IF NOT EXISTS vsl_watch_positions (
  -- The viewing this curve belongs to. PRIMARY KEY, so one row per viewing is
  -- the database's rule and not a convention.
  session_id  uuid PRIMARY KEY,

  -- Carried down from the parent PURELY so this row can police itself. A policy
  -- is a boolean over one row's own columns; without this column every read of
  -- this table would have to sub-select vsl_watch_sessions to find out who owns
  -- it, on every row, forever.
  --
  -- It cannot drift and it cannot lie: the foreign key below points at
  -- vsl_watch_sessions (id, visitor_id) together, so a row naming a visitor its
  -- parent does not have is rejected by the engine.
  visitor_id  text NOT NULL,

  -- The whole seconds of the video this viewing was actually observed at,
  -- sorted, de-duplicated. NULL means we were never told — an unknown curve,
  -- not an empty one.
  seconds_seen integer[],

  -- How many samples the page has sent for this viewing, across all beacons.
  -- Not array_length(seconds_seen): repeated samples at the same second collapse
  -- in the array and this number does not, which is how a stuck player and a
  -- fast-forwarding one are told apart. NULL until something says.
  sample_count integer,

  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- ON DELETE CASCADE so a retention sweep on the sessions table takes the
  -- curves with it and cannot leave an orphan behind.
  CONSTRAINT vsl_watch_positions_session_fk
    FOREIGN KEY (session_id, visitor_id)
    REFERENCES vsl_watch_sessions (id, visitor_id)
    ON DELETE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'vsl_watch_positions_shape_ck'
       AND conrelid = 'public.vsl_watch_positions'::regclass
  ) THEN
    ALTER TABLE vsl_watch_positions
      ADD CONSTRAINT vsl_watch_positions_shape_ck
      CHECK (
        fundhub_vsl_positions_ok(seconds_seen)
        AND (sample_count IS NULL OR (sample_count BETWEEN 0 AND 100000))
      );
  END IF;
END $$;

-- No index beyond the primary key. Every read of this table arrives through a
-- set of session ids already narrowed by one of the two indexes in Part 3, and
-- an index nobody uses still costs every write.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — A VIEWING ONLY EVER MOVES FORWARD
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE FAILURE THIS EXISTS TO PREVENT, and it is not hypothetical: a beacon
-- fires on page-hide, the network is slow, the browser retries, and the second
-- copy of an EARLIER beacon lands after a later one. Without this trigger a
-- viewing that reached 3:02 is overwritten with "got 4 seconds in" and the real
-- number is gone with no error and no trace.
--
-- The rules, all three of them:
--
--   FROZEN — org, video, visitor, session key and started_at are whatever the
--   first write said. A later beacon cannot move a viewing to another video or
--   another person. Silently restored rather than raised as an error: a
--   mismatch means a confused or hostile caller, and losing that one beacon is
--   better than a 500 that tells them which field they got wrong.
--
--   RISING — every number is GREATEST(old, new). Postgres's GREATEST ignores
--   NULLs, so unknown-then-known lands correctly and known-then-unknown keeps
--   the number. This is where NULL surviving is actually enforced. The one
--   exception is watched_fraction, which is worked out from the winning
--   max_position_seconds rather than raised on its own, so the two can never end
--   up describing two different moments.
--
--   STICKY — a true stays true. false may replace NULL, because learning
--   "autoplay was not blocked" is a real measurement. NULL may never replace
--   anything, because it carries nothing.
--
-- Facts that arrive late but only once — the duration, the page, the referrer,
-- the device, the ad — take the FIRST non-null value. The link's utm_content is
-- known at page load and cannot become a different ad halfway through a video.

CREATE OR REPLACE FUNCTION fundhub_vsl_session_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Frozen.
  NEW.id          := OLD.id;
  NEW.org_id      := OLD.org_id;
  NEW.video_key   := OLD.video_key;
  NEW.visitor_id  := OLD.visitor_id;
  NEW.session_key := OLD.session_key;
  NEW.started_at  := OLD.started_at;
  NEW.created_at  := OLD.created_at;

  -- First non-null wins.
  NEW.video_duration_seconds := coalesce(OLD.video_duration_seconds, NEW.video_duration_seconds);
  NEW.utm_content            := coalesce(OLD.utm_content,            NEW.utm_content);
  NEW.page_url               := coalesce(OLD.page_url,               NEW.page_url);
  NEW.referrer               := coalesce(OLD.referrer,               NEW.referrer);
  NEW.device_hint            := coalesce(OLD.device_hint,            NEW.device_hint);

  -- Rising. GREATEST ignores NULLs, which is exactly the behaviour wanted here.
  --
  -- THE POSITION AND ITS FRACTION MUST DESCRIBE THE SAME MOMENT, so on an
  -- update the fraction is WORKED OUT from the winning position rather than
  -- raised on its own.
  --
  -- THE FAILURE THIS PREVENTS. Raised separately, a late beacon that is the
  -- first to learn the video's length would set the fraction from ITS position
  -- while the stored position came from a different, further beacon. The row
  -- would then read "reached second 100, watched 25% of it" — two numbers about
  -- two different moments, and no error anywhere. Small, and only ever a
  -- cosmetic wobble on a screen, but there is no reason to leave it in.
  --
  -- The duration used is the one settled by the coalesce above, so this also
  -- fills the fraction in correctly the moment the length is finally learned.
  -- Same arithmetic as src/vsl/watch-beacon.mjs: clamped at 1, because a browser
  -- can report currentTime a hair past the end and that is rounding, not a lie.
  --
  -- When the duration is still unknown there is nothing to divide by, so the
  -- fraction falls back to rising on its own and an unknown stays unknown.
  NEW.max_position_seconds := GREATEST(OLD.max_position_seconds, NEW.max_position_seconds);

  IF NEW.max_position_seconds IS NOT NULL
     AND NEW.video_duration_seconds IS NOT NULL
     AND NEW.video_duration_seconds > 0 THEN
    NEW.watched_fraction :=
      LEAST(1, round(NEW.max_position_seconds / NEW.video_duration_seconds, 5));
  ELSE
    NEW.watched_fraction := GREATEST(OLD.watched_fraction, NEW.watched_fraction);
  END IF;

  -- The second run's furthest second, on its own. Rises like everything else and
  -- never falls, so a replayed beacon cannot shrink it. NULL stays NULL for
  -- somebody who never tapped for sound — it does not become 0.
  NEW.max_position_after_unmute_seconds :=
    GREATEST(OLD.max_position_after_unmute_seconds, NEW.max_position_after_unmute_seconds);

  NEW.replay_count         := GREATEST(OLD.replay_count,         NEW.replay_count);
  NEW.rewind_count         := GREATEST(OLD.rewind_count,         NEW.rewind_count);
  NEW.skip_count           := GREATEST(OLD.skip_count,           NEW.skip_count);

  -- Sticky. `WHEN OLD.x` is false for NULL as well as for false, so an unknown
  -- correctly falls through to the coalesce.
  NEW.unmuted          := CASE WHEN OLD.unmuted          THEN true ELSE coalesce(NEW.unmuted,          OLD.unmuted)          END;
  NEW.finished         := CASE WHEN OLD.finished         THEN true ELSE coalesce(NEW.finished,         OLD.finished)         END;
  NEW.autoplay_blocked := CASE WHEN OLD.autoplay_blocked THEN true ELSE coalesce(NEW.autoplay_blocked, OLD.autoplay_blocked) END;

  -- Server time, always. The browser's clock is not consulted anywhere here.
  NEW.last_beacon_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vsl_watch_sessions_forward ON vsl_watch_sessions;
CREATE TRIGGER trg_vsl_watch_sessions_forward
  BEFORE UPDATE ON vsl_watch_sessions
  FOR EACH ROW EXECUTE FUNCTION fundhub_vsl_session_forward();

COMMENT ON FUNCTION fundhub_vsl_session_forward() IS
  'Makes every update to a vsl_watch_sessions row move forward only: identity columns frozen to the first write, numbers GREATEST(old,new), booleans sticky once true, last_beacon_at stamped from the server clock. watched_fraction is worked out from the winning max_position_seconds rather than raised on its own, so the two can never describe different moments. max_position_after_unmute_seconds rises on its own and stays NULL for anyone who never tapped for sound. Exists because a beacon can arrive twice and out of order, and a late duplicate must not overwrite a finished viewing with an earlier one.';

-- vsl_watch_positions gets no such trigger. Its one mutable column is an array
-- that the endpoint merges by union in the upsert itself
-- (src/vsl/watch-store.mjs), and a union cannot lose a second that was already
-- in it. sample_count is raised with GREATEST in the same statement.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Read the header first. In short: staff see everything; a beacon that has
-- declared a visitor id sees and writes that visitor's rows and nothing else; a
-- connection that declares nothing gets nothing.
--
-- Declared in the same file that creates the tables, ENABLE and FORCE and a
-- named policy together, following 235's "no-bare-RLS" rule — a table that is
-- RLS-on with no policy denies everything to everyone but the owner, and 109,
-- 154 and 201 each had to go back and repair one.
--
-- FORCE matters more than usual here. Without it the table's owner bypasses
-- every policy, and migrations and psql sessions run as the owner, so a test
-- run as the owner would prove nothing at all. That is not a theoretical worry
-- in this repo: CLAUDE.md §12 records the whole isolation suite passing
-- falsely because the connection was a superuser.
--
--   ⚠️ A SUPERUSER BYPASSES ALL OF THIS. Any test that claims to prove these
--      policies must connect as fundhub_app (src/testing/rls-pool.mjs), the way
--      src/db/label-spine.pg.test.mjs:40-46 does.

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['vsl_watch_sessions', 'vsl_watch_positions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    -- READ: staff, or the visitor reading their own browser's rows.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT
         USING (fundhub_is_staff() OR visitor_id = fundhub_vsl_visitor())',
      tbl || '_read', tbl
    );

    -- CREATE: the beacon writing under the visitor id it declared. It cannot
    -- file a row under somebody else's id, because the WITH CHECK compares the
    -- row being written to the setting the transaction opened with.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT
         WITH CHECK (fundhub_is_staff() OR visitor_id = fundhub_vsl_visitor())',
      tbl || '_insert', tbl
    );

    -- ADD TO: the second and third beacons of the same viewing. What an update
    -- is ALLOWED to change is the trigger's business, not the policy's — this
    -- only decides whose row may be touched at all.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
         USING      (fundhub_is_staff() OR visitor_id = fundhub_vsl_visitor())
         WITH CHECK (fundhub_is_staff() OR visitor_id = fundhub_vsl_visitor())',
      tbl || '_update', tbl
    );

    -- REMOVE: staff only, with no visitor branch. A visitor may add to their
    -- own row. They may not delete it, and a hostile caller who guesses a
    -- visitor id cannot erase anything.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_delete', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (fundhub_is_staff())',
      tbl || '_delete', tbl
    );
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — GRANTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 104_app_role.sql's ALTER DEFAULT PRIVILEGES should cover a new table, but only
-- when migrate.mjs runs as the same role that ran 104. Stated explicitly, the
-- way 235:106-117 and 176 do, so a database where that is not true does not end
-- up with a table the app cannot write.
--
-- DELETE is granted; the policy above is what actually decides who may use it.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.vsl_watch_sessions  TO fundhub_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.vsl_watch_positions TO fundhub_app;
    GRANT EXECUTE ON FUNCTION fundhub_vsl_visitor()               TO fundhub_app;
    -- The flood ceiling. EXECUTE was revoked from PUBLIC where it was declared
    -- (Part 3b), so this grant is what makes it callable by the app at all.
    GRANT EXECUTE ON FUNCTION fundhub_vsl_recent_count(int)        TO fundhub_app;
    GRANT EXECUTE ON FUNCTION fundhub_vsl_positions_ok(integer[])  TO fundhub_app;
    GRANT EXECUTE ON FUNCTION fundhub_vsl_merge_positions(integer[], integer[]) TO fundhub_app;
  ELSE
    RAISE NOTICE '379: skipped grants — role fundhub_app does not exist in this database';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — WHAT EACH THING IS, ON THE THING ITSELF
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE vsl_watch_sessions IS
  'One row per person per viewing of one of our own self-hosted videos. Written by an anonymous browser through api/public/vsl-watch.mjs, which declares fundhub.vsl_visitor for the length of one transaction; staff read everything, a visitor reaches only their own rows. Every measured column is NULL until something says otherwise and NULL NEVER MEANS ZERO. started_at is the player arriving on the page; unmuted is somebody deciding to watch — they are different events because tapping for sound restarts the video from zero, which is also why how far they got is TWO columns: max_position_seconds for the whole viewing and max_position_after_unmute_seconds for the run after they chose. ad_number is derived from utm_content by fundhub_ad_id() and is the join to 377''s label spine and to client_ad_attribution.';

COMMENT ON TABLE vsl_watch_positions IS
  'One row per viewing, holding the seconds of the video that viewing was actually observed at, as a sorted de-duplicated array. One row and not one row per sample: see Part 4 of 379 for the arithmetic. The ordinary drop-off curve does not need this table at all — it is max_position_seconds on vsl_watch_sessions, counted. This answers the narrower question of which seconds were really seen, which differs only because people skip and rewind.';

COMMENT ON COLUMN vsl_watch_sessions.video_key IS
  'Which video, as its path under public/ with no leading slash — ''funnel/vsl.mp4'' for the VSL measured 2026-09-08. Not assumed to be one video: the SLO funnel has its own.';
COMMENT ON COLUMN vsl_watch_sessions.video_duration_seconds IS
  'How long the video is, in seconds, as the player reported it. NULL when the browser never loaded the metadata. Deliberately not hard-coded from a comment — a re-encode changes it.';
COMMENT ON COLUMN vsl_watch_sessions.visitor_id IS
  'An anonymous id the page generated in the browser. NOT A PERSON: there is no join from here to clients, users or accounts. It is also the key the row-level security policies are written on, via fundhub_vsl_visitor().';
COMMENT ON COLUMN vsl_watch_sessions.session_key IS
  'One viewing. The upsert target together with visitor_id, so a beacon that arrives twice adds to the first row instead of creating a second.';
COMMENT ON COLUMN vsl_watch_sessions.started_at IS
  'Server time of the FIRST beacon of this viewing — the player appearing on the page. That is NOT the same as somebody choosing to watch; see unmuted. Never the browser''s clock.';
COMMENT ON COLUMN vsl_watch_sessions.last_beacon_at IS
  'Server time of the most recent beacon for this viewing, stamped by trg_vsl_watch_sessions_forward.';
COMMENT ON COLUMN vsl_watch_sessions.max_position_seconds IS
  'The furthest second of the video this viewing reached. Only ever rises. NULL means no beacon has reported a position yet — it does not mean they watched none of it.';
COMMENT ON COLUMN vsl_watch_sessions.watched_fraction IS
  'max_position_seconds as a share of the whole video, 0 to 1. Stored rather than divided at read time because the duration is exactly the thing that can be missing. NULL when either number is unknown. Raised in lockstep with max_position_seconds by trg_vsl_watch_sessions_forward, so the two always describe the same moment.';
COMMENT ON COLUMN vsl_watch_sessions.max_position_after_unmute_seconds IS
  'The furthest second reached AFTER they tapped for sound — the second run on its own. Tapping restarts the video at zero (docs/workflows/cf-vsl-watch-html-step1.html:133), so one viewing holds two runs and max_position_seconds covers both together and cannot separate them. Read THIS one, over rows where unmuted = true, for a drop-off curve of people who chose to watch; reading max_position_seconds there instead reports somebody who watched silently to 3:00 and then left as having watched 3:00 after choosing, which is the opposite of what happened. NULL means the second run never happened or was never reported — it is never 0 for somebody who never tapped.';
COMMENT ON COLUMN vsl_watch_sessions.unmuted IS
  'They tapped for sound. THE DECISION TO WATCH, and the number to read before any other, because the player auto-plays muted and unmuting restarts it from zero (docs/workflows/cf-vsl-watch-html-step1.html:133). NULL means we never heard.';
COMMENT ON COLUMN vsl_watch_sessions.finished IS
  'They reached the end. NULL means we never heard — the tab was closed or the beacon was blocked — which is NOT the same as false. Never count a NULL as a non-finisher.';
COMMENT ON COLUMN vsl_watch_sessions.autoplay_blocked IS
  'The browser refused to start the video. Without this the people whose player never ran vanish and the funnel looks better than it is. NULL means unknown.';
COMMENT ON COLUMN vsl_watch_sessions.replay_count IS
  'Times this viewing reached the end and started again. A restart to zero caused by tapping for sound is NOT a replay. NULL means nobody told us; 0 means they replayed nothing.';
COMMENT ON COLUMN vsl_watch_sessions.rewind_count IS
  'Times this viewing jumped backwards. YouTube cannot report this at all. NULL means nobody told us; 0 means no rewinds.';
COMMENT ON COLUMN vsl_watch_sessions.skip_count IS
  'Times this viewing jumped forwards. YouTube cannot report this at all. NULL means nobody told us; 0 means no skips.';
COMMENT ON COLUMN vsl_watch_sessions.utm_content IS
  'The raw utm_content off the link that brought this viewer, stored exactly as it arrived. NULL is normal — somebody typed the address in, or the link carried none.';
COMMENT ON COLUMN vsl_watch_sessions.ad_number IS
  'OUR ad number, the leading digits of utm_content, derived by fundhub_ad_id() (286:81-84) and never typed by hand. Same shape as client_ad_attribution.ad_id and ads.fundhub_ad_number, which is what lets watch data, lead data and 377''s angles and hooks meet on one number. The slug is ignored: 42, 42-phase and 42_phase are all ad 42. NULL when the link said nothing that looked like an ad number — never a guess.';
COMMENT ON COLUMN vsl_watch_sessions.page_url IS
  'The page the player was on — https://apply.fundhub.ai/watch for the VSL as at 2026-09-08. Stored rather than assumed because the same video can be pasted onto a second page, and then this is the only way to tell two audiences apart.';
COMMENT ON COLUMN vsl_watch_sessions.referrer IS
  'Where the visitor came from, as the browser reported it. NULL when it reported nothing.';
COMMENT ON COLUMN vsl_watch_sessions.device_hint IS
  'mobile, tablet or desktop, and nothing finer. A full user-agent string is a fingerprint; this is the one cut that changes how a video gets watched. NULL when the page did not say.';

COMMENT ON COLUMN vsl_watch_positions.visitor_id IS
  'Copied from the parent session PURELY so this row can be policed without a sub-select on every read. It cannot lie: the foreign key points at vsl_watch_sessions (id, visitor_id) together.';
COMMENT ON COLUMN vsl_watch_positions.seconds_seen IS
  'The whole seconds of the video this viewing was actually observed at, sorted and de-duplicated. Merged by union on every beacon, so a second already in it can never be lost. NULL means we were never told — an unknown curve, not an empty one.';
COMMENT ON COLUMN vsl_watch_positions.sample_count IS
  'How many position samples the page has sent for this viewing in total. Deliberately not array_length(seconds_seen): repeats at one second collapse in the array and do not collapse here, which is how a stuck player is told from a fast-forwarding one. NULL until something says.';
