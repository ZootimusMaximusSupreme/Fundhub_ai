-- ---------------------------------------------------------------------------
-- The one-time key that lets a phone notification approve an ad video.
--
-- docs/video-pipeline-plan.md §1 step 13: Chris films and Chris approves, and
-- that is the whole of his job. Owner decision 2026-09-22: approval is a tap in
-- a phone notification, not a screen in the app. A notification carries no
-- session and no cookie, so the link itself has to be the credential, and this
-- table is what keeps that from being a standing key to the door.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DEPENDS ON 389_ad_videos.sql
--
-- ad_videos is created by 389. This file adds the decision door on top of it
-- and RAISES rather than skipping if it is missing, because a migration that
-- quietly does half its work leaves a door that answers every tap with a
-- refusal and no reason anywhere. db/migrate.mjs applies files in name order,
-- so 389 has already run on any ordinary migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE TOKEN IS IN TWO HALVES. src/video/decision-token.mjs has the full
-- reasoning; the shape of this table is the half that matters here:
--
--   selector         16 random bytes, hex, in the clear, UNIQUE. The only
--                    thing the lookup reads. Knowing it proves nothing.
--   verifier_sha256  sha256 of the other 32 bytes. The bytes themselves exist
--                    in exactly one place — the notification on Chris's phone —
--                    and are never stored. So a dump of this table contains
--                    nothing that can be replayed at the door.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ONE TAP, ONCE. used_at is the whole of the replay guard, and it is enforced
-- by a conditional UPDATE (`WHERE used_at IS NULL`) rather than by a read
-- followed by a write. Postgres re-checks an UPDATE's WHERE against the current
-- row version under the row lock, so two taps that arrive in the same
-- millisecond cannot both find it NULL. A check-then-write would let both
-- through, and the second one would silently overturn the first decision.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'ad_videos'
  ) THEN
    RAISE EXCEPTION
      'ad_videos is missing. 390_ad_video_decision_tokens.sql builds the approval door on top of 389_ad_videos.sql; apply 389 first.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ad_video_decision_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  ad_video_id      uuid NOT NULL REFERENCES ad_videos(id) ON DELETE CASCADE,

  -- The public half. UNIQUE because it is the lookup key.
  selector         text NOT NULL UNIQUE,
  -- The secret half, hashed. Exactly 32 bytes; a shorter value would be a
  -- truncated digest, which src/video/decision-token.mjs refuses to compare.
  verifier_sha256  bytea NOT NULL,

  expires_at       timestamptz NOT NULL,

  -- NULL = never used. Set once, by the conditional UPDATE. See the header.
  used_at          timestamptz,
  -- Which way it was spent. NULL until used_at is set, and the two move
  -- together or not at all (ad_video_decision_tokens_spend_ck).
  decision         text,

  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_video_decision_tokens
  DROP CONSTRAINT IF EXISTS ad_video_decision_tokens_selector_ck;
ALTER TABLE ad_video_decision_tokens
  ADD CONSTRAINT ad_video_decision_tokens_selector_ck
  CHECK (selector ~ '^[0-9a-f]{32}$');

ALTER TABLE ad_video_decision_tokens
  DROP CONSTRAINT IF EXISTS ad_video_decision_tokens_verifier_ck;
ALTER TABLE ad_video_decision_tokens
  ADD CONSTRAINT ad_video_decision_tokens_verifier_ck
  CHECK (octet_length(verifier_sha256) = 32);

/* used_at and decision are one fact written in two columns. Either both are
   set or neither is — a row saying "used, but nobody remembers which way" is
   not a state this door can be in, and a CHECK is the only thing that can say
   so about two columns at once. */
ALTER TABLE ad_video_decision_tokens
  DROP CONSTRAINT IF EXISTS ad_video_decision_tokens_spend_ck;
ALTER TABLE ad_video_decision_tokens
  ADD CONSTRAINT ad_video_decision_tokens_spend_ck
  CHECK (
    (used_at IS NULL AND decision IS NULL)
    OR (used_at IS NOT NULL AND decision IN ('approve', 'reject'))
  );

/* The sweeper's question: is there a live key out for this take already?
   Partial, so spent and expired rows cost nothing to keep. */
CREATE INDEX IF NOT EXISTS ad_video_decision_tokens_live_idx
  ON ad_video_decision_tokens (ad_video_id)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS ad_video_decision_tokens_video_idx
  ON ad_video_decision_tokens (ad_video_id, created_at DESC);

COMMENT ON TABLE ad_video_decision_tokens IS
  'One-time keys for the phone-notification approval door (api/public/ad-video-decision.mjs). selector is public and indexed; only the sha256 of the secret half is stored, so nothing in this table can be replayed at the door. used_at is the replay guard and is set by a conditional UPDATE, never by a read-then-write (390).';
COMMENT ON COLUMN ad_video_decision_tokens.selector IS
  'Public half of the token, 32 lower-case hex characters. The only column the door looks a token up by.';
COMMENT ON COLUMN ad_video_decision_tokens.verifier_sha256 IS
  'sha256 of the secret half. The secret itself is never stored — it exists only in the notification that was sent.';
COMMENT ON COLUMN ad_video_decision_tokens.used_at IS
  'When this key was spent. NULL = unspent. Set once; a second tap finds it non-NULL and is refused.';

