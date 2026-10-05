-- 406_repo_outbox.sql — marketing machine M0 step 2: repo saves through an outbox.
--
-- Every save that must also reach the GitHub repo writes one row here in the
-- SAME transaction as its database change. A worker (src/repo/outbox.mjs,
-- drainOutbox) later claims the waiting rows and turns them into one commit.
--
--   mode = 'replace'  the machine owns the file; `content` is the whole file.
--   mode = 'edit'     a shared file (RULES.md, registry.json, ...); `edit` holds
--                     the change itself so a retry re-applies it to the newest
--                     copy of the file.
--
-- op_id is the idempotency key. It rides in the commit message trailer
-- ("Outbox: <ids>") so a crash after the push cannot add the same change twice.
-- Spec: docs/specs/marketing-machine-2026-10-04.md, M0 step 2.

CREATE TABLE IF NOT EXISTS public.repo_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id),
  op_id         text NOT NULL,
  path          text NOT NULL,
  mode          text NOT NULL,
  content       text,
  edit          jsonb,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at    timestamptz,
  claim_id      uuid,
  attempts      integer NOT NULL DEFAULT 0,
  committed_sha text,
  committed_at  timestamptz,
  error         text,
  CONSTRAINT repo_outbox_mode_ck CHECK (mode IN ('replace', 'edit')),
  CONSTRAINT repo_outbox_payload_ck CHECK (
    (mode = 'replace' AND content IS NOT NULL AND edit IS NULL) OR
    (mode = 'edit'    AND edit IS NOT NULL    AND content IS NULL)
  ),
  CONSTRAINT repo_outbox_op_uq UNIQUE (org_id, op_id)
);

-- The drain reads "waiting, oldest first".
CREATE INDEX IF NOT EXISTS repo_outbox_waiting_idx
  ON public.repo_outbox (created_at)
  WHERE committed_at IS NULL;

COMMENT ON TABLE public.repo_outbox IS
  'Marketing machine: files waiting to be committed to the GitHub repo. Written in the caller''s transaction, drained by one worker at a time.';

ALTER TABLE public.repo_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_outbox FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'repo_outbox'
       AND policyname = 'repo_outbox_app_all'
  ) THEN
    CREATE POLICY repo_outbox_app_all ON public.repo_outbox
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.repo_outbox TO fundhub_app;
  END IF;
END $$;
