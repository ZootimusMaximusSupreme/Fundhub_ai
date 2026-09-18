// Hole 6 VERIFY — look only. Plain SELECTs. No writes. No message sent.
// Never prints a password, hash body, salt, or token.
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { verifyPassword, validatePassword, needsRehash } from "../../../src/auth/hash.mjs";
import { checkRateLimit, normalizeEmail } from "../../../src/auth/login.mjs";

const OUT = "/tmp/live-fix-2026-09-17/hole-6";
mkdirSync(OUT, { recursive: true });
const EMAIL = "chris@fundhub.ai";
const out = { at: new Date().toISOString() };

// 1. Which env names look like passwords (names only).
const pwNames = Object.keys(process.env).filter((k) => /PASS|PWD/i.test(k)).sort();
out.envPasswordNames = pwNames;
out.defaultOrgSlugEnvSet = !!process.env.DEFAULT_ORG_SLUG;

// 2. Staff columns + rows.
out.staffColumns = (await db.query(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' ORDER BY ordinal_position`
)).rows.map((r) => r.column_name);

const staffRows = (await db.query(
  `SELECT s.id, s.org_id, o.slug AS org_slug, s.email, s.role, s.status,
          (to_jsonb(s) ->> 'active') AS active_flag,
          (to_jsonb(s) ->> 'is_demo') AS is_demo_flag,
          s.password_hash IS NOT NULL AS has_hash,
          split_part(s.password_hash, '$', 2) AS algo,
          split_part(s.password_hash, '$', 3) AS params,
          length(s.password_hash) AS hash_len,
          (to_jsonb(s) ->> 'created_at') AS created_at,
          (to_jsonb(s) ->> 'updated_at') AS updated_at,
          (to_jsonb(s) ->> 'last_login_at') AS last_login_at,
          (to_jsonb(s) ->> 'password_changed_at') AS password_changed_at,
          s.password_hash AS _hash
     FROM staff s LEFT JOIN orgs o ON o.id = s.org_id
    WHERE lower(s.email) LIKE '%chris%' OR lower(s.email) = $1`,
  [EMAIL]
)).rows;

const defaultOrg = (await db.query(`SELECT id, slug FROM orgs WHERE slug = $1`, [process.env.DEFAULT_ORG_SLUG || "fundhub"])).rows[0] || null;
out.defaultOrg = defaultOrg;
out.orgs = (await db.query(`SELECT id, slug FROM orgs ORDER BY slug`)).rows;

// 3. Check every password-like env value against the stored hash, locally,
//    with the same verifyPassword the live login uses. Booleans only.
const cand = {};
for (const n of pwNames) {
  const v = process.env[n];
  cand[n] = {
    present: typeof v === "string" && v.length > 0,
    policy: validatePassword(v),
    hasOuterSpace: typeof v === "string" && v !== v.trim(),
    wrappedInQuotes: typeof v === "string" && /^(["']).*\1$/.test(v),
  };
}
out.staff = [];
for (const r of staffRows) {
  const row = { ...r };
  delete row._hash;
  row.inDefaultOrg = defaultOrg ? r.org_id === defaultOrg.id : null;
  row.needsRehash = r._hash ? needsRehash(r._hash) : null;
  row.envMatches = {};
  for (const n of pwNames) {
    const v = process.env[n];
    row.envMatches[n] = r._hash && v ? await verifyPassword(v, r._hash) : false;
    if (v && v !== v.trim() && r._hash) row.envMatches[n + "(trimmed)"] = await verifyPassword(v.trim(), r._hash);
  }
  out.staff.push(row);
}
// Are the candidate values equal to one another? (booleans only)
const same = {};
for (let i = 0; i < pwNames.length; i++) for (let j = i + 1; j < pwNames.length; j++) {
  same[`${pwNames[i]}==${pwNames[j]}`] = process.env[pwNames[i]] === process.env[pwNames[j]];
}
out.envValuesEqual = same;
out.envCandidates = cand;

// 4. Rate limit + recent attempts for this email.
if (defaultOrg) {
  const rl = await checkRateLimit(db, { orgId: defaultOrg.id, email: EMAIL, ip: null });
  out.rateLimitEmailOnly = rl;
}
out.recentAttempts = (await db.query(
  `SELECT created_at, successful, (ip IS NOT NULL) AS has_ip
     FROM auth_attempts WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 25`,
  [normalizeEmail(EMAIL)]
)).rows;
out.attemptTotals = (await db.query(
  `SELECT count(*)::int AS total,
          count(*) FILTER (WHERE successful)::int AS ok,
          max(created_at) FILTER (WHERE successful) AS last_ok,
          max(created_at) FILTER (WHERE NOT successful) AS last_fail
     FROM auth_attempts WHERE lower(email) = $1`,
  [normalizeEmail(EMAIL)]
)).rows[0];

// 5. accounts table row for this email? (second login path)
out.accountsRow = (await db.query(
  `SELECT id, kind, status, password_hash IS NOT NULL AS has_hash FROM accounts WHERE lower(email) = $1`,
  [EMAIL]
)).rows;

writeFileSync(`${OUT}/db-look.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await db.end?.();
process.exit(0);
