// N7 reviewer (fix run 2) — read-only look at live rows. BEGIN READ ONLY; nothing written.
// (Recreated: the first copy was removed from the worktree by another session's cleanup.)
import pg from "pg";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const WALK1 = "ab277630-8309-4c02-b187-f244e7e369e8";
const SINCE = process.env.SINCE || "2026-09-18 20:00:00+00";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(label, sql, params = []) {
  try { const r = await c.query(sql, params); console.log(`\n## ${label} (${r.rowCount})`); for (const row of r.rows) console.log(JSON.stringify(row)); return r.rows; }
  catch (e) { console.log(`\n## ${label} ERROR ${e.message}`); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); return []; }
}
console.log("label:", process.argv[2] || "(none)", "since:", SINCE);
await q("now", "SELECT now() AS db_now");
for (const [name, id] of [["EIGHT", EIGHT], ["WALK1", WALK1]]) {
  await q(`${name} applications`, `SELECT id, funding_round_id, lender_name, status, approved_amount, approval_excluded_at, updated_at FROM applications WHERE client_id=$1 ORDER BY created_at`, [id]);
  await q(`${name} rounds`, `SELECT round_number, status, approved_amount, funded_amount, updated_at FROM funding_rounds WHERE client_id=$1 ORDER BY round_number`, [id]);
  await q(`${name} invoices`, `SELECT id, source, status, amount_due, paid_at, voided_at, updated_at FROM invoices WHERE client_id=$1 ORDER BY created_at`, [id]);
  await q(`${name} invoice payments`, `SELECT ip.id, ip.kind, ip.amount, ip.paid_at FROM invoice_payments ip JOIN invoices i ON i.id=ip.invoice_id WHERE i.client_id=$1`, [id]);
  await q(`${name} fee tasks`, `SELECT id, assignee_role, done, created_at, left(title,160) title FROM tasks WHERE client_id=$1 AND source_workflow='success-fee-after-bill' ORDER BY created_at`, [id]);
  await q(`${name} tasks since`, `SELECT source_workflow, done, created_at FROM tasks WHERE client_id=$1 AND created_at >= $2 ORDER BY created_at`, [id, SINCE]);
  await q(`${name} decisions since`, `SELECT d.event_type, d.status, d.decided_at, d.created_by FROM application_decisions d JOIN applications a ON a.id=d.application_id WHERE a.client_id=$1 AND d.decided_at >= $2 ORDER BY d.decided_at`, [id, SINCE]);
  await q(`${name} messages since`, `SELECT template_key, channel, status, direction, created_at FROM messages WHERE client_id=$1 AND created_at >= $2 ORDER BY created_at`, [id, SINCE]);
  await q(`${name} events since`, `SELECT name, created_at FROM events WHERE client_id=$1 AND created_at >= $2 ORDER BY created_at`, [id, SINCE]);
}
await q("all success-fee-after-bill tasks (any client)", `SELECT id, client_id, done, created_at FROM tasks WHERE source_workflow='success-fee-after-bill' ORDER BY created_at`);
await c.query("ROLLBACK"); await c.end();
