-- 410_marketing_jobs_slot_unique.sql — marketing machine M0 step 4 review fix.
--
-- queueJob() dedupes a slotted job (the clock's weekly write_batch, one per local
-- date and time) by looking first and inserting second. Two clock ticks that race
-- could both look, both find nothing, and both insert. This makes the database the
-- referee: one job per (org, kind, slot). A job queued without a slot is unaffected.
--
-- marketing_jobs already has RLS enabled and forced, and its policy and grant, from 407.

CREATE UNIQUE INDEX IF NOT EXISTS marketing_jobs_slot_uq
  ON public.marketing_jobs (org_id, kind, (payload->>'slot'))
  WHERE payload->>'slot' IS NOT NULL;
