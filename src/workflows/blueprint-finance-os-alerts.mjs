// Blueprint + Finance OS — payment timing & promo alert stubs (no outbound yet).
//
// Payment timing uses account_statement_cycles + statement-cycles.mjs.
// Promo end dates: client_cards has no promo_end / intro_apr_end columns as of
// 2026-09-29 — promo sweep no-ops with reason documented below.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { FINANCE_OS_TIER } from "../finance/finance-os-entitlement.mjs";
import { formatIsoDate } from "../banking/statement-cycles.mjs";
import { nextDueDate } from "../banking/statement-cycles.mjs";

export const SWEEP_CRON = "30 7 * * *";
export const SOURCE_WORKFLOW = "blueprint-finance-os-alerts";

/** Promo tracking placeholder — no column on client_cards yet. */
export const PROMO_TRACKING_SKIP_REASON =
  "client_cards has no promo_end columns — promo alerts are a no-op until schema exists";

export async function entitledFinanceOsClients(conn, now) {
  const res = await conn.query(
    `SELECT s.org_id, s.client_id
       FROM subscriptions s
      WHERE s.tier = $1
        AND s.status = 'active'
        AND s.effective_from <= $2
        AND (s.effective_to IS NULL OR s.effective_to > $2)
        AND s.client_id IS NOT NULL`,
    [FINANCE_OS_TIER, now]
  );
  return res.rows;
}

export async function paymentTimingHints(conn, { orgId, clientId, todayIso }) {
  const res = await conn.query(
    `SELECT statement_close_day, payment_due_day
       FROM account_statement_cycles
      WHERE org_id = $1::uuid AND client_id = $2::uuid
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 20`,
    [orgId, clientId]
  );
  const hints = [];
  for (const row of res.rows) {
    const due = nextDueDate(row, { today: todayIso });
    if (due.dueOn) {
      hints.push({
        paymentDueDay: row.payment_due_day,
        statementCloseDay: row.statement_close_day,
        nextDueOn: due.dueOn,
        daysAway: due.daysAway
      });
    }
  }
  return hints;
}

export async function sweep(conn = db, { now = new Date() } = {}) {
  const todayIso = formatIsoDate({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate()
  });

  const tally = {
    checked: 0,
    paymentTimingRows: 0,
    promo: { skipped: true, reason: PROMO_TRACKING_SKIP_REASON }
  };

  const clients = await entitledFinanceOsClients(conn, now);
  tally.checked = clients.length;

  for (const row of clients) {
    const hints = await paymentTimingHints(conn, {
      orgId: row.org_id,
      clientId: row.client_id,
      todayIso
    });
    tally.paymentTimingRows += hints.length;
  }

  return tally;
}

export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const blueprintFinanceOsAlerts = inngest.createFunction(
  { id: "blueprint-finance-os-alerts", name: "Blueprint Finance OS alert stubs" },
  { cron: SWEEP_CRON },
  () => sweep(db)
);

export default sweep;
