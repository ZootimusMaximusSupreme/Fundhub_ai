// r12d — reviewer 4, hole 12. READ ONLY. One connection, BEGIN READ ONLY (no bare SET), savepoints, ROLLBACK.
// Every client holding a saved employee_next_action: saved + updated_at. Plus writers since SINCE on those files.
// Never prints the connection string or any secret.
//   TAG=base node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r12d-db.mjs
import pg from "pg";
import { writeFileSync } from "node:fs";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/review4";
const SINCE = process.env.SINCE || "2026-09-18T18:47:00Z";
const TAG = process.env.TAG || "x";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
const d = { tag: TAG, since: SINCE };
try {
  await c.query("BEGIN READ ONLY");
  d.read_only = (await q("show transaction_read_only"))[0].transaction_read_only;
  d.now = (await q("select now() n"))[0].n;
  d.saved = await q(`select id, first_name, last_name, custom_fields->>'employee_next_action' saved, updated_at
                       from clients where coalesce(custom_fields->>'employee_next_action','') <> '' order by first_name, id`);
  const ids = d.saved.filter((x) => x.id).map((x) => x.id);
  d.events = await q(`select client_id, name, created_at from events where client_id = any($1::uuid[]) and created_at > $2 order by created_at`, [ids, SINCE]);
  d.tasks = await q(`select client_id, source_workflow, title, created_at, updated_at from tasks where client_id = any($1::uuid[]) and (created_at > $2 or updated_at > $2) order by updated_at`, [ids, SINCE]);
  d.agent_runs = await q(`select client_id, agent_code, trigger_event, outcome, created_at from agent_runs where created_at > $1 order by created_at`, [SINCE]);
  d.action_log = await q(`select target_id, rule_key, actor, created_at from action_log where created_at > $1 order by created_at`, [SINCE]);
  d.messages = await q(`select client_id, template_key, channel, status, created_at from messages where client_id = any($1::uuid[]) and created_at > $2 order by created_at`, [ids, SINCE]);
  d.messages_any = await q(`select count(*)::int n from messages where created_at > $1`, [SINCE]);
  d.clients_touched = await q(`select id, first_name, last_name, updated_at, custom_fields->>'employee_next_action' saved from clients where updated_at > $1 order by updated_at`, [SINCE]);
  await c.query("ROLLBACK");
} finally { await c.end(); }
writeFileSync(`${OUT}/r12d-db-${TAG}.json`, JSON.stringify(d, null, 2));
const iso = (t) => (t ? new Date(t).toISOString() : null);
console.log(`tag=${TAG} read_only=${d.read_only} db_now=${iso(d.now)} since=${SINCE}`);
for (const x of d.saved) console.log(`  ${x.id} ${x.first_name} ${x.last_name} saved=${JSON.stringify(x.saved)} updated_at=${iso(x.updated_at)}`);
const f = (a) => a.map((x) => JSON.stringify(x)).join("\n    ");
console.log(`  events(${d.events.length}):\n    ${f(d.events)}`);
console.log(`  tasks(${d.tasks.length}):\n    ${f(d.tasks)}`);
console.log(`  agent_runs any(${d.agent_runs.length}):\n    ${f(d.agent_runs)}`);
console.log(`  action_log any(${d.action_log.length}):\n    ${f(d.action_log)}`);
console.log(`  messages on these files(${d.messages.length}):\n    ${f(d.messages)}`);
console.log(`  messages any client since: ${JSON.stringify(d.messages_any)}`);
console.log(`  clients rows changed since(${d.clients_touched.length}):\n    ${d.clients_touched.map((x) => `${x.id} ${x.first_name} ${iso(x.updated_at)} saved=${JSON.stringify(x.saved)}`).join("\n    ")}`);
