// HOLE 12 round 3 — LOOK ONLY. Nothing is written to the database.
//  1. Live database, ONE connection, BEGIN READ ONLY (never a bare SET), every
//     statement inside its own savepoint so one failed read cannot poison the
//     rest. Through that connection, the NEW shared piece
//     (src/fulfillment/client-step.mjs shownStepLabel) works out the step for
//     every file in #8's company that has a saved step.
//     Also: how many files hold a saved step in every company (the catch-up
//     job's batch size is sized on this), and every trigger on `clients` (the
//     catch-up job must set nothing off).
//  2. Owner password sign-in (the one POST), then GET only:
//     /api/dashboard/client?id=<file> — the step the live control panel paints.
//  3. Side by side: saved now / shared piece / live API.
// Never prints the password, the cookie, or the connection string.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h12r3-shared-vs-api.mjs
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";
import { shownStepLabel } from "../../../src/fulfillment/client-step.mjs";

const BASE = "https://fundhub.ai";
const OUT = process.env.OUT ||
  "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/round3";
mkdirSync(OUT, { recursive: true });
const NAMED = {
  "d682c13b-11f3-4bd5-a0c5-232b6a7875c4": "#8",
  "029964c5-4d8e-47ed-88c9-53ac13863fd4": "#11",
  "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f": "#12",
  "567c12ce-64de-4043-aa98-d842434bd267": "Combo",
};
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/* A `db` for the shared piece: one query at a time (it fires reads in
   parallel), each in its own savepoint inside the read-only transaction. */
let chain = Promise.resolve();
const roDb = {
  query(sql, params = []) {
    const run = async () => {
      await c.query("SAVEPOINT s");
      try {
        const r = await c.query(sql, params);
        await c.query("RELEASE SAVEPOINT s");
        return r;
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT s");
        throw e;
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  },
};

const db = {};
try {
  await c.query("BEGIN READ ONLY");
  db.read_only = (await roDb.query("show transaction_read_only")).rows[0].transaction_read_only;
  db.now = (await roDb.query("select now() n")).rows[0].n;
  db.saved_per_company = (await roDb.query(
    `select org_id, count(*)::int n from clients where custom_fields ? 'employee_next_action' group by org_id order by n desc`)).rows;
  db.saved_total = db.saved_per_company.reduce((a, r) => a + r.n, 0);
  db.clients_triggers = (await roDb.query(
    `select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid = 'public.clients'::regclass and not tgisinternal`)).rows;
  const files = (await roDb.query(
    `select id, first_name, custom_fields->>'employee_next_action' saved
       from clients
      where org_id = (select org_id from clients where id = $1)
        and custom_fields ? 'employee_next_action'
      order by updated_at desc`, [EIGHT])).rows;
  for (const id of Object.keys(NAMED)) {
    if (!files.find((f) => f.id === id)) {
      const r = (await roDb.query(`select id, first_name, custom_fields->>'employee_next_action' saved from clients where id = $1`, [id])).rows[0];
      if (r) files.push(r);
    }
  }
  db.files = [];
  for (const f of files) {
    const shared = await shownStepLabel(roDb, f.id);
    db.files.push({ id: f.id, name: NAMED[f.id] || f.first_name, saved: f.saved, shared_piece: shared });
  }
  await c.query("ROLLBACK");
} finally {
  await c.end();
}

// ── the live API the control panel reads ─────────────────────────────────
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h12r3-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("sign-in failed", r.status); process.exit(1); }
const H = { cookie: `fundhub_session=${m[1]}` };

for (const f of db.files) {
  const res = await fetch(`${BASE}/api/dashboard/client?id=${f.id}`, { headers: H });
  const d = await res.json();
  f.api_status = res.status;
  f.api_label = d?.next_action?.label ?? null;
  f.api_degraded = d?.next_action_degraded ?? null;
  f.shared_equals_api = f.shared_piece === (f.api_degraded === true ? null : f.api_label);
  f.saved_equals_api = f.saved === f.api_label;
}

const out = { at: new Date().toISOString(), db };
writeFileSync(`${OUT}/h12r3-shared-vs-api.json`, JSON.stringify(out, null, 2));
console.log(`read_only=${db.read_only} db_now=${new Date(db.now).toISOString()}`);
console.log(`files holding a saved step, all companies: ${db.saved_total} (${db.saved_per_company.map((x) => x.n).join(", ")})`);
console.log(`triggers on clients: ${db.clients_triggers.map((t) => t.tgname).join(", ") || "none"}`);
for (const f of db.files) {
  console.log(`${f.shared_equals_api ? "SAME" : "DIFF"} ${f.name.padEnd(8)} saved=${JSON.stringify(f.saved)} shared_piece=${JSON.stringify(f.shared_piece)} live_api=${JSON.stringify(f.api_label)} degraded=${f.api_degraded}`);
}
