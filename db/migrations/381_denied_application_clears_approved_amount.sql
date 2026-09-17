-- ---------------------------------------------------------------------------
-- A bank that said NO cannot keep carrying an approved dollar amount.
--
-- WHY THIS EXISTS
-- Measured 2026-09-16 on the live walk, client d682c13b (Sim Eight-Funding):
-- "Arizona Bank & Trust (0% - HTLF)" was moved from Approved to Denied at
-- 19:28:24Z and kept approved_amount = 25000.00. Nothing cleared it, because
-- setApplicationStatus only patches approved_amount when it is TOLD one
-- (src/applications/status.mjs — "null means not told, so the column keeps what
-- it had"). That rule is right for every other transition and wrong for exactly
-- one: a denial.
--
-- The stale figure is not cosmetic. It is the number that made the Funding
-- round box read $25,000 while the Apply door and the Approved-confirmed tile
-- both read $10,000 — three dollar figures on one screen for one pot of money.
--
-- WHY A TRIGGER AND NOT A CHECK CONSTRAINT
-- A CHECK is validated against rows that already exist, and rows like the one
-- above already exist, so a CHECK would refuse to apply. A BEFORE trigger fixes
-- the value on the way in instead of refusing the write — staff pressing "Bank
-- no" must never be met with a database error they cannot act on.
--
-- WHY IT SETS NULL AND NOT 0
-- NULL means unknown and it survives (CLAUDE.md §12). A 0 would be a claim that
-- the bank approved nothing, which is a different sentence from "the bank said
-- no", and src/applications/status.mjs already refuses a 0 on the way in.
--
-- THIS IS NOT THE "DOESN'T COUNT" FLAG. An excluded approval (migration 272)
-- keeps status = 'Approved' because the bank did approve. This is the other
-- case: the bank said no, so there is no approval and no amount.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fundhub_denied_application_clears_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.status = 'Denied' AND NEW.approved_amount IS NOT NULL THEN
    NEW.approved_amount := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_denied_application_clears_amount ON applications;

CREATE TRIGGER trg_denied_application_clears_amount
  BEFORE INSERT OR UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION fundhub_denied_application_clears_amount();

-- The rows already on the book, including the Arizona row above.
UPDATE applications
   SET approved_amount = NULL,
       updated_at = now()
 WHERE status = 'Denied'
   AND approved_amount IS NOT NULL;

COMMENT ON FUNCTION fundhub_denied_application_clears_amount() IS
  'A denial carries no approved amount. Clears approved_amount to NULL (unknown, never 0) whenever an application row is written with status Denied.';
