// HOLE 22 BACKFILL — put Combo's five UnderwriteIQ reports on file.
//
// WHY
//   Combo (567c12ce…) is on the funding path (outcome_tier PREMIUM_STACK). Its
//   credit file landed at 08:52:59 UTC on 2026-09-18 (analysis.completed,
//   source crs). C-06 ran, tagged it path:funding, built the pack, and could not
//   save it: the sample credit was pushed from the laptop, where
//   DOCUMENT_STORE_PROVIDER is netlify-blobs but no site id / blobs token is set,
//   so the save threw, was caught, and nothing was stored. The backup hand-off
//   to the automation service did not run either (the laptop's automation key is
//   a masked copy). C-06 correctly did NOT stamp it delivered, and nothing
//   retries. Same cause as hole 1 (#8). This is the system's own output from the
//   credit file already on record — no bureau pull, nothing invented.
//
// WHAT IT SAVES
//   Only the five reports: the four gold HTML analysis pages (credit analysis,
//   funding snapshot, lender match list, optimization roadmap) and the Capital
//   Readiness Summary. None of them prints a home address.
//
//   HELD BACK, ON PURPOSE: the six bureau letters (inquiry removal + personal
//   info, one per bureau). A bureau letter is signed and mailed by the client
//   and must carry their home address. Combo has no address on file, so those
//   letters print no sender address and ask the bureau to "keep only my current
//   address" without saying what it is. Saving them would put a broken letter on
//   the file. They are not saved and no address is made up.
//
// WHAT IT DOES NOT DO
//   Sends nothing, queues nothing, emits no event, never touches tags or
//   clients.custom_fields, deletes nothing. Does not call C-06 handle(),
//   deliverFundingLettersOnce, deliverSloPack or the closer deck (those email).
//
// WHERE THE BYTES GO
//   Same as hole 1 (scripts/tmp/live-fix-2026-09-17/hole-1-backfill.mjs): the
//   Netlify CLI's own login writes to the live "documents" blob store under the
//   key netlifyBlobsProvider would use, and each put is read back and its sha256
//   checked before the row is written. No token is read or printed.
//
// RE-RUN SAFE: sourceEventId 'live-fix-2026-09-18:hole-22:<clientId>' — the
// registry dedupes on it, and blob keys are content-addressed.
//
// Run (dry):   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//                scripts/tmp/live-fix-2026-09-18/h22-backfill.mjs
// Run (write): same, plus --write
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
import { buildLetterPackForClient } from "../../../src/underwrite/letter-pack.mjs";
import { persistFundingLetterFiles } from "../../../src/underwrite/funding-letter-pdf.mjs";
import { createStore, storeFromEnv } from "../../../src/documents/store.mjs";

const WRITE = process.argv.includes("--write");
const MAIN = "/Users/chrisstanbridge/Developer/fundhub-platform";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22";
const BLOBS = `${OUT}/blobs-tmp`;
const STORE_NAME = "documents";
const KEY_PREFIX = `netlify-blob://${STORE_NAME}/`;
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const ANALYSIS_KEYS = ["credit_analysis", "funding_snapshot", "lender_match", "roadmap"];
const REPORT_TYPES = new Set([...ANALYSIS_KEYS, "funding_summary"]);
mkdirSync(BLOBS, { recursive: true });

if (process.env.DOCUMENT_STORE_PROVIDER !== "netlify-blobs") {
  throw new Error("DOCUMENT_STORE_PROVIDER is not netlify-blobs; refusing.");
}
if ((process.env.NETLIFY_BLOBS_STORE || STORE_NAME) !== STORE_NAME) {
  throw new Error("NETLIFY_BLOBS_STORE is not 'documents'; refusing.");
}
if (storeFromEnv().name !== "netlify-blobs") throw new Error("storeFromEnv is not netlify-blobs");

const sha = (buf) => `sha256:${createHash("sha256").update(buf).digest("hex")}`;
let tmpN = 0;
function cli(args) {
  execFileSync("netlify", args, { cwd: MAIN, stdio: ["ignore", "ignore", "inherit"] });
}

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
  async get(storageKey) {
    const s = String(storageKey);
    if (!s.startsWith(KEY_PREFIX)) throw new Error(`not a ${KEY_PREFIX} key`);
    const f = `${BLOBS}/get-${++tmpN}.bin`;
    cli(["blobs:get", STORE_NAME, s.slice(KEY_PREFIX.length), "--output", f]);
    const body = readFileSync(f);
    rmSync(f);
    return { body, contentType: null };
  },
  async del() {
    throw new Error("delete is not allowed from this script");
  },
};
const store = createStore({ provider: cliProvider });

