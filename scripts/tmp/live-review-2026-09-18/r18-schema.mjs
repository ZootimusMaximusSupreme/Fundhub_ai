// Hole 18 reviewer — read only. Column lists for tables this review reads.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const r = await c.query(`SELECT table_name, string_agg(column_name||':'||data_type, ', ' ORDER BY ordinal_position) cols
 FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1) GROUP BY table_name`,
 [["commas_inbox","payment_links","sales","sale_payments","funding_rounds","events","invoices","messages","clients","funding_board_cards","funding_cards","products"]]);
for (const row of r.rows) console.log(row.table_name, "=>", row.cols, "\n");
const t = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%fund%' OR table_name ILIKE '%board%' OR table_name ILIKE '%invoice%')`);
console.log(t.rows.map(x=>x.table_name).join(", "));
await c.query("ROLLBACK"); await c.end();
