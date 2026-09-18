// READ ONLY. N17: run THIS branch's computePulse + briefsFromPulse against the
// live rows inside BEGIN READ ONLY, and print the funded lines of the CEO brief.
// Each query runs one at a time under its own savepoint so one failed optional
// read cannot poison the others. No SET, no writes. Prints no PII.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n17-local-render.mjs <org_id> [tag]
import { mkdirSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
import { computePulse } from "../../../src/ops/pulse.mjs";
import { briefsFromPulse } from "../../../src/ops/briefs.mjs";

const ORG = process.argv[2];
const TAG = process.argv[3] || "local-render";
if (!ORG) throw new Error("org id required");
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N17";
mkdirSync(OUT, { recursive: true });

const c = await pool().connect();
let chain = Promise.resolve();
let sp = 0;
const db = {
  query(sql, params) {
    const run = async () => {
      const name = `sp${++sp}`;
      await c.query(`SAVEPOINT ${name}`);
      try {
        const r = await c.query(sql, params);
        await c.query(`RELEASE SAVEPOINT ${name}`);
        return r;
      } catch (e) {
        await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw e;
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }
};

let out;
try {
  await c.query("BEGIN READ ONLY");
  const pulse = await computePulse(db, { orgId: ORG, period: "7d" });
  const briefs = briefsFromPulse(pulse);
  out = {
    at: new Date().toISOString(),
    code: "branch fix/r2-n17-ceo-funded-count",
    bar_funding_advisor: pulse.bars.funding_advisor,
    kpi_funded_count_7d: pulse.kpis.funded_count,
    ceo_funded_lines: briefs.ceo.split("\n").filter((l) => /[Ff]unded/.test(l)),
  };
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