async function snapshot(p) {
  const c = await p.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const docs = (await c.query(
      `SELECT kind, subtype, title, mime_type, byte_size, current_version, generated_by, created_at
         FROM documents WHERE client_id = $1 ORDER BY kind, subtype`, [COMBO])).rows;
    const msgs = (await c.query(`SELECT count(*)::int AS n FROM messages WHERE client_id = $1`, [COMBO])).rows[0].n;
    const events = (await c.query(`SELECT count(*)::int AS n FROM events WHERE client_id = $1`, [COMBO])).rows[0].n;
    const cf = (await c.query(`SELECT custom_fields, tags FROM clients WHERE id = $1`, [COMBO])).rows[0];
    await c.query("COMMIT");
    return {
      documents: docs,
      messages: msgs,
      events,
      customFieldsSha: sha(Buffer.from(JSON.stringify(cf?.custom_fields ?? null))),
      tags: cf?.tags ?? null,
    };
  } finally {
    c.release();
  }
}

const report = { at: new Date().toISOString(), mode: WRITE ? "write" : "dry", clientId: COMBO };
const p = pool();
try {
  report.before = await snapshot(p);

  const c = await p.connect();
  let pack;
  let orgId;
  let tier;
  try {
    await c.query("BEGIN READ ONLY");
    const row = (await c.query(`SELECT org_id, outcome_tier FROM clients WHERE id = $1`, [COMBO])).rows[0];
    orgId = row?.org_id;
    tier = row?.outcome_tier;
    pack = await buildLetterPackForClient({ query: (sql, v) => c.query(sql, v) }, { clientId: COMBO, pack: "funding" });
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  if (!orgId) throw new Error("no org_id");
  if (tier !== "PREMIUM_STACK") throw new Error(`expected the funding-path tier PREMIUM_STACK, got ${tier}`);

  const all = pack.files || [];
  const html = all.filter((f) => /html/.test(String(f.contentType)));
  const htmlOk = html.length === 4
    && html.every((f) => f.engine === "html" && f.content?.length > 0)
    && ANALYSIS_KEYS.every((k) => html.some((f) => f.type === k));
  const files = all.filter((f) => REPORT_TYPES.has(f.type));
  const held = all.filter((f) => !REPORT_TYPES.has(f.type));
  report.tier = tier;
  report.reason = pack.reason ?? null;
  report.deliverableSkip = pack.deliverableSkip ?? null;
  report.htmlOk = htmlOk;
  report.handedToSaver = files.map((f) => ({ filename: f.filename, type: f.type, contentType: f.contentType, bytes: f.content?.length ?? 0, engine: f.engine ?? null }));
  report.heldBack = held.map((f) => ({ filename: f.filename, type: f.type, why: "bureau letter needs a home address; none on file" }));
  if (!htmlOk || files.length !== 5) {
    console.error("expected 4 gold HTML pages and the Capital Readiness Summary; stopping.");
    process.exitCode = 1;
  } else if (WRITE) {
    const saved = await persistFundingLetterFiles(p, store, {
      orgId,
      clientId: COMBO,
      files,
      generatedBy: "c-06-crs-results-router",
      sourceEventId: `live-fix-2026-09-18:hole-22:${COMBO}`,
    });
    report.saved = {
      stored: saved.stored,
      notStored: saved.notStored,
      faults: saved.faults,
      unrecognised: saved.unrecognised,
      filesIn: saved.filesIn,
      skipped: saved.skipped,
    };
    if (saved.faults.length || saved.unrecognised.length || saved.skipped) {
      console.error("saver reported faults/unrecognised/skipped.");
      process.exitCode = 1;
    }
    report.after = await snapshot(p);
  }
} finally {
  await close();
}
rmSync(BLOBS, { recursive: true, force: true });
writeFileSync(`${OUT}/backfill-${report.mode}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
