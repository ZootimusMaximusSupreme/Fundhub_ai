// N10 (round b) LIVE DRY RUN — the OLD tool (main) and the FIXED tool, both with
// --dry, on three Sim files. A dry run writes nothing: both tools only read the
// client, its prior pulls (and, fixed tool only, its identity row) and run the
// tier engine in memory. Before/after snapshots prove nothing moved.
//
//   #13 Sim Thirteen-NoBook (funding, NO identity row)
//   Sim Combo-20260918      (funding, address-only identity row)
//   #9 Sim Nine-Repair      (repair, full form-written row)
//
// The old tool is `git show main:scripts/sim/push-credit.mjs`, written next to
// the fixed one as scripts/sim/push-credit.main-copy.mjs before this runs (so its
// relative imports resolve) and removed after. Emails are looked up by id and
// masked; lines naming the identity file's person are dropped.
//
// Usage: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//          scripts/tmp/live-fix-2026-09-18/r2-N10b-dry.mjs
import pg from "pg";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N10";
const ENV_FILE = "/Users/chrisstanbridge/Developer/fundhub-platform/.env";
const TOOLS = [
  { name: "OLD (main)", path: new URL("../../sim/push-credit.main-copy.mjs", import.meta.url).pathname },
  { name: "FIXED", path: new URL("../../sim/push-credit.mjs", import.meta.url).pathname },
];
if (!existsSync(TOOLS[0].path)) { console.error("write the old copy first: git show main:scripts/sim/push-credit.mjs > scripts/sim/push-credit.main-copy.mjs"); process.exit(2); }
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
const clean = (s) => mask(s || "").split("\n").filter(Boolean).filter((l) => !/identity file says/.test(l));

const report = { at: new Date().toISOString(), before: await snapshot(), runs: [] };
for (const tool of TOOLS) {
  for (const r of RUNS) {
    const res = spawnSync(process.execPath, [`--env-file=${ENV_FILE}`, tool.path, "--email", r.email, "--profile", r.profile, "--dry"], {
      encoding: "utf8", timeout: 120_000,
    });
    report.runs.push({ tool: tool.name, label: r.label, client_id: r.id, profile: r.profile, exit_code: res.status, stdout: clean(res.stdout), stderr: clean(res.stderr) });
  }
}
report.after = await snapshot();
report.nothing_changed = JSON.stringify(report.before) === JSON.stringify(report.after);

writeFileSync(`${OUT}/dry-run-old-vs-fixed.json`, JSON.stringify(report, null, 2));
for (const run of report.runs) {
  console.log(`\n=== ${run.tool} · ${run.label} (${run.profile}) — exit ${run.exit_code}`);
  for (const l of run.stdout.filter((l) => /^(tier|prior|identity|pack|dry run)/.test(l))) console.log(`  ${l}`);
  for (const l of run.stderr) console.log(`  [stderr] ${l.slice(0, 300)}`);
}
console.log(`\nbefore == after (crs rows, documents, events, identity rows): ${report.nothing_changed}`);
console.log(JSON.stringify(report.after, null, 1));
