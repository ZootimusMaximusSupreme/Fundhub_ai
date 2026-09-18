// h20r2 — shape only (length / asterisk count / JSON or not / which JSON fields exist).
// Never prints a value. Runs the real src/gmail/ config against this laptop's env.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h20r2-shapes.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gmailConfigFromEnv } from "../../../src/gmail/index.mjs";

const KEYS = [
  "GOOGLE_GMAIL_OAUTH_TOKEN_PATH", "GOOGLE_GMAIL_OAUTH_TOKEN_JSON",
  "GOOGLE_OAUTH_TOKEN_PATH", "GOOGLE_OAUTH_TOKEN_JSON",
  "GOOGLE_DRIVE_OAUTH_TOKEN_PATH", "GOOGLE_DRIVE_OAUTH_TOKEN_JSON",
  "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY"
];

function shape(v) {
  if (v == null) return "unset";
  const s = String(v);
  const stars = (s.match(/\*/g) || []).length;
  let json = "not json";
  try {
    const p = JSON.parse(s);
    json = `json fields=${Object.keys(p || {}).join(",")}`;
  } catch { /* shape only */ }
  return `len=${s.length} asterisks=${stars} ${json}`;
}

for (const k of KEYS) console.log(`${k}: ${shape(process.env[k])}`);
const home = process.env.HOME || "";
for (const p of [
  join(home, ".config/fundhub/google-token.json"),
  "/Users/chrisstanbridge/Developer/fundhub-platform/credentials/google-token.json"
]) {
  console.log(`token file ${p.replace(home, "~")}: ${existsSync(p) ? "present" : "not on disk"}`);
}
const cfg = gmailConfigFromEnv(process.env);
console.log(`gmailConfigFromEnv: ready=${cfg.ready} tokenSource=${cfg.tokenSource} missing=${JSON.stringify(cfg.missing)}`);
