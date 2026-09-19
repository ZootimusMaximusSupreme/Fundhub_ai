// h20r2 — read-only: can the real src/gmail/ code open prove Gmail with this laptop's token?
// One token refresh + one All Mail search (maxResults 1) + one labels list. Nothing is sent,
// nothing is labelled, nothing is created. Never prints a token, secret or message content.
// Prints: which key won, the token file's field NAMES and minted_at, and PASS/FAIL per call.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h20r2-laptop-read.mjs
import { readFileSync } from "node:fs";
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../../src/gmail/index.mjs";

const cfg = gmailConfigFromEnv(process.env);
console.log(`src/gmail config: ready=${cfg.ready} tokenSource=${cfg.tokenSource} missing=${JSON.stringify(cfg.missing)}`);
if (cfg.tokenSource?.endsWith("_PATH")) {
  const raw = String(process.env[cfg.tokenSource] || "").replace(/^~\//, `${process.env.HOME}/`);
  try {
    const p = JSON.parse(readFileSync(raw, "utf8"));
    console.log(`token file fields: ${Object.keys(p).join(",")} minted_at=${p.minted_at || "-"}`);
    console.log(`token file scopes: ${String(p.scope || "-").split(/\s+/).map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(" ")}`);
  } catch (err) {
    console.log(`token file unreadable: ${err.message.slice(0, 80)}`);
  }
}
if (!cfg.ready) process.exit(0);

const client = createGmailClientFromConfig(cfg);
try {
  const listed = await client.listMessages({ maxResults: 1, labelIds: [], q: "newer_than:7d" });
  console.log(`All Mail search newer_than:7d: PASS (${listed.messages.length} id, estimate ${listed.resultSizeEstimate})`);
} catch (err) {
  console.log(`All Mail search: FAIL ${String(err.message).slice(0, 160)}`);
}
try {
  const prof = await client.getProfile();
  const dom = String(prof.emailAddress || "").split("@")[1] || "?";
  console.log(`mailbox: *@${dom} messagesTotal=${prof.messagesTotal}`);
} catch (err) {
  console.log(`profile: FAIL ${String(err.message).slice(0, 160)}`);
}
