// HOLE 1 BACKFILL — put the gold HTML UnderwriteIQ pages on #8 and #11.
//
// WHAT IT DOES
//   1. Builds the funding pack IN MEMORY from the sample credit data already on
//      file (buildLetterPackForClient, inside BEGIN READ ONLY). No bureau pull.
//   2. DRY by default: prints what it would save and stops.
//   3. With --write: saves through persistFundingLetterFiles, the same no-send
//      saver C-06 uses. It sends nothing, queues nothing, emits no event, and
//      never touches tags or clients.custom_fields.
//
// WHO GETS WHAT (decided from code and entitlements, not assumed)
//   #8  d682c13b  funding path (PREMIUM_STACK, funding-snapshot). Owed the whole
//                 funding pack C-06 failed to save: 4 HTML analysis pages plus
//                 the funding letters. The saver itself skips dispute letters
//                 and complaints.
//   #11 029964c5  Capital Blueprint. Letters and summary are already on file, so
//                 only the 4 HTML analysis pages. They append a new version on
//                 the existing rows; the old PDF version is kept (no delete).
//   #9  be3dcfd7  REPAIR_ONLY, metro2-letter-pack only. The repair pack has no
//                 analysis pages (deliverableSkip 'not_funding'). Not touched.
//
// NOT CALLED, ON PURPOSE: C-06 handle() / deliverFundingLettersOnce (tags and
// stamps), src/slo/deliver.mjs deliverSloPack and src/sales/closer-deck.mjs
// (both send the funding delivery email).
//
// WHERE THE BYTES GO
//   The live site reads Netlify Blobs store "documents" through
//   src/documents/store.mjs netlifyBlobsProvider. The laptop has no blobs token
//   in .env (that is why #8's first save failed), so this script writes the
//   bytes with the Netlify CLI's own login (`netlify blobs:set`), to the same
//   store and the same key netlifyBlobsProvider would use. The script never
//   reads or prints a token. Each put is read back with `netlify blobs:get` and
//   its sha256 checked before the row is written. hole-1-probe.mjs proved the
//   CLI sees the live store (checksum match on #11's existing file).
//
// RE-RUN SAFE: sourceEventId 'live-fix-2026-09-17:hole-1:<clientId>' — the
// registry dedupes on it (document_versions_doc_source_event_uniq), and the
// blob keys are content-addressed.
//
// Run (dry):   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//                scripts/tmp/live-fix-2026-09-17/hole-1-backfill.mjs
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
const OUT = "/tmp/live-fix-2026-09-17/hole-1";
const STORE_NAME = "documents";
const KEY_PREFIX = `netlify-blob://${STORE_NAME}/`;
const TARGETS = [
  { name: "#8", clientId: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4", htmlOnly: false },
  { name: "#11", clientId: "029964c5-4d8e-47ed-88c9-53ac13863fd4", htmlOnly: true },
];
const ANALYSIS_KEYS = ["credit_analysis", "funding_snapshot", "lender_match", "roadmap"];
mkdirSync(`${OUT}/blobs`, { recursive: true });

// The live site's store must be netlify-blobs / "documents", or this script
// would be writing somewhere the site never reads.
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

// Same key shape and prefix as netlifyBlobsProvider; writes through the CLI.
const cliProvider = {
  name: "netlify-blobs",
  async put(pathname, bytes) {
    const buf = Buffer.from(bytes);
    const inFile = `${OUT}/blobs/put-${++tmpN}.bin`;
    const backFile = `${OUT}/blobs/back-${tmpN}.bin`;
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
    const f = `${OUT}/blobs/get-${++tmpN}.bin`;
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

const report = { mode: WRITE ? "write" : "dry", clients: [] };
const p = pool();
try {
  for (const t of TARGETS) {
    // Build in memory inside a READ ONLY transaction: proves the build writes nothing.
    const c = await p.connect();
    let pack;
    let orgId;
    try {
      await c.query("BEGIN READ ONLY");
      orgId = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [t.clientId])).rows[0]?.org_id;
      pack = await buildLetterPackForClient({ query: (sql, v) => c.query(sql, v) }, { clientId: t.clientId, pack: "funding" });
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    if (!orgId) throw new Error(`${t.name}: no org_id`);

    const all = pack.files || [];
    const html = all.filter((f) => /html/.test(String(f.contentType)));
    const htmlOk = html.length === 4
      && html.every((f) => f.engine === "html" && f.content?.length > 0)
      && ANALYSIS_KEYS.every((k) => html.some((f) => f.type === k));
    const files = t.htmlOnly ? html : all;
    const entry = {
      name: t.name,
      clientId: t.clientId,
      reason: pack.reason ?? null,
      deliverableSkip: pack.deliverableSkip ?? null,
      letterSkip: pack.letterSkip ?? null,
      htmlOk,
      filesInPack: all.map((f) => ({
        filename: f.filename, type: f.type ?? null, contentType: f.contentType,
        bytes: f.content?.length ?? 0, engine: f.engine ?? null,
      })),
      handedToSaver: files.length,
    };
    report.clients.push(entry);
    if (!htmlOk) {
      console.error(`${t.name}: expected 4 gold HTML pages with engine 'html'; stopping.`);
      process.exitCode = 1;
      break;
    }
    if (!WRITE) continue;

    const saved = await persistFundingLetterFiles(p, store, {
      orgId,
      clientId: t.clientId,
      files,
      generatedBy: "c-06-crs-results-router",
      sourceEventId: `live-fix-2026-09-17:hole-1:${t.clientId}`,
    });
    entry.saved = {
      stored: saved.stored,
      notStored: saved.notStored,
      faults: saved.faults,
      unrecognised: saved.unrecognised,
      filesIn: saved.filesIn,
      skipped: saved.skipped,
    };
    if (saved.faults.length || saved.unrecognised.length || saved.skipped) {
      console.error(`${t.name}: saver reported faults/unrecognised/skipped; stopping.`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await close();
}
writeFileSync(`${OUT}/backfill-${report.mode}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
