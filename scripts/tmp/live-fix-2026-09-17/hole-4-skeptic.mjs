// Hole 4 SKEPTIC — independent look only on https://fundhub.ai. GET-only; every
// non-GET request is aborted and logged. Clicks nothing. Two rounds, each case in
// a fresh browser context. Mints one staff session + one client session (the
// sanctioned look pattern) and revokes both at the end (UPDATE revoked_at).
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession, revokeSession } from "../../../src/auth/session.mjs";
import { createAccountSession, revokeAccountSession } from "../../../src/auth/account-session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-4/skeptic";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
mkdirSync(OUT, { recursive: true });

// Plain SELECTs only.
const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const acct = (await db.query(
  `SELECT id, org_id FROM accounts WHERE client_id = $1 AND kind = 'client' AND status = 'active' LIMIT 1`, [ELEVEN]
)).rows[0];
const trig = (await db.query(
  `SELECT tgname, tgrelid::regclass::text AS tbl FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('account_sessions','sessions')`
)).rows;
if (!staff || !acct) { console.error("missing staff or client account"); process.exit(1); }

const staffTok = (await createSession(db, { staffId: staff.id, orgId: staff.org_id })).token;
const clientTok = (await createAccountSession(db, { accountId: acct.id, orgId: acct.org_id })).token;

// Direct API, no browser, no auth — must be 401 with no data.
const direct = {};
for (const [k, q] of [["noauth-11", `?client_id=${ELEVEN}`], ["noauth-bare", ""]]) {
  const r = await fetch(`${BASE}/api/read/client-progress${q}`, { headers: { accept: "application/json" } });
  const t = await r.text();
  direct[k] = { status: r.status, bodyStart: t.slice(0, 120) };
}
{
  const r = await fetch(`${BASE}/api/read/client-progress?client_id=${ELEVEN}`, {
    headers: { accept: "application/json", authorization: "Bearer not-a-real-token-xyz" },
  });
  direct["garbage-bearer"] = { status: r.status, bodyStart: (await r.text()).slice(0, 120) };
}

const browser = await chromium.launch();
const results = [];

