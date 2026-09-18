// Save #9's already-generated letter bodies as client files via Netlify CLI blobs.
// Mails nothing. Same body_text as dispute_letters.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { db, close } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/db.mjs";
import { createStore } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/documents/store.mjs";
import { persistGeneratedLetters } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/repair/persist-generated-letters.mjs";

const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const MAIN = "/Users/chrisstanbridge/Developer/fundhub-platform";
const BLOBS = `${MAIN}/docs/workflows/live-prove-2026-09-18-letter-brain/blobs-tmp`;
const STORE_NAME = "documents";
const KEY_PREFIX = `netlify-blob://${STORE_NAME}/`;
mkdirSync(BLOBS, { recursive: true });

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
  async del() { throw new Error("delete is not allowed from this script"); }
};
const store = createStore({ provider: cliProvider });

const client = await db.query(`SELECT org_id FROM clients WHERE id = $1`, [NINE]);
const orgId = client.rows[0]?.org_id;
const letters = (await db.query(
  `SELECT id, bureau, round, status, target, body_text
     FROM dispute_letters WHERE client_id = $1 ORDER BY bureau`,
  [NINE]
)).rows;

const persist = await persistGeneratedLetters(db, store, {
  orgId,
  clientId: NINE,
  round: "R1",
  letters: letters.map((l) => ({
    letterId: l.id,
    bureau: l.bureau,
    round: l.round,
    target: l.target,
    body_text: l.body_text
  })),
  generatedBy: "repair_analyze"
});

const docs = (await db.query(
  `SELECT id, title, kind, subtype, mime_type, byte_size, generated_by
     FROM documents
    WHERE client_id = $1 AND subtype = 'metro2_dispute_letter_pack'
    ORDER BY title`,
  [NINE]
)).rows;

const out = {
  at: new Date().toISOString(),
  store: store.name,
  letterRows: letters.map((l) => ({
    id: l.id, bureau: l.bureau, round: l.round, status: l.status,
    target: l.target, bodyChars: (l.body_text || "").length
  })),
  persist,
  documents: docs
};
writeFileSync(
  `${MAIN}/docs/workflows/live-prove-2026-09-18-letter-brain/persist.json`,
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
await close();
