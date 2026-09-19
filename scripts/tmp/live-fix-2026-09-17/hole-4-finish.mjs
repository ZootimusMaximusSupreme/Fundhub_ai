// Hole 4 FINISH — look only on https://fundhub.ai. GET-only; every non-GET is aborted.
// Two rounds, each with fresh browser contexts (two fresh page loads per case).
// Cases: staff cookie ?id= · staff cookie ?client_id= · client's own token (no id) · stranger.
// Marked screenshots (red numbered boxes + legend drawn on the page) go to the evidence dir.
// Never clicks anything. Sessions minted here are revoked (UPDATE revoked_at) at the end.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession, revokeSession } from "../../../src/auth/session.mjs";
import { createAccountSession, revokeAccountSession } from "../../../src/auth/account-session.mjs";

const BASE = "https://fundhub.ai";
const RAW = "/tmp/live-fix-2026-09-17/hole-4";
const EV = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-4";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
mkdirSync(RAW, { recursive: true });
mkdirSync(EV, { recursive: true });

const staff = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, ["chris@fundhub.ai"]
)).rows[0];
const acct = (await db.query(
  `SELECT id, org_id FROM accounts WHERE client_id = $1 AND kind = 'client' AND status = 'active' LIMIT 1`, [ID]
)).rows[0];
const staffTok = (await createSession(db, { staffId: staff.id, orgId: staff.org_id })).token;
const clientTok = (await createAccountSession(db, { accountId: acct.id, orgId: acct.org_id })).token;

const browser = await chromium.launch();
const results = [];

async function ctxFor({ cookie, lsToken }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (cookie) {
    await ctx.addCookies([
      { name: "fundhub_session", value: staffTok, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
      { name: "fundhub_session", value: staffTok, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
    ]);
  }
  if (lsToken) {
    await ctx.addInitScript((t) => { try { localStorage.setItem("fh_token", t); } catch (e) {} }, lsToken);
  }
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      blocked.push(m + " " + route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  ctx._blocked = blocked;
  return ctx;
}

// Draw numbered red boxes + a legend on the page, then screenshot.
async function markAndShoot(page, file, title, marks, legendExtra) {
  const clipBottom = await page.evaluate(({ title, marks, legendExtra }) => {
    const legend = document.createElement("div");
    legend.id = "__legend";
    legend.style.cssText = "position:relative;z-index:99999;background:#fff;border:3px solid #d00;margin:8px auto;max-width:1240px;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#111";
    let html = "<div style='font-weight:700;font-size:15px;margin-bottom:4px'>" + title + "</div>";
    marks.forEach((m, i) => { html += "<div><b style='color:#d00'>" + (i + 1) + "</b> — " + m.label + "</div>"; });
    (legendExtra || []).forEach((l) => { html += "<div style='color:#333'>" + l + "</div>"; });
    legend.innerHTML = html;
    document.body.insertBefore(legend, document.body.firstChild);
    let bottom = legend.getBoundingClientRect().bottom + window.scrollY;
    marks.forEach((m, i) => {
      let r;
      if (m.union) {
        const els = m.union.map((s) => document.querySelector(s)).filter(Boolean);
        if (!els.length) return;
        const rs = els.map((e) => e.getBoundingClientRect());
        r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)),
              right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
      } else {
        let el = m.sel ? document.querySelector(m.sel) : null;
        if (m.text) el = Array.from(document.querySelectorAll(m.tag || "*")).find((e) => e.textContent.trim() === m.text) || el;
        if (!el) return;
        r = el.getBoundingClientRect();
      }
      const pad = 6;
      const box = document.createElement("div");
      box.style.cssText = "position:absolute;z-index:99998;border:3px solid #d00;pointer-events:none;"
        + "left:" + (r.left + window.scrollX - pad) + "px;top:" + (r.top + window.scrollY - pad) + "px;"
        + "width:" + (r.right - r.left + pad * 2) + "px;height:" + (r.bottom - r.top + pad * 2) + "px";
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = "position:absolute;left:-3px;top:-26px;background:#d00;color:#fff;font:700 15px/22px Arial;padding:0 8px;border-radius:3px";
      box.appendChild(tag);
      document.body.appendChild(box);
      bottom = Math.max(bottom, r.bottom + window.scrollY + pad + 20);
    });
    return Math.ceil(bottom);
  }, { title, marks, legendExtra });
  await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: 1280, height: Math.min(clipBottom, 4000) } });
}

