// HOLE 3 FIX — add one real (not demo) Client Success Manager login.
//
// Owner call (Chris, final): "make one up, don't ask".
//
//   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//     scripts/tmp/live-fix-2026-09-17/hole-3-create.mjs
//
// SAFE TO RE-RUN. What it does, in order:
//   1. Reads the main .env for CSM_STAFF_EMAIL / CSM_STAFF_PASSWORD (names only).
//      Both present  -> reuse them. Never overwrite.
//      Neither       -> pick a made-up person with no collision, make a strong
//                       password in memory, APPEND the two new keys, re-read.
//      Only one      -> stop. Touch nothing.
//   2. Writes the staff row through src/auth/seed-staff.mjs upsertStaff, inside
//      BEGIN ... COMMIT. A row that already exists is left alone (verify only).
//   3. Checks the row with plain SELECTs and verifyPassword in memory.
//   4. Owner session GET /api/read/staff?role=csm to see the row on the list.
//
// NO-SEND. No invite, no email, no text, no event. It does not call
// scripts/create-csm-staff.mjs, sendStaffCredentialEmail, or /api/auth/invite.
// NO bare SET on the pooled connection. NO delete. The demo CSM row is not read
// for writing and not changed. Never prints the password, the hash, or a token.

import crypto from "node:crypto";
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { db, pool, close } from "../../../src/db.mjs";
import { upsertStaff, SEED_FURNITURE_EMAILS } from "../../../src/auth/seed-staff.mjs";
import { validatePassword, verifyPassword } from "../../../src/auth/hash.mjs";
import { resolveDefaultOrg } from "../../../src/auth/org.mjs";
import { isDemoEmail } from "../../../src/auth/demo-logins.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const ENV_PATH = "/Users/chrisstanbridge/Developer/fundhub-platform/.env";
const OUT = "/tmp/live-fix-2026-09-17/hole-3";
const CHRIS_ORG = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const DEMO_CSM_ID = "6ec4e592-4e60-4501-a3ee-ecc2b4b88146";
const ROLE = "csm";
const KEY_EMAIL = "CSM_STAFF_EMAIL";
const KEY_PASSWORD = "CSM_STAFF_PASSWORD";
// Made-up people. First one with no collision wins. None reuse a seed name.
const CANDIDATES = [
  { email: "elena.brooks@fundhub.ai", name: "Elena Brooks" },
  { email: "nora.whitfield@fundhub.ai", name: "Nora Whitfield" },
  { email: "grace.holloway@fundhub.ai", name: "Grace Holloway" }
];
// The only triggers the live staff table is known to carry. Neither sends.
const KNOWN_STAFF_TRIGGERS = ["trg_staff_employee_code", "trg_staff_updated"];

mkdirSync(OUT, { recursive: true });
const out = { at: new Date().toISOString() };
const stop = async (why) => {
  out.stopped = why;
  writeFileSync(`${OUT}/create.json`, JSON.stringify(out, null, 2));
  console.error("STOP:", why);
  await close();
  process.exit(1);
};

const readEnvFile = () => parseEnv(readFileSync(ENV_PATH, "utf8"));

async function collides(email) {
  const e = email.toLowerCase();
  if (SEED_FURNITURE_EMAILS.map((x) => x.toLowerCase()).includes(e)) return "seed furniture";
  if (isDemoEmail(e)) return "demo domain";
  const s = await db.query(`SELECT count(*)::int n FROM staff WHERE lower(email) = $1`, [e]);
  if (s.rows[0].n > 0) return "staff row";
  const a = await db.query(`SELECT count(*)::int n FROM accounts WHERE lower(email) = $1`, [e]);
  if (a.rows[0].n > 0) return "accounts row";
  return null;
}

// ── Safety checks before any write ────────────────────────────────────────
const orgId = await resolveDefaultOrg(db);
out.orgMatchesChris = orgId === CHRIS_ORG;
if (!out.orgMatchesChris) await stop("default org is not chris's org");

const chris = (await db.query(
  `SELECT id, org_id, role, status FROM staff WHERE lower(email) = 'chris@fundhub.ai' LIMIT 1`)).rows[0];
if (!chris || chris.org_id !== CHRIS_ORG) await stop("chris@fundhub.ai is not in the expected org");

out.staffTriggers = (await db.query(
  `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.staff'::regclass AND NOT tgisinternal ORDER BY tgname`
)).rows.map((r) => r.tgname);
const unknownTriggers = out.staffTriggers.filter((t) => !KNOWN_STAFF_TRIGGERS.includes(t));
if (unknownTriggers.length) await stop(`staff has triggers not checked for sends: ${unknownTriggers.join(", ")}`);

const demoBefore = (await db.query(
  `SELECT email, role, status, is_demo, updated_at FROM staff WHERE id = $1`, [DEMO_CSM_ID])).rows[0] || null;

// ── 1. The .env keys ──────────────────────────────────────────────────────
let env = readEnvFile();
const hasEmail = Object.prototype.hasOwnProperty.call(env, KEY_EMAIL);
const hasPassword = Object.prototype.hasOwnProperty.call(env, KEY_PASSWORD);
let email;
let name;
let password;

