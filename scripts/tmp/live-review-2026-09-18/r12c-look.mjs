// r12c — reviewer, hole 12 round 3 (final). LOOK ONLY. Nothing is written anywhere live.
//  1. Live DB, one connection, BEGIN READ ONLY (never a bare SET), each read in a savepoint, ROLLBACK.
//     For the 6 files: saved employee_next_action + updated_at; every file company-wide holding a
//     saved step; since 16:13 UTC on these 6 files: events, tasks, agent_runs, action_log, messages
//     (template key / channel / status only).
//  2. One owner password sign-in POST, then GET /api/dashboard/client?id=<file> for each — the step
//     the live control panel paints.
//  3. Side by side. Output JSON to the evidence folder with a look tag.
// Never prints the password, the cookie or the connection string.
//   LOOK=1 node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r12c-look.mjs
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHIP = "2026-09-18T16:13:00Z";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/review3";
mkdirSync(OUT, { recursive: true });
const LOOK = process.env.LOOK || "x";
const FILES = [
  ["d682c13b-11f3-4bd5-a0c5-232b6a7875c4", "#8"],
  ["029964c5-4d8e-47ed-88c9-53ac13863fd4", "#11"],
  ["f01cc0e0-c8f6-4343-93e5-6a33f0d3112f", "#12"],
  ["567c12ce-64de-4043-aa98-d842434bd267", "Combo"],
  ["6e8d0c8d-d0c1-438c-9c9b-50516c086eb7", "Walk4"],
  ["ab277630-8309-4c02-b187-f244e7e369e8", "Walk1"],
];
const IDS = FILES.map((f) => f[0]);
const NAME = Object.fromEntries(FILES);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
const db = {};
try {
  await c.query("BEGIN READ ONLY");
  db.read_only = (await q("show transaction_read_only"))[0].transaction_read_only;
  db.now = (await q("select now() n"))[0].n;
  db.files = await q(`select id, custom_fields->>'employee_next_action' saved, updated_at
                        from clients where id = any($1::uuid[])`, [IDS]);
  db.all_saved = await q(`select id, first_name, last_name, custom_fields->>'employee_next_action' saved, updated_at
                            from clients where coalesce(custom_fields->>'employee_next_action','') <> '' order by updated_at desc`);
  db.events = await q(`select client_id, name, created_at from events where client_id = any($1::uuid[]) and created_at > $2 order by created_at`, [IDS, SHIP]);
  db.tasks = await q(`select client_id, source_workflow, title, created_at, updated_at from tasks where client_id = any($1::uuid[]) and (created_at > $2 or updated_at > $2) order by updated_at`, [IDS, SHIP]);
  db.agent_runs = await q(`select client_id, agent_code, trigger_event, outcome, created_at from agent_runs where created_at > $1 order by created_at`, [SHIP]);
  db.action_log = await q(`select target_id, rule_key, actor, created_at from action_log where created_at > $1 order by created_at`, [SHIP]);
  db.messages = await q(`select client_id, template_key, channel, status, created_at from messages where client_id = any($1::uuid[]) and created_at > $2 order by created_at`, [IDS, SHIP]);
  db.messages_any_since_ship = await q(`select count(*)::int n from messages where created_at > $1`, [SHIP]);
  // Other clients whose row changed since ship (for "who else moved").
  db.clients_touched_since_ship = await q(`select id, first_name, updated_at, custom_fields->>'employee_next_action' saved from clients where updated_at > $1 order by updated_at`, [SHIP]);
  await c.query("ROLLBACK");
} finally { await c.end(); }

// Live API as the owner.
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h12r3-reviewer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("sign-in failed", r.status); process.exit(1); }
const H = { cookie: `fundhub_session=${m[1]}` };
const rows = [];
for (const [id, name] of FILES) {
  const res = await fetch(`${BASE}/api/dashboard/client?id=${id}`, { headers: H });
  let d = null; try { d = await res.json(); } catch {}
  const f = db.files.find((x) => x.id === id) || {};
  rows.push({
    name, id, saved: f.saved ?? null, updated_at: f.updated_at ? new Date(f.updated_at).toISOString() : null,
    api_status: res.status, shown: d?.next_action?.label ?? null, degraded: d?.next_action_degraded ?? null,
    same: (f.saved ?? null) === (d?.next_action?.label ?? null),
  });
}
const apiAt = new Date().toISOString();
const out = { look: LOOK, db_now: new Date(db.now).toISOString(), api_at: apiAt, read_only: db.read_only, rows, db };
writeFileSync(`${OUT}/r12c-look${LOOK}.json`, JSON.stringify(out, null, 2));

console.log(`look ${LOOK}: read_only=${db.read_only} db_now=${out.db_now} api_at=${apiAt}`);
for (const x of rows) console.log(`${x.same ? "SAME" : "DIFF"} ${x.name.padEnd(6)} saved=${JSON.stringify(x.saved)} shown=${JSON.stringify(x.shown)} degraded=${x.degraded} updated_at=${x.updated_at} api=${x.api_status}`);
console.log(`files holding a saved step (all companies): ${db.all_saved.length}`);
for (const x of db.all_saved) if (!NAME[x.id]) console.log(`  other: ${x.id} ${x.first_name} ${x.last_name} saved=${JSON.stringify(x.saved)}`);
const fmt = (a) => a.map((x) => JSON.stringify({ ...x, client: NAME[x.client_id] || x.client_id })).join("\n  ");
console.log(`events since ship on the 6 (${db.events.length}):\n  ${fmt(db.events)}`);
console.log(`tasks since ship on the 6 (${db.tasks.length}):\n  ${fmt(db.tasks)}`);
console.log(`agent_runs since ship, all (${db.agent_runs.length}):\n  ${fmt(db.agent_runs)}`);
console.log(`action_log since ship, all (${db.action_log.length}):\n  ${db.action_log.map((x) => JSON.stringify(x)).join("\n  ")}`);
console.log(`messages since ship on the 6 (${db.messages.length}):\n  ${fmt(db.messages)}`);
console.log(`messages since ship, any client: ${db.messages_any_since_ship[0]?.n}`);
console.log(`clients rows changed since ship (${db.clients_touched_since_ship.length}):\n  ${db.clients_touched_since_ship.map((x) => `${NAME[x.id] || x.id} ${x.first_name} ${new Date(x.updated_at).toISOString()} saved=${JSON.stringify(x.saved)}`).join("\n  ")}`);
