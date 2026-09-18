// N9 DATA FIX — re-save the funding letters on three Sim files with the home
// address printed on them.
//
// WHY
//   Sim Combo (567c12ce…), Sim Eight #8 (d682c13b…) and Eleven-Blueprint #11
//   (029964c5…) each hold six funding letters (inquiry removal + personal info,
//   one per bureau) saved by the closer deck before the N9 fix. Measured on live
//   2026-09-18 through the staff download door (r2-n9-letters.mjs):
//     Combo — name and date only, no address; the personal-info letters ask the
//             bureau to keep "my current address" and list it for removal.
//     #8, #11 — a street with no city, state or ZIP.
//   All three have a home address on the identity record. Pressing the deck
//   button again would not fix them: the registry dedupes on the button's event
//   id, so the old bytes would stay current.
//
// WHAT IT DOES
//   Builds each file's funding pack in memory with the fixed builder
//   (src/underwrite/letter-pack.mjs), inside BEGIN READ ONLY. Keeps only the six
//   letters, and only if EVERY one prints the street and the city/ZIP on file
//   and each maps onto a letter row that already exists. With --write it appends
//   a new version to each of those existing rows through the same saver the app
//   uses (persistFundingLetterFiles). The old versions stay — versions are
//   immutable and never deleted.
//
// WHAT IT DOES NOT DO
//   Sends nothing, queues nothing, emits no event, touches no tag and no
//   custom_fields, deletes nothing, saves no analysis page. Real clients are not
//   in the list and the script refuses any id not in it.
//
// WHERE THE BYTES GO
//   Same as hole 22 (h22-backfill.mjs): the Netlify CLI's own login writes the
//   live "documents" blob store under the key netlifyBlobsProvider would use;
//   each put is read back and its sha256 checked before the row is written. No
//   token is read or printed. Prints no name, street, ZIP, SSN or DOB.
//
// RE-RUN SAFE: sourceEventId 'live-fix-2026-09-18:N9:<clientId>'.
//
// Run (dry):   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//                scripts/tmp/live-fix-2026-09-18/r2-n9-refresh.mjs
// Run (write): same, plus --write
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pool, close } from "../../../src/db.mjs";
import { buildLetterPackForClient } from "../../../src/underwrite/letter-pack.mjs";
import { persistFundingLetterFiles } from "../../../src/underwrite/funding-letter-pdf.mjs";
import { createStore, storeFromEnv } from "../../../src/documents/store.mjs";

delete process.env.ANTHROPIC_API_KEY;
const WRITE = process.argv.includes("--write");
const MAIN = "/Users/chrisstanbridge/Developer/fundhub-platform";
const OUT = `${MAIN}/docs/workflows/live-prove-2026-09-17-evidence/N9`;
const BLOBS = `${OUT}/blobs-tmp`;
const STORE_NAME = "documents";
const KEY_PREFIX = `netlify-blob://${STORE_NAME}/`;
const SIMS = {
  "567c12ce-64de-4043-aa98-d842434bd267": "Sim Combo-20260918",
  "d682c13b-11f3-4bd5-a0c5-232b6a7875c4": "Sim Eight-Funding #8",
  "029964c5-4d8e-47ed-88c9-53ac13863fd4": "Eleven-Blueprint #11",
};
const LETTER_SUBTYPE = { inquiry_removal: "funding_inquiry_removal", personal_info: "funding_personal_info" };
mkdirSync(BLOBS, { recursive: true });

if (process.env.DOCUMENT_STORE_PROVIDER !== "netlify-blobs") throw new Error("DOCUMENT_STORE_PROVIDER is not netlify-blobs; refusing.");
if ((process.env.NETLIFY_BLOBS_STORE || STORE_NAME) !== STORE_NAME) throw new Error("NETLIFY_BLOBS_STORE is not 'documents'; refusing.");
if (storeFromEnv().name !== "netlify-blobs") throw new Error("storeFromEnv is not netlify-blobs");

const sha = (buf) => `sha256:${createHash("sha256").update(buf).digest("hex")}`;
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const z5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);
let tmpN = 0;
const cli = (args) => execFileSync("netlify", args, { cwd: MAIN, stdio: ["ignore", "ignore", "inherit"] });
const cliProvider = {
  name: "netlify-blobs",
  async put(pathname, bytes) {
    const buf = Buffer.from(bytes);
    const inFile = `${BLOBS}/put-${++tmpN}.bin`;
    const backFile = `${BLOBS}/back-${tmpN}.bin`;
    writeFileSync(inFile, buf);
    cli(["blobs:set", STORE_NAME, pathname, "--input", inFile, "--force"]);
    cli(["blobs:get", STORE_NAME, pathname, "--output", backFile]);
    const back = readFileSync(backFile);
    rmSync(inFile);
    rmSync(backFile);
    if (sha(back) !== sha(buf)) throw new Error(`read-back mismatch for ${pathname}`);
    return `${KEY_PREFIX}${pathname}`;
  },
  async get() { throw new Error("get is not used by this script"); },
  async del() { throw new Error("delete is not allowed from this script"); },
};
const store = createStore({ provider: cliProvider });

