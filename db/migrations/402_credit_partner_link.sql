-- 402_credit_partner_link.sql — Capital Blueprint credit partner (second file).
--
-- One included partner per primary Blueprint client. Partner is their own
-- clients row with their own soft_pull_consent and checklist — primary consent
-- does not cover them.

CREATE TABLE IF NOT EXISTS public.credit_partner_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES orgs(id),
  primary_client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  partner_client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  removed_at          timestamptz,
  CONSTRAINT credit_partner_links_distinct_ck
    CHECK (primary_client_id <> partner_client_id)
);

-- One live partner file per primary buyer.
CREATE UNIQUE INDEX IF NOT EXISTS credit_partner_links_one_live_primary
  ON public.credit_partner_links (primary_client_id)
  WHERE removed_at IS NULL;

-- A person is linked as partner on at most one primary file at a time.
CREATE UNIQUE INDEX IF NOT EXISTS credit_partner_links_one_live_partner
  ON public.credit_partner_links (partner_client_id)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS credit_partner_links_org_primary_idx
  ON public.credit_partner_links (org_id, primary_client_id)
  WHERE removed_at IS NULL;

COMMENT ON TABLE public.credit_partner_links IS
  'Capital Blueprint: primary client_id to free credit partner client_id, org scoped.';

ALTER TABLE public.credit_partner_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_partner_links FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'credit_partner_links'
       AND policyname = 'credit_partner_links_app_all'
  ) THEN
    CREATE POLICY credit_partner_links_app_all ON public.credit_partner_links
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_partner_links TO fundhub_app;
  END IF;
END $$;
