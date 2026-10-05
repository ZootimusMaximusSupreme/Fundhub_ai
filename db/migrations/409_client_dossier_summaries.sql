-- 409_client_dossier_summaries.sql — running summary of a client's older dossier items.
--
-- Marketing machine M0 step 9 (docs/specs/marketing-machine-2026-10-04.md §6).
-- The context fetcher (src/agents/context.mjs) hands every agent the client's
-- whole dossier (src/clients/dossier.mjs). When the dossier is too big for one
-- model call, nothing is cut: a worker job folds the older items into this
-- running summary, and a model call gets the summary plus every item newer than
-- covers_until, in full.
--
-- One row per client. covers_until is the newest item time the summary already
-- folds in; items at or before it are covered, items after it are not.
-- items_covered is how many dossier items the summary has folded so far, so a
-- reader can say "summary of N older items" instead of hiding the count.

CREATE TABLE IF NOT EXISTS public.client_dossier_summaries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES orgs(id),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  summary        text NOT NULL,
  covers_until   timestamptz NOT NULL,
  items_covered  integer NOT NULL DEFAULT 0,
  model          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_dossier_summaries_summary_ck
    CHECK (char_length(btrim(summary)) >= 1),
  CONSTRAINT client_dossier_summaries_items_ck
    CHECK (items_covered >= 0)
);

-- One running summary per client, per org.
CREATE UNIQUE INDEX IF NOT EXISTS client_dossier_summaries_client_uq
  ON public.client_dossier_summaries (org_id, client_id);

COMMENT ON TABLE public.client_dossier_summaries IS
  'Running summary of a client''s dossier items up to covers_until. Agents get this plus every newer item in full (M0 step 9).';

ALTER TABLE public.client_dossier_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_dossier_summaries FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'client_dossier_summaries'
       AND policyname = 'client_dossier_summaries_app_all'
  ) THEN
    CREATE POLICY client_dossier_summaries_app_all ON public.client_dossier_summaries
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_dossier_summaries TO fundhub_app;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_client_dossier_summaries_updated_at') THEN
    CREATE TRIGGER trg_client_dossier_summaries_updated_at
      BEFORE UPDATE ON public.client_dossier_summaries
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
