// N10 (round b) — SCRATCH proof of the fixed scripts/sim/push-credit.mjs, real
// runs (not --dry), end to end, against a LOCAL scratch Postgres and a LOCAL
// Netlify Blobs server. Nothing here can reach live: it refuses any DATABASE_URL
// that is not 127.0.0.1/localhost, the tool is spawned with a hand-built env (no
// .env, no INNGEST_EVENT_KEY, no provider keys), and the PII key is a throwaway
// generated for this run.
//
// What it proves, one run each:
//   R1 funding, no identity row, netlify-blobs with no site id/token (the laptop)
//        → STOP, exit 1, not one row written.
//   R2 funding, no identity row, memory store (scripts/sim/with-prod-env.sh)
//        → STOP, exit 1, not one row written.
//   R3 funding, no identity row, store reachable, --dry
//        → exit 0, says it would save address + DOB + SSN, not one row written.
//   R4 funding, no identity row, store reachable (real run)
//        → identity row in the soft-pull form's shape (SSN decrypts to the
//          never-issued SIM_SSN, DOB + address = the identity file), C-06 pack
//          stored in the blobs server, stamp = this pull's analysis.completed id,
//          exit 0.
//   R5 funding, address-only identity row, store opens but refuses writes
//        (wrong token) → DOB + SSN filled, address left exactly as it was,
//          FAILED, exit 1, no stamp.
//   R6 repair, no identity row, memory store → identity saved, no pack owed, exit 0.
//   R7 repair again on the same client → identity left as is (byte-identical).
//
// Usage:
//   SCRATCH_DATABASE_URL=postgres://postgres:…@127.0.0.1:55477/fundhub_n10 \
//     node scripts/tmp/live-fix-2026-09-18/r2-N10b-scratch.mjs
import pg from "pg";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { BlobsServer } from "@netlify/blobs/server";
import { storeIdentity, decryptSsn } from "../../../src/pii/index.mjs";

const URL_ = process.env.SCRATCH_DATABASE_URL || "";
const host = (() => { try { return new URL(URL_).hostname; } catch { return ""; } })();
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error("refusing: SCRATCH_DATABASE_URL must point at 127.0.0.1 or localhost");
  process.exit(2);
}

const ROOT = new URL("../../../", import.meta.url).pathname;
const TOOL = new URL("../../sim/push-credit.mjs", import.meta.url).pathname;
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N10";
const SCRATCH = process.env.N10_SCRATCH_DIR || "/tmp/n10-scratch";
mkdirSync(OUT, { recursive: true });
const BLOB_DIR = `${SCRATCH}/blobs-${Date.now()}`;
mkdirSync(BLOB_DIR, { recursive: true });

const IDFILE = JSON.parse(readFileSync(new URL("../../../credentials/sim-identity/owner-identity.local.json", import.meta.url), "utf8"));
const PII_KEY = crypto.randomBytes(32).toString("base64"); // throwaway, this run only
const SIM_SSN = "666154480"; // scripts/sim/push-credit.mjs SIM_SSN — a never-issued number
const RUN = Date.now().toString(36);

/* A local Netlify Blobs server. The tool reaches it through NETLIFY_BLOBS_CONTEXT —
   the same channel a deployed Netlify function is handed — so the document store
   code runs unchanged. */
const TOKEN = "scratch-blobs-token";
const server = new BlobsServer({ directory: BLOB_DIR, token: TOKEN, port: 0 });
const { port } = await server.start();
const ctx = (token) => Buffer.from(JSON.stringify({ siteID: "scratch-site", token, edgeURL: `http://127.0.0.1:${port}` })).toString("base64");

const db = new pg.Client({ connectionString: URL_ });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const org = (await q(`SELECT id FROM orgs WHERE slug = 'default' LIMIT 1`))[0]?.id
  || (await q(`SELECT id FROM orgs ORDER BY created_at LIMIT 1`))[0].id;

async function newClient(tag) {
  const email = `n10-${tag}-${RUN}@example.test`;
  const id = (await q(
    `INSERT INTO clients (org_id, first_name, last_name, email) VALUES ($1, $2, $3, $4) RETURNING id`,
    [org, "N10", `Scratch ${tag}`, email]))[0].id;
  return { id, email };
}

async function snap(clientId) {
  const r = (await q(`
    SELECT (SELECT count(*)::int FROM crs_results WHERE client_id = $1) AS crs_rows,
           (SELECT count(*)::int FROM events WHERE client_id = $1) AS events,
           (SELECT count(*)::int FROM documents WHERE client_id = $1 AND kind = 'deliverable') AS deliverables,
           (SELECT count(*)::int FROM documents WHERE client_id = $1 AND kind = 'deliverable' AND generated_by = 'c-06-crs-results-router') AS c06_files,
           (SELECT custom_fields->>'funding_letters_delivered_event_id' FROM clients WHERE id = $1) AS stamp,
           (SELECT md5(COALESCE(ssn_enc::text,'') || COALESCE(dob::text,'') || COALESCE(addresses::text,'') || updated_at::text)
              FROM pii_identity WHERE client_id = $1) AS identity_fingerprint`, [clientId]))[0];
  const idRow = (await q(`SELECT ssn_enc, dob::text AS dob, addresses FROM pii_identity WHERE client_id = $1`, [clientId]))[0] || null;
  let identity = null;
  if (idRow) {
    const a0 = Array.isArray(idRow.addresses) ? idRow.addresses[0] : null;
    let ssn = null;
    try { ssn = idRow.ssn_enc ? decryptSsn(idRow.ssn_enc, { clientId, env: { PII_ENC_KEY: PII_KEY } }) : null; } catch { ssn = "undecryptable"; }
    identity = {
      n_addresses: Array.isArray(idRow.addresses) ? idRow.addresses.length : null,
      first_address_keys: a0 ? Object.keys(a0).sort() : null,
      first_address_is_identity_file: a0 ? (
        a0.addressLine1 === String(IDFILE.current_address.line1).trim()
        && a0.city === String(IDFILE.current_address.city).trim()
        && a0.state === String(IDFILE.current_address.state).trim().toUpperCase()
        && a0.postalCode === String(IDFILE.current_address.postal_code).trim()) : null,
      dob_is_identity_file: idRow.dob ? idRow.dob.slice(0, 10) === String(IDFILE.dob).slice(0, 10) : null,
      ssn: ssn == null ? "none" : ssn === SIM_SSN ? "SIM_SSN (never-issued 666)" : ssn === "undecryptable" ? "undecryptable" : "other",
    };
  }
  const analysis = (await q(`SELECT id FROM events WHERE client_id = $1 AND name = 'analysis.completed' ORDER BY created_at DESC LIMIT 1`, [clientId]))[0]?.id || null;
  return { ...r, identity, stamp_is_latest_analysis_event: Boolean(r.stamp) && r.stamp === analysis };
}

