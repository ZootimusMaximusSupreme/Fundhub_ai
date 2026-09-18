// Hole 6 FIX — put chris@fundhub.ai's stored password back in step with
// STAFF_INITIAL_PASSWORD in the main .env. Owner-set 2026-09-17: "agent does
// the fix, including a password reset, without asking."
//
//   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//     scripts/tmp/live-fix-2026-09-17/hole-6-reset.mjs            # dry run, writes nothing
//   …                                                    --apply   # does the reset
//
// Same write as `scripts/seed-staff.mjs --reset-passwords` (it calls the same
// upsertStaff), with three extra guards:
//   1. It touches only staff row 52bc675a-… in org fb789b0b-…, and refuses if
//      the name, role, status or demo flag is not what it should be.
//   2. It runs in one transaction and checks the new hash with the same
//      verifyPassword the live login uses BEFORE it commits. Any miss rolls back.
//   3. It is idempotent. If the stored hash already matches, it writes nothing.
//
// Before the write it saves the old hash to a 0600 file under
// /tmp/live-fix-2026-09-17/hole-6/ so the change can be undone. That file is
// never printed.
//
// Sends nothing. Writes only staff.password_hash (and staff.updated_at through
// the trg_staff_updated trigger). No auth_attempts, no sessions, no messages.
// Never prints the password, a hash or a token.
import { writeFileSync, mkdirSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
import { verifyPassword, validatePassword } from "../../../src/auth/hash.mjs";
import { resolveDefaultOrg } from "../../../src/auth/org.mjs";
import { upsertStaff, FOUNDING_STAFF, PASSWORD_ENV } from "../../../src/auth/seed-staff.mjs";

const OUT = "/tmp/live-fix-2026-09-17/hole-6";
const STAFF_ID = "52bc675a-db0f-4e24-9b53-80f7fd077f72";
const ORG_ID = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const EMAIL = "chris@fundhub.ai";
const apply = process.argv.includes("--apply");

mkdirSync(OUT, { recursive: true });
const out = { at: new Date().toISOString(), apply };

const ROW_SQL = `
  SELECT id, org_id, email, name, role, status,
         (to_jsonb(s) ->> 'active')  AS active_flag,
         (to_jsonb(s) ->> 'is_demo') AS is_demo_flag,
         password_hash
    FROM staff s WHERE id = $1`;

const shape = (r) => ({
  id: r.id, org_id: r.org_id, email: r.email, name: r.name, role: r.role,
  status: r.status, active_flag: r.active_flag, is_demo_flag: r.is_demo_flag
});

function refuse(why) {
  const e = new Error(why);
  e.refusal = true;
  throw e;
}

let client = null;
try {
  const password = process.env[PASSWORD_ENV];
  const bad = validatePassword(password);
  if (bad) refuse(`${PASSWORD_ENV}: ${bad}`);

  const person = FOUNDING_STAFF.find((p) => p.email === EMAIL);
  if (!person || person.role !== "owner") refuse("roster entry for chris@fundhub.ai is not the owner");

  const orgId = await resolveDefaultOrg({ query: (s, p) => pool().query(s, p) });
  if (orgId !== ORG_ID) refuse("default org is not the fundhub org");

  client = await pool().connect();
  const tx = { query: (s, p) => client.query(s, p) };
  await client.query("BEGIN");

  const before = (await client.query(`${ROW_SQL} FOR UPDATE`, [STAFF_ID])).rows[0];
  if (!before) refuse("staff row not found");
  out.before = shape(before);
  if (before.org_id !== ORG_ID) refuse("staff row is not in the fundhub org");
  if (String(before.email).toLowerCase() !== EMAIL) refuse("staff row email is not chris@fundhub.ai");
  if (before.name !== person.name) refuse("stored name differs from the roster; the reset would rename him");
  if (before.role !== "owner") refuse("staff row is not the owner");
  if (before.status !== "active" || before.active_flag === "false") refuse("staff row is not active");
  if (before.is_demo_flag === "true") refuse("staff row is a demo row");

  const rows = (await client.query(
    `SELECT count(*)::int AS n FROM staff WHERE org_id = $1 AND lower(email) = $2`,
    [ORG_ID, EMAIL]
  )).rows[0].n;
  if (rows !== 1) refuse(`expected 1 staff row for the email, found ${rows}`);

  out.verifyBefore = !!(before.password_hash && await verifyPassword(password, before.password_hash));
  if (out.verifyBefore) {
    await client.query("ROLLBACK");
    out.action = "already-correct";
  } else if (!apply) {
    await client.query("ROLLBACK");
    out.action = "would-reset (dry run, nothing written)";
  } else {
    // Undo copy, never printed.
    const backup = `${OUT}/old-hash-backup-${out.at.replace(/[:.]/g, "-")}.DO-NOT-PRINT.json`;
    writeFileSync(backup, JSON.stringify({
      staff_id: STAFF_ID, taken_at: out.at, password_hash: before.password_hash
    }), { mode: 0o600, flag: "wx" });
    out.backupFile = backup;

    const r = await upsertStaff(tx, ORG_ID, person, { password, resetPasswords: true });
    if (r.action !== "password-reset") refuse(`unexpected upsert result ${r.action}`);

    const after = (await client.query(ROW_SQL, [STAFF_ID])).rows[0];
    out.after = shape(after);
    out.verifyAfter = await verifyPassword(password, after.password_hash);
    const same = JSON.stringify(shape(after)) === JSON.stringify(shape(before));
    out.otherFieldsUnchanged = same;
    if (!out.verifyAfter || !same) refuse("post-write check failed; rolled back");

    await client.query("COMMIT");
    out.action = `${r.action} ${r.email} ${r.role}`;
  }
} catch (e) {
  if (client) { try { await client.query("ROLLBACK"); } catch { /* already closed */ } }
  out.error = e.message;
  out.refused = !!e.refusal;
  process.exitCode = 1;
} finally {
  if (client) client.release();
  writeFileSync(`${OUT}/reset-${apply ? "apply" : "dry"}.json`, JSON.stringify(out, null, 2));
  console.log(out.action || "no action");
  console.log(JSON.stringify(out, null, 2));
  await close();
}
