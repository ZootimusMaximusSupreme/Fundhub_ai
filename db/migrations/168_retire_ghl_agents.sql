-- 168_retire_ghl_agents.sql
--
-- SUPERSEDED 2026-10-05 by 168_retire_legacy_crm_agents.sql, which carries this file's SQL word
-- for word (372_rename_legacy_crm_column_and_keys.sql moved the recorded key to
-- that name). Kept as a no-op so a fresh database does not apply the same work
-- twice. Production already records this key, so this file never runs there.
SELECT 1;
