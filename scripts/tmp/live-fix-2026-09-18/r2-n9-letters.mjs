// N9 — open the funding letters saved on live, as staff, through the same
// download door the Documents desk and the client portal use, and read what
// the letter actually prints at the top. LOOK ONLY.
//
// Signs in with the one staff POST (/api/auth/login). Every other call is a GET.
// Compares the letter text against the client's saved identity address
// (pii_identity, read inside BEGIN READ ONLY) and prints only yes/no answers —
// never a name, street, city, ZIP, SSN or DOB.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n9-letters.mjs [tag] [clientId ...]
import { request } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pool, close } from "../../../src/db.mjs";

const BASE = "https://fundhub.ai";
const TAG = process.argv[2] || "letters";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const CLIENTS = process.argv.slice(3).length ? process.argv.slice(3) : [COMBO, EIGHT];
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N9";
mkdirSync(OUT, { recursive: true });

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const z5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);

// ── What is on file, read only.
const onFile = {};
const docs = {};
{
  const c = await pool().connect();
  try {
    await c.query("BEGIN READ ONLY");
    for (const id of CLIENTS) {
      const p = (await c.query(`SELECT addresses FROM pii_identity WHERE client_id = $1`, [id])).rows[0];
      const a = Array.isArray(p?.addresses) ? p.addresses[0] : null;
      onFile[id] = a ? {
        street: norm(a.addressLine1 || a.address_line1 || a.line1 || a.street),
        city: norm(a.city || a.address_city),
        zip: z5(a.postalCode || a.postal_code || a.zip || a.address_zip),
      } : null;
      docs[id] = (await c.query(
        `SELECT id, subtype, title, generated_by, created_at FROM documents
          WHERE client_id = $1 AND subtype IN ('funding_inquiry_removal', 'funding_personal_info')
          ORDER BY subtype, title`, [id])).rows;
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
    await close();
  }
}

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");
const api = await request.newContext({ baseURL: BASE });
const login = await api.post("/api/auth/login", { data: { email: "chris@fundhub.ai", password } });
const out = { at: new Date().toISOString(), tag: TAG, login: login.status(), only_get_after_login: true, clients: {} };
if (login.status() !== 200) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

async function pdfLines(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
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

const BUREAU_HEAD = /^(EQUIFAX|EXPERIAN|TRANSUNION|TRANS UNION)/;
for (const id of CLIENTS) {
  const f = onFile[id];
  const rows = [];
  for (const d of docs[id]) {
    const meta = await api.get(`/api/documents-download?id=${d.id}`);
    const mj = await meta.json().catch(() => null);
    const url = mj?.document?.download?.url || mj?.document?.download;
    let lines = [];
    let fileStatus = null;
    if (typeof url === "string") {
      const r = await api.get(url.startsWith("http") ? url : `${BASE}${url.startsWith("/") ? "" : "/"}${url}`);
      fileStatus = r.status();
      if (r.ok()) lines = await pdfLines(await r.body());
    }
    const all = norm(lines.join(" "));
    // The sender block: everything above the bureau's name. Line 1 is the client's name.
    const head = [];
    for (const l of lines) { if (BUREAU_HEAD.test(norm(l))) break; head.push(l); }
    rows.push({
      title: d.title,
      generated_by: d.generated_by,
      created_at: d.created_at,
      meta_status: meta.status(),
      file_status: fileStatus,
      text_lines: lines.length,
      sender_block_lines: head.length,
      sender_block_shape: head.map((l, i) => {
        if (i === 0) return "[name]";
        if (/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d{1,2} \d{4}$/.test(norm(l))) return "[date]";
        if (f?.street && norm(l).includes(f.street)) return "[street on file]";
        if (f?.zip && norm(l).includes(f.zip)) return "[city/state/ZIP on file]";
        return /\d/.test(l) ? "[other line with digits]" : "[other line]";
      }),
      prints_street_on_file: f?.street ? all.includes(f.street) : null,
      prints_city_on_file: f?.city ? all.includes(f.city) : null,
      prints_zip_on_file: f?.zip ? all.includes(f.zip) : null,
      says_keep_only_my_current_address_without_saying_it: /PLEASE KEEP ONLY MY CURRENT ADDRESS/.test(all),
      says_keep_only_this_address: /PLEASE KEEP ONLY THIS ADDRESS/.test(all),
    });
  }
  out.clients[id.slice(0, 8)] = { identity_address_on_file: Boolean(f?.street), letters: rows };
}
await api.dispose();
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
