// Hole 22 round 2 — WHERE did the address on Combo's credit pull come from, and
// does the real client path save a pull address where the Repair desk reads it?
// READ ONLY: one transaction, BEGIN READ ONLY, rolled back. Prints no street, no
// ZIP, no SSN, no email — only booleans, counts, ids, dates.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h22r2-provenance.mjs
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/round2";
mkdirSync(OUT, { recursive: true });
const IDFILE = "/Users/chrisstanbridge/Developer/fundhub-platform/credentials/sim-identity/owner-identity.local.json";

// Normalised "same address" key: street + city + state + 5-digit ZIP, upper-cased.
const z5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);
const key = (a) => a ? [
  String(a.addressLine1 ?? a.address_line1 ?? a.line1 ?? a.street ?? "").toUpperCase().replace(/\s+/g, " ").trim(),
  String(a.city ?? "").toUpperCase().trim(),
  String(a.state ?? "").toUpperCase().trim(),
  z5(a.postalCode ?? a.postal_code ?? a.zip),
].join("|") : null;

let ownerKey = null;
try {
  const id = JSON.parse(readFileSync(IDFILE, "utf8"));
  ownerKey = key(id.current_address);
} catch { ownerKey = null; }

const out = { at: new Date().toISOString(), ownerIdentityFileRead: Boolean(ownerKey) };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  // ---- 1. Combo's own rows ----
  const cl = (await q(`SELECT first_name, last_name, created_at FROM clients WHERE id = $1`, [COMBO]))[0];
  const fullUpper = [cl.first_name, cl.last_name].filter(Boolean).join(" ").toUpperCase();
  const crs = await q(`SELECT id, created_at, result FROM crs_results WHERE client_id = $1 ORDER BY created_at`, [COMBO]);
  out.combo = {
    name: [cl.first_name, cl.last_name].join(" "),
    created_at: cl.created_at,
    pii_identity_rows: (await q(`SELECT count(*)::int n FROM pii_identity WHERE client_id = $1`, [COMBO]))[0].n,
    soft_pull_requests: await q(`SELECT status, requested_by_kind, created_at FROM soft_pull_requests WHERE client_id = $1 ORDER BY created_at`, [COMBO]),
    soft_pull_consents: (await q(`SELECT count(*)::int n FROM client_consents WHERE client_id = $1 AND kind = 'soft_pull_consent'`, [COMBO]))[0].n,
    businesses_from_soft_pull_form: (await q(`SELECT count(*)::int n FROM businesses WHERE client_id = $1 AND entity_data->>'source' = 'soft_pull_approve'`, [COMBO]))[0].n,
    crs_results: crs.map((r) => {
      const b = r.result?.bureaus || {};
      const per = Object.fromEntries(Object.entries(b).map(([code, v]) => {
        const rq = v?.requestData?.addresses?.[0];
        const fl = v?.creditFiles?.[0]?.addresses?.[0];
        const nm = [v?.requestData?.firstName, v?.requestData?.lastName].filter(Boolean).join(" ");
        return [code, {
          request_name_is_combo: nm === fullUpper,
          request_has_street: Boolean(rq?.addressLine1),
          request_zip_5_digits: /^\d{5}$/.test(String(rq?.postalCode ?? "")),
          request_city_state: rq ? `${rq.city}, ${rq.state}` : null,
          request_equals_file: key(rq) === key(fl),
          request_equals_owner_identity_file: ownerKey ? key(rq) === ownerKey : null,
          requesting_party: v?.responseDetail?.requestingParty?.name ?? null,
        }];
      }));
      return {
        id: r.id, created_at: r.created_at,
        environment: r.result?.environment ?? null,
        simulated: r.result?.simulated ?? null,
        pulledAt: r.result?.pulledAt ?? null,
        per_bureau: per,
      };
    }),
    events_carrying_request_address: (await q(
      `SELECT name, created_at, payload->>'source' AS source
         FROM events WHERE client_id = $1
          AND jsonb_path_exists(payload, '$.**.requestData.addresses[0].addressLine1')
        ORDER BY created_at`, [COMBO])),
  };

  // ---- 2. Every client whose pull used the owner's address (sim files) ----
  const allCrs = await q(`
    SELECT r.client_id, c.first_name, c.last_name, r.created_at,
           r.result->>'environment' AS environment,
           r.result->'bureaus'->'EX'->'requestData'->'addresses'->0 AS ex_addr,
           r.result->'bureaus'->'EQ'->'requestData'->'addresses'->0 AS eq_addr,
           r.result->'bureaus'->'TU'->'requestData'->'addresses'->0 AS tu_addr
      FROM crs_results r JOIN clients c ON c.id = r.client_id`);
  const ownerPulls = allCrs.filter((r) => ownerKey && [r.ex_addr, r.eq_addr, r.tu_addr].some((a) => key(a) === ownerKey));
  const piiAll = await q(`
    SELECT p.client_id, c.first_name, c.last_name, p.created_at, p.updated_at,
           p.addresses->0 AS a0,
           (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(COALESCE(p.addresses->0,'{}'::jsonb)) k) AS a0_keys
      FROM pii_identity p JOIN clients c ON c.id = p.client_id`);
  const ownerPii = piiAll.filter((p) => ownerKey && key(p.a0) === ownerKey);
  out.simOwnerAddress = {
    crs_results_total: allCrs.length,
    crs_results_sent_owner_address: ownerPulls.length,
    clients_whose_pull_sent_owner_address: [...new Map(ownerPulls.map((r) => [r.client_id, `${r.first_name} ${r.last_name} (${r.environment})`])).values()],
    pii_identity_rows_total: piiAll.length,
    pii_identity_rows_holding_owner_address: ownerPii.map((p) => ({ client: `${p.first_name} ${p.last_name}`, keys: p.a0_keys })),
  };

  // ---- 3. The real soft-pull form path: consent + identity written together ----
  const formRows = await q(`
    SELECT cc.client_id, c.first_name, c.last_name, cc.granted_at, cc.capture_method,
           p.created_at AS pii_created, p.updated_at AS pii_updated,
           (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(COALESCE(p.addresses->0,'{}'::jsonb)) k) AS a0_keys,
           (p.addresses IS NOT NULL AND jsonb_typeof(p.addresses) = 'array' AND jsonb_array_length(p.addresses) > 0
            AND NULLIF(TRIM(COALESCE(p.addresses->0->>'address_line1', p.addresses->0->>'addressLine1',
                 p.addresses->0->>'line1', p.addresses->0->>'street','')),'') IS NOT NULL) AS desk_address_ok,
           (c.email ILIKE '%+sim%' OR c.email ILIKE '%e2e%') AS test_email
      FROM client_consents cc
      JOIN clients c ON c.id = cc.client_id
      LEFT JOIN pii_identity p ON p.client_id = cc.client_id
     WHERE cc.kind = 'soft_pull_consent'
     ORDER BY cc.granted_at`);
  out.softPullForm = formRows.map((r) => {
    const p = piiAll.find((x) => x.client_id === r.client_id);
    return {
      client_id: r.client_id,
      client: r.test_email ? `${r.first_name} ${r.last_name}` : "(not a sim email — name withheld)",
      consent_at: r.granted_at, capture_method: r.capture_method,
      identity_created: r.pii_created,
      seconds_consent_after_identity: r.pii_created ? Math.round((new Date(r.granted_at) - new Date(r.pii_created)) / 1000) : null,
      address_keys: r.a0_keys, desk_address_ok: r.desk_address_ok,
      holds_owner_address: ownerKey && p ? key(p.a0) === ownerKey : null,
    };
  });
  // Did any stored pull send exactly the address held on that client's identity row?
  const piiBy = new Map(piiAll.map((p) => [p.client_id, key(p.a0)]));
  const testIds = new Set((await q(
    `SELECT id FROM clients WHERE email ILIKE '%+sim%' OR email ILIKE '%e2e%' OR first_name ILIKE 'sim' OR first_name ILIKE 'walk%'`)).map((r) => r.id));
  out.pullsSentIdentityAddress = allCrs
    .filter((r) => piiBy.get(r.client_id) && [r.ex_addr, r.eq_addr, r.tu_addr].some((a) => a && key(a) === piiBy.get(r.client_id)))
    .map((r) => ({
      client_id: r.client_id,
      client: testIds.has(r.client_id) ? `${r.first_name} ${r.last_name}` : "(not a test client — name withheld)",
      environment: r.environment, at: r.created_at,
    }));
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
writeFileSync(`${OUT}/provenance.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
