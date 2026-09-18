// N7 — make Sim Eight-Funding's success-fee bill follow the bank approvals.
//
// Owner-set 2026-09-18: the fee must follow the real approval, not $25k.
// INV-B4B9C768 billed 10% of $25,000; the only approval on file is $10,000.
//
// This runs the SAME path a bank-answer press runs (flagBilledFeeDrift in
// src/funding/billed-fee-check.mjs) on this ONE test client and nothing else.
// Hard-locked to the client, round and bill below; it refuses anything else.
//
//   default   DRY RUN — one transaction, every write rolled back, events not
//             written (so nothing reaches Inngest). Prints before / would-be after.
//   --apply   the real run. The reissue commits in its own transaction.
//
// Nothing here sends the client an email or a text. No SET is issued.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/g-n7-reissue.mjs [--apply]
import pg from "pg";
import { writeFileSync } from "node:fs";
import { flagBilledFeeDrift } from "../../../src/funding/billed-fee-check.mjs";
import { CLIENT_INVOICES_SQL } from "../../../src/fulfillment/client-step.mjs";
import { BALANCES_SQL } from "../../../src/fulfillment/read-signals.mjs";

const ORG = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const CLIENT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4"; // Sim Eight-Funding
const ROUND = "bc9bb3a1-c043-4554-8512-a2e005612541"; // round 2
const OLD_BILL = "b4b9c768-5488-4202-9d2a-323a28b8aec6"; // INV-B4B9C768
const APPLY = process.argv.includes("--apply");
const OUT = new URL(`./g-n7-reissue-${APPLY ? "apply" : "dryrun"}.json`, import.meta.url);

async function snapshot(db) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  return {
    bills: await q(
      `SELECT invoice_id, status, amount_due, amount_paid, balance_due, gross_paid, reversed,
              settlement_state, open_balance, idempotency_key, voided_at, paid_at
         FROM v_invoice_balance WHERE client_id = $1 AND funding_round_id = $2
        ORDER BY created_at`, [CLIENT, ROUND]),
    payments: await q(
      `SELECT p.invoice_id, p.kind, p.amount, p.method, p.notes
         FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE i.client_id = $1 AND i.funding_round_id = $2
        ORDER BY p.created_at`, [CLIENT, ROUND]),
    closeout: await q(
      `SELECT total_approved_amount, total_fee, balance_due, fee_percent, status
         FROM funding_closeout WHERE funding_round_id = $1`, [ROUND]),
    confirmedApprovals: await q(
      `SELECT lender_name, status, approved_amount FROM applications
        WHERE funding_round_id = $1 ORDER BY created_at`, [ROUND]),
    feeTasks: await q(
      `SELECT title, created_at FROM tasks
        WHERE client_id = $1 AND source_workflow = 'success-fee-after-bill'
        ORDER BY created_at`, [CLIENT]),
    // What the control panel / Finance page and the list signals read as "still owed".
    panelInvoices: (await q(CLIENT_INVOICES_SQL, [CLIENT, ORG]))
      .map(({ id, status, amount_due, amount_paid, balance_due }) => ({ id, status, amount_due, amount_paid, balance_due })),
    listSignalBalances: (await q(BALANCES_SQL, [ORG, [CLIENT]]))
      .map(({ id, balance_due }) => ({ id, balance_due })),
    messagesLastHour: await q(
      `SELECT count(*)::int AS n FROM messages
        WHERE client_id = $1 AND created_at > now() - interval '1 hour'`, [CLIENT])
  };
}

async function guard(db) {
  const c = (await db.query(
    `SELECT first_name, last_name, email FROM clients WHERE id = $1 AND org_id = $2`, [CLIENT, ORG])).rows[0];
  if (!c || c.first_name !== "Sim" || c.last_name !== "Eight-Funding" || !/\+sim-08@/.test(c.email || "")) {
    throw new Error("refusing: the client is not the Sim Eight-Funding test file");
  }
  const bill = (await db.query(
    `SELECT client_id, funding_round_id, status, amount_due FROM invoices WHERE id = $1`, [OLD_BILL])).rows[0];
  if (!bill || bill.client_id !== CLIENT || bill.funding_round_id !== ROUND) {
    throw new Error("refusing: INV-B4B9C768 is not this client's round-2 bill");
  }
  return bill;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
const out = { at: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run" };
try {
  if (!APPLY) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      out.bill = await guard(client);
      out.before = await snapshot(client);
      // Inline on this one connection, so every write stays inside the rollback.
      // Event rows are skipped so a rolled-back bill is never announced anywhere.
      const inTx = {
        query: (sql, params) => /INSERT INTO events/i.test(sql)
          ? Promise.resolve({ rows: [] })
          : client.query(sql, params)
      };
      const res = await flagBilledFeeDrift(inTx, { orgId: ORG, application: { funding_round_id: ROUND, client_id: CLIENT } });
      out.result = res && { matches: res.matches, reissued: res.reissue?.invoice?.id || null,
        newStatus: res.reissue?.invoice?.status || null, carriedCents: res.reissue?.carriedCents ?? null,
        overpaidCents: res.reissue?.overpaidCents ?? null, task: !!res.task };
      out.after = await snapshot(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  } else {
    out.bill = await guard(pool);
    out.before = await snapshot(pool);
    const res = await flagBilledFeeDrift(pool, { orgId: ORG, application: { funding_round_id: ROUND, client_id: CLIENT } });
    out.result = res && { matches: res.matches, reissued: res.reissue?.invoice?.id || null,
      newStatus: res.reissue?.invoice?.status || null, carriedCents: res.reissue?.carriedCents ?? null,
      overpaidCents: res.reissue?.overpaidCents ?? null, task: !!res.task };
    // Let the fire-and-forget event hand-off finish before the process exits.
    await new Promise((r) => setTimeout(r, 1500));
    out.after = await snapshot(pool);
  }
} finally {
  await pool.end();
}
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
