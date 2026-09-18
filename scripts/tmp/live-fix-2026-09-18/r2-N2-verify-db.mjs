// N2 VERIFY — read-only look at payment_links, the failed payment-link step,
// and the matching payment.received events for the Sim files. BEGIN READ ONLY,
// then ROLLBACK. No SET. Prints no phone, email, token or secret.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N2-verify-db.mjs
import pg from "pg";

const SIMS = {
  "#8": "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  "#9": "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  "#10": "22103bca-0ec9-4491-bb75-5d1b6528f116",
  "#11": "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  "#12": "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  "#13": "7ccbeb76-df98-4125-8c14-0d1c9f5e3042",
  Combo: "567c12ce-64de-4043-aa98-d842434bd267",
  Walk1: "ab277630-8309-4c02-b187-f244e7e369e8",
};
const ids = Object.values(SIMS);
const name = Object.fromEntries(Object.entries(SIMS).map(([k, v]) => [v, k]));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const show = (label, rows) => {
  console.log(`\n== ${label} (${rows.length})`);
  for (const r of rows) console.log(JSON.stringify(r));
};
try {
  await c.query("BEGIN READ ONLY");
  show("payment_links on Sim files", (await c.query(
    `SELECT client_id, id, purpose, left(description, 40) AS description, amount_cents, status,
            link_ref, commas_session_id, paid_amount_cents, created_at, sent_at, paid_at, product_id, sale_id
       FROM payment_links WHERE client_id = ANY($1) ORDER BY client_id, created_at`, [ids]))
    .rows.map((r) => ({ who: name[r.client_id], ...r, client_id: undefined })));

  show("failed_events payment-link step (any client)", (await c.query(
    `SELECT id, event_id, handler_name, status, attempts, max_attempts, client_id, first_seen_at, last_seen_at,
            next_attempt_at, resolved_at, left(error_message, 300) AS error_message
       FROM failed_events WHERE handler_name ILIKE '%PaymentReceivedForLink%' ORDER BY first_seen_at`))
    .rows.map((r) => ({ who: name[r.client_id] || "other", ...r })));
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
