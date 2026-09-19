// One-off: pull the most recent SENT email to David Ramirez with attachments
// and save the attachments to gitignored credentials/david-email-docs-2026-09-18/.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { gmailConfigFromEnv, createGmailClientFromConfig } = await import("../../src/gmail/index.mjs");
const { fetchOAuthAccessToken } = await import("../../src/company-brain/auth.mjs");

const cfg = gmailConfigFromEnv(process.env);
if (!cfg.ready) {
  console.error("gmail config not ready:", cfg.missing.join(","));
  process.exit(1);
}
const g = createGmailClientFromConfig(cfg);
const tok = await fetchOAuthAccessToken(cfg.oauthCredentials);

const outDir = join(process.cwd(), "credentials", "david-email-docs-2026-09-18");
mkdirSync(outDir, { recursive: true, mode: 0o700 });

const q = "in:sent to:Daramirez10171@gmail.com has:attachment";
const list = await g.listMessages({ q, maxResults: 10 });
console.log("QUERY:", q, "-> count", list.messages.length, "est", list.resultSizeEstimate);

function collectParts(payload, acc = []) {
  if (!payload) return acc;
  acc.push(payload);
  for (const p of payload.parts || []) collectParts(p, acc);
  return acc;
}

const summaries = [];
for (const m of list.messages.slice(0, 3)) {
  const full = await g.getMessage(m.id, { format: "full" });
  const parts = collectParts(full.payload).filter((p) => p.filename && p.filename.length);
  summaries.push({
    id: m.id,
    date: g.headerValue(full, "Date"),
    subject: g.headerValue(full, "Subject"),
    to: g.headerValue(full, "To"),
    attachments: parts.map((p) => ({
      filename: p.filename,
      mimeType: p.mimeType,
      size: p.body?.size ?? null,
      attachmentId: p.body?.attachmentId || null
    })),
    full
  });
}

for (const s of summaries) {
  console.log("\n---", s.date, "|", s.subject);
  console.log("    to:", s.to, "| id:", s.id);
  for (const a of s.attachments) console.log("    *", a.filename, a.mimeType, a.size, "bytes");
}

const pick = summaries[0];
if (!pick) {
  console.log("NO MATCH");
  process.exit(0);
}

const { plainTextFromMessage } = await import("../../src/gmail/client.mjs");
const body = plainTextFromMessage(pick.full);
console.log("\n=== BODY (first 2000 chars) ===\n", body.slice(0, 2000));

for (const a of pick.attachments) {
  if (!a.attachmentId) continue;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${pick.id}/attachments/${a.attachmentId}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${tok.accessToken}` } });
  const json = await res.json();
  if (!res.ok) {
    console.error("attachment fetch failed", a.filename, res.status, json?.error?.message);
    continue;
  }
  const buf = Buffer.from(String(json.data).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const safe = a.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  writeFileSync(join(outDir, safe), buf, { mode: 0o600 });
  console.log("saved", safe, buf.length, "bytes");
}
console.log("\nOUT DIR:", outDir);
process.exit(0);
