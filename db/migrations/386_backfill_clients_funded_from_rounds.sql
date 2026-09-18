-- ---------------------------------------------------------------------------
-- A client with a funded round reads funded — including the ones funded before
-- the person row was kept in step (hole N18).
--
-- WHY THIS EXISTS
-- Hole 8 (2026-09-18) made round.funded write clients.funded and
-- clients.funded_amount from the rounds (syncClientFunded in
-- src/handlers/money-chain.mjs). That only runs when a round is funded from now
-- on. A round funded BEFORE that change never passed through it, so its client
-- still reads "not funded".
--
-- Measured on live 2026-09-18, read only: Walk1 Funding
-- (ab277630-8309-4c02-b187-f244e7e369e8) has round 1 funded for $45,000 and its
-- client row says funded = false, funded_amount = NULL. The Client Control
-- Panel's Funded line reads "No" on two fresh loads. It was the only client out
-- of step; Sim Eight-Funding had already been set by the hole 8 data fix.
--
-- THE RULE IS THE SAME ONE round.funded RUNS (SQL_SYNC_CLIENT_FUNDED)
--   * Only rounds with status 'funded' count.
--   * funded_amount is the SUM of the client's funded rounds.
--   * If any funded round has no amount, the total is unknown: NULL. Never a
--     partial sum, never 0 (CLAUDE.md section 12 — NULL means unknown).
--   * It only ever sets funded to true. It never un-funds a client: a client
--     with no funded round is not touched at all.
--   * Rounds and client are matched on client_id AND org_id, as the sync does.
--
-- Only rows that are out of step are written, so a client that already reads
-- right (Sim Eight-Funding) is left alone and its updated_at does not move.
-- Safe to run twice: the second run matches nothing.
-- ---------------------------------------------------------------------------

UPDATE clients c
   SET funded = true,
       funded_amount = s.total
  FROM (
    SELECT fr.client_id,
           fr.org_id,
           CASE WHEN bool_and(fr.funded_amount IS NOT NULL)
                THEN SUM(fr.funded_amount) END AS total
      FROM funding_rounds fr
     WHERE fr.status = 'funded'
       AND fr.client_id IS NOT NULL
     GROUP BY fr.client_id, fr.org_id
    HAVING count(*) > 0
  ) s
 WHERE c.id = s.client_id
   AND c.org_id = s.org_id
   AND (c.funded IS DISTINCT FROM true
        OR c.funded_amount IS DISTINCT FROM s.total);
