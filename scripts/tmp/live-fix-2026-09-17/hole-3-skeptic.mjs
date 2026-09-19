// Hole 3 SKEPTIC — independent look. Reads the DB (plain SELECTs only), signs
// the real CSM in twice in fresh browsers, and never clicks anything on the
// CSM screen. Every non-GET request is aborted except the one POST
// /api/auth/login from the Sign in button. Never prints the password or tokens.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-3/skeptic";
mkdirSync(OUT, { recursive: true });

const EMAIL = process.env.CSM_STAFF_EMAIL || "";
const PW = process.env.CSM_STAFF_PASSWORD || "";
const out = { envEmailPresent: !!EMAIL, envPasswordPresent: !!PW, email: EMAIL };
if (!EMAIL || !PW) {
  writeFileSync(`${OUT}/skeptic.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  process.exit(1);
}
const e = EMAIL.trim().toLowerCase();

// ---------- DB reads (SELECT only) ----------
const chris = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = 'chris@fundhub.ai' LIMIT 1`)).rows[0];
const staffRows = (await db.query(
  `SELECT id, org_id, email, name, role, status,
          (to_jsonb(s) ->> 'active') AS active, (to_jsonb(s) ->> 'is_demo') AS is_demo,
          (password_hash IS NOT NULL) AS has_password, created_at, last_login_at
     FROM staff s WHERE lower(email) = $1`, [e])).rows;
out.staffRowsForEmail = staffRows;
out.chrisOrg = chris?.org_id;
out.sameOrgAsChris = staffRows.length === 1 && staffRows[0].org_id === chris?.org_id;
out.accountsWithEmail = (await db.query(
  `SELECT count(*)::int n FROM accounts WHERE lower(email) = $1`, [e])).rows[0].n;
out.csmRows = (await db.query(
  `SELECT email, name, status, (to_jsonb(s) ->> 'active') AS active, (to_jsonb(s) ->> 'is_demo') AS is_demo
     FROM staff s WHERE role = 'csm' ORDER BY email`)).rows;
const sid = staffRows[0]?.id;
const before = (await db.query(
  `SELECT count(*) FILTER (WHERE successful)::int ok, count(*) FILTER (WHERE NOT successful)::int bad
     FROM auth_attempts WHERE lower(email) = $1 AND created_at > now() - interval '6 hours'`, [e])).rows[0];
out.authAttemptsBefore6h = before;
out.passwordResets = sid ? (await db.query(
  `SELECT count(*)::int n FROM password_resets WHERE staff_id = $1`, [sid])).rows[0].n : null;
out.messagesMentioningEmail6h = (await db.query(
  `SELECT count(*)::int n FROM messages m
    WHERE m.created_at > now() - interval '6 hours' AND to_jsonb(m)::text ILIKE $1`, [`%${e}%`])).rows[0].n;

// ---------- Stranger (no cookie) ----------
async function get(path, cookie) {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}
const demo = await get("/api/auth/login");
out.demoGet = { status: demo.status, enabled: demo.body?.demo?.enabled, hasPassword: !!demo.body?.demo?.password };
const strangerStaff = await get("/api/read/staff?role=csm");
const strangerQueue = await get("/api/read/csm-queue");
const strangerSession = await get("/api/auth/session");
out.stranger = {
  readStaffCsm: { status: strangerStaff.status, rows: Array.isArray(strangerStaff.body?.rows) ? strangerStaff.body.rows.length : null, error: strangerStaff.body?.error },
  readCsmQueue: { status: strangerQueue.status, error: strangerQueue.body?.error, keys: strangerQueue.body ? Object.keys(strangerQueue.body) : null },
  session: { status: strangerSession.status, error: strangerSession.body?.error },
};

// ---------- Owner view of staff?role=csm (card RECREATE step 2) ----------
const { token: ownerTok } = await createSession(db, { staffId: chris.id, orgId: chris.org_id });
const ownerStaff = await get("/api/read/staff?role=csm", `fundhub_session=${ownerTok}`);
const rowsOf = (b) => b?.rows || b?.staff || b?.data || (Array.isArray(b) ? b : null);
const ownerRows = rowsOf(ownerStaff.body);
out.ownerReadStaffCsm = {
  status: ownerStaff.status,
  keys: ownerStaff.body ? Object.keys(ownerStaff.body) : null,
  rows: Array.isArray(ownerRows) ? ownerRows.map((r) => ({ email: r.email, name: r.name, role: r.role, status: r.status, is_demo: r.is_demo })) : null,
};

