// READ ONLY. N17: funded rounds vs distinct funded files this month.
// BEGIN READ ONLY ... COMMIT only. No SET, no writes. Prints no names, phones or emails.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n17-rows.mjs [tag]
import { mkdirSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";

const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N17";
mkdirSync(OUT, { recursive: true });
const TAG = process.argv[2] || "rows";
const out = { at: new Date().toISOString() };
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  // Same month window the pulse uses: first of the month, UTC.
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  out.month_start_utc = start;
  out.funded_rounds_this_month = (await c.query(`
    SELECT fr.org_id, left(fr.client_id::text, 8) AS client8, left(fr.id::text, 8) AS round8,
           fr.status, fr.funded_amount, fr.updated_at, cl.is_demo
      FROM funding_rounds fr LEFT JOIN clients cl ON cl.id = fr.client_id
     WHERE fr.status = 'funded'
       AND fr.updated_at >= $1
     ORDER BY fr.org_id, fr.client_id, fr.updated_at`, [start])).rows;
  out.per_org = (await c.query(`
    SELECT org_id, count(*)::int AS rounds, count(DISTINCT client_id)::int AS files
      FROM funding_rounds
     WHERE status = 'funded'
       AND updated_at >= $1
     GROUP BY org_id`, [start])).rows;
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log("month start (UTC):", out.month_start_utc);
for (const r of out.funded_rounds_this_month) {
  console.log("org", String(r.org_id).slice(0, 8), "| file", r.client8, "| round", r.round8, "| $", r.funded_amount,
    "| updated", r.updated_at?.toISOString?.(), "| demo", r.is_demo);
}
for (const r of out.per_org) console.log("org", String(r.org_id).slice(0, 8), "| funded rounds", r.rounds, "| distinct funded files", r.files);
