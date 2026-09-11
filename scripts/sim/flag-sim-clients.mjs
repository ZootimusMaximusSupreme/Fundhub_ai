#!/usr/bin/env node
// scripts/sim/flag-sim-clients.mjs — mark every simulated client as simulated.
//
//   node scripts/sim/flag-sim-clients.mjs          # shows what it WOULD change
//   node scripts/sim/flag-sim-clients.mjs --write  # makes the change
//
// WHY THIS EXISTS. Measured against the live database on 2026-09-11: all nine
// simulated clients — Walk1 through Walk4 and Sim One through Sim Five — carry
// custom_fields.synthetic = NULL and is_demo = false. Those two fields are the
// only thing in this platform that stops a real message or a real bureau call
// going out about an invented person:
//
//   * src/messaging/dispatch.mjs:512-521 refuses a send permanently, with no
//     override, when custom_fields.synthetic === true. It is a BOOLEAN check,
//     which is why this writes JSON true and not the string "true".
//   * src/inquiry-ops/call-scheduler.mjs:235-240 reads the same field plus
//     is_demo before it schedules an AI bureau call.
//
// Neither guard is armed on any of the nine right now. fulfillment-walk-2026-09-05.md
// §0.2 called this out before the first walk and it was never done. The loop
// that sent 51 real texts to one phone in two hours on 2026-09-03 is the shape
// of what these guards exist to prevent.
//
// SCOPE. It matches ONLY the +walk-0N@ and +sim-0N@ email tags, which are the
// seeder's own markers and cannot collide with a real client — a real client
// with a plus-tagged address would have to have picked exactly that tag. It
// touches no other column, deletes nothing, and re-running it is a no-op: the
// WHERE clause skips rows already flagged, so the RETURNING list is empty the
// second time.
//
// It is DRY BY DEFAULT. --write is required, matching seed-fulfillment-client.mjs.

import { loadEnv } from "../load-env.mjs";
loadEnv();
import pg from "pg";

const WRITE = process.argv.includes("--write");

const SELECTOR = `(email LIKE '%+walk-0%@%' OR email LIKE '%+sim-0%@%')`;
const UNFLAGGED = `(custom_fields->>'synthetic' IS DISTINCT FROM 'true' OR is_demo IS DISTINCT FROM true)`;

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
await c.connect();

const before = await c.query(`
  SELECT first_name, last_name, email,
         custom_fields->>'synthetic' AS synthetic, is_demo
    FROM clients
   WHERE ${SELECTOR}
   ORDER BY first_name, last_name`);

console.log(`\nSimulated clients on file: ${before.rows.length}`);
console.table(before.rows);

const needing = before.rows.filter((r) => r.synthetic !== "true" || r.is_demo !== true);
console.log(`Not yet flagged: ${needing.length}`);

if (!needing.length) {
  console.log("Nothing to do — every simulated client is already flagged.\n");
  await c.end();
  process.exit(0);
}

if (!WRITE) {
  console.log("\nDRY RUN. Nothing was written. Re-run with --write to flag them.\n");
  await c.end();
  process.exit(0);
}

const done = await c.query(`
  UPDATE clients
     SET custom_fields = jsonb_set(COALESCE(custom_fields, '{}'::jsonb), '{synthetic}', 'true'::jsonb, true),
         is_demo = true,
         updated_at = now()
   WHERE ${SELECTOR} AND ${UNFLAGGED}
  RETURNING first_name, last_name, email,
            custom_fields->>'synthetic' AS synthetic, is_demo`);

console.log(`\nFlagged ${done.rowCount} client(s):`);
console.table(done.rows);
console.log("Both guards are now armed on these records.\n");

await c.end();
