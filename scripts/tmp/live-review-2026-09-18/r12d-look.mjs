// r12d — reviewer 4, hole 12. LOOK ONLY.
//  1. Live DB, BEGIN READ ONLY (no SET), ROLLBACK: every file holding a saved employee_next_action.
//  2. One owner password sign-in POST, then GET /api/dashboard/client?id=<file> for each (the step the panel paints).
//  3. DB read again right after the API, so a write landing mid-look is caught.
// Never prints the password, cookie or connection string.
//   LOOK=1 node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r12d-look.mjs
import pg from "pg";
import { writeFileSync } from "node:fs";
const BASE = "https://fundhub.ai";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/review4";
const LOOK = process.env.LOOK || "x";
async function readSaved() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const ro = (await c.query("show transaction_read_only")).rows[0].transaction_read_only;
    const now = (await c.query("select now() n")).rows[0].n;
    const rows = (await c.query(`select id, first_name, last_name, custom_fields->>'employee_next_action' saved, updated_at
                                   from clients where coalesce(custom_fields->>'employee_next_action','') <> '' order by first_name, id`)).rows;
    await c.query("ROLLBACK");
    return { ro, now: new Date(now).toISOString(), rows };
  } finally { await c.end(); }
}
const before = await readSaved();
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h12-reviewer4" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("sign-in failed", r.status); process.exit(1); }
const H = { cookie: `fundhub_session=${m[1]}` };
const api = {};
for (const x of before.rows) {
  const res = await fetch(`${BASE}/api/dashboard/client?id=${x.id}`, { headers: H });
  let d = null; try { d = await res.json(); } catch {}
  api[x.id] = { status: res.status, shown: d?.next_action?.label ?? null, degraded: d?.next_action_degraded ?? null,
    saved_in_api: d?.client?.custom_fields?.employee_next_action ?? null, at: new Date().toISOString() };
}
const after = await readSaved();
const rows = before.rows.map((x) => {
  const a = after.rows.find((y) => y.id === x.id) || {};
  const s = api[x.id];
  return { id: x.id, name: `${x.first_name} ${x.last_name}`, saved: x.saved, saved_after: a.saved ?? null,
    updated_at: new Date(x.updated_at).toISOString(), updated_at_after: a.updated_at ? new Date(a.updated_at).toISOString() : null,
    shown: s.shown, degraded: s.degraded, api_status: s.status, api_at: s.at, same: x.saved === s.shown };
});
const out = { look: LOOK, read_only: [before.ro, after.ro], db_before: before.now, db_after: after.now, sign_in_status: r.status, rows };
writeFileSync(`${OUT}/r12d-look${LOOK}.json`, JSON.stringify(out, null, 2));
console.log(`look ${LOOK}: read_only=${before.ro}/${after.ro} db ${before.now} -> ${after.now} sign-in=${r.status}`);
for (const x of rows) console.log(`${x.same ? "SAME" : "DIFF"} ${x.id.slice(0, 8)} ${x.name.padEnd(22)} saved=${JSON.stringify(x.saved)} shown=${JSON.stringify(x.shown)} degraded=${x.degraded} api=${x.api_status} updated_at=${x.updated_at}${x.saved_after !== x.saved || x.updated_at_after !== x.updated_at ? ` AFTER saved=${JSON.stringify(x.saved_after)} updated_at=${x.updated_at_after}` : ""}`);
