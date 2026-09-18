// HOLE 12 — read-only history of #8: its inquiry cases, and the events and
// workflow writes that touched its stored next action. Nothing is written.
import { pool, close } from "../../../src/db.mjs";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const cases = (await c.query(`SELECT id, case_id, case_status, request_source, requested_by, open_inquiry_count, created_at, updated_at FROM inquiry_removal_cases WHERE client_id = $1 ORDER BY created_at`, [EIGHT])).rows;
  const evCols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
  const tsCol = evCols.includes("created_at") ? "created_at" : (evCols.includes("received_at") ? "received_at" : evCols.find((x) => /_at$/.test(x)));
  const typeCol = evCols.includes("type") ? "type" : (evCols.includes("name") ? "name" : evCols.find((x) => /type|name/.test(x)));
  let events = [];
  if (evCols.includes("client_id")) {
    events = (await c.query(`SELECT ${typeCol} AS type, ${tsCol} AS at FROM events WHERE client_id = $1 ORDER BY ${tsCol}`, [EIGHT])).rows;
  }
  const inqLog = (await c.query(`SELECT bureau, inquiry, status, created_at FROM inquiry_log WHERE client_id = $1 ORDER BY created_at`, [EIGHT])).rows;
  const tasks = (await c.query(`SELECT source_workflow, title, created_at FROM tasks WHERE client_id = $1 ORDER BY created_at`, [EIGHT])).rows;
  const tags = (await c.query(`SELECT tags FROM clients WHERE id = $1`, [EIGHT])).rows[0];
  await c.query("COMMIT");
  console.log(JSON.stringify({ evCols, cases, events, inqLog, tasks, tags }, null, 1));
} finally { c.release(); await close(); }
