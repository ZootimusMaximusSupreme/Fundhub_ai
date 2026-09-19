// HOLE 3 VERIFY — look only. Plain SELECTs + GETs. Any non-GET request from the page is aborted.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";
import { resolveDefaultOrg } from "../../../src/auth/org.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-3";
mkdirSync(OUT, { recursive: true });
const out = { at: new Date().toISOString() };

const chris = (await db.query(
  `SELECT id, org_id, role, status FROM staff WHERE lower(email) = 'chris@fundhub.ai' LIMIT 1`)).rows[0];
out.chris = { role: chris?.role, status: chris?.status, org_id: chris?.org_id };
out.defaultOrg = await resolveDefaultOrg(db);

out.csmRows = (await db.query(
  `SELECT id, email, name, role, status, is_demo, (password_hash IS NOT NULL) AS has_password,
          org_id, (org_id = $1) AS same_org_as_chris, created_at, last_login_at
     FROM staff WHERE lower(btrim(role)) IN ('csm','client_success_manager','client success manager')
     ORDER BY created_at`, [chris.org_id])).rows;
out.csmLikeEmails = (await db.query(
  `SELECT email, role, status, is_demo FROM staff WHERE email ILIKE '%csm%' OR name ILIKE '%success%' ORDER BY email`)).rows;
out.roleCounts = (await db.query(
  `SELECT role, is_demo, status, count(*)::int n FROM staff WHERE org_id = $1 GROUP BY 1,2,3 ORDER BY 1,2,3`, [chris.org_id])).rows;
out.staffRoleCsm = (await db.query(
  `SELECT key, active FROM staff_roles WHERE org_id = $1 AND lower(key) = 'csm'`, [chris.org_id])).rows;
out.csmResets = (await db.query(
  `SELECT s.email, p.kind, p.expires_at, p.used_at, p.created_at
     FROM password_resets p JOIN staff s ON s.id = p.staff_id
    WHERE lower(btrim(s.role)) = 'csm' ORDER BY p.created_at DESC LIMIT 10`)).rows;
out.csmAuthAttempts = (await db.query(
  `SELECT email, successful, created_at FROM auth_attempts
    WHERE email ILIKE '%csm%' ORDER BY created_at DESC LIMIT 10`)).rows;

const { token } = await createSession(db, { staffId: chris.id, orgId: chris.org_id });

// 1. Demo switch — no cookie.
{
  const r = await fetch(`${BASE}/api/auth/login`);
  out.loginGet = { status: r.status, body: await r.json().catch(() => null) };
}
// 2. Staff list, role csm, owner cookie.
{
  const r = await fetch(`${BASE}/api/read/staff?role=csm`, { headers: { cookie: `fundhub_session=${token}` } });
  const j = await r.json().catch(() => null);
  out.readStaffCsm = { status: r.status, ok: j?.ok, hiddenCount: j?.hiddenCount,
    rows: (j?.rows || j?.data || []).map((x) => ({ email: x.email, role: x.role, status: x.status, name: x.name })) };
}
// 3. Owner opens the CSM queue page. GET only.
const browser = await chromium.launch();
const ctx = await browser.newContext();
for (const domain of ["fundhub.ai", ".fundhub.ai"]) {
  await ctx.addCookies([{ name: "fundhub_session", value: token, domain, path: "/", httpOnly: true, secure: true }]);
}
const page = await ctx.newPage();
const net = [];
await page.route("**/*", (route) => {
  const m = route.request().method();
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") { net.push({ blocked: m, url: route.request().url() }); return route.abort(); }
  return route.continue();
});
page.on("response", async (resp) => {
  const u = resp.url();
  if (!u.includes("/api/")) return;
  let n = null;
  try { const j = await resp.json(); n = Array.isArray(j?.rows) ? j.rows.length : Array.isArray(j?.data) ? j.data.length : null; } catch {}
  net.push({ method: resp.request().method(), url: u.replace(BASE, ""), status: resp.status(), rows: n });
});
const nav = await page.goto(`${BASE}/app/csm-queue.html`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(3000);
out.queuePage = { status: nav?.status(), finalUrl: page.url().replace(BASE, ""), title: await page.title() };
out.queueNet = net;
await page.screenshot({ path: `${OUT}/csm-queue-owner.png`, fullPage: false });
// 4. Login page as a stranger — is any CSM option offered?
const p2 = await (await browser.newContext()).newPage();
await p2.goto(`${BASE}/login.html`, { waitUntil: "networkidle", timeout: 45000 });
out.loginPageHasDemoPanel = await p2.evaluate(() => /demo/i.test(document.body.innerText) ? document.body.innerText.slice(0, 600) : null);
await p2.screenshot({ path: `${OUT}/login-page.png` });
await browser.close();

writeFileSync(`${OUT}/verify.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await close();