async function look(round, key, { cookie, lsToken, path, expect }) {
  const ctx = await ctxFor({ cookie, lsToken });
  const page = await ctx.newPage();
  const api = [];
  page.on("response", (r) => { const u = r.url(); if (u.includes("/api/")) api.push(r.status() + " " + u.replace(BASE, "")); });
  const nav = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav.push(f.url().replace(BASE, "")); });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const finalUrl = page.url().replace(BASE, "");
  const info = await page.evaluate(() => {
    const wp = document.querySelector("#cWaypoints");
    return {
      title: document.title,
      h1: (document.querySelector("h1") || {}).textContent || null,
      signInButton: !!Array.from(document.querySelectorAll("button")).find((b) => /Email me a sign-in link/i.test(b.textContent)),
      mainVisible: !!document.querySelector("#main:not(.hidden)"),
      fatal: (() => { const e = document.querySelector("#fatal:not(.hidden)"); return e ? e.innerText.trim().slice(0, 200) : null; })(),
      checklistRows: wp ? wp.children.length : null,
      checklistText: wp ? wp.innerText.trim().split("\n").filter(Boolean).slice(0, 12) : null,
      backHref: (document.querySelector("header .back") || {}).getAttribute ? document.querySelector("header .back").getAttribute("href") : null,
    };
  });
  const bouncedToLogin = nav.some((u) => u.startsWith("/portal-login.html"));
  let pass;
  if (expect === "checklist") pass = !bouncedToLogin && finalUrl === path && info.mainVisible && !info.fatal && info.checklistRows > 0 && !info.signInButton;
  else pass = finalUrl.startsWith("/portal-login.html") && info.signInButton && !info.mainVisible && api.some((a) => a.startsWith("401 /api/read/client-progress"));

  const file = `${EV}/r${round}-${key}.png`;
  const legendExtra = [
    "Page address after 6s: " + finalUrl,
    "Progress read: " + (api.filter((a) => a.includes("client-progress")).join(", ") || "none"),
    "Round " + round + " of 2 · fresh browser · look only, nothing clicked · " + new Date().toISOString(),
  ];
  if (expect === "checklist") {
    await page.evaluate(() => document.querySelector("#cWaypoints").scrollIntoView({ block: "center" }));
    await markAndShoot(page, file, labelFor(key) + (pass ? " — PASS" : " — FAIL"), [
      { label: "Page title \"Your progress\" — still on the progress page, not sent to sign-in", sel: "#hTitle" },
      { label: "\"Your checklist\" with " + info.checklistRows + " checklist lines", union: ["#cWaypoints"] },
    ], legendExtra);
  } else {
    await markAndShoot(page, file, labelFor(key) + (pass ? " — PASS (still locked out)" : " — FAIL"), [
      { label: "Stranger lands on the \"fundhub portal · Client sign-in\" page", union: ["h1", "p.sub"] },
      { label: "\"Email me a sign-in link\" — shown, NOT clicked", tag: "button", text: "Email me a sign-in link" },
    ], legendExtra);
  }
  results.push({ round, key, path, expect, pass, finalUrl, nav, api, blocked: ctx._blocked, ...info, shot: file });
  await ctx.close();
}

function labelFor(key) {
  return {
    "staff-id": "Staff (owner cookie, no fh_token) opens /progress.html?id=<#11>",
    "staff-clientid": "Staff (owner cookie, no fh_token) opens /progress.html?client_id=<#11>",
    "client-own": "Client #11's own sign-in (fh_token, no cookie, no id) opens /progress.html",
    "stranger": "Stranger (no cookie, no token) opens /progress.html?id=<#11>",
  }[key];
}

for (const round of [1, 2]) {
  await look(round, "staff-id", { cookie: true, lsToken: null, path: `/progress.html?id=${ID}`, expect: "checklist" });
  await look(round, "staff-clientid", { cookie: true, lsToken: null, path: `/progress.html?client_id=${ID}`, expect: "checklist" });
  await look(round, "client-own", { cookie: false, lsToken: clientTok, path: `/progress.html`, expect: "checklist" });
  await look(round, "stranger", { cookie: false, lsToken: null, path: `/progress.html?id=${ID}`, expect: "login" });
}

await browser.close();
const revoked = { staff: await revokeSession(db, staffTok), client: await revokeAccountSession(db, clientTok) };
writeFileSync(`${RAW}/finish.json`, JSON.stringify({ results, revoked }, null, 2));
console.log(JSON.stringify({ results, revoked, allPass: results.every((r) => r.pass) }, null, 2));
process.exit(0);
