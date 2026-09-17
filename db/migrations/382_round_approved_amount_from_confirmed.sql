-- ---------------------------------------------------------------------------
-- ONE NUMBER FOR "APPROVED", AND THE DATABASE KEEPS IT TRUE.
--
-- WHAT WENT WRONG
-- Measured 2026-09-16 on the live walk, client d682c13b (Sim Eight-Funding):
-- one file, one pot of money, three dollar figures on screen.
--
--   Apply door            $10,000  — summed from the application rows
--   Approved-confirmed    $10,000  — the same sum
--   Funding round box     $25,000  — funding_rounds.approved_amount
--
-- The round column is a SUMMARY that was frozen when the round was funded. One
-- of the two banks on the file was later moved to Denied and the summary never
-- moved with it, so the screen kept showing a bank yes that no longer existed.
--
-- WHAT THIS DOES
-- Keeps funding_rounds.approved_amount equal, at all times, to the confirmed
-- approvals on that round — the ONE basis the owner set on 2026-08-30
-- (docs/CLOSEOUT-FEE-BASIS.md):
--
--   SUM(applications.approved_amount)
--     WHERE funding_round_id = <this round>
--       AND status = 'Approved'
--       AND approval_excluded_at IS NULL      -- "doesn't count" (migration 272)
--       AND approved_amount IS NOT NULL
--       AND approved_amount > 0
--
-- After this the door, the tile, the round box and the success-fee basis are the
-- same number by construction rather than by four pieces of code agreeing.
-- CLAUDE.md 3a: the rule lives in the database, not in the screen.
--
-- NULL IS UNKNOWN AND IT SURVIVES (CLAUDE.md 12)
-- A round where nothing is confirmed gets NULL, never 0. "No bank has said yes
-- with a number on it" is not "the banks approved zero dollars", and a 0 in this
-- column is exactly what would let a $0 bill be produced from it.
--
-- A ROUND WITH NO APPLICATION ROWS AT ALL IS NOT TOUCHED.
-- The trigger only ever fires from an application write, and the backfill below
-- only visits rounds that have at least one application. A round imported with a
-- summary figure and no per-bank rows keeps what it has — deleting a number
-- nobody can re-derive would destroy information, not correct it.
--
-- THIS COLUMN IS STILL NOT A BILLING SOURCE. docs/CLOSEOUT-FEE-BASIS.md is
-- unchanged: the invoice and the closeout read the application rows through
-- src/funding/success-fee.mjs. This only stops the summary DISAGREEING with
-- them on screen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fundhub_round_approved_amount_from_confirmed(round_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  confirmed numeric(14,2);
BEGIN
  IF round_id IS NULL THEN
    RETURN;
  END IF;

  SELECT SUM(a.approved_amount)
    INTO confirmed
    FROM applications a
    JOIN funding_rounds r ON r.id = a.funding_round_id
   WHERE a.funding_round_id = round_id
     AND a.org_id = r.org_id
     AND a.status = 'Approved'
     AND a.approval_excluded_at IS NULL
     AND a.approved_amount IS NOT NULL
     AND a.approved_amount > 0;

  UPDATE funding_rounds
     SET approved_amount = confirmed,
         updated_at = now()
   WHERE id = round_id
     AND approved_amount IS DISTINCT FROM confirmed;
END;
$fn$;

CREATE OR REPLACE FUNCTION fundhub_application_syncs_round_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM fundhub_round_approved_amount_from_confirmed(OLD.funding_round_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM fundhub_round_approved_amount_from_confirmed(NEW.funding_round_id);
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_application_syncs_round_approved ON applications;

CREATE TRIGGER trg_application_syncs_round_approved
  AFTER INSERT OR UPDATE OR DELETE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION fundhub_application_syncs_round_approved();

-- The rounds already on the book that HAVE application rows, including round 2
-- on Sim Eight-Funding, which was reading $25,000 for a $10,000 bank yes.
DO $do$
DECLARE
  r uuid;
BEGIN
  FOR r IN SELECT DISTINCT funding_round_id FROM applications WHERE funding_round_id IS NOT NULL
  LOOP
    PERFORM fundhub_round_approved_amount_from_confirmed(r);
  END LOOP;
END;
$do$;

COMMENT ON COLUMN funding_rounds.approved_amount IS
  'Confirmed approvals on this round, kept in step with the application rows by trigger (migration 382). NULL means nothing on this round is confirmed - never 0. Display only: the invoice and the closeout read the application rows, see docs/CLOSEOUT-FEE-BASIS.md.';
