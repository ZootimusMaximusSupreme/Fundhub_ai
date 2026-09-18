// h20r2 — run the EXACT live job code (watchBlakeLeads → getOrCreateLabel → listLabels →
// listMessages) on this laptop with the same token live now holds, as a dry run.
// Guards: every request except GET and the Google token refresh is refused before it leaves
// (no label created, nothing labelled); sendImpl throws; dryRun=true. Nothing is sent.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h20r2-laptop-watch-dry.mjs
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../../src/gmail/index.mjs";
import { watchBlakeLeads } from "../../../src/staff/blake-lead-watch.mjs";

const calls = [];
async function guardedFetch(url, init = {}) {
  const u = new URL(String(url));
  const method = String(init.method || "GET").toUpperCase();
  const isRefresh = u.host === "oauth2.googleapis.com" && u.pathname === "/token";
  calls.push(`${method} ${u.host}${u.pathname.replace(/\/messages\/[^/]+/, "/messages/<id>")}`);
  if (method !== "GET" && !isRefresh) throw new Error(`guard: refused ${method} ${u.pathname}`);
  const res = await fetch(url, init);
  calls[calls.length - 1] += ` → ${res.status}`;
  return res;
}

const cfg = gmailConfigFromEnv(process.env);
console.log(`src/gmail config: ready=${cfg.ready} tokenSource=${cfg.tokenSource}`);
if (!cfg.ready) process.exit(0);
const gmailClient = createGmailClientFromConfig(cfg, { fetchImpl: guardedFetch });
const env = { ...process.env, PULSE_SMS_TO: process.env.PULSE_SMS_TO || "+10000000000" };
try {
  const out = await watchBlakeLeads({
    env, dryRun: true, gmailClient,
    sendImpl: () => { throw new Error("guard: send refused"); }
  });
  console.log(`watchBlakeLeads (dry): ${JSON.stringify(out)}`);
} catch (err) {
  console.log(`watchBlakeLeads (dry): FAIL ${String(err.message).slice(0, 160)}`);
}
for (const c of calls) console.log(`  ${c}`);
