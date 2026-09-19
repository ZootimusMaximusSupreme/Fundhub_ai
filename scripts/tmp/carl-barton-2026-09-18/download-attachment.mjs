#!/usr/bin/env node
// Download Gmail attachments for one message id into credentials/carl-barton-2026-09-18/.
// Usage: node scripts/tmp/carl-barton-2026-09-18/download-attachment.mjs <messageId>

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gmailConfigFromEnv } from "../../../src/gmail/index.mjs";
import { fetchOAuthAccessToken } from "../../../src/company-brain/auth.mjs";

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

const messageId = process.argv[2];
if (!messageId) throw new Error("usage: download-attachment.mjs <messageId>");

const config = gmailConfigFromEnv(process.env);
const tok = await fetchOAuthAccessToken({ ...config.oauthCredentials });
const auth = { authorization: `Bearer ${tok.accessToken}` };

const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, { headers: auth });
const msg = await msgRes.json();

const parts = [];
(function walk(p) {
  if (!p) return;
  if (p.filename && p.body?.attachmentId) parts.push(p);
  for (const c of p.parts || []) walk(c);
})(msg.payload);

mkdirSync(OUT, { recursive: true });
const saved = [];
for (const p of parts) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${p.body.attachmentId}`,
    { headers: auth }
  );
  const json = await res.json();
  const buf = Buffer.from(String(json.data).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const path = join(OUT, p.filename);
  writeFileSync(path, buf);
  saved.push({ filename: p.filename, bytes: buf.length, mimeType: p.mimeType });
}
console.log(JSON.stringify({ ok: true, messageId, saved }, null, 2));
