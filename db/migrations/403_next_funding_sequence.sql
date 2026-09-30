-- 403_next_funding_sequence.sql — Next Funding Sequence + bank relationship todos.
--
-- Ready date for the next funding sequence lives in clients.custom_fields:
--   blueprint_next_sequence_ready_date  (ISO date YYYY-MM-DD, staff-set)
--
-- Closer-offered bank relationship tracker flag:
--   blueprint_bank_tracker_offered      ('true' when closer offered the tracker)
--
-- Named-bank todos (only after offer) live in blueprint_bank_relationship_todos.

CREATE TABLE IF NOT EXISTS public.blueprint_bank_relationship_todos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  bank_key      text NOT NULL,
  account_kind  text NOT NULL
                CONSTRAINT blueprint_bank_relationship_todos_kind_ck
                CHECK (account_kind IN ('personal', 'business')),
  state         text NOT NULL DEFAULT 'open'
                CONSTRAINT blueprint_bank_relationship_todos_state_ck
                CHECK (state IN ('open', 'done', 'skipped')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blueprint_bank_relationship_todos_bank_key_ck
    CHECK (char_length(btrim(bank_key)) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS blueprint_bank_relationship_todos_unique
  ON public.blueprint_bank_relationship_todos (client_id, bank_key, account_kind);

CREATE INDEX IF NOT EXISTS blueprint_bank_relationship_todos_client_open_idx
  ON public.blueprint_bank_relationship_todos (client_id, state)
  WHERE state = 'open';

COMMENT ON TABLE public.blueprint_bank_relationship_todos IS
  'Capital Blueprint bank relationship tracker — one row per bank + account kind when closer offered the tracker.';

ALTER TABLE public.blueprint_bank_relationship_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_bank_relationship_todos FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'blueprint_bank_relationship_todos'
       AND policyname = 'blueprint_bank_relationship_todos_app_all'
  ) THEN
    CREATE POLICY blueprint_bank_relationship_todos_app_all
      ON public.blueprint_bank_relationship_todos
      USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_blueprint_bank_relationship_todos_updated_at') THEN
    CREATE TRIGGER trg_blueprint_bank_relationship_todos_updated_at
      BEFORE UPDATE ON public.blueprint_bank_relationship_todos
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fundhub_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_bank_relationship_todos TO fundhub_app;
  END IF;
END $$;
