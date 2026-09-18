// N26 — can the NEW Google token (the one live Gmail reads, GOOGLE_GMAIL_OAUTH_TOKEN_JSON,
// same bytes as the laptop token at GOOGLE_GMAIL_OAUTH_TOKEN_PATH) read the SAME Drive the
// Company Brain index was built from? READ ONLY:
//   * Google: token refresh, changes/startPageToken, files.get on indexed ids, one page of
//     changes.list from the live stored page token. All GET except the refresh POST.
//   * Live DB: BEGIN READ ONLY → brain_drive_sync.page_token + a sample of indexed
//     drive_file_ids → ROLLBACK. Nothing is written anywhere.
// Prints counts and status codes only — never a token, a file name, or an email.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/r2-n26-drive-dry.mjs [tag]
import pg from "pg";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const TAG = process.argv[2] || "drive-dry";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N26";
mkdirSync(DIR, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG, writes: "none" };

const path = String(process.env.GOOGLE_GMAIL_OAUTH_TOKEN_PATH || "").replace(/^~\//, `${process.env.HOME}/`);
const tok = JSON.parse(readFileSync(path, "utf8"));

const r = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tok.refresh_token,
    client_id: tok.client_id,
    client_secret: tok.client_secret
  }).toString()
});
const j = await r.json();
out.refresh = { status: r.status, error: j.error || null };
out.granted_scopes = String(j.scope || "").split(" ").filter(Boolean);
out.has_drive_scope = out.granted_scopes.some((s) => /\/auth\/drive(\.readonly)?$/.test(s));
if (!j.access_token) {
  writeFileSync(`${DIR}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
const H = { authorization: `Bearer ${j.access_token}` };
const D = "https://www.googleapis.com/drive/v3";

const sp = await fetch(`${D}/changes/startPageToken?supportsAllDrives=true`, { headers: H });
out.start_page_token = { status: sp.status };

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let pageToken = null;
let ids = [];
try {
  await c.query("BEGIN READ ONLY");
  pageToken = (await c.query(`SELECT page_token FROM brain_drive_sync LIMIT 1`)).rows[0]?.page_token || null;
  ids = (await c.query(
    `SELECT drive_file_id FROM brain_files WHERE drive_file_id IS NOT NULL
      ORDER BY indexed_at DESC NULLS LAST LIMIT 8`)).rows.map((x) => x.drive_file_id);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}

out.indexed_files_readable = { tried: ids.length, ok: 0, statuses: {} };
for (const id of ids) {
  const g = await fetch(`${D}/files/${encodeURIComponent(id)}?fields=id&supportsAllDrives=true`, { headers: H });
  out.indexed_files_readable.statuses[g.status] = (out.indexed_files_readable.statuses[g.status] || 0) + 1;
  if (g.ok) out.indexed_files_readable.ok += 1;
}

if (pageToken) {
  const u = new URL(`${D}/changes`);
  u.searchParams.set("pageToken", pageToken);
  u.searchParams.set("pageSize", "100");
  u.searchParams.set("includeRemoved", "true");
  u.searchParams.set("supportsAllDrives", "true");
  u.searchParams.set("includeItemsFromAllDrives", "true");
  u.searchParams.set("fields", "nextPageToken,newStartPageToken,changes(fileId,removed)");
  const ch = await fetch(u, { headers: H });
  const cj = await ch.json().catch(() => ({}));
  out.changes_from_live_page_token = {
    status: ch.status,
    first_page_changes: (cj.changes || []).length,
    has_more: !!cj.nextPageToken,
    error: cj.error?.message ? String(cj.error.message).slice(0, 120) : null
  };
}

writeFileSync(`${DIR}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