async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    t += " " + tc.items.map((it) => it.str).join(" ");
  }
  return norm(t);
}

async function letterRows(c, clientId) {
  return (await c.query(
    `SELECT id, subtype, title, current_version, checksum, generated_by, updated_at FROM documents
      WHERE client_id = $1 AND subtype IN ('funding_inquiry_removal', 'funding_personal_info')
      ORDER BY subtype, title`, [clientId])).rows;
}

const report = { at: new Date().toISOString(), mode: WRITE ? "write" : "dry", sent: 0, events: 0, files: {} };
const p = pool();
try {
  for (const [clientId, label] of Object.entries(SIMS)) {
    const entry = { label };
    const c = await p.connect();
    let pack, orgId, home, before, msgsBefore, eventsBefore;
    try {
      await c.query("BEGIN READ ONLY");
      orgId = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [clientId])).rows[0]?.org_id;
      const a = (await c.query(`SELECT addresses FROM pii_identity WHERE client_id = $1`, [clientId])).rows[0]?.addresses?.[0];
      home = a ? { street: norm(a.addressLine1 || a.address_line1), city: norm(a.city), zip: z5(a.postalCode || a.zip) } : null;
      before = await letterRows(c, clientId);
      msgsBefore = (await c.query(`SELECT count(*)::int AS n FROM messages WHERE client_id = $1`, [clientId])).rows[0].n;
      eventsBefore = (await c.query(`SELECT count(*)::int AS n FROM events WHERE client_id = $1`, [clientId])).rows[0].n;
      pack = await buildLetterPackForClient({ query: (sql, v) => c.query(sql, v) }, { clientId, pack: "funding" });
      await c.query("ROLLBACK");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    if (!orgId || !home?.street || !home.city || !home.zip) throw new Error(`${label}: no org or no full home address on the identity record; refusing`);
    const letters = (pack.files || []).filter((f) => f.type === "inquiry_removal" || f.type === "personal_info");
    entry.letterSkip = pack.letterSkip ?? null;
    entry.before = before.map((r) => ({ id: r.id, title: r.title, current_version: r.current_version, checksum: r.checksum, generated_by: r.generated_by }));
    entry.built = [];
    for (const f of letters) {
      const text = await pdfText(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
      const bureau = String(f.bureau || "").toLowerCase();
      const code = { experian: "EX", transunion: "TU", equifax: "EQ" }[bureau] || null;
      const title = `${f.type === "inquiry_removal" ? "Inquiry removal" : "Personal info"} — ${code}`;
      entry.built.push({
        filename: f.filename, title,
        maps_to_existing_row: before.some((r) => r.subtype === LETTER_SUBTYPE[f.type] && r.title === title),
        prints_street_on_file: text.includes(home.street),
        prints_city_on_file: text.includes(home.city),
        prints_zip_on_file: text.includes(home.zip),
        says_keep_only_my_current_address_without_saying_it: /PLEASE KEEP ONLY MY CURRENT ADDRESS/.test(text),
      });
    }
    const ok = letters.length === before.length && letters.length === 6
      && entry.built.every((b) => b.maps_to_existing_row && b.prints_street_on_file && b.prints_city_on_file
        && b.prints_zip_on_file && !b.says_keep_only_my_current_address_without_saying_it);
    entry.ok_to_write = ok;
    if (!ok) {
      console.error(`${label}: built letters do not pass every check; not writing.`);
      process.exitCode = 1;
    } else if (WRITE) {
      const saved = await persistFundingLetterFiles(p, store, {
        orgId, clientId, files: letters,
        generatedBy: "live-fix-2026-09-18-n9",
        sourceEventId: `live-fix-2026-09-18:N9:${clientId}`,
      });
      entry.saved = { stored: saved.stored.length, notStored: saved.notStored, faults: saved.faults, unrecognised: saved.unrecognised, skipped: saved.skipped };
      const c2 = await p.connect();
      try {
        await c2.query("BEGIN READ ONLY");
        const after = await letterRows(c2, clientId);
        entry.after = after.map((r) => ({ id: r.id, title: r.title, current_version: r.current_version, checksum: r.checksum, generated_by: r.generated_by }));
        entry.messages_before_after = [msgsBefore, (await c2.query(`SELECT count(*)::int AS n FROM messages WHERE client_id = $1`, [clientId])).rows[0].n];
        entry.events_before_after = [eventsBefore, (await c2.query(`SELECT count(*)::int AS n FROM events WHERE client_id = $1`, [clientId])).rows[0].n];
        await c2.query("COMMIT");
      } finally {
        c2.release();
      }
    }
    report.files[clientId.slice(0, 8)] = entry;
  }
} finally {
  await close();
}
rmSync(BLOBS, { recursive: true, force: true });
writeFileSync(`${OUT}/refresh-${report.mode}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
