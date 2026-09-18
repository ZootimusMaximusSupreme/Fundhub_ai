// N7 — LOOK ONLY. Runs this branch's bill-vs-rule check against the live rows
// for a round, inside BEGIN READ ONLY, and prints the task a person would get.
// Writes nothing. No SET.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n7-dryrun.mjs [roundId] [tag]
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { checkBilledSuccessFee, feeDriftTask } from "../../../src/funding/billed-fee-check.mjs";

const ROUND = process.argv[2] || "bc9bb3a1-c043-4554-8512-a2e005612541"; // #8 round 2
const TAG = process.argv[3] || "dryrun";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N7";
mkdirSync(OUT, { recursive: true });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const out = { at: new Date().toISOString(), round: ROUND };
try {
  const check = await checkBilledSuccessFee(c, { fundingRoundId: ROUND });
  out.check = check && { ...check, invoice: { id: check.invoice.id, status: check.invoice.status, amount_due: check.invoice.amount_due } };
  out.task = check && !check.matches ? feeDriftTask(check) : null;
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
