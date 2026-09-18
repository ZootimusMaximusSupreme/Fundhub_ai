// N7 reviewer — read-only dry run of the shipped compare (checkBilledSuccessFee) on live rows.
// Runs inside BEGIN READ ONLY and rolls back; any write would be refused by Postgres.
// Supporting evidence only (the control press on Walk1 was not allowed as a write).
import pg from "pg";
import { checkBilledSuccessFee } from "../../../src/funding/billed-fee-check.mjs";
const ROUNDS = {
  "eight round 2 (billed)": "bc9bb3a1-c043-4554-8512-a2e005612541",
  "eight round 1 (no bill)": "4575b08f-aec2-4843-ba59-b06ba0f41959",
  "walk1 round 1 (billed)": "84ff1a9d-839f-477d-835d-44f1789b214b",
  "walk1 round 2 (no bill)": "a20d891f-d154-44ab-956c-70c4bc543e3d"
};
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
for (const [label, id] of Object.entries(ROUNDS)) {
  try {
    const r = await checkBilledSuccessFee(c, { fundingRoundId: id });
    console.log(label, "=>", r == null ? "null (nothing to compare)" : JSON.stringify({ matches: r.matches, invoice: r.invoiceNumber, status: r.invoice.status, billedCents: r.billedCents, ruleFeeCents: r.ruleFeeCents, paidCents: r.paidCents, confirmed: r.confirmedApprovedAmount, pct: r.feePercent, reason: r.reason }));
  } catch (e) { console.log(label, "ERROR", e.message); await c.query("ROLLBACK"); await c.query("BEGIN READ ONLY"); }
}
await c.query("ROLLBACK"); await c.end();
