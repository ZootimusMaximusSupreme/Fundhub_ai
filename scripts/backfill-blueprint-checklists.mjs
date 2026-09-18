#!/usr/bin/env node
// One-shot backfill: every client who already PAID for the Capital Blueprint
// gets the checklist that paying now creates (src/waypoints/purchase.mjs).
//
// WHY IT IS NEEDED. The checklist is written once, at the moment a payment is
// processed. Shipping the hook in src/handlers/money-chain.mjs therefore gives a
// checklist to nobody who paid before today. Measured on production 2026-09-17:
// Sim Eleven-Blueprint paid $5,000 and holds zero rows in client_waypoints.
//
// REQUIRES DATABASE_URL.
//
//   node scripts/backfill-blueprint-checklists.mjs               # dry-run (default)
//   node scripts/backfill-blueprint-checklists.mjs --write       # actually seed
//   node scripts/backfill-blueprint-checklists.mjs --write --client=<uuid>
//
// SAFE TO RE-RUN. It only ever INSERTs or refreshes a waypoint, it never
// deletes one, and it never re-opens a step the client has already ticked off
// (client_waypoints is UNIQUE (client_id, key) and the upsert leaves `state` and
// `completed_at` alone). Running it twice leaves one checklist.

import { db, close } from "../src/db.mjs";
import { resolveDefaultOrg } from "../src/auth/org.mjs";
import { backfillPurchaseChecklists } from "../src/waypoints/purchase.mjs";

const WRITE = process.argv.includes("--write");
const clientArg = process.argv.find((a) => a.startsWith("--client="));
const clientId = clientArg ? clientArg.split("=")[1] : null;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const orgId = await resolveDefaultOrg(db);
  const out = await backfillPurchaseChecklists(db, { orgId, clientId, dryRun: !WRITE });

  console.log(`${WRITE ? "WROTE" : "DRY RUN"} — ${out.scanned} succeeded payment(s) scanned.`);
  console.log(`${out.clients} client(s) bought the Capital Blueprint.`);
  for (const s of out.seeded) {
    console.log(
      WRITE
        ? `  ${s.clientId}: ${s.keys.length} step(s), credit file: ${s.creditFile}`
        : `  ${s.clientId}: would build the checklist`
    );
  }
  for (const f of out.failed) console.error(`  FAILED ${f.clientId}: ${f.error}`);
  for (const u of out.unresolved) {
    console.warn(`  unresolved payment ${u.transactionId}: product "${u.productName}" matches nothing`);
  }
  if (!WRITE) console.log("\nNothing was written. Re-run with --write to apply.");
  await close();
  process.exit(out.failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await close().catch(() => {});
  process.exit(1);
});
