// r12c — READ ONLY. Anything written live since the 16:13 UTC ship (any client)? Latest event names.
// BEGIN READ ONLY, ROLLBACK. No bare SET. No secrets printed.
import pg from "pg";
const SHIP = "2026-09-18T16:13:00Z";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 160) }]; }
};
try {
  await c.query("BEGIN READ ONLY");
  console.log("now", (await q("select now() n"))[0].n.toISOString());
  for (const t of ["events", "tasks", "messages", "agent_runs", "action_log", "clients"]) {
    const col = t === "clients" ? "updated_at" : "created_at";
    const r = (await q(`select count(*) filter (where ${col} > $1)::int n, max(${col}) m from ${t}`, [SHIP]))[0];
    console.log(`${t}: since ship=${r.n ?? r.error} latest=${r.m ? new Date(r.m).toISOString() : r.error}`);
  }
  for (const r of await q(`select name, created_at from events order by created_at desc limit 8`)) console.log("  event", r.name, new Date(r.created_at).toISOString());
  for (const r of await q(`select template_key, channel, status, updated_at from messages where updated_at > $1 order by updated_at desc limit 10`, [SHIP])) console.log("  msg updated", JSON.stringify(r));
  await c.query("ROLLBACK");
} finally { await c.end(); }
