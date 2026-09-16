#!/usr/bin/env node
// scripts/sim/put-identity-on-file.mjs — put the fake address and birth date where
// the document checker reads them, on the walk clients only.
//
//   node scripts/sim/put-identity-on-file.mjs --client 8           # shows what it WOULD change
//   node scripts/sim/put-identity-on-file.mjs --client 8 --write   # makes the change
//   node scripts/sim/put-identity-on-file.mjs --client all --write # 08 to 12
//
// WHY THIS EXISTS. The document checker is told the client's address and date of
// birth from clients.custom_fields — address_line1 / address_city / address_state /
// address_zip and dob (src/handlers/doc-check.mjs:198-205). Nothing on the walk
// writes those keys. The soft-pull consent form saves the same facts to
// pii_identity (api/soft-pull-approve.mjs:458-470), which the checker never reads.
// So every walk client is checked against "(address not on file)" and
// "(DOB not on file)", while the checker's rules want both to match before it
// accepts an ID or a bill (db/migrations/114_ghl_agent_seed.sql:216-219).
//
// It is the FALLBACK in docs/workflows/sim-documents/MATRIX.md: upload the clean
// ID first with nothing on file, record what the checker says, and run this only
// if it comes back "request more".
//
// The values come from the fake identity in
// credentials/sim-identity/owner-identity.local.json — the same address and date
// of birth make-documents.mjs prints and the sheet types on the consent form. They
// are never printed here.
//
// SCOPE. Matches ONLY stanbridgejchris+sim-08@gmail.com to +sim-14@. Writes only
// those five custom_fields keys, deletes nothing, touches no other column, and
// re-running it writes the same values again. The lender match reads home_state /
// state / mailing_state (src/lenders/match.mjs:144-152), not address_state, so the
// bank list does not move — do not add a plain `state` key here for that reason.
//
// ALSO READ ELSEWHERE. The closer-deck / funding letter pack and the do-it-yourself
// letter packet read address_line1 and dob from these fields, but take city, state
// and ZIP from the plain keys. A pack built after this runs prints the street with
// no city, state or ZIP. So do not press "Generate letters and email now" for a
// walk client after this has run.
//
// It is DRY BY DEFAULT. --write is required, matching flag-sim-clients.mjs.

import { loadEnv } from "../load-env.mjs";
loadEnv();
import fs from "node:fs";
import pg from "pg";

const WRITE = process.argv.includes("--write");
const IDENTITY_FILE = new URL("../../credentials/sim-identity/owner-identity.local.json", import.meta.url);
const WALK_CLIENTS = ["08", "09", "10", "11", "12", "13", "14"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

const pick = arg("client");
const numbers = pick === "all"
  ? ["08", "09", "10", "11", "12"]
  : pick ? [String(pick).replace(/\D/g, "").padStart(2, "0")] : [];
if (!numbers.length || numbers.some((n) => !WALK_CLIENTS.includes(n))) {
  console.error("Say which client: --client 8 (08 to 14), or --client all for 08 to 12.");
  process.exit(1);
}
const emails = numbers.map((n) => `stanbridgejchris+sim-${n}@gmail.com`);

const id = JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
const a = id.current_address || {};
if (!a.line1 || !a.city || !a.state || !a.postal_code || !/^\d{4}-\d{2}-\d{2}$/.test(String(id.dob || ""))) {
  console.error("The identity file needs current_address line1, city, state, postal_code and a YYYY-MM-DD dob.");
  process.exit(1);
}
const patch = {
  address_line1: String(a.line1),
  address_city: String(a.city),
  address_state: String(a.state).toUpperCase(),
  address_zip: String(a.postal_code),
  dob: String(id.dob)
};
const KEYS = Object.keys(patch);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const onFile = (cf) => KEYS.every((k) => cf?.[k] === patch[k]);
const before = await c.query(
  `SELECT id, first_name, last_name, email, custom_fields
     FROM clients
    WHERE lower(email) = ANY($1::text[])
    ORDER BY email`,
  [emails]
);

console.log(`\nWalk clients asked for: ${emails.length}. Found: ${before.rows.length}.`);
console.table(before.rows.map((r) => ({
  name: `${r.first_name || ""} ${r.last_name || ""}`.trim(),
  email: r.email,
  address_and_dob_on_file: onFile(r.custom_fields) ? "yes" : "no"
})));

const missing = emails.filter((e) => !before.rows.some((r) => r.email.toLowerCase() === e));
if (missing.length) console.log(`Not signed up yet: ${missing.join(", ")}`);

const needing = before.rows.filter((r) => !onFile(r.custom_fields));
if (!needing.length) {
  console.log("Nothing to do.\n");
  await c.end();
  process.exit(0);
}
if (!WRITE) {
  console.log(`\nDRY RUN. Nothing was written. ${needing.length} client(s) would get the fake address and birth date. Re-run with --write.\n`);
  await c.end();
  process.exit(0);
}

const done = await c.query(
  `UPDATE clients
      SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || $2::jsonb,
          updated_at = now()
    WHERE id = ANY($1::uuid[])
      AND lower(email) = ANY($3::text[])
    RETURNING first_name, last_name, email`,
  [needing.map((r) => r.id), JSON.stringify(patch), emails]
);

console.log(`\nPut the fake address and birth date on ${done.rowCount} client(s):`);
console.table(done.rows);
console.log("The document checker will now see them. Upload the clean ID again.\n");

await c.end();
