// r12d — READ ONLY poller. Every 60s until UNTIL: saved employee_next_action + updated_at for every file
// holding one, plus count of messages created since 18:47 UTC. New connection each tick, BEGIN READ ONLY,
// ROLLBACK. No SET. No secrets printed. Appends JSONL to the evidence folder.
import pg from "pg";
import { appendFileSync } from "node:fs";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/review4/r12d-poll.jsonl";
const UNTIL = Date.parse(process.env.UNTIL || "2026-09-18T19:13:00Z");
const SINCE = "2026-09-18T18:47:00Z";
let last = "";
while (Date.now() < UNTIL) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    const now = (await c.query("select now() n")).rows[0].n;
    const rows = (await c.query(`select id, first_name, last_name, custom_fields->>'employee_next_action' saved, updated_at
                                   from clients where coalesce(custom_fields->>'employee_next_action','') <> '' order by first_name, id`)).rows;
    const msgs = (await c.query(`select count(*)::int n from messages where created_at > $1`, [SINCE])).rows[0].n;
    await c.query("ROLLBACK");
    const rec = { at: new Date(now).toISOString(), messages_since_1847: msgs,
      rows: rows.map((r) => ({ id: r.id.slice(0, 8), name: `${r.first_name} ${r.last_name}`, saved: r.saved, updated_at: new Date(r.updated_at).toISOString() })) };
    appendFileSync(OUT, JSON.stringify(rec) + "\n");
    const sig = JSON.stringify(rec.rows) + msgs;
    console.log(`${rec.at} msgs=${msgs} ${sig === last ? "(no change)" : rec.rows.map((r) => `${r.name}=${r.saved}@${r.updated_at.slice(11, 23)}`).join(" | ")}`);
    last = sig;
  } catch (e) {
    console.log(`${new Date().toISOString()} read failed: ${e.message.slice(0, 160)}`);
  } finally { try { await c.end(); } catch {} }
  await new Promise((r) => setTimeout(r, 60000));
}
console.log("poll done");
