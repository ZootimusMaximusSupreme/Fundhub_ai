-- 255_doc_agent_docs_received.sql
--
-- RESTORED 2026-10-05 (marketing machine M0 step 6, the CI fix; Chris: "Go").
-- This is the renamed copy of 255_ghl_doc_docs_received.sql. 372_rename_legacy_crm_column_and_keys.sql
-- moved the recorded key to this name. The 2026-10-04 text cleanup cut lines and
-- code values out of the SQL below, so it did not run on an empty database (CI,
-- scratch databases) or silently matched nothing. The SQL is restored word for
-- word from the original. The original file is now a no-op so this runs once.
-- Production already records both keys, so nothing here re-runs there.
--
-- GHL-DOC was seeded against the GHL-era tag docs:uploaded. Nothing in this
-- stack raises that tag. api/documents-upload.mjs emits docs.received.
-- The runner is src/workflows/ghl-doc-document-check.mjs. JSON accept /
-- request_more / hold routing is not this migration.

UPDATE agents
   SET trigger_events = '["docs.received"]'::jsonb,
       updated_at = now()
 WHERE code = 'GHL-DOC';

DELETE FROM agent_triggers
 WHERE agent_code = 'GHL-DOC'
   AND event_name <> 'docs.received';

INSERT INTO agent_triggers (org_id, agent_code, event_name, source, note)
SELECT a.org_id, a.code, 'docs.received', 'seed',
       'Rewired from GHL-era tag docs:uploaded. Raised by api/documents-upload.mjs.'
  FROM agents a
 WHERE a.code = 'GHL-DOC'
ON CONFLICT (org_id, agent_code, event_name) DO UPDATE
  SET source = EXCLUDED.source,
      note = EXCLUDED.note,
      enabled = true,
      updated_at = now();
