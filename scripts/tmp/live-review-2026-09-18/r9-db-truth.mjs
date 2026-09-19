// r9 — reviewer's read-only look at live truth for INV-B4B9C768 and #8's payments.
// BEGIN READ ONLY, ROLLBACK. No bare SET. No secrets printed.
import pg from "pg";
const CLIENT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
try {
  await c.query("BEGIN READ ONLY");
  console.log("read_only=", (await q("show transaction_read_only"))[0].transaction_read_only, "now=", (await q("select now() n"))[0].n.toISOString());
  const tabs = (await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and (table_name ilike '%invoice%' or table_name ilike '%payment%' or table_name ilike '%receipt%' or table_name ilike '%charge%') order by 1`)).map(r => r.table_name);
  console.log("tables:", tabs.join(", "));
  for (const t of tabs) {
    const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).map(r => r.column_name);
    let where = null;
    if (cols.includes("client_id")) where = `client_id::text=$1`;
    const rows = where ? await q(`select to_jsonb(x) j from public."${t}" x where ${where} order by 1`, [CLIENT])
                       : await q(`select to_jsonb(x) j from public."${t}" x where to_jsonb(x)::text ilike $1 limit 20`, [`%${CLIENT}%`]);
    const hitByNum = await q(`select to_jsonb(x) j from public."${t}" x where to_jsonb(x)::text ilike '%B4B9C768%' limit 20`);
    const all = [...rows, ...hitByNum.filter(h => !rows.some(r => JSON.stringify(r.j) === JSON.stringify(h.j)))];
    if (!all.length) continue;
    console.log(`\n== ${t} (${all.length})`);
    for (const r of all) {
      if (r.error) { console.log("  ERR", r.error); continue; }
      const j = { ...r.j };
      for (const k of Object.keys(j)) if (/(token|secret|password|card|last4|email|phone|url|link|metadata|raw|payload|lines|items|meta)/i.test(k) && !/(status|amount|_cents|number)/i.test(k)) j[k] = j[k] == null ? null : "[hidden]";
      console.log("  ", JSON.stringify(j));
    }
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
