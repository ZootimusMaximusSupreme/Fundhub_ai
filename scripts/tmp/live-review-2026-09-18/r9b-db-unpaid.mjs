// r9b — second reviewer, hole 9. Read only: every live invoice with money still owed.
// BEGIN READ ONLY, ROLLBACK. No bare SET. No emails/phones/links/secrets printed.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 300) }]; }
};
try {
  await c.query("BEGIN READ ONLY");
  console.log("read_only=", (await q("show transaction_read_only"))[0].transaction_read_only, "now=", (await q("select now() n"))[0].n.toISOString());
  console.log("\n== invoices by status (all rows)");
  console.log(await q(`select status, coalesce(is_demo,false) demo, count(*)::int n from invoices group by 1,2 order by 1,2`));
  console.log("\n== v_invoice_aging open_balance > 0 (any demo flag)");
  const rows = await q(`
    select v.invoice_id, v.client_id, v.org_id, v.source, v.status, v.currency, v.amount_due, v.amount_paid, v.open_balance,
           v.due_at, v.sent_at, v.created_at, coalesce(i.is_demo,false) inv_demo,
           upper(substr(replace(v.invoice_id::text,'-',''),1,8)) inv8,
           cl.first_name, cl.last_name,
           (select count(*)::int from payment_links pl where pl.invoice_id=v.invoice_id and pl.org_id=v.org_id and pl.checkout_url is not null and pl.status <> 'paid' and coalesce(pl.is_demo,false)=false) open_links
      from v_invoice_aging v join invoices i on i.id=v.invoice_id
      left join clients cl on cl.id=v.client_id
     where v.open_balance > 0
     order by v.created_at`);
  for (const r of rows) console.log(JSON.stringify(r));
  console.log("\n== invoices not paid/void by status (raw table), with client");
  const raw = await q(`select i.id, i.client_id, i.status, i.amount_due, coalesce(i.is_demo,false) demo, i.created_at from invoices i where i.status not in ('paid','void','written_off') order by i.created_at`);
  for (const r of raw) console.log(JSON.stringify(r));
  await c.query("ROLLBACK");
} finally { await c.end(); }