// ---------- Two fresh browsers, sign in by hand ----------
const browser = await chromium.launch();
out.loads = [];
for (const n of [1, 2]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const L = { n, blocked: [], writes: [], api: [], consoleErrors: [], pageErrors: [] };
  await page.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const u = new URL(req.url());
    if (m === "POST" && u.pathname === "/api/auth/login") { L.writes.push(`${m} ${u.pathname}`); return route.continue(); }
    L.blocked.push(`${m} ${u.pathname}`);
    return route.abort();
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) L.api.push(`${r.request().method()} ${u.pathname}${u.search} ${r.status()}`);
  });
  page.on("console", (m) => { if (m.type() === "error") L.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (err) => L.pageErrors.push(String(err).slice(0, 200)));

  const lr = await page.goto(`${BASE}/login.html`, { waitUntil: "networkidle" });
  L.loginStatus = lr?.status();
  L.demoButtons = await page.locator("#fh-demo-mount button").count();
  L.demoMountText = (await page.locator("#fh-demo-mount").innerText().catch(() => "")).slice(0, 200);
  L.cookiesBefore = (await ctx.cookies()).length;

  await page.fill("#email", EMAIL);
  await page.fill("#pw", PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login.html"), { timeout: 25000 }).catch(() => null),
    page.click("#go"),
  ]);
  await page.waitForLoadState("networkidle").catch(() => null);
  await page.waitForTimeout(2500);
  L.urlAfter = page.url();
  L.title = await page.title();
  L.loginErr = await page.locator("#err").isVisible().catch(() => false)
    ? (await page.locator("#err").innerText()).slice(0, 200) : null;
  const body = await page.locator("body").innerText().catch(() => "");
  L.bodyHead = body.slice(0, 700);
  L.hasElena = body.includes("Elena Brooks");
  L.mentionsCsm = /csm/i.test(body);
  L.mentionsDemo = /demo/i.test(body);
  L.headings = (await page.locator("h1, h2").allInnerTexts()).slice(0, 8);
  const sess = await page.request.get(`${BASE}/api/auth/session`);
  const sj = await sess.json().catch(() => null);
  L.session = { status: sess.status(), principal: sj?.principal, email: sj?.staff?.email ?? sj?.email, role: sj?.staff?.role ?? sj?.role, is_demo: sj?.staff?.is_demo };
  await page.screenshot({ path: `${OUT}/load-${n}-raw.png`, fullPage: false });

  // Reload: does the sign-in stick?
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  L.urlAfterReload = page.url();
  L.hasElenaAfterReload = (await page.locator("body").innerText().catch(() => "")).includes("Elena Brooks");
  L.apiErrors = L.api.filter((s) => !/ (200|204|304)$/.test(s));
  out.loads.push(L);
  await ctx.close();
}
await browser.close();

const after = (await db.query(
  `SELECT count(*) FILTER (WHERE successful)::int ok, count(*) FILTER (WHERE NOT successful)::int bad
     FROM auth_attempts WHERE lower(email) = $1 AND created_at > now() - interval '6 hours'`, [e])).rows[0];
out.authAttemptsAfter6h = after;
out.passwordResetsAfter = sid ? (await db.query(
  `SELECT count(*)::int n FROM password_resets WHERE staff_id = $1`, [sid])).rows[0].n : null;
out.messagesMentioningEmail6hAfter = (await db.query(
  `SELECT count(*)::int n FROM messages m
    WHERE m.created_at > now() - interval '6 hours' AND to_jsonb(m)::text ILIKE $1`, [`%${e}%`])).rows[0].n;

const text = JSON.stringify(out, null, 2);
if (text.includes(PW)) { console.error("password leaked into output; not writing"); process.exit(2); }
writeFileSync(`${OUT}/skeptic.json`, text);
console.log(text);
process.exit(0);
