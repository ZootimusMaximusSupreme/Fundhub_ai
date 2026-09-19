// Hole N6 — read only. The Commas payment inbox: who claimed what, and when.
// Every query runs inside BEGIN READ ONLY. Nothing is written. No payload
// bytes, names, phones or emails are printed.
// Usage: node --env-file=<.env> r2-n6-read.mjs            (default look)
//        node --env-file=<.env> r2-n6-read.mjs "<sql>" [params...]
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
async function q(label, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    console.log(`\n## ${label} (${r.rowCount})`);
    for (const row of r.rows) console.log(JSON.stringify(row));
  } catch (e) {
    console.log(`\n## ${label} ERROR ${e.message}`);
    await c.query("ROLLBACK");
    await c.query("BEGIN READ ONLY");
  }
}
const extra = process.argv.slice(2);
if (extra.length) {
  await q("adhoc", extra[0], extra.slice(1));
} else {
  await q("now", `SELECT now() AS db_now`);
  await q("inbox columns", `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='commas_inbox' ORDER BY ordinal_position`);
  await q("inbox by status", `SELECT status, count(*), max(attempts) max_attempts FROM commas_inbox GROUP BY status`);
  await q("inbox rows (newest 30)", `SELECT left(id::text,8) id, status, attempts, left(coalesce(payment_id,''),24) payment_id, event_type, source, received_at, claimed_at, processed_at, left(coalesce(last_error,''),160) err FROM commas_inbox ORDER BY received_at DESC LIMIT 30`);
}
await c.query("ROLLBACK");
await c.end();
