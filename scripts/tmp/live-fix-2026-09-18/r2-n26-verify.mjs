// N26 VERIFY — does the live Company Brain Drive index actually work? READ ONLY.
// 1) Signs in as the owner (POST /api/auth/login) and GETs /api/company-brain/sync, then ?check=1 twice
//    (drive_ready, last_sync_at, last_error). No POST sync.
// 2) Live DB: BEGIN READ ONLY → brain_drive_sync rows + newest brain_files index
//    times + Meet files still waiting for words → ROLLBACK. No SET.
// Never prints a password, token, cookie or key.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/r2-n26-verify.mjs [tag]
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TAG = process.argv[2] || "verify";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N26";
mkdirSync(DIR, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG, api: {}, db: {} };

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const lr = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password })
});
out.api.login = lr.status;
const lj = await lr.json().catch(() => ({}));
const token = lj.token || lj.access_token || null;
const cookie = (lr.headers.get("set-cookie") || "").split(";")[0];
const headers = {};
if (token) headers.authorization = `Bearer ${token}`;
if (cookie) headers.cookie = cookie;

// Plain GET, then the read-only Google check (?check=1, after the N26 fix ships) twice.
for (const [name, q] of [["get_sync", ""], ["get_check_1", "?check=1"], ["get_check_2", "?check=1"]]) {
  const r = await fetch(`${BASE}/api/company-brain/sync${q}`, { headers });
  const j = await r.json().catch(() => null);
  out.api[name] = { status: r.status, body: j };
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  out.db.brain_drive_sync = (await c.query(
    `SELECT org_id, (page_token IS NOT NULL) AS has_page_token, last_sync_at, last_error, updated_at
       FROM brain_drive_sync ORDER BY updated_at DESC NULLS LAST`)).rows;
  out.db.brain_files_newest = (await c.query(
    `SELECT org_id, count(*)::int AS files, max(indexed_at) AS newest_indexed_at,
            max(created_at) AS newest_created_at,
            count(*) FILTER (WHERE needs_transcription)::int AS needs_words
       FROM brain_files GROUP BY org_id`)).rows;
  out.db.brain_files_last_48h = (await c.query(
    `SELECT date_trunc('hour', COALESCE(indexed_at, created_at)) AS hour, count(*)::int AS n
       FROM brain_files WHERE COALESCE(indexed_at, created_at) > now() - interval '48 hours'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 20`)).rows;
  await c.query("ROLLBACK");
} finally {
  await c.end();
}

writeFileSync(`${DIR}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
