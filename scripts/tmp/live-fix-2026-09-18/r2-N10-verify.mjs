// N10 VERIFY — does the laptop sim tool (scripts/sim/push-credit.mjs) leave a
// practice pull with no identity row and no saved UnderwriteIQ pack?
//
// READ ONLY on live: one transaction, BEGIN READ ONLY, rolled back. Prints no
// street, ZIP, SSN, DOB, email or phone — only ids, names of Sim files, dates,
// counts and booleans.
//
// Part A (live rows): every client with a SIMULATED credit pull — was an
//   identity row there when the pull landed, and did an UnderwriteIQ pack land
//   with it (before any hand backfill)?
// Part B (this laptop): can the document store the tool's pack save uses be
//   opened from here at all? Opens the store only; writes nothing.
// Part C (this laptop): is PII_ENC_KEY usable, and does it read what the live
//   site wrote? Decrypts ONE sim row in memory; prints only true/false.
//
// Usage: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//          scripts/tmp/live-fix-2026-09-18/r2-N10-verify.mjs
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";
import { decryptSsn } from "../../../src/pii/index.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N10";
mkdirSync(OUT, { recursive: true });

const out = { at: new Date().toISOString() };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
try {
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  const sims = await q(`
    SELECT cr.client_id,
           min(cr.created_at) AS first_sim_pull_at,
           max(cr.created_at) AS last_sim_pull_at,
           count(*)::int AS sim_pulls
      FROM crs_results cr
     WHERE cr.result->>'environment' = 'simulated' OR cr.result->>'simulated' = 'true'
     GROUP BY cr.client_id
     ORDER BY min(cr.created_at)`);

  out.simulated_pull_clients = [];
  for (const s of sims) {
    const cl = (await q(`SELECT first_name, last_name, outcome_tier, is_demo,
                                custom_fields->>'funding_letters_delivered_event_id' AS stamp
                           FROM clients WHERE id = $1`, [s.client_id]))[0] || {};
    const pii = (await q(`SELECT created_at,
                                 jsonb_array_length(COALESCE(addresses,'[]'::jsonb)) AS n_addr,
                                 NULLIF(TRIM(COALESCE(addresses->0->>'addressLine1', addresses->0->>'address_line1', '')),'') IS NOT NULL AS has_street,
                                 ssn_enc IS NOT NULL AS has_ssn, dob IS NOT NULL AS has_dob
                            FROM pii_identity WHERE client_id = $1`, [s.client_id]))[0] || null;
    const docs = (await q(`SELECT generated_by, min(created_at) AS first_at, count(*)::int AS n
                             FROM documents WHERE client_id = $1 AND kind = 'deliverable'
                            GROUP BY generated_by ORDER BY 2`, [s.client_id]));
    const c06 = docs.filter((d) => d.generated_by === "c-06-crs-results-router");
    // A pack C-06 saved within 5 minutes of a sim pull is one the tool's own run produced.
    const packWithPull = (await q(`
      SELECT count(*)::int AS n FROM documents d
       WHERE d.client_id = $1 AND d.kind = 'deliverable' AND d.generated_by = 'c-06-crs-results-router'
         AND EXISTS (SELECT 1 FROM crs_results cr
                      WHERE cr.client_id = d.client_id
                        AND (cr.result->>'environment' = 'simulated' OR cr.result->>'simulated' = 'true')
                        AND d.created_at BETWEEN cr.created_at AND cr.created_at + interval '5 minutes')`,
      [s.client_id]))[0].n;
    const ac = (await q(`SELECT count(*)::int AS n FROM events
                          WHERE client_id = $1 AND name = 'analysis.completed'
                            AND payload->>'simulated' = 'true'`, [s.client_id]))[0].n;
    const dead = (await q(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'failed_events'`))[0].n
      ? (await q(`SELECT count(*)::int AS n FROM failed_events WHERE client_id = $1 AND event_name = 'analysis.completed'`, [s.client_id]))[0].n
      : null;
    out.simulated_pull_clients.push({
      client_id: s.client_id,
      name: [cl.first_name, cl.last_name].filter(Boolean).join(" "),
      outcome_tier: cl.outcome_tier ?? null,
      is_demo: cl.is_demo ?? null,
      sim_pulls: s.sim_pulls,
      first_sim_pull_at: s.first_sim_pull_at,
      identity_row: pii ? {
        created_at: pii.created_at,
        before_or_with_first_pull: new Date(pii.created_at) <= new Date(new Date(s.first_sim_pull_at).getTime() + 60_000),
        has_street: pii.has_street, n_addresses: pii.n_addr, has_ssn: pii.has_ssn, has_dob: pii.has_dob,
      } : null,
      deliverables_by_writer: docs,
      c06_pack_saved_within_5_min_of_a_sim_pull: packWithPull,
      c06_pack_total: c06.reduce((n, d) => n + d.n, 0),
      funding_letters_stamp_present: Boolean(cl.stamp),
      simulated_analysis_completed_events: ac,
      dead_letters_for_analysis_completed: dead,
    });
  }

  // Contrast: real (not simulated) pulls — identity row there?
  out.real_pulls = (await q(`
    SELECT count(DISTINCT cr.client_id)::int AS clients,
           count(DISTINCT cr.client_id) FILTER (WHERE p.client_id IS NOT NULL)::int AS with_identity_row
      FROM crs_results cr
      LEFT JOIN pii_identity p ON p.client_id = cr.client_id
     WHERE COALESCE(cr.result->>'environment','') <> 'simulated' AND COALESCE(cr.result->>'simulated','') <> 'true'`))[0];

  // Part C — does the laptop key read an SSN the LIVE site wrote? Pick one sim
  // client whose identity row was written by the real form (soft-pull consent on file).
  const probe = (await q(`
    SELECT p.client_id, p.ssn_enc FROM pii_identity p
      JOIN clients cl ON cl.id = p.client_id
     WHERE p.ssn_enc IS NOT NULL
       AND lower(cl.email) LIKE 'stanbridgejchris+sim-%'
       AND EXISTS (SELECT 1 FROM client_consents cc WHERE cc.client_id = p.client_id AND cc.kind = 'soft_pull_consent')
     ORDER BY p.created_at LIMIT 1`))[0];
  if (probe) {
    let ok = false;
    try { ok = typeof decryptSsn(probe.ssn_enc, { clientId: probe.client_id }) === "string"; } catch { ok = false; }
    out.laptop_pii_key_reads_live_ciphertext = ok;
    out.laptop_pii_key_probe_client = probe.client_id;
  } else {
    out.laptop_pii_key_reads_live_ciphertext = "no form-written sim row to test against";
  }
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}

// Part B — can the store be opened from here? Opening only; nothing is written.
out.document_store = { provider: process.env.DOCUMENT_STORE_PROVIDER || "memory (default)" };
try {
  const { getStore } = await import("@netlify/blobs");
  const name = process.env.NETLIFY_BLOBS_STORE || "documents";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  siteID && token ? getStore({ name, siteID, token }) : getStore(name);
  out.document_store.opens_from_this_machine = true;
} catch (e) {
  out.document_store.opens_from_this_machine = false;
  out.document_store.error = `${e?.name || "Error"}: ${String(e?.message || e).slice(0, 200)}`;
}

writeFileSync(`${OUT}/verify-live.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
