-- A take that is waiting says nothing, and that is how the pilot went dark.
--
-- Measured 2026-09-23: the first take ever polled reached `staged` and stopped.
-- Every five minutes the sweeper tried the next step, the step answered "wait"
-- with a reason, and a wait writes no patch — so `updated_at` never moved and
-- the reason existed only in a return value that went to Inngest and nowhere a
-- person could read it. From the outside a take retrying every five minutes and
-- a take nothing is touching look exactly the same.
--
-- These two columns are the difference. Every pass writes what it just tried
-- and why it could not finish, whether or not the take moved.

ALTER TABLE ad_videos
  ADD COLUMN IF NOT EXISTS last_step      text,
  ADD COLUMN IF NOT EXISTS last_step_note text,
  ADD COLUMN IF NOT EXISTS last_step_at   timestamptz;

COMMENT ON COLUMN ad_videos.last_step IS
  'The pipeline step the most recent sweep ran on this take.';
COMMENT ON COLUMN ad_videos.last_step_note IS
  'Why that step did not finish, in the step''s own words. NULL when it did.';
COMMENT ON COLUMN ad_videos.last_step_at IS
  'When that step last ran. Moves on every pass, including a pass that waited.';
