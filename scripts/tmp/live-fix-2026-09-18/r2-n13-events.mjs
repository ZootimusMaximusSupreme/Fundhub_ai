// N13 — event names and times on #12's and #11's files, and every funding-round
// event name used anywhere. BEGIN READ ONLY, then ROLLBACK. Names, counts and
// timestamps only — no payloads are printed.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n13-events.mjs
import { pool } from "../../../src/db.mjs";

const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const out = {};
  for (const [n, id] of [["twelve", TWELVE], ["eleven", ELEVEN]]) {
    out[n] = (await c.query(
      `SELECT name, created_at FROM events WHERE client_id = $1 ORDER BY created_at`, [id])).rows;
  }
  out.round_event_names = (await c.query(
    `SELECT name, count(*)::int AS n FROM events
      WHERE name ILIKE '%round%' OR name ILIKE '%fund%'
      GROUP BY name ORDER BY n DESC LIMIT 40`)).rows;
  out.round_source_events = (await c.query(
    `SELECT fr.client_id, fr.status, e.name, e.created_at
       FROM funding_rounds fr LEFT JOIN events e ON e.id = fr.source_event_id
      ORDER BY fr.created_at`)).rows.map((r) => ({ ...r, client_id: String(r.client_id).slice(0, 8) }));
  await c.query("ROLLBACK");
  console.log(JSON.stringify(out, null, 2));
} finally {
  c.release();
  await pool().end();
}
