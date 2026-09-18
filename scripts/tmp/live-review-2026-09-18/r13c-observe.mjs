// Hole 13 round 2 — REVIEW (r13c) round B. Same looks as r13c-review.mjs, but a change-watcher
// (MutationObserver, installed before any page script) logs EVERY text change of the greeting
// (#greeting), top name (#who-name / #who-av) with a timestamp, so a flash shorter than the 0.1 s
// poll cannot slip past. Also logs any added text mentioning Eleven/Sim (stranger data check).
// LOOK ONLY. Blocks every non-GET except the sign-in POST. Never prints a secret.
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r13c-observe.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-13/review3";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const out = { at: new Date().toISOString(), runs: [], blocked: [] };

async function guard(ctx) {
  await ctx.route("**/*", (route) => {
    const req = route.request(); const m = req.method(); const u = new URL(req.url());
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      if (m === "POST" && u.origin === BASE && u.pathname === "/api/auth/login") return route.continue();
      out.blocked.push(`${m} ${u.pathname}`); return route.abort();
    }
    return route.continue();
  });
  await ctx.addInitScript(() => {
    if (!location.pathname.startsWith("/app/client-portal")) return;
    const log = (window.__r13c = []);
    let last = { g: undefined, t: undefined, a: undefined };
    const read = () => {
      const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
      const now = { g: t("greeting"), t: t("who-name"), a: t("who-av") };
      if (now.g !== last.g || now.t !== last.t || now.a !== last.a) { log.push({ ms: Math.round(performance.now()), ...now }); last = now; }
    };
    const leaks = (window.__r13cLeak = []);
    new MutationObserver((muts) => {
      read();
      for (const m of muts) for (const n of m.addedNodes || []) {
        const s = (n.textContent || "").slice(0, 400);
        if (/Eleven|\bSim\b/.test(s) && leaks.length < 20) leaks.push({ ms: Math.round(performance.now()), text: s.replace(/\s+/g, " ").slice(0, 120) });
      }
      if (m0 && muts.some((m) => m.type === "characterData")) read();
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: false });
    const m0 = true;
  });
}

async function look(ctx, url, label) {
  const pg = await ctx.newPage();
  const t0 = Date.now();
  const hops = [];
  pg.on("framenavigated", (f) => { if (f === pg.mainFrame()) hops.push(`${Date.now() - t0}ms ${new URL(f.url()).pathname}`); });
  const logs = [];
  // collect the watcher log from each document before it unloads (stranger redirects)
  const grab = async () => { try { const r = await pg.evaluate(() => ({ p: location.pathname, log: window.__r13c || null, leak: window.__r13cLeak || null })); return r; } catch { return null; } };
  await pg.goto(url, { waitUntil: "commit" });
  let snap = null;
  while (Date.now() - t0 < 10000) {
    const r = await grab();
    if (r && r.log) snap = r; // keep the latest portal-document log
    await pg.waitForTimeout(100);
  }
  const final = await grab();
  if (final && final.log) snap = final;
  await pg.close();
  const log = snap?.log || [];
  const chris = log.filter((x) => /chris/i.test(x.g || "") || /chris/i.test(x.t || ""));
  const run = { label, url: url.replace(BASE, ""), final_path: final?.p ?? null, hops, changes: log, chris_changes: chris.length, leaks: snap?.leak || [] };
  out.runs.push(run);
  return run;
}

const portal = (param) => `${BASE}/app/client-portal.html?${param}=${ELEVEN}`;
const browser = await chromium.launch({ headless: true });
const A = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(A);
const lp = await A.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", pw);
const lrP = lp.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await lp.click("#go");
const lr = await lrP;
const names = (await lr.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split("=")[0].trim());
out.login = { status: lr.status(), set_cookie_names: names };
if (lr.status() !== 200 || !names.length) { console.log("SIGN-IN FAILED", out.login); await browser.close(); process.exit(2); }
await lp.waitForTimeout(2500);
await lp.close();
const sessionCookies = (await A.cookies()).filter((c) => names.includes(c.name));

await look(A, portal("id"), "B-normal-id");
await look(A, portal("client_id"), "B-normal-client_id");
for (const param of ["id", "client_id"]) for (const n of [1, 2]) {
  const B = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await guard(B);
  await B.addCookies(sessionCookies);
  await look(B, portal(param), `B-cookieonly-${param}-fresh${n}`);
  await B.close();
}
for (const param of ["id", "client_id"]) {
  const c = await A.newPage();
  await c.goto(`${BASE}/robots.txt`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await c.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await c.close();
  await look(A, portal(param), `B-wiped-${param}`);
}
await A.close();
const S = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await guard(S);
await look(S, portal("id"), "B-stranger-id");
await S.close();

fs.writeFileSync(`${SHOTS}/review3-observe.json`, JSON.stringify(out, null, 2));
console.log("login", out.login);
for (const r of out.runs) {
  console.log(`\n=== ${r.label} final=${r.final_path} CHRIS-changes=${r.chris_changes} hops: ${r.hops.join(" -> ")}`);
  for (const x of r.changes) console.log(`  ${String(x.ms).padStart(5)}ms greeting="${x.g}" top="${x.t}" av="${x.a}"`);
  if (r.leaks.length) console.log("  eleven/sim text added:", r.leaks.map((l) => `${l.ms}ms "${l.text}"`).join(" | "));
}
console.log("\nblocked", out.blocked);
await browser.close();
