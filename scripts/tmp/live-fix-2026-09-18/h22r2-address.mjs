// HOLE 22 ROUND 2 — put the address Combo's credit pull was sent with onto
// Combo's identity record, where the Repair desk reads "address on file".
//
// WHY THIS IS A DATA FIX, NOT A CODE FIX
//   The desk reads pii_identity.addresses[0] (src/repair/read-repair-signals.mjs
//   ADDRESS_SQL). The real client path — the soft-pull form, api/soft-pull-approve.mjs
//   — refuses to go on without street, city, state and ZIP and saves them there
//   as [{addressLine1, city, state, postalCode}] through storeIdentity(). A real
//   production pull then reads the address back FROM that row
//   (src/finance/crs-pull.mjs loadClientIdentity), so in the product a pull's
//   address cannot exist without the identity address. Live proof: see
//   docs/workflows/live-prove-2026-09-17-evidence/hole-22/round2/provenance.json
//   and formcheck.json.
//
//   Combo never went through that form. Its pull is the laptop sim tool
//   (scripts/sim/push-credit.mjs, stamped "SIMULATED — fulfillment walkthrough.
//   Not a bureau pull."), which writes the sim identity address into the pull
//   but never writes an identity row. So Combo is test data missing the row the
//   form would have written.
//
// WHAT IT WRITES
//   One pii_identity row for Combo, through the same storeIdentity() the form
//   calls, with the same address shape the form writes. The address is copied
//   verbatim from what Combo's pull SENT (result.bureaus.*.requestData.addresses[0]),
//   never from what a bureau returned, and only if all three bureaus were sent the
//   same one. No SSN, no date of birth — address only.
//
// GUARDS
//   Refuses if Combo already has an identity row (never overwrites, never
//   deletes). One transaction; dry run rolls back. Sends nothing, emits no event,
//   builds no letter. Prints no street and no ZIP — only whether they are there.
//
// Run (dry):   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//                scripts/tmp/live-fix-2026-09-18/h22r2-address.mjs
// Run (write): same, plus --write
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { storeIdentity } from "../../../src/pii/index.mjs";

const WRITE = process.argv.includes("--write");
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const CRS_ROW = "6adb7b98-d1c8-45b7-aac5-ca8aa2be50bc";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/round2";
const IDFILE = "/Users/chrisstanbridge/Developer/fundhub-platform/credentials/sim-identity/owner-identity.local.json";
mkdirSync(OUT, { recursive: true });

const z5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);
const key = (a) => a ? [
  String(a.addressLine1 ?? a.line1 ?? "").toUpperCase().replace(/\s+/g, " ").trim(),
  String(a.city ?? "").toUpperCase().trim(),
  String(a.state ?? "").toUpperCase().trim(),
  z5(a.postalCode ?? a.postal_code ?? a.zip),
].join("|") : null;

// The desk's own check, verbatim from src/repair/read-repair-signals.mjs ADDRESS_SQL.
const DESK_SQL = `
  SELECT (
           addresses IS NOT NULL
           AND jsonb_typeof(addresses) = 'array'
           AND jsonb_array_length(addresses) > 0
           AND NULLIF(TRIM(COALESCE(
                 addresses->0->>'address_line1',
                 addresses->0->>'addressLine1',
                 addresses->0->>'line1',
                 addresses->0->>'street',
                 ''
               )), '') IS NOT NULL
         ) AS address_ok
    FROM pii_identity
   WHERE org_id = $1::uuid AND client_id = $2::uuid`;

const describe = async (db, orgId) => {
  const row = (await db.query(
    `SELECT created_at, updated_at, jsonb_array_length(addresses) AS n_addresses,
            (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(COALESCE(addresses->0,'{}'::jsonb)) k) AS keys,
            NULLIF(TRIM(addresses->0->>'addressLine1'),'') IS NOT NULL AS has_street,
            addresses->0->>'city' AS city, addresses->0->>'state' AS state,
            (addresses->0->>'postalCode') ~ '^[0-9]{5}$' AS zip_5_digits,
            ssn_enc IS NOT NULL AS has_ssn, dob IS NOT NULL AS has_dob
       FROM pii_identity WHERE client_id = $1`, [COMBO])).rows[0] || null;
  const desk = (await db.query(DESK_SQL, [orgId, COMBO])).rows[0];
  return { identity_row: row, desk_address_ok: desk ? desk.address_ok === true : false };
};

