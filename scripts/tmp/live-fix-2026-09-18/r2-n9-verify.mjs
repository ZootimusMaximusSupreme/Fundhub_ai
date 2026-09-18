// N9 — "Funding letters are built with no home address on them". LOOK ONLY.
//
// Reads the live database inside BEGIN READ ONLY. Writes nothing, sends nothing,
// emits no event. Prints no name, street, ZIP, SSN or DOB — only whether a
// field is there.
//
// What it answers:
//   1. Where does the funding letter builder look for the home address, and is
//      it there? The builder (src/underwrite/letter-pack.mjs personalFromClient)
//      reads clients.custom_fields. The Repair desk and the real credit form use
//      pii_identity.addresses. Counted for every client with a credit file.
//   2. Funding letters already saved on live (documents subtype
//      funding_inquiry_removal / funding_personal_info): how many belong to a
//      client with no custom_fields address — i.e. were built with no home
//      address printed.
//   3. The Sim / test files named for this run, one line each.
//
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//        scripts/tmp/live-fix-2026-09-18/r2-n9-verify.mjs [tag]
import { mkdirSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";

const TAG = process.argv[2] || "verify";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N9";
mkdirSync(OUT, { recursive: true });

const SIMS = {
  "d682c13b-11f3-4bd5-a0c5-232b6a7875c4": "Sim Eight-Funding #8",
  "be3dcfd7-faae-4001-b97f-9bc30875bbcd": "Sim Nine-Repair #9",
  "22103bca-0ec9-4491-bb75-5d1b6528f116": "Ten-Trial #10",
  "029964c5-4d8e-47ed-88c9-53ac13863fd4": "Eleven-Blueprint #11",
  "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f": "Twelve-Academy #12",
  "7ccbeb76-df98-4125-8c14-0d1c9f5e3042": "Thirteen-NoBook #13",
  "567c12ce-64de-4043-aa98-d842434bd267": "Sim Combo-20260918",
  "ab277630-8309-4c02-b187-f244e7e369e8": "Walk1 Funding",
};

// The same custom_fields keys personalFromClient() reads for the street.
const CF_STREET = `NULLIF(TRIM(COALESCE(c.custom_fields->>'address', c.custom_fields->>'mailing_address',
                   c.custom_fields->>'street_address', c.custom_fields->>'address_line1', '')), '') IS NOT NULL`;
// The Repair desk's own rule, verbatim from src/repair/read-repair-signals.mjs ADDRESS_SQL.
const PII_STREET = `(p.addresses IS NOT NULL AND jsonb_typeof(p.addresses) = 'array'
                   AND jsonb_array_length(p.addresses) > 0
                   AND NULLIF(TRIM(COALESCE(p.addresses->0->>'address_line1', p.addresses->0->>'addressLine1',
                       p.addresses->0->>'line1', p.addresses->0->>'street', '')), '') IS NOT NULL)`;

const out = { at: new Date().toISOString(), tag: TAG, read_only: true };
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");

  out.population = (await c.query(`
    WITH w AS (
      SELECT c.id, COALESCE(c.is_demo, false) AS is_demo,
             ${CF_STREET} AS cf_addr,
             COALESCE(${PII_STREET}, false) AS pii_addr,
             (p.verified_address IS NOT NULL) AS verified_addr
        FROM clients c
        LEFT JOIN pii_identity p ON p.client_id = c.id AND p.org_id = c.org_id
       WHERE EXISTS (SELECT 1 FROM crs_results r WHERE r.client_id = c.id)
    )
    SELECT is_demo, cf_addr, pii_addr, count(*)::int AS clients,
           count(*) FILTER (WHERE verified_addr)::int AS with_verified_addr
      FROM w GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)).rows;

  out.saved_funding_letters = (await c.query(`
    SELECT COALESCE(c.is_demo, false) AS is_demo,
           ${CF_STREET} AS cf_addr,
           COALESCE(${PII_STREET}, false) AS pii_addr,
           d.subtype,
           count(*)::int AS documents,
           count(DISTINCT d.client_id)::int AS clients
      FROM documents d
      JOIN clients c ON c.id = d.client_id
      LEFT JOIN pii_identity p ON p.client_id = c.id AND p.org_id = c.org_id
     WHERE d.subtype IN ('funding_inquiry_removal', 'funding_personal_info')
     GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`)).rows;

  // Address key names used on live (names only, never values).
  out.pii_address_keys = (await c.query(`
    SELECT k, count(*)::int AS n
      FROM pii_identity p, jsonb_object_keys(CASE WHEN jsonb_typeof(p.addresses->0) = 'object'
                                                 THEN p.addresses->0 ELSE '{}'::jsonb END) AS k
     GROUP BY k ORDER BY n DESC`)).rows;

  const sims = (await c.query(`
    SELECT c.id, c.outcome_tier, COALESCE(c.is_demo, false) AS is_demo,
           ${CF_STREET} AS cf_addr,
           COALESCE(${PII_STREET}, false) AS pii_addr,
           (p.verified_address IS NOT NULL) AS verified_addr,
           (NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') IS NOT NULL) AS has_name,
           EXISTS (SELECT 1 FROM crs_results r WHERE r.client_id = c.id) AS has_crs,
           (SELECT count(*)::int FROM documents d WHERE d.client_id = c.id
              AND d.subtype IN ('funding_inquiry_removal', 'funding_personal_info')) AS funding_letters_saved,
           (SELECT count(*)::int FROM documents d WHERE d.client_id = c.id
              AND d.subtype IN ('funding_inquiry_removal', 'funding_personal_info')
              AND d.generated_by IS NOT NULL) AS funding_letters_generated
      FROM clients c
      LEFT JOIN pii_identity p ON p.client_id = c.id AND p.org_id = c.org_id
     WHERE c.id = ANY($1::uuid[])`, [Object.keys(SIMS)])).rows;
  out.sims = sims.map((r) => ({ label: SIMS[r.id], ...r }));

  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
  await close();
}
writeFileSync(`${OUT}/${TAG}-db.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
