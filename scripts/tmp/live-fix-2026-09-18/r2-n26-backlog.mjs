// N26 — how much Drive change is waiting since the live index's last sync (2026-08-25)?
// READ ONLY: pages changes.list from the live stored page token with the new token.
// Counts only (changes, removed, folders, A/V files). Never prints a name or a token.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/r2-n26-backlog.mjs
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { driveConfigFromEnv } from "../../../src/company-brain/config.mjs";
import { createDriveClientFromConfig } from "../../../src/company-brain/drive-client.mjs";

const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N26";
const path = String(process.env.GOOGLE_GMAIL_OAUTH_TOKEN_PATH || "").replace(/^~\//, `${process.env.HOME}/`);
const config = driveConfigFromEnv({ GOOGLE_GMAIL_OAUTH_TOKEN_JSON: readFileSync(path, "utf8") });
const client = createDriveClientFromConfig(config);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let pageToken;
try {
  await c.query("BEGIN READ ONLY");
  pageToken = (await c.query(`SELECT page_token FROM brain_drive_sync LIMIT 1`)).rows[0]?.page_token;
  await c.query("ROLLBACK");
} finally {
  await c.end();
}

const out = { at: new Date().toISOString(), writes: "none", pages: 0, changes: 0, removed: 0, folders: 0, av: 0, other: 0 };
let token = pageToken;
while (token && out.pages < 200) {
  const page = await client.listChangesPage(token, { pageSize: 1000 });
  out.pages += 1;
  for (const ch of page.changes) {
    out.changes += 1;
    if (ch.removed) out.removed += 1;
    else if (ch.file?.mimeType === "application/vnd.google-apps.folder") out.folders += 1;
    else if (/^(video|audio)\//.test(ch.file?.mimeType || "")) out.av += 1;
    else out.other += 1;
  }
  token = page.nextPageToken;
  if (!token) out.caught_up = !!page.newStartPageToken;
}
writeFileSync(`${DIR}/backlog.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
