// N26 — the FIXED Drive code, on the laptop, shaped like live. READ ONLY.
// Live: GOOGLE_DRIVE_OAUTH_TOKEN_JSON holds a token whose Google client is gone
// (401 invalid_client); GOOGLE_GMAIL_OAUTH_TOKEN_JSON holds the new token.
// Here: the Drive key gets a token.json with a client id Google does not know
// (same 401 invalid_client), the Gmail key gets the laptop's new token (the same
// token live has — mask tail matches, r2-n26-env.mjs).
// Runs checkDriveAccess (token + changes/startPageToken) and one page of
// changes.list from the live stored page token. No DB write, no Drive write.
// Prints codes and counts only — never a token, a file name or an email.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/r2-n26-fixed-dry.mjs [tag]
import pg from "pg";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { driveConfigFromEnv } from "../../../src/company-brain/config.mjs";
import { createDriveClientFromConfig, checkDriveAccess } from "../../../src/company-brain/drive-client.mjs";

const TAG = process.argv[2] || "fixed-dry";
const DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N26";
mkdirSync(DIR, { recursive: true });

const path = String(process.env.GOOGLE_GMAIL_OAUTH_TOKEN_PATH || "").replace(/^~\//, `${process.env.HOME}/`);
const env = {
  GOOGLE_DRIVE_OAUTH_TOKEN_JSON: JSON.stringify({
    refresh_token: "1//n26-dead-client-stand-in",
    client_id: "000000000000-n26deadclient.apps.googleusercontent.com",
    client_secret: "n26-dead-client-stand-in"
  }),
  GOOGLE_GMAIL_OAUTH_TOKEN_JSON: readFileSync(path, "utf8")
};

const config = driveConfigFromEnv(env);
const out = {
  at: new Date().toISOString(),
  tag: TAG,
  writes: "none",
  config: { ready: config.ready, authMode: config.authMode, candidates: (config.oauthCandidates || []).map((c) => c.tokenSource) },
  check: await checkDriveAccess(config)
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let pageToken = null;
try {
  await c.query("BEGIN READ ONLY");
  pageToken = (await c.query(`SELECT page_token FROM brain_drive_sync LIMIT 1`)).rows[0]?.page_token || null;
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
const client = createDriveClientFromConfig(config);
try {
  const page = await client.listChangesPage(pageToken, { pageSize: 100 });
  out.changes_page = {
    ok: true,
    token_source: client.tokenSource(),
    changes: page.changes.length,
    has_more: !!page.nextPageToken
  };
} catch (err) {
  out.changes_page = { ok: false, token_source: client.tokenSource(), error: String(err.message).slice(0, 200) };
}

writeFileSync(`${DIR}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
