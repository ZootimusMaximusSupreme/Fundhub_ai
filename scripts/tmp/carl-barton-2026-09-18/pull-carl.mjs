// One-shot: pull the Sent "CARL BARTONS LIST" message, print body links,
// save any attachment to gitignored credentials/carl-barton-2026-09-18/.
// Read-only against Gmail. Never prints a token.
//
// Run: node --env-file=.env scripts/tmp/carl-barton-2026-09-18/pull-carl.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { gmailConfigFromEnv, createGmailClientFromConfig, plainTextFromMessage, decodeGmailBodyData } from "../../../src/gmail/index.mjs";

const OUT = "credentials/carl-barton-2026-09-18";
mkdirSync(OUT, { recursive: true });

const cfg = gmailConfigFromEnv();
if (!cfg.ready) {
  console.log(JSON.stringify({ ok: false, missing: cfg.missing }, null, 2));
  process.exit(1);
}
const gmail = createGmailClientFromConfig(cfg);

const q = 'in:anywhere subject:("CARL BARTON" OR "CARL BARTONS") OR in:anywhere "0_APR_database"';
const list = await gmail.listMessages({ q, maxResults: 20, labelIds: undefined });
console.log("hits:", list.messages.length, "estimate:", list.resultSizeEstimate);

const report = [];
for (const m of list.messages) {
  const full = await gmail.getMessage(m.id, { format: "full" });
  const subject = gmail.headerValue(full, "Subject");
  const date = gmail.headerValue(full, "Date");
  const to = gmail.headerValue(full, "To");
  const from = gmail.headerValue(full, "From");

  const body = plainTextFromMessage(full);
  const urls = Array.from(new Set((body.match(/https?:\/\/[^\s<>")\]]+/g) || [])));

  // raw html too (links often only in href)
  const hrefs = [];
  const atts = [];
  (function walk(p) {
    if (!p) return;
    const mime = String(p.mimeType || "").toLowerCase();
    if (p.body?.data && mime.startsWith("text/html")) {
      const html = decodeGmailBodyData(p.body.data);
      for (const h of html.match(/href="([^"]+)"/g) || []) hrefs.push(h.slice(6, -1));
    }
    if (p.filename && p.body?.attachmentId) {
      atts.push({ filename: p.filename, attachmentId: p.body.attachmentId, size: p.body.size, mimeType: p.mimeType });
    }
    for (const c of p.parts || []) walk(c);
  })(full.payload);

  report.push({ id: m.id, subject, date, from, to, urls, hrefs: Array.from(new Set(hrefs)), atts: atts.map(a => ({ ...a, attachmentId: undefined })) });

  if (atts.length) {
    const rawMsg = await gmail.getMessage(m.id, { format: "raw" });
    const eml = Buffer.from(String(rawMsg.raw).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    writeFileSync(`${OUT}/${m.id}.eml`, eml);
    console.log("saved eml", m.id, eml.length, "bytes", "atts:", atts.map(a => a.filename).join(","));
  }
}

writeFileSync(`${OUT}/gmail-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