function cookiesFor(tok) {
  return [
    { name: "fundhub_session", value: tok, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
    { name: "fundhub_session", value: tok, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
  ];
}

async function look(round, key, { cookieTok, lsTok, path, expect }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (cookieTok) await ctx.addCookies(cookiesFor(cookieTok));
  if (lsTok) await ctx.addInitScript((t) => { try { localStorage.setItem("fh_token", t); } catch (e) {} }, lsTok);
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") { blocked.push(m + " " + route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await ctx.newPage();
  const api = [];
  let progressBody = null;
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.includes("/api/")) return;
    api.push(r.status() + " " + r.request().method() + " " + u.replace(BASE, ""));
    if (u.includes("/api/read/client-progress")) {
      try {
        const j = await r.json();
        progressBody = {
          status: r.status(),
          ok: j.ok,
          error: j.error || null,
          waypointTitles: Array.isArray(j.waypoints) ? j.waypoints.map((w) => w.title || w.label || w.name || null) : null,
        };
      } catch (e) { progressBody = { status: r.status(), parseError: true }; }
    }
  });
  const nav = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav.push(f.url().replace(BASE, "")); });

  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(() => {
      const wp = document.querySelector("#cWaypoints");
      if (wp && wp.children.length > 0 && document.querySelector("#main:not(.hidden)")) return true;
      if (location.pathname === "/portal-login.html" && document.querySelector("button")) return true;
      const f = document.querySelector("#fatal:not(.hidden)");
      return !!(f && f.innerText.trim());
    }, null, { timeout: 20000 });
  } catch (e) { /* recorded below as whatever state we landed in */ }
  await page.waitForTimeout(2500); // settle: catch any late bounce
  const ms = Date.now() - t0;
  const finalUrl = page.url().replace(BASE, "");
  const info = await page.evaluate(() => {
    const wp = document.querySelector("#cWaypoints");
    const body = document.body ? document.body.innerText : "";
    return {
      title: document.title,
      hTitle: (document.querySelector("#hTitle") || {}).textContent || null,
      signInButton: !!Array.from(document.querySelectorAll("button")).find((b) => /Email me a sign-in link/i.test(b.textContent)),
      mainVisible: !!document.querySelector("#main:not(.hidden)"),
      fatal: (() => { const e = document.querySelector("#fatal:not(.hidden)"); return e ? e.innerText.trim().slice(0, 200) : null; })(),
      checklistRows: wp ? wp.children.length : null,
      checklistText: wp ? wp.innerText.trim().split("\n").filter(Boolean).slice(0, 14) : null,
      privateTextOnPage: /File your LLC|Get your EIN|business checking account/i.test(body),
    };
  });
  const shot = `${OUT}/r${round}-${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  const bounced = nav.some((u) => u.startsWith("/portal-login.html"));
  let pass;
  if (expect === "checklist") {
    pass = !bounced && finalUrl === path && info.mainVisible && !info.fatal && info.checklistRows > 0 && !info.signInButton;
  } else {
    pass = finalUrl.startsWith("/portal-login.html") && info.signInButton && !info.privateTextOnPage
      && !api.some((a) => a.startsWith("200 GET /api/read/client-progress"));
  }
  results.push({ round, key, path, expect, pass, ms, finalUrl, nav, api, blocked, progressBody, ...info, shot });
  await ctx.close();
}

for (const round of [1, 2]) {
  await look(round, "staff-id", { cookieTok: staffTok, path: `/progress.html?id=${ELEVEN}`, expect: "checklist" });
  await look(round, "staff-clientid", { cookieTok: staffTok, path: `/progress.html?client_id=${ELEVEN}`, expect: "checklist" });
  await look(round, "client-token-only", { lsTok: clientTok, path: `/progress.html`, expect: "checklist" });
  await look(round, "client-token-and-cookie", { lsTok: clientTok, cookieTok: clientTok, path: `/progress.html`, expect: "checklist" });
  await look(round, "client-cookie-only", { cookieTok: clientTok, path: `/progress.html`, expect: "checklist" });
  await look(round, "client-token-names-8", { lsTok: clientTok, path: `/progress.html?id=${EIGHT}`, expect: "checklist" });
  await look(round, "stranger-id", { path: `/progress.html?id=${ELEVEN}`, expect: "login" });
  await look(round, "stranger-clientid", { path: `/progress.html?client_id=${ELEVEN}`, expect: "login" });
  await look(round, "stranger-bare", { path: `/progress.html`, expect: "login" });
  await look(round, "stranger-garbage-token", { lsTok: "not-a-real-token-xyz", path: `/progress.html?id=${ELEVEN}`, expect: "login" });
}
// Fingerprint of #8's own checklist, read as staff, to prove client #11 naming #8 did not see #8.
await look(1, "staff-id-8", { cookieTok: staffTok, path: `/progress.html?id=${EIGHT}`, expect: "checklist" });

await browser.close();
const revoked = { staff: await revokeSession(db, staffTok), client: await revokeAccountSession(db, clientTok) };
const out = { direct, triggers: trig, results, revoked };
writeFileSync(`${OUT}/skeptic.json`, JSON.stringify(out, null, 2));
const brief = results.map((r) => ({
  r: r.round, key: r.key, pass: r.pass, ms: r.ms, finalUrl: r.finalUrl, rows: r.checklistRows,
  prog: r.progressBody && { s: r.progressBody.status, e: r.progressBody.error, w: r.progressBody.waypointTitles },
  signIn: r.signInButton, fatal: r.fatal, blocked: r.blocked.length, priv: r.privateTextOnPage,
}));
console.log(JSON.stringify({ direct, triggers: trig, brief, revoked }, null, 1));
process.exit(0);
