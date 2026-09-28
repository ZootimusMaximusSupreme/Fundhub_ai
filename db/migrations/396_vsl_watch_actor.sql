-- 396_vsl_watch_actor.sql — a sales-video viewing says person or agent.
--
-- The roadmap page already does this (src/slo/visitor.mjs, slo.visit).
-- vsl_watch_sessions did not, so a robot browser and a customer were one pile.
--
-- NULL on every row that already exists. Those viewings never said which,
-- and a blank is not the same as "a person."
--
-- Once a viewing is an agent it stays an agent. A later beacon from a normal
-- browser must not wipe that. The forward trigger is replaced here so that
-- rule lives on the table, the same place the other "only move forward" rules
-- already live. The rest of that function is unchanged from 379.

ALTER TABLE vsl_watch_sessions
  ADD COLUMN IF NOT EXISTS actor text,
  ADD COLUMN IF NOT EXISTS actor_reason text;

ALTER TABLE vsl_watch_sessions
  DROP CONSTRAINT IF EXISTS vsl_watch_sessions_actor_ck;

ALTER TABLE vsl_watch_sessions
  ADD CONSTRAINT vsl_watch_sessions_actor_ck CHECK (
    (actor IS NULL AND actor_reason IS NULL)
    OR (
      actor = 'person' AND actor_reason = 'browser'
    )
    OR (
      actor = 'agent' AND actor_reason IN (
        'automated_browser', 'bot_browser', 'company_email', 'test_email'
      )
    )
  );

COMMENT ON COLUMN vsl_watch_sessions.actor IS
  'person or agent. Same split as the roadmap page. NULL on viewings saved before this column existed — unknown, not a person.';

COMMENT ON COLUMN vsl_watch_sessions.actor_reason IS
  'Why actor is what it is: browser, automated_browser, bot_browser, company_email, or test_email. From src/slo/visitor.mjs.';

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

  NEW.max_position_seconds := GREATEST(OLD.max_position_seconds, NEW.max_position_seconds);

  IF NEW.max_position_seconds IS NOT NULL
     AND NEW.video_duration_seconds IS NOT NULL
     AND NEW.video_duration_seconds > 0 THEN
    NEW.watched_fraction :=
      LEAST(1, round(NEW.max_position_seconds / NEW.video_duration_seconds, 5));
  ELSE
    NEW.watched_fraction := GREATEST(OLD.watched_fraction, NEW.watched_fraction);
  END IF;

  NEW.max_position_after_unmute_seconds :=
    GREATEST(OLD.max_position_after_unmute_seconds, NEW.max_position_after_unmute_seconds);

  NEW.replay_count         := GREATEST(OLD.replay_count,         NEW.replay_count);
  NEW.rewind_count         := GREATEST(OLD.rewind_count,         NEW.rewind_count);
  NEW.skip_count           := GREATEST(OLD.skip_count,           NEW.skip_count);

  NEW.unmuted          := CASE WHEN OLD.unmuted          THEN true ELSE coalesce(NEW.unmuted,          OLD.unmuted)          END;
  NEW.finished         := CASE WHEN OLD.finished         THEN true ELSE coalesce(NEW.finished,         OLD.finished)         END;
  NEW.autoplay_blocked := CASE WHEN OLD.autoplay_blocked THEN true ELSE coalesce(NEW.autoplay_blocked, OLD.autoplay_blocked) END;

  -- An agent stays an agent. A person can become an agent. An agent never
  -- becomes a person because a later beacon looked ordinary.
  IF OLD.actor = 'agent' THEN
    NEW.actor := 'agent';
    NEW.actor_reason := OLD.actor_reason;
  ELSIF NEW.actor IS NULL THEN
    NEW.actor := OLD.actor;
    NEW.actor_reason := OLD.actor_reason;
  END IF;

  NEW.last_beacon_at := now();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fundhub_vsl_session_forward() IS
  'Makes every update to a vsl_watch_sessions row move forward only: identity columns frozen to the first write, numbers GREATEST(old,new), booleans sticky once true, last_beacon_at stamped from the server clock. watched_fraction is worked out from the winning max_position_seconds rather than raised on its own. An agent stays an agent. Exists because a beacon can arrive twice and out of order, and a late duplicate must not overwrite a finished viewing with an earlier one.';