function runTool(args, extraEnv) {
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, TZ: "America/Phoenix",
    DATABASE_URL: URL_, PII_ENC_KEY: PII_KEY, ...extraEnv,
  };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TOOL, ...args], { cwd: ROOT, env });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const t = setTimeout(() => child.kill("SIGKILL"), 240_000);
    child.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

// Lines the tool prints that name the identity file's person are dropped from
// the saved evidence; nothing else it prints carries identity data.
const clean = (s) => s.split("\n").filter(Boolean).filter((l) => !/identity file says/.test(l));

const blobFiles = () => {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = `${d}/${n}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
  return walk(BLOB_DIR).filter((p) => !p.includes("/metadata/")).length;
};

const report = { at: new Date().toISOString(), database: `${host}:${new URL(URL_).port}${new URL(URL_).pathname}`, runs: [] };
async function step(label, client, args, env, expect) {
  const before = await snap(client.id);
  const blobsBefore = blobFiles();
  const r = await runTool(["--email", client.email, ...args], env);
  const after = await snap(client.id);
  const row = {
    label, expect, args: args.join(" "), exit_code: r.code,
    before, after, blob_files_added: blobFiles() - blobsBefore,
    stdout: clean(r.out), stderr: clean(r.err).filter((l) => !/^\s+at /.test(l)).slice(0, 40),
  };
  report.runs.push(row);
  console.log(`\n=== ${label} — exit ${r.code}`);
  console.log(`    expect: ${expect}`);
  for (const l of row.stdout.filter((l) => /^(identity|pack|tier|written|dry run|FAILED|STOP)/.test(l.trim()))) console.log(`    ${l}`);
  for (const l of row.stderr.slice(0, 6)) console.log(`    [stderr] ${l.slice(0, 260)}`);
  console.log(`    before: ${JSON.stringify({ ...before, identity_fingerprint: undefined })}`);
  console.log(`    after:  ${JSON.stringify({ ...after, identity_fingerprint: undefined })}`);
  console.log(`    identity row byte-identical: ${before.identity_fingerprint === after.identity_fingerprint} · blob files added: ${row.blob_files_added}`);
  return row;
}

try {
  const noId = await newClient("noid-funding");
  const addrOnly = await newClient("addronly-funding");
  const repair = await newClient("noid-repair");
  // Combo's shape: a hand-made address-only row (no SSN, no DOB). Made-up address.
  await storeIdentity(db, {
    orgId: org, clientId: addrOnly.id, ssn: null, dob: null,
    addresses: [{ addressLine1: "9 Scratch Rd", city: "Mesa", state: "AZ", postalCode: "85201" }],
    env: { PII_ENC_KEY: PII_KEY },
  });

  const blobsOk = { DOCUMENT_STORE_PROVIDER: "netlify-blobs", NETLIFY_BLOBS_CONTEXT: ctx(TOKEN) };
  await step("R1 laptop store (netlify-blobs, no site id/token), funding, no identity row", noId,
    ["--profile", "fundable"], { DOCUMENT_STORE_PROVIDER: "netlify-blobs" }, "STOP, exit 1, nothing written");
  await step("R2 memory store (with-prod-env.sh), funding, no identity row", noId,
    ["--profile", "fundable"], {}, "STOP, exit 1, nothing written");
  await step("R3 store reachable, funding, no identity row, --dry", noId,
    ["--profile", "fundable", "--dry"], blobsOk, "exit 0, would save address + DOB + SSN, nothing written");
  await step("R4 store reachable, funding, no identity row, REAL run", noId,
    ["--profile", "fundable"], blobsOk, "identity row saved in form shape, pack stored, stamp = this pull, exit 0");
  await step("R5 store opens but refuses writes (wrong token), funding, address-only row", addrOnly,
    ["--profile", "fundable"], { DOCUMENT_STORE_PROVIDER: "netlify-blobs", NETLIFY_BLOBS_CONTEXT: ctx("wrong-token") },
    "DOB + SSN filled, address untouched, FAILED, exit 1, no stamp");
  await step("R6 repair, no identity row, memory store", repair,
    ["--profile", "repair-full"], {}, "identity saved, no pack owed, exit 0");
  await step("R7 repair again, same client", repair,
    ["--profile", "repair-full"], {}, "identity left as is (byte-identical), exit 0");
} finally {
  await db.end();
  await server.stop();
}

writeFileSync(`${OUT}/scratch-run.json`, JSON.stringify(report, null, 2));
console.log(`\nsaved ${OUT}/scratch-run.json`);
