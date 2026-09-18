// N9 — DRY BUILD with the fixed builder against live data. READ ONLY.
//
// Builds each named Sim file's funding pack in memory, inside BEGIN READ ONLY,
// with this branch's src/underwrite/letter-pack.mjs. Nothing is saved, nothing is
// sent, no event is emitted, the model writer is switched off (ANTHROPIC key
// dropped from this process only). Prints yes/no answers only — never a name,
// street, city, ZIP, SSN or DOB.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n9-drybuild.mjs [tag]
import { mkdirSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pool, close } from "../../../src/db.mjs";
import { buildLetterPackForClient } from "../../../src/underwrite/letter-pack.mjs";

delete process.env.ANTHROPIC_API_KEY;
const TAG = process.argv[2] || "drybuild-fixed";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N9";
mkdirSync(OUT, { recursive: true });

const FILES = {
  "567c12ce-64de-4043-aa98-d842434bd267": "Sim Combo-20260918 (identity address, no typed address)",
  "d682c13b-11f3-4bd5-a0c5-232b6a7875c4": "Sim Eight-Funding #8 (identity address + typed street)",
  "7ccbeb76-df98-4125-8c14-0d1c9f5e3042": "Thirteen-NoBook #13 (no address anywhere)",
  "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f": "Twelve-Academy #12 (identity address, no letters saved yet)",
  "029964c5-4d8e-47ed-88c9-53ac13863fd4": "Eleven-Blueprint #11 (identity address + typed street)",
  "ab277630-8309-4c02-b187-f244e7e369e8": "Walk1 Funding (demo; identity address, no letters saved yet)",
};
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const z5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);
const BUREAU_HEAD = /^(EQUIFAX|EXPERIAN|TRANSUNION|TRANS UNION)/;
const MONTH = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d{1,2} \d{4}$/;

async function pdfLines(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    let row = null;
    let buf = "";
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      if (row !== null && y !== row) { if (buf.trim()) lines.push(buf.trim()); buf = ""; }
      row = y;
      buf += it.str;
    }
    if (buf.trim()) lines.push(buf.trim());
  }
  return lines;
}

const out = { at: new Date().toISOString(), tag: TAG, read_only: true, saved: 0, sent: 0, files: {} };
const c = await pool().connect();
const ro = { query: (sql, p) => c.query(sql, p) };
try {
  await c.query("BEGIN READ ONLY");
  for (const [id, label] of Object.entries(FILES)) {
    const p = (await c.query(`SELECT addresses FROM pii_identity WHERE client_id = $1`, [id])).rows[0];
    const a = Array.isArray(p?.addresses) ? p.addresses[0] : null;
    const f = a ? { street: norm(a.addressLine1 || a.address_line1), city: norm(a.city), zip: z5(a.postalCode || a.zip) } : null;
    const pack = await buildLetterPackForClient(ro, { clientId: id, pack: "funding" });
    const letters = (pack.files || []).filter((x) => /inquiry_|personal_info_|round/.test(x.filename));
    const rows = [];
    for (const l of letters) {
      const lines = await pdfLines(Buffer.isBuffer(l.content) ? l.content : Buffer.from(l.content));
      const all = norm(lines.join(" "));
      const head = [];
      for (const x of lines) { if (BUREAU_HEAD.test(norm(x))) break; head.push(x); }
      rows.push({
        filename: l.filename,
        sender_block_shape: head.map((x, i) => {
          if (i === 0) return "[name]";
          if (MONTH.test(norm(x))) return "[date]";
          if (f?.street && norm(x).includes(f.street)) return "[street on file]";
          if (f?.zip && norm(x).includes(f.zip) && f?.city && norm(x).includes(f.city)) return "[city, state ZIP on file]";
          return "[other line]";
        }),
        prints_street_on_file: f ? all.includes(f.street) : null,
        prints_city_on_file: f ? all.includes(f.city) : null,
        prints_zip_on_file: f ? all.includes(f.zip) : null,
        says_keep_only_my_current_address_without_saying_it: /PLEASE KEEP ONLY MY CURRENT ADDRESS/.test(all),
        says_keep_only_this_address: /PLEASE KEEP ONLY THIS ADDRESS/.test(all),
      });
    }
    out.files[id.slice(0, 8)] = {
      label,
      identity_address_on_file: Boolean(f?.street),
      letterSkip: pack.letterSkip ?? null,
      homeAddressSkip: pack.homeAddressSkip ?? null,
      reason: pack.reason ?? null,
      analysis_files: (pack.files || []).filter((x) => !/inquiry_|personal_info_|round/.test(x.filename)).map((x) => x.filename),
      letters: rows,
    };
  }
  await c.query("ROLLBACK");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
  await close();
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
