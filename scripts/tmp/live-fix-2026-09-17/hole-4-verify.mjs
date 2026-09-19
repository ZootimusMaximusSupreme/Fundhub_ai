// Hole 4 VERIFY — look only. GET-only; every non-GET request is aborted.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-4";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
mkdirSync(OUT, { recursive: true });

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });

const browser = await chromium.launch();
const results = {};

async function ctxFor({ cookie, lsToken }) {
  const ctx = await browser.newContext();
  if (cookie) {
    await ctx.addCookies([
      { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
      { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
    ]);
  }
  if (lsToken) {
    await ctx.addInitScript((t) => { try { localStorage.setItem("fh_token", t); } catch (e) {} }, token);
  }
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      console.log("BLOCKED non-GET", m, route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  return ctx;
}

async function look(label, ctx, path) {
  const page = await ctx.newPage();
  const api = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/")) api.push({ status: r.status(), url: u.replace(BASE, "") });
  });
  const nav = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav.push(f.url().replace(BASE, "")); });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const finalUrl = page.url().replace(BASE, "");
  const info = await page.evaluate(() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim().slice(0, 300) : null; };
    return {
      title: document.title,
      hasSignInButton: !!Array.from(document.querySelectorAll("button")).find((b) => /Email me a sign-in link/i.test(b.textContent)),
      fatal: txt("#fatal:not(.hidden)"),
      mainVisible: !!document.querySelector("#main:not(.hidden)"),
      hSub: txt("#hSub"),
      lsHasToken: (() => { try { return !!localStorage.getItem("fh_token"); } catch (e) { return "throw"; } })(),
      bodyStart: document.body ? document.body.innerText.trim().slice(0, 400) : null,
    };
  });
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: false });
  results[label] = { path, finalUrl, nav, api, ...info };
  await page.close();
}

// A — card recreate: owner cookie only (as the no-send look had it)
const A = await ctxFor({ cookie: true, lsToken: false });
await look("A1-portal-id-cookie", A, `/app/client-portal.html?id=${ID}`);
await look("A2-progress-id-cookie", A, `/progress.html?id=${ID}`);
await look("A3-progress-clientid-cookie", A, `/progress.html?client_id=${ID}`);
// A4 — same cookie-only context: does the server itself accept the cookie on the progress read?
{
  const page = await A.newPage();
  await page.goto(BASE + "/favicon.svg");
  const r = await page.evaluate(async (id) => {
    const res = await fetch("/api/read/client-progress?client_id=" + id, { credentials: "same-origin", headers: { accept: "application/json" } });
    let b = {}; try { b = await res.json(); } catch (e) {}
    return { status: res.status, ok: b.ok, error: b.error || null, waypoints: Array.isArray(b.waypoints) ? b.waypoints.length : null, stage: b.stage ? (b.stage.key || b.stage.label || b.stage.name || "set") : null };
  }, ID);
  results["A4-api-progress-cookie-only"] = r;
  await page.close();
}
await A.close();

// B — diagnostic: cookie + staff token in localStorage (what login.html:230 leaves behind)
const B = await ctxFor({ cookie: true, lsToken: true });
await look("B1-progress-id-cookie+ls", B, `/progress.html?id=${ID}`);
await look("B2-progress-clientid-cookie+ls", B, `/progress.html?client_id=${ID}`);
await B.close();

// C — stranger: no cookie, no token (auth must still hold)
const C = await ctxFor({ cookie: false, lsToken: false });
await look("C1-progress-id-stranger", C, `/progress.html?id=${ID}`);
{
  const page = await C.newPage();
  await page.goto(BASE + "/favicon.svg");
  results["C2-api-progress-stranger"] = await page.evaluate(async (id) => {
    const res = await fetch("/api/read/client-progress?client_id=" + id, { headers: { accept: "application/json" } });
    let b = {}; try { b = await res.json(); } catch (e) {}
    return { status: res.status, error: b.error || null };
  }, ID);
  await page.close();
}
await C.close();

await browser.close();
writeFileSync(`${OUT}/verify.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
process.exit(0);
