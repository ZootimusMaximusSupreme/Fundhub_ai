-- 168_retire_legacy_crm_agents.sql
--
-- RESTORED 2026-10-05 (marketing machine M0 step 6, the CI fix; Chris: "Go").
-- This is the renamed copy of 168_retire_ghl_agents.sql. 372_rename_legacy_crm_column_and_keys.sql
-- moved the recorded key to this name. The 2026-10-04 text cleanup cut lines and
-- code values out of the SQL below, so it did not run on an empty database (CI,
-- scratch databases) or silently matched nothing. The SQL is restored word for
-- word from the original. The original file is now a no-op so this runs once.
-- Production already records both keys, so nothing here re-runs there.
--
-- Owner 2026-08-15: GHL is out. Seeded GHL-* agent rows stay as inventory but
-- must not be selectable for live/shadow reply. Retire them.

UPDATE agents
   SET status = 'retired',
       retired_at = COALESCE(retired_at, now()),
       updated_at = now()
 WHERE code LIKE 'GHL-%'
   AND status IS DISTINCT FROM 'retired';
