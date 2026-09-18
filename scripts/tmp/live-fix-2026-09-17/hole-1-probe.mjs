// HOLE 1 PROBE — look only. Read-only SELECTs plus one blob READ.
// Proves the laptop's Netlify CLI sees the SAME document store the live site
// reads: it fetches #11's current Credit Analysis bytes through `netlify
// blobs:get` and checks their sha256 against the checksum on the live row.
// The CLI uses its own login; this script never reads or prints a token.
// Nothing is written, nothing is sent.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//        scripts/tmp/live-fix-2026-09-17/hole-1-probe.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";

const MAIN = "/Users/chrisstanbridge/Developer/fundhub-platform";
const OUT = "/tmp/live-fix-2026-09-17/hole-1";
const PREFIX = "netlify-blob://documents/";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};
mkdirSync(OUT, { recursive: true });

const c = await pool().connect();
const out = {};
try {
  await c.query("BEGIN READ ONLY");
  out.clients = (await c.query(
    `SELECT id, org_id, outcome_tier FROM clients WHERE id = ANY($1::uuid[])`,
    [Object.values(IDS)])).rows;
  out.deliverables = (await c.query(
    `SELECT client_id, subtype, document_key, mime_type, current_version, byte_size,
            generated_by, metadata->>'engine' AS engine
       FROM documents
      WHERE client_id = ANY($1::uuid[]) AND kind = 'deliverable'
      ORDER BY client_id, subtype`, [Object.values(IDS)])).rows;
  out.probeRow = (await c.query(
    `SELECT id, storage_key, checksum, mime_type, byte_size
       FROM documents
      WHERE client_id = $1 AND kind = 'deliverable' AND subtype = 'credit_analysis_report'`,
    [IDS.eleven])).rows[0] || null;
  out.triggers = (await c.query(
    `SELECT event_object_table, trigger_name, event_manipulation
       FROM information_schema.triggers
      WHERE event_object_table IN ('documents', 'document_versions')
      ORDER BY 1, 2, 3`)).rows;
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
  await close();
}

const row = out.probeRow;
if (!row?.storage_key?.startsWith(PREFIX)) {
  throw new Error(`probe row missing or not a netlify-blobs key: ${row?.storage_key ?? "none"}`);
}
const blobKey = row.storage_key.slice(PREFIX.length);
const file = `${OUT}/probe-11-credit-analysis.bin`;
execFileSync("netlify", ["blobs:get", "documents", blobKey, "--output", file], {
  cwd: MAIN, stdio: ["ignore", "ignore", "inherit"],
});
const bytes = readFileSync(file);
const got = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
out.probe = {
  blobKey,
  bytes: bytes.length,
  rowBytes: row.byte_size,
  checksumMatches: got === row.checksum,
};
writeFileSync(`${OUT}/probe.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  clients: out.clients,
  deliverableCounts: out.deliverables.reduce((m, d) => {
    m[d.client_id] = (m[d.client_id] || 0) + 1; return m;
  }, {}),
  triggers: out.triggers.map((t) => `${t.event_object_table}.${t.trigger_name}:${t.event_manipulation}`),
  probe: out.probe,
}, null, 2));
if (!out.probe.checksumMatches) {
  console.error("PROBE FAILED: the CLI store is not the store the live rows point at.");
  process.exitCode = 1;
}
