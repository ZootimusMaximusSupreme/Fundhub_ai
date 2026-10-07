// Make the FIRST Yesdoor staff user (an owner), so someone can use the staff doors.
//
// Yesdoor's staff doors (api/yesdoor/staff/*) need a staff row in the `yesdoor` org.
// None exists until this is run. Run with no arguments it only PRINTS these
// instructions and touches nothing.
//
//   node scripts/yesdoor/create-first-staff.mjs
//
// To create the user (a scratch database, or the Yesdoor database once it has its own):
//
//   YD_STAFF_PASSWORD='<at least 12 characters>' DATABASE_URL=<that database> \
//     node scripts/yesdoor/create-first-staff.mjs --apply --email you@example.com [--name "Your Name"] [--role owner] [--session]
//
//   --role     owner (default) | ops | sales | collections
//   --session  also mint a 7-day staff session token and print it ONCE. Use it as
//              "Authorization: Bearer <token>" on the staff doors.
//
// The password comes from the environment, never the command line, and is never
// printed. The row is an upsert by (org, email): running it again resets the password.
//
// NEVER RUN THIS AGAINST THE FUNDHUB PRODUCTION DATABASE. The file refuses a remote
// host (Supabase or any pooler) unless YD_ALLOW_REMOTE_DB=yes is set, which is for
// the day Yesdoor has its OWN database and you are pointing at that one.
//
// HOW STAFF SIGN IN. The staff login (POST /api/auth/login) looks a person up in the
// DEFAULT organisation (DEFAULT_ORG_SLUG, "fundhub" here). A Yesdoor staff user can
// therefore sign in with a password only on a deployment where DEFAULT_ORG_SLUG is
// "yesdoor", which is what Yesdoor's own deployment will have after the split. Until
// then, use --session to get a bearer token for the staff doors.

import { fileURLToPath } from "node:url";
import { hashPassword, validatePassword } from "../../src/auth/hash.mjs";
import { createSession } from "../../src/auth/session.mjs";
import { db, close } from "../../src/db.mjs";

export const ROLES = Object.freeze(["owner", "ops", "sales", "collections"]);
const REMOTE_HOST = /(^|\.)supabase\.(com|co)$|pooler|amazonaws\.com$|neon\.tech$|render\.com$/i;

export const INSTRUCTIONS = `Create the first Yesdoor staff user

  This only prints instructions. To create the user:

    YD_STAFF_PASSWORD='<at least 12 characters>' DATABASE_URL=<scratch or Yesdoor database> \\
      node scripts/yesdoor/create-first-staff.mjs --apply --email you@example.com [--name "Your Name"] [--role owner] [--session]

  Roles: ${ROLES.join(" | ")}. The password is read from the environment and never printed.
  --session also prints a 7-day staff session token ONCE: send it as "Authorization: Bearer <token>".

  NEVER run this against the Fundhub production database. It refuses remote hosts unless
  YD_ALLOW_REMOTE_DB=yes (for Yesdoor's own database after the split).

  Staff password sign-in uses the DEFAULT organisation, so a Yesdoor user signs in with a password
  only on a deployment whose DEFAULT_ORG_SLUG is "yesdoor". Until then use --session.
`;

/** argv (without node and the script) -> { apply, email, name, role, session } or { error }. */
export function parseArgs(argv) {
  const out = { apply: false, email: null, name: null, role: "owner", session: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--session") out.session = true;
    else if (a === "--email" || a === "--name" || a === "--role") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return { error: `${a} needs a value` };
      out[a.slice(2)] = v;
      i += 1;
    } else return { error: `unknown argument ${a}` };
  }
  if (out.apply) {
    out.email = out.email ? out.email.trim().toLowerCase() : null;
    if (!out.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: "--email must be an email address" };
    if (!ROLES.includes(out.role)) return { error: `--role must be one of ${ROLES.join(", ")}` };
  }
  return out;
}

/** A reason this database must not be touched, or null. Reads the host, never the password. */
export function refuseTarget(databaseUrl, env = process.env) {
  if (!databaseUrl) return "DATABASE_URL is not set.";
  let host;
  try { host = new URL(databaseUrl).hostname; } catch { return "DATABASE_URL is not a readable address."; }
  if (REMOTE_HOST.test(host) && env.YD_ALLOW_REMOTE_DB !== "yes") {
    return `${host} looks like a hosted database. Refusing: this must never touch the Fundhub production database. ` +
      "If this IS Yesdoor's own database, set YD_ALLOW_REMOTE_DB=yes.";
  }
  return null;
}

export async function run(argv, env = process.env, out = console) {
  const args = parseArgs(argv);
  if (args.error) { out.error(`create-first-staff: ${args.error}`); return 2; }
  if (!args.apply) { out.log(INSTRUCTIONS); return 0; }

  const refusal = refuseTarget(env.DATABASE_URL, env);
  if (refusal) { out.error(`create-first-staff: ${refusal}`); return 1; }
  const password = env.YD_STAFF_PASSWORD;
  const bad = validatePassword(password);
  if (bad) { out.error(`create-first-staff: YD_STAFF_PASSWORD ${bad}`); return 1; }

  const slug = String(env.YD_ORG_SLUG || "yesdoor").trim() || "yesdoor";
  const org = (await db.query(`SELECT id FROM orgs WHERE slug = $1`, [slug])).rows[0];
  if (!org) { out.error(`create-first-staff: no organisation "${slug}". Run the migrations first.`); return 1; }

  const hash = await hashPassword(password);
  const existing = (await db.query(
    `SELECT id FROM staff WHERE org_id = $1 AND lower(email) = $2 LIMIT 1`, [org.id, args.email])).rows[0];
  let row;
  if (existing) {
    row = (await db.query(
      `UPDATE staff SET password_hash = $2, role = $3, name = COALESCE($4, name), status = 'active'
        WHERE id = $1 RETURNING id, email, name, role, status`, [existing.id, hash, args.role, args.name])).rows[0];
    out.log("updated:", row);
  } else {
    row = (await db.query(
      `INSERT INTO staff (org_id, email, name, role, status, password_hash)
       VALUES ($1,$2,$3,$4,'active',$5) RETURNING id, email, name, role, status`,
      [org.id, args.email, args.name || args.email, args.role, hash])).rows[0];
    out.log("created:", row);
  }
  out.log(`organisation: ${slug}`);

  if (args.session) {
    const s = await createSession(db, { staffId: row.id, orgId: org.id });
    out.log(`session token (shown once, valid until ${new Date(s.expiresAt).toISOString()}):`);
    out.log(s.token);
    out.log('use it as:  Authorization: Bearer <token>');
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).then(async (code) => { await close(); process.exit(code); }).catch(async (e) => {
    console.error("create-first-staff: failed:", e && e.message ? e.message : e);
    await close();
    process.exit(1);
  });
}
