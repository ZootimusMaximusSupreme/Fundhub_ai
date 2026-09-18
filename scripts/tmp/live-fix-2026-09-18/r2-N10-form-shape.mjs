// N10 — what does the REAL form leave on a Sim file's identity row? The fixed
// tool must write the same thing, so measure it instead of guessing.
//
// READ ONLY on live (BEGIN READ ONLY, rolled back). For every Sim identity row
// whose client has a soft-pull consent (so the real form wrote it), compares the
// row with the sim identity file and with the simulated pull. Prints ONLY
// booleans, key names and counts — never an SSN, DOB, street or ZIP.
//
// Usage: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//          scripts/tmp/live-fix-2026-09-18/r2-N10-form-shape.mjs
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { decryptSsn } from "../../../src/pii/index.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N10";
const IDFILE = "/Users/chrisstanbridge/Developer/fundhub-platform/credentials/sim-identity/owner-identity.local.json";
mkdirSync(OUT, { recursive: true });
const id = JSON.parse(readFileSync(IDFILE, "utf8"));
const z5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);
const key = (a) => a ? [
  String(a.addressLine1 ?? a.line1 ?? "").toUpperCase().replace(/\s+/g, " ").trim(),
  String(a.city ?? "").toUpperCase().trim(),
  String(a.state ?? "").toUpperCase().trim(),
  z5(a.postalCode ?? a.postal_code ?? a.zip),
].join("|") : null;
const idKey = key(id.current_address);
const idSsn = String(id.ssn).replace(/\D/g, "");
const SIM_SSN_LAST4 = "4480"; // scripts/sim/push-credit.mjs SIM_SSN, a never-issued 666 number

const out = { at: new Date().toISOString(), rows: [] };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const rows = (await c.query(`
    SELECT p.client_id, cl.first_name, cl.last_name, p.created_at, p.ssn_enc, p.dob::text AS dob, p.addresses,
           EXISTS (SELECT 1 FROM client_consents cc WHERE cc.client_id = p.client_id AND cc.kind = 'soft_pull_consent') AS form_consent,
           (SELECT result FROM crs_results cr WHERE cr.client_id = p.client_id ORDER BY created_at DESC LIMIT 1) AS last_pull
      FROM pii_identity p JOIN clients cl ON cl.id = p.client_id
     WHERE lower(cl.email) LIKE 'stanbridgejchris+%'
     ORDER BY p.created_at`)).rows;
  for (const r of rows) {
    let ssn = null;
    try { ssn = r.ssn_enc ? decryptSsn(r.ssn_enc, { clientId: r.client_id }) : null; } catch { ssn = "undecryptable"; }
    const a0 = Array.isArray(r.addresses) ? r.addresses[0] : null;
    const rq = r.last_pull?.bureaus?.EX?.requestData || null;
    out.rows.push({
      client: `${r.first_name} ${r.last_name}`,
      client_id: r.client_id,
      written_by_real_form: r.form_consent,
      created_at: r.created_at,
      address_keys: a0 ? Object.keys(a0) : null,
      n_addresses: Array.isArray(r.addresses) ? r.addresses.length : null,
      address_equals_identity_file: a0 ? key(a0) === idKey : null,
      dob_equals_identity_file: r.dob ? r.dob.slice(0, 10) === String(id.dob).slice(0, 10) : null,
      ssn: ssn == null ? "none" : ssn === "undecryptable" ? "undecryptable" :
        ssn === idSsn ? "identity file SSN" : ssn.endsWith(SIM_SSN_LAST4) ? "push-credit SIM_SSN" : "other",
      last_pull_simulated: r.last_pull ? r.last_pull.simulated === true : null,
      last_pull_sent_address_equals_row: rq && a0 ? key(rq.addresses?.[0]) === key(a0) : null,
      last_pull_sent_dob_equals_row: rq && r.dob ? String(rq.birthDate).slice(0, 10) === r.dob.slice(0, 10) : null,
    });
  }
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
writeFileSync(`${OUT}/form-shape.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