const out = { at: new Date().toISOString(), mode: WRITE ? "write" : "dry" };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN");
try {
  const client = (await c.query(`SELECT id, org_id, first_name, last_name FROM clients WHERE id = $1`, [COMBO])).rows[0];
  if (!client) throw new Error("Combo not found");
  const orgId = client.org_id;
  out.client = `${client.first_name} ${client.last_name}`;

  const existing = (await c.query(`SELECT count(*)::int n FROM pii_identity WHERE client_id = $1`, [COMBO])).rows[0].n;
  if (existing !== 0) throw new Error(`Combo already has ${existing} identity row(s) — refusing to overwrite`);
  out.before = await describe(c, orgId);

  // The address the pull was SENT with — requestData, not the returned file.
  const crs = (await c.query(`SELECT id, client_id, created_at, result FROM crs_results WHERE id = $1`, [CRS_ROW])).rows[0];
  if (!crs || crs.client_id !== COMBO) throw new Error("Combo's credit pull row not found");
  const sent = ["EX", "EQ", "TU"].map((b) => crs.result?.bureaus?.[b]?.requestData?.addresses?.[0] || null);
  if (sent.some((a) => !a)) throw new Error("a bureau on Combo's pull carries no sent address");
  const keys = new Set(sent.map(key));
  if (keys.size !== 1) throw new Error("the three bureaus were sent different addresses — refusing to pick one");
  const src = sent[0];
  const addr = {
    addressLine1: String(src.addressLine1 || "").trim(),
    city: String(src.city || "").trim(),
    state: String(src.state || "").trim().toUpperCase(),
    postalCode: String(src.postalCode || "").trim(),
  };
  // The form's own validation (api/soft-pull-approve.mjs): all four present, 2-letter state.
  if (!addr.addressLine1 || !addr.city || !/^[A-Z]{2}$/.test(addr.state) || !addr.postalCode) {
    throw new Error("the sent address is incomplete — the form would have refused it");
  }
  let sameAsSimIdentityFile = null;
  try { sameAsSimIdentityFile = key(addr) === key(JSON.parse(readFileSync(IDFILE, "utf8")).current_address); } catch { /* not required */ }
  out.source = {
    crs_result_id: crs.id,
    crs_created_at: crs.created_at,
    environment: crs.result?.environment,
    simulated: crs.result?.simulated,
    field: "result.bureaus.{EX,EQ,TU}.requestData.addresses[0] (what the pull SENT)",
    all_three_bureaus_sent_same_address: true,
    sent_equals_returned_file_on_all_three: ["EX", "EQ", "TU"].every((b) => key(crs.result.bureaus[b].requestData.addresses[0]) === key(crs.result.bureaus[b].creditFiles?.[0]?.addresses?.[0])),
    same_as_sim_identity_file_current_address: sameAsSimIdentityFile,
    has_street: Boolean(addr.addressLine1),
    city_state: `${addr.city}, ${addr.state}`,
    zip_5_digits: /^\d{5}$/.test(addr.postalCode),
    shape_written: Object.keys(addr),
  };

  await storeIdentity(c, { orgId, clientId: COMBO, ssn: null, dob: null, addresses: [addr] });
  out.after = await describe(c, orgId);

  if (WRITE) { await c.query("COMMIT"); out.committed = true; }
  else { await c.query("ROLLBACK"); out.committed = false; }
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  out.error = e.message;
  out.committed = false;
} finally {
  await c.end();
}
writeFileSync(`${OUT}/address-fix-${WRITE ? "write" : "dry"}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (out.error) process.exit(1);
