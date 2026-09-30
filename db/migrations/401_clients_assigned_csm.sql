-- 401_clients_assigned_csm.sql — one CSM staff row owns each Capital Blueprint client.
--
-- Spec: docs/finance/capital-blueprint-build-spec-2026-09-29.md §4.8. The CSM queue
-- today is role-wide open tasks; this column is the durable owner for exceptions
-- and closing prep on that file.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS assigned_csm_staff_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_assigned_csm_staff_fk') THEN
    ALTER TABLE clients
      ADD CONSTRAINT clients_assigned_csm_staff_fk
      FOREIGN KEY (assigned_csm_staff_id) REFERENCES staff(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN clients.assigned_csm_staff_id IS
  'Staff CSM who owns this client for Blueprint exceptions and closing prep. Set on Blueprint pay when unset.';

CREATE INDEX IF NOT EXISTS clients_assigned_csm_staff_idx
  ON clients (org_id, assigned_csm_staff_id)
  WHERE assigned_csm_staff_id IS NOT NULL;
