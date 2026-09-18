// HOLE 20 VERIFY — can src/gmail/ search prove Gmail right now?
//
// Look only. Nothing is sent. No email, no SMS. Never prints a token, secret or cookie.
//
// Part A (laptop): run the real src/gmail/ config + client against this laptop's env.
//   Shape of each Google key is reported as length / asterisk count only.
// Part B (live runtime): GET https://fundhub.ai/api/company-brain/sync as owner. That
//   handler runs on Netlify with the REAL stored GOOGLE_DRIVE_OAUTH_TOKEN_JSON — the same
//   key src/gmail/config.mjs falls back to (no GOOGLE_GMAIL_* / GOOGLE_OAUTH_* key is set
//   on Netlify). If live says invalid_json, the stored value itself is not a token — the
//   laptop mask is not just Netlify hiding a secret.
//   The only write is the owner session row createSession() makes; it is revoked at the end.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//        scripts/tmp/live-fix-2026-09-18/h20-verify.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../../src/gmail/index.mjs";
import { db, close } from "../../../src/db.mjs";
import { createSession, revokeSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const KEYS = [
  "GOOGLE_GMAIL_OAUTH_TOKEN_PATH", "GOOGLE_GMAIL_OAUTH_TOKEN_JSON",
  "GOOGLE_OAUTH_TOKEN_PATH", "GOOGLE_OAUTH_TOKEN_JSON",
  "GOOGLE_DRIVE_OAUTH_TOKEN_PATH", "GOOGLE_DRIVE_OAUTH_TOKEN_JSON"
];

function shape(v) {
  if (v == null) return "unset";
  const s = String(v);
  const stars = (s.match(/\*/g) || []).length;
  let json = "not json";
  try { JSON.parse(s); json = "json"; } catch { /* shape only */ }
  return `len=${s.length} asterisks=${stars} ${json}`;
}

console.log("== Part A: laptop, through src/gmail/ ==");
for (const k of KEYS) console.log(`  ${k}: ${shape(process.env[k])}`);
const defaultTokenFile = join(process.env.HOME || "", ".config/fundhub/google-token.json");
console.log(`  mint default token file (${defaultTokenFile}): ${existsSync(defaultTokenFile) ? "present" : "not on disk"}`);

const cfg = gmailConfigFromEnv(process.env);
console.log(`  gmailConfigFromEnv: ready=${cfg.ready} tokenSource=${cfg.tokenSource} missing=${JSON.stringify(cfg.missing)}`);
if (cfg.ready) {
  try {
    const client = createGmailClientFromConfig(cfg);
    const listed = await client.listMessages({ maxResults: 1, labelIds: [], q: "newer_than:7d" });
    console.log(`  All Mail search (newer_than:7d): OK, ${listed.messages.length} id(s) — INBOX CAN BE READ`);
  } catch (err) {
    console.log(`  All Mail search FAILED: ${String(err.message).slice(0, 200)}`);
  }
} else {
  console.log("  All Mail search: not attempted — src/gmail/ is not ready, so the inbox cannot be opened");
}

console.log("\n== Part B: live runtime, GET /api/company-brain/sync as owner ==");
const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
if (!staff) {
  console.log("  owner staff row not found — Part B skipped");
} else {
  const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
  try {
    const res = await fetch(`${BASE}/api/company-brain/sync`, {
      headers: { cookie: `fundhub_session=${token}`, accept: "application/json" }
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    console.log(`  HTTP ${res.status}`);
    console.log(`  drive_ready=${body.drive_ready} missing=${JSON.stringify(body.missing)}`);
    console.log(`  last_sync_at=${body.last_sync_at} last_error=${body.last_error ? String(body.last_error).slice(0, 160) : null}`);
  } finally {
    const revoked = await revokeSession(db, token);
    console.log(`  owner session revoked: ${revoked}`);
  }
}
await close();
