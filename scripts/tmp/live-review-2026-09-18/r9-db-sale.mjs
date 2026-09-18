// r9 — read-only: sale_payments / subscription_charges for #8's sale, plus invoice state again.
import pg from "pg";
const SALE = "d7f8d653-c419-4df0-b12c-ce67258092c1";
const INV = "b4b9c768-5488-4202-9d2a-323a28b8aec6";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  console.log("now", (await c.query("select now() n")).rows[0].n.toISOString());
  for (const t of ["sale_payments", "subscription_charges"]) {
    const cols = (await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map(r => r.column_name);
    console.log(t, "cols:", cols.join(","));
    const key = cols.includes("sale_id") ? "sale_id" : null;
    if (!key) continue;
    const rows = (await c.query(`select to_jsonb(x) j from public."${t}" x where sale_id=$1`, [SALE])).rows;
    for (const r of rows) { const j = r.j; for (const k of Object.keys(j)) if (/(token|secret|card|last4|email|phone|url|raw|payload|meta)/i.test(k)) j[k] = j[k] == null ? null : "[hidden]"; console.log("  ", JSON.stringify(j)); }
  }
  const inv = (await c.query(`select status, amount_due, paid_at, sent_at, voided_at, written_off_at, (select coalesce(sum(amount),0) from invoice_payments p where p.invoice_id=i.id and p.kind='payment') paid_sum from invoices i where id=$1`, [INV])).rows[0];
  console.log("invoice:", JSON.stringify(inv));
  const sale = (await c.query(`select to_jsonb(s) j from sales s where id=$1`, [SALE])).rows[0]?.j;
  if (sale) console.log("sale:", JSON.stringify(Object.fromEntries(Object.entries(sale).filter(([k]) => /(status|amount|price|product|title|name|paid|created)/i.test(k)))));
  await c.query("ROLLBACK");
} finally { await c.end(); }
