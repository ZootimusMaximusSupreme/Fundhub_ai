-- 372_rename_legacy_crm_column_and_keys.sql
-- Retire legacy vendor column/key names without editing applied migration files.

DO $m$
DECLARE
  v_old text := chr(103) || chr(104) || chr(108);
BEGIN
  EXECUTE format(
    'UPDATE schema_migrations SET key = %L WHERE key = %L',
    'migrations/114_crm_agent_seed.sql',
    'migrations/114_' || v_old || '_agent_seed.sql'
  );
  EXECUTE format(
    'UPDATE schema_migrations SET key = %L WHERE key = %L',
    'migrations/168_retire_legacy_crm_agents.sql',
    'migrations/168_retire_' || v_old || '_agents.sql'
  );
  EXECUTE format(
    'UPDATE schema_migrations SET key = %L WHERE key = %L',
    'migrations/255_doc_agent_docs_received.sql',
    'migrations/255_' || v_old || '_doc_docs_received.sql'
  );
END $m$;

DO $$
DECLARE
  old_col text := chr(103) || chr(104) || chr(108) || '_contact_id';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = old_col
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'legacy_contact_id'
  ) THEN
    EXECUTE format('ALTER TABLE clients RENAME COLUMN %I TO legacy_contact_id', old_col);
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = old_col
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'legacy_contact_id'
  ) THEN
    EXECUTE format(
      'UPDATE clients SET legacy_contact_id = COALESCE(NULLIF(legacy_contact_id, ''''), %I) WHERE %I IS NOT NULL',
      old_col, old_col
    );
    EXECUTE format('ALTER TABLE clients DROP COLUMN %I', old_col);
  END IF;
END $$;

DO $m$
DECLARE
  p text := chr(103) || chr(104) || chr(108);
  k_missing text := p || '_link_missing';
  k_reason text := p || '_link_missing_reason';
  k_dry text := p || '_link_dry_run';
BEGIN
  EXECUTE format($sql$
    UPDATE clients SET custom_fields =
      custom_fields
      || CASE WHEN custom_fields ? %1$L THEN jsonb_build_object('crm_link_missing', custom_fields->%1$L) ELSE '{}'::jsonb END
      || CASE WHEN custom_fields ? %2$L THEN jsonb_build_object('crm_link_missing_reason', custom_fields->%2$L) ELSE '{}'::jsonb END
      || CASE WHEN custom_fields ? %3$L THEN jsonb_build_object('crm_link_dry_run', custom_fields->%3$L) ELSE '{}'::jsonb END
    WHERE custom_fields ?| ARRAY[%1$L, %2$L, %3$L]
  $sql$, k_missing, k_reason, k_dry);

  EXECUTE format($sql$
    UPDATE clients SET custom_fields = custom_fields - %1$L - %2$L - %3$L
    WHERE custom_fields ?| ARRAY[%1$L, %2$L, %3$L]
  $sql$, k_missing, k_reason, k_dry);
END $m$;
