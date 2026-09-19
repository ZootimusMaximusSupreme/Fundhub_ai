// Hole 19 reviewer — #12 checklist rows, purchases, grants, funding rounds now.
// BEGIN READ ONLY, then ROLLBACK. Writes nothing. Prints no secrets.
import pg from "pg";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const out = { at: new Date().toISOString() };
try {
  await c.query("BEGIN READ ONLY");
  const q = async (sql, p) => { await c.query("SAVEPOINT s"); try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return { error: e.message.slice(0, 200) }; } };
  out.db_now = (await q("SELECT now()"))[0];
  for (const [name, id] of [["twelve", TWELVE], ["eleven", ELEVEN]]) {
    const o = {};
    o.client = await q(`SELECT id, first_name, last_name, created_at FROM clients WHERE id=$1`, [id]);
    o.waypoints = await q(`SELECT * FROM client_waypoints WHERE client_id=$1 ORDER BY position`, [id]);
    o.waypoints_any_count = await q(`SELECT count(*)::int n FROM client_waypoints WHERE client_id=$1`, [id]);
    o.transactions = await q(`SELECT * FROM transactions WHERE client_id=$1 ORDER BY created_at`, [id]);
    o.entitlements = await q(`SELECT entitlement_code, grant_reason, granted_at, revoked_at FROM entitlements WHERE client_id=$1 ORDER BY granted_at`, [id]);
    o.paid_service_requests = await q(`SELECT * FROM paid_service_requests WHERE client_id=$1 ORDER BY created_at`, [id]);
    out[name] = o;
  }
  // any other table with a client_id column whose name suggests checklist/steps
  out.checklistish_tables = await q(`SELECT table_name FROM information_schema.columns
     WHERE table_schema='public' AND column_name='client_id'
       AND (table_name ILIKE '%waypoint%' OR table_name ILIKE '%checklist%' OR table_name ILIKE '%step%' OR table_name ILIKE '%task%' OR table_name ILIKE '%milestone%' OR table_name ILIKE '%round%')
     ORDER BY 1`);
  if (Array.isArray(out.checklistish_tables)) {
    out.twelve_rows_by_table = {};
    for (const { table_name } of out.checklistish_tables) {
      const r = await q(`SELECT count(*)::int n FROM public."${table_name}" WHERE client_id=$1`, [TWELVE]);
      out.twelve_rows_by_table[table_name] = Array.isArray(r) ? r[0].n : r;
    }
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
console.log(JSON.stringify(out, (k, v) => (typeof v === "bigint" ? String(v) : v), 2));
