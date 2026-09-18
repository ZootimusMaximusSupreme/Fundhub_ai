// Reviewer hole 11 — read only. Column names for clients, documents, messages.
import { pool, close } from "../../../src/db.mjs";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1) GROUP BY 1`, [["clients","documents","messages"]]);
  await c.query("COMMIT");
  for (const x of r.rows) console.log(x.table_name, "::", x.cols);
} catch (e) { try { await c.query("ROLLBACK"); } catch {} console.error("fail", e.message); process.exitCode = 1; }
finally { c.release(); await close(); }
