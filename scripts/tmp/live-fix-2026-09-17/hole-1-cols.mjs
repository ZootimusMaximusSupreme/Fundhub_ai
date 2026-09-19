// read-only: column lists for the tables hole 1 looks at
import { pool, close } from "../../../src/db.mjs";
const client = await pool().connect();
try {
  await client.query("BEGIN READ ONLY");
  const r0 = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%entitle%' OR table_name ILIKE '%contract%' OR table_name ILIKE '%purchase%' OR table_name ILIKE '%order%' OR table_name ILIKE '%product%') ORDER BY 1`);
  console.log("tables:", r0.rows.map((x) => x.table_name).join(","));
  for (const t of ["documents", "client_entitlements", "contracts", "crs_results"]) {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.log(t, r.rows.map((x) => x.column_name).join(","));
  }
  await client.query("COMMIT");
} finally { client.release(); await close(); }
