// Hole 6 PRE/POST CHECK — look only. Plain SELECTs. No writes. No message sent.
// Never prints a password, a hash, a salt or a token. Booleans and counts only.
//
//   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//     scripts/tmp/live-fix-2026-09-17/hole-6-precheck.mjs [label]
//
// Writes /tmp/live-fix-2026-09-17/hole-6/precheck-<label>.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";
import { verifyPassword, validatePassword, needsRehash } from "../../../src/auth/hash.mjs";
import { checkRateLimit, normalizeEmail } from "../../../src/auth/login.mjs";
import { resolveDefaultOrg } from "../../../src/auth/org.mjs";
import { PASSWORD_ENV } from "../../../src/auth/seed-staff.mjs";

const OUT = "/tmp/live-fix-2026-09-17/hole-6";
const label = (process.argv[2] || "pre").replace(/[^a-z0-9-]/gi, "");
const STAFF_ID = "52bc675a-db0f-4e24-9b53-80f7fd077f72";
const ORG_ID = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const EMAIL = "chris@fundhub.ai";

mkdirSync(OUT, { recursive: true });
const out = { at: new Date().toISOString(), label };

try {
  const defaultOrg = await resolveDefaultOrg(db);
  out.defaultOrgMatches = defaultOrg === ORG_ID;

  const row = (await db.query(
    `SELECT id, org_id, email, name, role, status,
            (to_jsonb(s) ->> 'active')  AS active_flag,
            (to_jsonb(s) ->> 'is_demo') AS is_demo_flag,
            (to_jsonb(s) ->> 'updated_at') AS updated_at,
            (to_jsonb(s) ->> 'last_login_at') AS last_login_at,
            password_hash
       FROM staff s WHERE id = $1`,
    [STAFF_ID]
  )).rows[0];

  if (!row) {
    out.error = "staff row not found";
  } else {
    const password = process.env[PASSWORD_ENV];
    out.staff = {
      id: row.id,
      org_id: row.org_id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      active_flag: row.active_flag,
      is_demo_flag: row.is_demo_flag,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at,
      hasHash: !!row.password_hash,
      needsRehash: row.password_hash ? needsRehash(row.password_hash) : null
    };
    out.passwordEnvPresent = typeof password === "string" && password.length > 0;
    out.passwordPolicyProblem = validatePassword(password); // names the rule, never the value
    out.verify = !!(row.password_hash && out.passwordEnvPresent &&
                    await verifyPassword(password, row.password_hash));
  }

  // How many rows would a login for this email look at? Must be exactly one.
  out.staffRowsForEmailInOrg = (await db.query(
    `SELECT count(*)::int AS n FROM staff WHERE org_id = $1 AND lower(email) = $2`,
    [ORG_ID, normalizeEmail(EMAIL)]
  )).rows[0].n;

  // Failed tries that count toward the 5-per-15-minute lock (email only).
  out.rateLimit = await checkRateLimit(db, { orgId: ORG_ID, email: EMAIL, ip: null });

  // Triggers on staff. A trigger that notifies or queues a message would make
  // a password write unsafe. Names and timing only.
  out.staffTriggers = (await db.query(
    `SELECT trigger_name, event_manipulation, action_timing, action_statement
       FROM information_schema.triggers
      WHERE event_object_schema = 'public' AND event_object_table = 'staff'
      ORDER BY trigger_name, event_manipulation`
  )).rows;
} catch (e) {
  out.error = e.message;
  process.exitCode = 1;
} finally {
  writeFileSync(`${OUT}/precheck-${label}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await close();
}
