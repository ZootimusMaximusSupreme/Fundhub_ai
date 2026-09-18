// HOLE 12 round 2 — VERIFY. LOOK ONLY. Nothing is written anywhere.
//  1. Live database, BEGIN READ ONLY (no SET): the saved next action on every
//     client in #8's company that has one, plus what touched #8/#11/#12/Combo
//     today (events, tasks, agent runs) so the last writer can be named.
//  2. Owner password sign-in (the one POST), then GET only:
//     /api/dashboard/client?id=<each named file> — the step the control panel paints,
//     /api/dashboard/clients?fulfillment=1 — the step the Fulfillment list paints.
// Never prints the password, the cookie, or the connection string.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h12r2-verify.mjs
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TAG = process.env.TAG || "before";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/round2";
mkdirSync(OUT, { recursive: true });
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  combo: "567c12ce-64de-4043-aa98-d842434bd267",
};
const SINCE = process.env.SINCE || "2026-09-18T14:00Z";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql, p = []) => {
  await c.query("SAVEPOINT s");
  try { const r = (await c.query(sql, p)).rows; await c.query("RELEASE SAVEPOINT s"); return r; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT s"); return [{ error: e.message.slice(0, 200) }]; }
};
const db = { files: {} };
try {
  await c.query("BEGIN READ ONLY");
  db.read_only = (await q("show transaction_read_only"))[0].transaction_read_only;
  db.now = (await q("select now() n"))[0].n;
  db.saved_all = await q(
    `select id, first_name||' '||last_name nm, custom_fields->>'employee_next_action' saved, updated_at
       from clients
      where org_id = (select org_id from clients where id = $1)
        and custom_fields ? 'employee_next_action'
      order by updated_at desc`, [IDS.eight]);
  const agentRunCols = (await q(`select column_name from information_schema.columns where table_name='agent_runs' order by ordinal_position`)).map((r) => r.column_name);
  for (const [k, id] of Object.entries(IDS)) {
    const f = {};
    f.client = (await q(
      `select updated_at, custom_fields->>'employee_next_action' saved,
              custom_fields->>'round_hold_reason' hold, custom_fields->>'lifecycle_status' lifecycle,
              custom_fields->>'product_path' product_path, outcome_tier, tags
         from clients where id = $1`, [id]))[0];
    f.events = await q(`select name, created_at from events where client_id = $1 and created_at > $2 order by created_at`, [id, SINCE]);
    f.tasks = await q(`select title, source_workflow, done, created_at, updated_at from tasks where client_id = $1 and (created_at > $2 or updated_at > $2) order by created_at`, [id, SINCE]);
    f.open_inquiry_cases = await q(`select case_status, updated_at from inquiry_removal_cases where client_id = $1 and case_status in ('Queued','Scheduled','In Progress','Escalated','Blocked') order by updated_at`, [id]);
    if (agentRunCols.includes("client_id")) {
      const cols = ["created_at", "workflow", "workflow_id", "function_id", "name", "status", "agent_key", "event_name"].filter((x) => agentRunCols.includes(x));
      f.agent_runs = await q(`select ${cols.join(", ")} from agent_runs where client_id = $1 and created_at > $2 order by created_at`, [id, SINCE]);
    }
    db.files[k] = f;
  }
  db.agent_run_columns = agentRunCols;
  await c.query("ROLLBACK");
} finally { await c.end(); }

// ── the live API the screens read ──────────────────────────────────────────
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h12r2-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("sign-in failed", r.status); process.exit(1); }
const H = { cookie: `fundhub_session=${m[1]}` };

const shown = {};
for (const [k, id] of Object.entries(IDS)) {
  const res = await fetch(`${BASE}/api/dashboard/client?id=${id}`, { headers: H });
  const d = await res.json();
  shown[k] = {
    status: res.status,
    next_action: d?.next_action ?? null,
    degraded: d?.next_action_degraded ?? null,
    saved_in_payload: d?.client?.custom_fields?.employee_next_action ?? null,
    scores_on_file: d?.scores_on_file ?? null,
  };
}
const list = await fetch(`${BASE}/api/dashboard/clients?limit=500&fulfillment=1`, { headers: H });
const lj = await list.json();
const rows = lj?.clients || [];

const compare = db.saved_all.map((s) => {
  const row = rows.find((x) => x.id === s.id);
  const listLabel = row?.next_action?.label ?? null;
  return { name: s.nm, id: s.id, saved: s.saved, list_shows: listLabel, degraded: row?.next_action_degraded ?? null, agree: s.saved === listLabel };
});

const out = { at: new Date().toISOString(), tag: TAG, db, shown, compare };
writeFileSync(`${OUT}/h12r2-${TAG}.json`, JSON.stringify(out, null, 2));
for (const [k, f] of Object.entries(db.files)) {
  console.log(`\n== ${k}: saved=${JSON.stringify(f.client?.saved)} control-panel=${JSON.stringify(shown[k].next_action?.label ?? null)} degraded=${shown[k].degraded} updated=${f.client?.updated_at?.toISOString?.()}`);
  console.log("  events:", JSON.stringify(f.events.map((e) => `${e.name}@${new Date(e.created_at).toISOString().slice(11, 19)}`)));
  console.log("  tasks:", JSON.stringify(f.tasks.map((t) => `${t.source_workflow}|${t.title}|done=${t.done}@${new Date(t.created_at).toISOString().slice(11, 19)}`)));
  console.log("  open inquiry cases:", JSON.stringify(f.open_inquiry_cases.map((x) => x.case_status)));
  if (f.agent_runs) console.log("  agent_runs:", JSON.stringify(f.agent_runs).slice(0, 800));
}
const dis = compare.filter((x) => !x.agree);
console.log(`\ncompany files with a saved next action: ${compare.length}; disagree with the list: ${dis.length}`);
for (const x of compare) console.log(`${x.agree ? "AGREE   " : "DISAGREE"} ${x.name} saved=${JSON.stringify(x.saved)} list=${JSON.stringify(x.list_shows)} degraded=${x.degraded}`);