-- ═══════════════════════════════════════════════════════════════════════════
-- THE DOOR'S OWN SCOPE
--
-- fundhub_ad_video_decision() reads a setting the door sets for the length of
-- one transaction (src/video/decision-store.mjs, the same shape as 379's
-- fundhub_vsl_visitor). The policies below then let an unauthenticated request
-- holding a valid selector touch that one token row and that one video row,
-- and nothing else in the database. fundhub.actor is never set, so
-- fundhub_is_staff() is false throughout: this door never becomes staff.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fundhub_ad_video_decision()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('fundhub.ad_video_decision', true), '')
$$;

COMMENT ON FUNCTION fundhub_ad_video_decision() IS
  'The token selector the current transaction is deciding, or NULL. Set with set_config(..., true) by src/video/decision-store.mjs and dies with the transaction — src/db.mjs is a pool, so a session-scoped setting would leak one tap''s scope into the next request (390).';

ALTER TABLE ad_video_decision_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_video_decision_tokens FORCE  ROW LEVEL SECURITY;

/* Staff see every key. The door sees the one it is holding — it needs SELECT
   as well as UPDATE because Postgres applies the read policy to a RETURNING
   clause, and without RETURNING the door cannot tell a spent key from a wrong
   one. */
DROP POLICY IF EXISTS ad_video_decision_tokens_read ON ad_video_decision_tokens;
CREATE POLICY ad_video_decision_tokens_read ON ad_video_decision_tokens
  FOR SELECT
  USING (fundhub_is_staff() OR selector = fundhub_ad_video_decision());

/* Minting is staff work — the sweeper that buzzes the phone. The door itself
   can never create a key, only spend the one it arrived with. */
DROP POLICY IF EXISTS ad_video_decision_tokens_insert ON ad_video_decision_tokens;
CREATE POLICY ad_video_decision_tokens_insert ON ad_video_decision_tokens
  FOR INSERT
  WITH CHECK (fundhub_is_staff());

/* The spend. USING picks the row, WITH CHECK says what it may become: the door
   may only ever move a key from unspent to spent, and may not rewrite which
   video it belongs to or push its expiry out. */
DROP POLICY IF EXISTS ad_video_decision_tokens_update ON ad_video_decision_tokens;
CREATE POLICY ad_video_decision_tokens_update ON ad_video_decision_tokens
  FOR UPDATE
  USING      (fundhub_is_staff() OR (selector = fundhub_ad_video_decision() AND used_at IS NULL))
  WITH CHECK (fundhub_is_staff() OR (selector = fundhub_ad_video_decision() AND used_at IS NOT NULL));

DROP POLICY IF EXISTS ad_video_decision_tokens_delete ON ad_video_decision_tokens;
CREATE POLICY ad_video_decision_tokens_delete ON ad_video_decision_tokens
  FOR DELETE USING (fundhub_is_staff());

-- ═══════════════════════════════════════════════════════════════════════════
-- THE ONE VIDEO ROW THE DOOR MAY MOVE
--
-- Added here rather than in 389 because this is the only caller it exists for.
-- It is as narrow as the sentence it enforces: a take that is waiting on a
-- person, named by an unspent key the caller is holding, may become approved or
-- rejected and nothing else.
--
-- A policy is inert until RLS is enabled on the table, so this is safe whether
-- or not 389 turned RLS on — it simply starts applying when it does.
-- ═══════════════════════════════════════════════════════════════════════════
/* READ FIRST, AND IT IS NOT OPTIONAL. Two things need it and neither is
   obvious: the tiny confirmation page has to show Chris which take he is about
   to decide, and — the one that bites — Postgres applies the SELECT policy to
   an UPDATE's RETURNING clause. Without this policy the write below would
   succeed and return no rows, which the door would read as "refused". */
DROP POLICY IF EXISTS ad_videos_decision_door_read ON ad_videos;
CREATE POLICY ad_videos_decision_door_read ON ad_videos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ad_video_decision_tokens t
       WHERE t.ad_video_id = ad_videos.id
         AND t.org_id      = ad_videos.org_id
         AND t.selector    = fundhub_ad_video_decision()
         AND t.expires_at  > now()
    )
  );

COMMENT ON POLICY ad_videos_decision_door_read ON ad_videos IS
  'Lets the phone-approval door read the one take its token names — for the confirmation page, and because Postgres applies the SELECT policy to the decision UPDATE''s RETURNING clause (390).';

DROP POLICY IF EXISTS ad_videos_decision_door ON ad_videos;
CREATE POLICY ad_videos_decision_door ON ad_videos
  FOR UPDATE
  USING (
    status = 'awaiting_approval'
    AND EXISTS (
      SELECT 1 FROM ad_video_decision_tokens t
       WHERE t.ad_video_id = ad_videos.id
         AND t.org_id      = ad_videos.org_id
         AND t.selector    = fundhub_ad_video_decision()
         AND t.expires_at  > now()
    )
  )
  WITH CHECK (status IN ('approved', 'rejected'));

COMMENT ON POLICY ad_videos_decision_door ON ad_videos IS
  'Lets the unauthenticated phone-approval door move exactly one take out of awaiting_approval, and only into approved or rejected. Scoped by the token selector in fundhub_ad_video_decision() (390).';

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS — stated explicitly, the way 379 Part 7 and 385 do, so a database
-- where 104's default privileges do not reach still ends up usable.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_video_decision_tokens TO fundhub_app;
    GRANT EXECUTE ON FUNCTION fundhub_ad_video_decision() TO fundhub_app;
  END IF;
END $$;
