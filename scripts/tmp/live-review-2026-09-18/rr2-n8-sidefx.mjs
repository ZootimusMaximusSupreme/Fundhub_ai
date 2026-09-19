// N8 reviewer — what my one enrolment wrote on Sim SloEighteen. BEGIN READ ONLY, ROLLBACK. No SET.
import pg from "pg";
const ID = "0dd8892c-6f1c-4fd5-84e4-4dc1b992b3d0";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const tables = (await c.query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='client_id'
       AND table_name NOT IN ('events','messages','repair_programs','documents') ORDER BY 1`)).rows.map((r) => r.table_name);
  for (const t of tables) {
    const hasCreated = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='created_at'`, [t])).rows.length;
    const hasUpdated = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='updated_at'`, [t])).rows.length;
    const cond = [hasCreated ? `created_at >= '2026-09-18T20:05:00Z'` : null, hasUpdated ? `updated_at >= '2026-09-18T20:05:00Z'` : null].filter(Boolean).join(" OR ");
    if (!cond) continue;
    try {
      const n = (await c.query(`SELECT count(*)::int AS n FROM ${t} WHERE client_id::text = $1 AND (${cond})`, [ID])).rows[0].n;
      if (n) console.log(t, n);
    } catch (e) { /* view or odd type */ }
  }
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
