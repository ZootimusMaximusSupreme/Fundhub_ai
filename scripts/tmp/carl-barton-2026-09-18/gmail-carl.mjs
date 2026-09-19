#!/usr/bin/env node
// One Gmail pass: find the "CARL BARTONS LIST" thread, dump body + links + attachments.
// Usage: node scripts/tmp/carl-barton-2026-09-18/gmail-carl.mjs

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gmailConfigFromEnv, createGmailClientFromConfig } from "../../../src/gmail/index.mjs";
import { plainTextFromMessage } from "../../../src/gmail/client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "credentials/carl-barton-2026-09-18");

for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && process.env[k] == null) process.env[k] = v;
}

const config = gmailConfigFromEnv(process.env);
if (!config.ready) {
  console.log(JSON.stringify({ ok: false, reason: "not_configured", missing: config.missing }));
  process.exit(1);
}
const client = createGmailClientFromConfig(config);

const queries = process.argv.slice(2).length ? process.argv.slice(2) : [
  'in:anywhere "carl barton"',
  'in:anywhere carl barton list',
  'in:anywhere calbarton',
  'in:anywhere cashback barton'
];

const seen = new Map();
for (const q of queries) {
  const { messages } = await client.listMessages({ q, maxResults: 25 });
  for (const m of messages) if (!seen.has(m.id)) seen.set(m.id, q);
}

mkdirSync(OUT, { recursive: true });
const report = [];

for (const [id, foundBy] of seen) {
  const full = await client.getMessage(id, { format: "full" });
  const subject = client.headerValue(full, "Subject");
  const from = client.headerValue(full, "From");
  const to = client.headerValue(full, "To");
  const date = client.headerValue(full, "Date");
  const body = plainTextFromMessage(full);
  const links = [...new Set((body.match(/https?:\/\/[^\s<>")\]]+/g) || []))];

  const attachments = [];
  (function walk(p) {
    if (!p) return;
    if (p.filename) attachments.push({ filename: p.filename, mimeType: p.mimeType, attachmentId: p.body?.attachmentId, size: p.body?.size });
    for (const c of p.parts || []) walk(c);
  })(full.payload);

  report.push({ id, foundBy, subject, from, to, date, links, attachments, bodyChars: body.length });
  writeFileSync(join(OUT, `msg-${id}.txt`), `Subject: ${subject}\nFrom: ${from}\nTo: ${to}\nDate: ${date}\n\n${body}\n`);
}

writeFileSync(join(OUT, "gmail-report.json"), JSON.stringify({ count: report.length, messages: report }, null, 2));
console.log(JSON.stringify({ ok: true, count: report.length, messages: report.map(r => ({ id: r.id, subject: r.subject, date: r.date, links: r.links.slice(0, 12), attachments: r.attachments.map(a => a.filename) })) }, null, 2));
