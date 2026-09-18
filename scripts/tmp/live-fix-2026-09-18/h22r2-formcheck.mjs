// Hole 22 round 2 — two read-only checks before any write.
//  1. The one non-test client whose pull went to the production bureau: did its
//     identity come in through the client soft-pull form (consent + identity in
//     the same request, form address shape), and not a staff/tool write?
//  2. pii_identity write rules on live: unique key on client_id, row-level
//     security, which role this connection is. No values printed.
// READ ONLY (BEGIN READ ONLY, rolled back).
import pg from "pg";
import { writeFileSync } from "node:fs";

const REAL = "e42c11e8-ec33-40b7-ac5a-99f733d18a3f";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/round2";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const out = { at: new Date().toISOString() };
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'client_consents'`)).map((r) => r.column_name);
  out.consentCols = cols;
  const pick = ["granted_by_kind", "granted_by_account_id", "granted_by_staff_id", "capture_method", "consent_version", "granted_at"].filter((k) => cols.includes(k));
  out.realClient = {
    consents: await q(`SELECT ${pick.join(", ")} FROM client_consents WHERE client_id = $1 ORDER BY granted_at`, [REAL]),
    account_kinds: await q(`SELECT kind, created_at FROM accounts WHERE client_id = $1`, [REAL]),
    businesses_from_form: (await q(`SELECT count(*)::int n FROM businesses WHERE client_id = $1 AND entity_data->>'source' = 'soft_pull_approve'`, [REAL]))[0].n,
    soft_pull_requests: await q(`SELECT status, requested_by_kind, created_at FROM soft_pull_requests WHERE client_id = $1 ORDER BY created_at`, [REAL]),
    identity: (await q(`SELECT created_at, updated_at, jsonb_array_length(addresses) AS n_addresses,
                               (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(addresses->0) k) AS keys,
                               ssn_enc IS NOT NULL AS has_ssn, dob IS NOT NULL AS has_dob
                          FROM pii_identity WHERE client_id = $1`, [REAL]))[0] || null,
  };
  out.piiRules = {
    current_user: (await q(`SELECT current_user AS u`))[0].u,
    unique_on_client_id: (await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'pii_identity'`)).map((r) => r.indexdef),
    rls: (await q(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'pii_identity'`))[0],
    policies: (await q(`SELECT policyname, cmd, roles::text FROM pg_policies WHERE tablename = 'pii_identity'`)),
    triggers: (await q(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'pii_identity'::regclass AND NOT tgisinternal`)).map((r) => r.tgname),
  };
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
writeFileSync(`${OUT}/formcheck.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
