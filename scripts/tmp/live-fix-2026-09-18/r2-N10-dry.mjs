// N10 PROVE — run the FIXED scripts/sim/push-credit.mjs with --dry against live
// for three Sim files, and save what it says. A dry run writes nothing: the tool
// only reads (client, prior pulls, identity row) and runs the tier engine in memory.
//
//   #13 Sim Thirteen-NoBook  (funding, NO identity row)       → must say it would save
//        address, date of birth and SSN, and STOP because the laptop cannot save the pack
//   Combo                    (funding, address-only row)      → would fill date of birth + SSN, STOP on the pack
//   #9 Sim Nine-Repair       (repair, full form-written row)  → identity left as is, no pack owed, dry run ok
//
// Emails are looked up by client id (read only) and masked in everything saved
// or printed. Also snapshots the three identity rows and the crs/doc counts
// before and after, to prove the dry run changed nothing.
//
// Usage: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//          scripts/tmp/live-fix-2026-09-18/r2-N10-dry.mjs
import pg from "pg";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N10";
const ENV_FILE = "/Users/chrisstanbridge/Developer/fundhub-platform/.env";
const TOOL = new URL("../../sim/push-credit.mjs", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const RUNS = [
  { label: "#13 Sim Thirteen-NoBook", id: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042", profile: "fundable" },
  { label: "Sim Combo-20260918", id: "567c12ce-64de-4043-aa98-d842434bd267", profile: "fundable" },
  { label: "#9 Sim Nine-Repair", id: "be3dcfd7-faae-4001-b97f-9bc30875bbcd", profile: "repair-full" },
];

async function snapshot() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  try {
    const out = {};
    for (const r of RUNS) {
      const row = (await c.query(`
        SELECT cl.email,
               (SELECT count(*)::int FROM crs_results WHERE client_id = cl.id) AS crs_rows,
               (SELECT count(*)::int FROM documents WHERE client_id = cl.id) AS documents,
               (SELECT count(*)::int FROM events WHERE client_id = cl.id) AS events,
               (SELECT md5(COALESCE(p.ssn_enc::text,'') || COALESCE(p.dob::text,'') || COALESCE(p.addresses::text,'') || p.updated_at::text)
                  FROM pii_identity p WHERE p.client_id = cl.id) AS identity_fingerprint,
               (SELECT json_build_object('has_street', NULLIF(TRIM(p.addresses->0->>'addressLine1'),'') IS NOT NULL,
                                         'has_dob', p.dob IS NOT NULL, 'has_ssn', p.ssn_enc IS NOT NULL)
                  FROM pii_identity p WHERE p.client_id = cl.id) AS identity
          FROM clients cl WHERE cl.id = $1`, [r.id])).rows[0];
      r.email = row.email;
      const { email, ...rest } = row;
      void email;
      out[r.label] = rest;
    }
    return out;
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
}

const mask = (s) => RUNS.reduce((t, r) => (r.email ? t.split(r.email).join("<sim inbox>") : t), s);

const report = { at: new Date().toISOString(), tool: "scripts/sim/push-credit.mjs --dry", before: await snapshot(), runs: [] };
for (const r of RUNS) {
  const res = spawnSync(process.execPath, [`--env-file=${ENV_FILE}`, TOOL, "--email", r.email, "--profile", r.profile, "--dry"], {
    encoding: "utf8", timeout: 120_000,
  });
  report.runs.push({
    label: r.label, client_id: r.id, profile: r.profile, exit_code: res.status,
    stdout: mask(res.stdout || "").split("\n").filter(Boolean),
    stderr: mask(res.stderr || "").split("\n").filter(Boolean),
  });
}
report.after = await snapshot();
report.nothing_changed = JSON.stringify(report.before) === JSON.stringify(report.after);

writeFileSync(`${OUT}/dry-run.json`, JSON.stringify(report, null, 2));
for (const run of report.runs) {
  console.log(`\n=== ${run.label} (${run.profile}) — exit ${run.exit_code}`);
  for (const l of run.stdout) console.log(`  ${l}`);
  for (const l of run.stderr) console.log(`  [stderr] ${l}`);
}
console.log(`\nbefore == after (crs rows, documents, events, identity rows): ${report.nothing_changed}`);
