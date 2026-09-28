-- 397_authorized_representatives.sql — one person can open more than one file.
--
-- THE CASE. A dad watches both kids' credit files. He is not an affiliate and
-- he is not a second copy of either kid. Staff add him. He can upload, sign,
-- pay, and message on each file, the same as the kid. Texts and emails for
-- those files go to him. A file with no dad still messages the kid.
--
-- WHY A NEW LOGIN KIND. accounts_email_uniq is one login per email, and
-- accounts_client_uniq is one login per file. A dad on two files cannot be a
-- client row. kind 'authorized_rep' carries no client_id. The files live on
-- client_authorized_reps. One live dad per file. One dad, many files.
--
-- Adding a different person to a file stamps removed_at on the old row. The
-- old row stays so "who used to have this" is still a fact.
--
-- SAFETY. New kind, one nullable phone column, one nullable session column,
-- one new table. No existing row is rewritten. A client login still has a
-- client_id and still fails the same checks it failed before.

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_kind_ck;
ALTER TABLE accounts ADD CONSTRAINT accounts_kind_ck
  CHECK (kind IN ('client', 'affiliate', 'partner', 'authorized_rep'));

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_subject_ck;
ALTER TABLE accounts ADD CONSTRAINT accounts_subject_ck CHECK (
  (kind = 'client'    AND client_id    IS NOT NULL AND partner_id IS NULL) OR
  (kind = 'affiliate' AND affiliate_id IS NOT NULL AND client_id IS NULL AND partner_id IS NULL) OR
  (kind = 'partner'   AND partner_id   IS NOT NULL AND client_id IS NULL AND affiliate_id IS NULL) OR
  (kind = 'authorized_rep' AND client_id IS NULL AND affiliate_id IS NULL AND partner_id IS NULL)
);

COMMENT ON CONSTRAINT accounts_subject_ck ON accounts IS
  'A client may also carry an affiliate_id. An authorized representative carries none of the three subject ids; their files are client_authorized_reps.';

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_phone_ck;
ALTER TABLE accounts ADD CONSTRAINT accounts_phone_ck
  CHECK (phone IS NULL OR phone ~ '^\+[0-9]{8,15}$');

COMMENT ON COLUMN accounts.phone IS
  'E.164. Set for an authorized representative, because texts for the files they watch go here and not to the client row.';

INSERT INTO account_signup_policy (kind, self_signup, note) VALUES
  ('authorized_rep', false, 'INVITE ONLY. Staff add this person to a client file. They do not sign themselves up.')
ON CONFLICT (kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.client_authorized_reps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  added_by    uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz
);

-- One live person per file. A removed row does not hold the slot.
CREATE UNIQUE INDEX IF NOT EXISTS client_authorized_reps_one_live
  ON public.client_authorized_reps (client_id)
  WHERE removed_at IS NULL;

-- One live link from this login to this file. Re-adding after a removal is a new row.
CREATE UNIQUE INDEX IF NOT EXISTS client_authorized_reps_pair_live
  ON public.client_authorized_reps (account_id, client_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS client_authorized_reps_account_live_idx
  ON public.client_authorized_reps (account_id, created_at)
  WHERE removed_at IS NULL;

COMMENT ON TABLE public.client_authorized_reps IS
  'Which client files an authorized representative may open. One live row per file. Texts and emails for that file go to the representative, not the client.';

ALTER TABLE account_sessions
  ADD COLUMN IF NOT EXISTS active_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN account_sessions.active_client_id IS
  'The file an authorized representative is looking at. Null on a client, affiliate, or partner session.';

ALTER TABLE public.client_authorized_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_authorized_reps FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'client_authorized_reps'
       AND policyname = 'client_authorized_reps_app_all'
  ) THEN
    CREATE POLICY client_authorized_reps_app_all ON public.client_authorized_reps
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_authorized_reps TO fundhub_app;
  END IF;
END $$;
