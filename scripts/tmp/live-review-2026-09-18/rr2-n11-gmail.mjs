// rr2-n11: read-only Gmail look at the delivered copy for a review sim plus-tag.
// Prints no address. Saves the delivered HTML (addresses + sig masked) for a screenshot.
import pg from "pg";
import { writeFileSync } from "node:fs";
import { gmailConfigFromEnv, createGmailClientFromConfig, decodeGmailBodyData } from "../../../src/gmail/index.mjs";
const TAG = process.argv[2]; const OUTHTML = process.argv[3];
const mask = (s) => String(s).replace(/((?:\?|&|&amp;)sig=)[0-9a-f]{6}[0-9a-f]*/gi, "$1<sig…>").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
const addr = (await c.query(`SELECT email FROM clients WHERE email LIKE '%+' || $1 || '@%'`, [TAG])).rows[0]?.email;
await c.query("ROLLBACK"); await c.end();
if (!addr) throw new Error("no client for tag");
const g = createGmailClientFromConfig(gmailConfigFromEnv(process.env));
const { messages } = await g.listMessages({ q: `to:${addr} in:anywhere`, maxResults: 10 });
console.log(`gmail hits for tag ${TAG}: ${messages.length}`);
for (const { id } of messages) {
  const full = await g.getMessage(id, { format: "full" }); const h = (n) => g.headerValue(full, n);
  let html = "";
  const walk = (p) => { if (!p) return; if (p.mimeType === "text/html" && p.body?.data) html += decodeGmailBodyData(p.body.data); (p.parts || []).forEach(walk); };
  walk(full.payload);
  console.log(`\ngmail ${id} labels ${JSON.stringify(full.labelIds)} date ${h("Date")} subject "${h("Subject")}"`);
  console.log(`  List-Unsubscribe header present: ${!!h("List-Unsubscribe")}; List-Unsubscribe-Post: ${h("List-Unsubscribe-Post") || "none"}`);
  console.log(`  '{{' present: ${html.includes("{{")}; unsubscribe.html links: ${(html.match(/unsubscribe\.html/g) || []).length}`);
  const lines = html.split(/\r?\n/); const i = lines.findIndex(l => /Funding Intelligence for Entrepreneurs/.test(l));
  if (i >= 0) for (const l of lines.slice(i, i + 2)) console.log(`  | ${mask(l).trim().slice(0, 400)}`);
  console.log(`  client ids in unsubscribe links: ${JSON.stringify([...html.matchAll(/unsubscribe\.html\?[^"]*?client=([0-9a-f-]{36})/g)].map(m => m[1].slice(0, 8)))}`);
  if (OUTHTML) writeFileSync(OUTHTML, mask(html));
}