if (hasEmail !== hasPassword) {
  await stop(`only one of ${KEY_EMAIL} / ${KEY_PASSWORD} is in .env — not touching it`);
} else if (hasEmail && hasPassword) {
  out.envKeys = "already present — reused, not overwritten";
  email = String(env[KEY_EMAIL]).trim().toLowerCase();
  password = String(env[KEY_PASSWORD]);
  name = (CANDIDATES.find((c) => c.email === email) || {}).name || null;
} else {
  for (const c of CANDIDATES) {
    const why = await collides(c.email);
    out.candidates = [...(out.candidates || []), { email: c.email, collision: why }];
    if (!why) { email = c.email; name = c.name; break; }
  }
  if (!email) await stop("every made-up candidate collides");

  password = crypto.randomBytes(24).toString("base64url");
  const bad = validatePassword(password);
  if (bad) await stop(`generated password failed policy: ${bad}`);

  const current = readFileSync(ENV_PATH, "utf8");
  const lead = current.length && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(ENV_PATH, `${lead}${KEY_EMAIL}=${email}\n${KEY_PASSWORD}=${password}\n`);
  out.envKeys = "appended";

  env = readEnvFile();
  const same = env[KEY_EMAIL] === email && env[KEY_PASSWORD] === password;
  out.envReadBack = same ? "match" : "MISMATCH";
  console.log("env read-back:", out.envReadBack);
  if (!same) await stop(".env read-back did not match what was written");
}
out.email = email;
out.name = name;
if (validatePassword(password)) await stop("stored password fails policy");

// ── 2. The staff row ──────────────────────────────────────────────────────
const existing = (await db.query(
  `SELECT id, org_id, role, status, is_demo FROM staff WHERE lower(email) = $1`, [email])).rows;
if (existing.length > 1) await stop("more than one staff row for that email");

if (existing.length === 1) {
  const r = existing[0];
  if (r.org_id !== CHRIS_ORG || r.role !== ROLE || r.is_demo) {
    await stop("a staff row with that email exists and is not our CSM row — not touching it");
  }
  out.insert = "row already existed — left alone, verify only";
} else {
  if (!name) await stop("no name for a new row");
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const res = await upsertStaff(client, orgId, { email, name, role: ROLE }, { password });
    const row = (await client.query(
      `SELECT role, status, active, is_demo, org_id FROM staff WHERE org_id = $1 AND lower(email) = $2`,
      [orgId, email])).rows[0];
    const good = res.action === "created" && row && row.role === ROLE && row.status === "active" &&
      row.active === true && row.is_demo === false && row.org_id === CHRIS_ORG;
    if (!good) {
      await client.query("ROLLBACK");
      out.insert = `rolled back (action ${res.action})`;
    } else {
      await client.query("COMMIT");
      out.insert = res.action;
    }
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    out.insert = `failed: ${e.message}`;
  } finally {
    client.release();
  }
  if (out.insert !== "created") await stop(`insert did not finish: ${out.insert}`);
}
console.log("insert:", out.insert);

// ── 3. Verify with plain SELECTs ──────────────────────────────────────────
const row = (await db.query(
  `SELECT id, email, name, role, status, active, is_demo, org_id, employee_code,
          (password_hash IS NOT NULL) AS has_password, password_hash, created_at, last_login_at
     FROM staff WHERE lower(email) = $1`, [email])).rows[0];
out.row = row && {
  id: row.id, email: row.email, name: row.name, role: row.role, status: row.status,
  active: row.active, is_demo: row.is_demo, same_org_as_chris: row.org_id === CHRIS_ORG,
  employee_code: row.employee_code, has_password: row.has_password,
  created_at: row.created_at, last_login_at: row.last_login_at
};
out.passwordMatchesEnv = row ? await verifyPassword(password, row.password_hash) : false;
console.log("password matches .env:", out.passwordMatchesEnv);

out.check = {
  role_csm: row?.role === ROLE,
  status_active: row?.status === "active",
  active_true: row?.active === true,
  is_demo_false: row?.is_demo === false,
  org_is_chris: row?.org_id === CHRIS_ORG,
  not_demo_address: !isDemoEmail(row?.email),
  password_ok: out.passwordMatchesEnv
};

out.csmRows = (await db.query(
  `SELECT email, name, status, is_demo FROM staff WHERE role = 'csm' AND org_id = $1 ORDER BY created_at`,
  [CHRIS_ORG])).rows;
const demoAfter = (await db.query(
  `SELECT email, role, status, is_demo, updated_at FROM staff WHERE id = $1`, [DEMO_CSM_ID])).rows[0] || null;
out.demoRowUnchanged = JSON.stringify(demoBefore) === JSON.stringify(demoAfter);
out.inviteRows = (await db.query(
  `SELECT count(*)::int n FROM password_resets p JOIN staff s ON s.id = p.staff_id WHERE lower(s.email) = $1`,
  [email])).rows[0].n;
out.messagesForEmail = (await db.query(
  `SELECT count(*)::int n FROM messages WHERE created_at > now() - interval '30 minutes'
      AND (to_jsonb(messages)::text ILIKE '%' || $1 || '%')`, [email])).rows[0].n;

// ── 4. Owner sees it on the staff list ────────────────────────────────────
const { token } = await createSession(db, { staffId: chris.id, orgId: chris.org_id });
{
  const r = await fetch(`${BASE}/api/read/staff?role=csm`, { headers: { cookie: `fundhub_session=${token}` } });
  const j = await r.json().catch(() => null);
  const rows = (j?.items || j?.rows || j?.data || []).map((x) => ({ email: x.email, name: x.name, role: x.role, status: x.status }));
  out.readStaffCsm = { status: r.status, count: rows.length, rows, hiddenCount: j?.hiddenCount };
}

writeFileSync(`${OUT}/create.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, csmRows: out.csmRows }, null, 2));
await close();
