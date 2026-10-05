-- 424_clarity_export_counter.sql — Clarity Data Export daily request counter.
--
-- The rate-capped adapter (src/adapters/clarity-export.mjs) used to count calls
-- in credentials/clarity-export-daily.json. Netlify cannot write there, so the
-- sweeper could never run. The count lives here now.
--
-- One row per org, Clarity project and UTC day.
--   calls         every request sent that day (Microsoft's cap is 10).
--   machine_calls the part of that sent by the daily sweeper (our cap is 2).

CREATE TABLE IF NOT EXISTS public.clarity_export_calls (
  org_id        uuid NOT NULL REFERENCES orgs(id),
  project_id    text NOT NULL,
  day_utc       date NOT NULL,
  calls         integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  machine_calls integer NOT NULL DEFAULT 0 CHECK (machine_calls >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, project_id, day_utc)
);

COMMENT ON TABLE public.clarity_export_calls IS
  'Daily count of Microsoft Clarity Data Export requests per project. Microsoft allows 10 a day; the sweeper sends at most 2.';

ALTER TABLE public.clarity_export_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clarity_export_calls FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'clarity_export_calls'
       AND policyname = 'clarity_export_calls_app_all'
  ) THEN
    CREATE POLICY clarity_export_calls_app_all ON public.clarity_export_calls
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.clarity_export_calls TO fundhub_app;
  END IF;
END $$;
