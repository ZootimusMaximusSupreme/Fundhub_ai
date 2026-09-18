// h20r2 — read-only: how much Blake mail is still waiting for the live 5-minute watch?
// The live watch searches BLAKE_GMAIL_QUERY (which leaves out mail already labelled
// fundhub-blake-lead) and labels every message it reads. So if live can read Gmail, this
// count drains; if live cannot, it stays. Counts and Date headers only — no names, phones,
// senders or bodies. Nothing is labelled, sent or changed.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h20r2-blake-pending.mjs
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../../src/gmail/index.mjs";
import { BLAKE_GMAIL_QUERY, PROCESSED_LABEL } from "../../../src/staff/blake-lead.mjs";

const cfg = gmailConfigFromEnv(process.env);
if (!cfg.ready) {
  console.log(`src/gmail not ready: ${JSON.stringify(cfg.missing)}`);
  process.exit(0);
}
const client = createGmailClientFromConfig(cfg);
console.log(`checked at ${new Date().toISOString()}`);

async function dates(q, label) {
  const listed = await client.listMessages({ maxResults: 20, q });
  const out = [];
  for (const m of listed.messages) {
    const msg = await client.getMessage(m.id);
    const d = Date.parse(client.headerValue(msg, "Date") || "");
    out.push(Number.isFinite(d) ? new Date(d).toISOString() : "?");
  }
  console.log(`${label}: ${listed.messages.length}${out.length ? ` — dates ${out.sort().join(", ")}` : ""}`);
}

await dates(BLAKE_GMAIL_QUERY, "Blake mail waiting (not yet labelled, last 3 days)");
await dates(`label:${PROCESSED_LABEL} newer_than:3d`, `Blake mail already labelled ${PROCESSED_LABEL} (last 3 days)`);
