// r9b — read only: the client that owes, and which org the owner login belongs to. No PII printed.
import pg from "pg";
const CLIENT = "ab277630-8309-4c02-b187-f244e7e369e8";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 300) }]; }
};
try {
  await c.query("BEGIN READ ONLY");
  const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name='clients'`)).map(r => r.column_name);
  const want = ["id","org_id","first_name","last_name","status","stage","is_demo","archived_at","deleted_at","created_at"].filter(k => cols.includes(k));
  console.log("client:", await q(`select ${want.join(",")} from clients where id=$1`, [CLIENT]));
  const ucols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name='users'`)).map(r => r.column_name);
  const uw = ["org_id","role","is_active","active"].filter(k => ucols.includes(k));
  console.log("owner login org/role:", await q(`select ${uw.join(",")} from users where lower(email)='chris@fundhub.ai'`));
  console.log("payment_links on invoice:", await q(`select status, coalesce(is_demo,false) demo, (checkout_url is not null) has_url, amount_cents, created_at from payment_links where invoice_id='ae12b967-c524-4e2b-92b8-7a8dcea7980b'`));
  await c.query("ROLLBACK");
} finally { await c.end(); }
