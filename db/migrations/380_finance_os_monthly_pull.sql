-- 380_finance_os_monthly_pull.sql — a soft pull can be requested by the system,
-- not only by a person tapping a button.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Finance OS becomes a paid monthly add-on (owner-set 2026-09-09; price not yet
-- set — subscriptions.price_cents stays NULL for this tier until Chris gives a
-- number, the same pattern the Winners Board tier used before it was priced).
-- Part of what the add-on buys is one included soft pull a month, run through
-- UnderwriteIQ so the client's Finance OS suggestions stay current, plus the
-- ability to pay for an additional pull whenever they want.
--
-- 077_soft_pull_requests.sql built the ledger around exactly two requesters —
-- `staff` working a file, `client` tapping a button in their own portal — and
-- its own CONSTRAINT soft_pull_requests_requester_ck requires one of those two
-- FKs to be set. A scheduled monthly pull has no human requester: nobody at
-- Fundhub tapped anything, and attributing it to a staff id or the client's own
-- account id would be a false record on the one table this repo built
-- specifically to be an honest audit trail of who asked and why. So this adds
-- a third, genuine value — `system` — rather than stretching either existing
-- one to cover a case it was not built for.
--
-- NOTHING HERE SCHEDULES A PULL OR CALLS A BUREAU. This migration only widens
-- what the ledger is allowed to say. The scheduler that writes a `system` row
-- once a billing period, and the entitlement check that decides who gets one,
-- are application code (src/finance/finance-os-pull-scheduler.mjs), not this
-- file — CLAUDE.md §2: constraints and guards live in the database, behaviour
-- does not.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT CLOSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- fulfilSoftPull() (src/finance/soft-pulls.mjs) is called from nowhere in
-- application code today — only from tests. The provider seam 077 describes
-- ("This is where a real soft pull would be requested, and it is not here...
-- on an answer calls fulfilSoftPull()") has never been closed, for ANY
-- requester kind, not only this new one. A `system` row this migration allows
-- will sit at 'queued' exactly as a `staff` or `client` row does today, until
-- something — a real CRS adapter, or the same sim tooling the manual walks use
-- — moves it to 'fulfilled'. Closing that seam is the same class of decision
-- Plaid's linkAccount()/getAccounts() were: a human call, not a side effect of
-- widening an enum. This migration does not make that call.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EVERY OTHER GUARD ON THIS TABLE IS UNCHANGED AND STILL APPLIES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- uq_soft_pull_requests_one_open (090) still allows exactly one queued request
-- per client — a scheduler must not, and does not need to, bypass it: if last
-- month's pull is somehow still queued, the guard is the correct reason this
-- month's does not get written, the same answer a second client tap gets today.
-- The consent gate in requestSoftPull() (soft-pulls.mjs, GUARD 0) is read at
-- request time regardless of requester kind, so a system-initiated pull is
-- refused exactly as a client-initiated one is when consent is not on file.
-- soft_pull_requests_resolved_ck and soft_pull_requests_result_ck are untouched
-- — a `system` row still needs resolved_at the moment it leaves 'queued', and
-- can still only name a crs_results row once it is 'fulfilled'.

ALTER TABLE soft_pull_requests
  DROP CONSTRAINT IF EXISTS soft_pull_requests_requested_by_kind_check;
ALTER TABLE soft_pull_requests
  ADD CONSTRAINT soft_pull_requests_requested_by_kind_check
  CHECK (requested_by_kind IN ('staff', 'client', 'system'));

ALTER TABLE soft_pull_requests
  DROP CONSTRAINT IF EXISTS soft_pull_requests_requester_ck;
ALTER TABLE soft_pull_requests
  ADD CONSTRAINT soft_pull_requests_requester_ck CHECK (
    (requested_by_kind = 'staff'
       AND requested_by_staff_id IS NOT NULL AND requested_by_account_id IS NULL)
    OR
    (requested_by_kind = 'client'
       AND requested_by_account_id IS NOT NULL AND requested_by_staff_id IS NULL)
    OR
    (requested_by_kind = 'system'
       AND requested_by_staff_id IS NULL AND requested_by_account_id IS NULL)
  );

COMMENT ON COLUMN soft_pull_requests.requested_by_kind IS
  'staff = an employee working the file. client = the client themself, from the portal. system = a scheduled pull with no human requester (Finance OS monthly cadence, 380_finance_os_monthly_pull.sql) — both FK columns are NULL for this kind, and that is the honest record, not a gap.';
