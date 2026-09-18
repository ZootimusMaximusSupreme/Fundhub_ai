// HOLE 3 PROVE — the real CSM signs in on the live site, then looks at her queue.
//
//   node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env \
//     scripts/tmp/live-fix-2026-09-17/hole-3-prove.mjs
//
// Exactly ONE POST: /api/auth/login with CSM_STAFF_EMAIL / CSM_STAFF_PASSWORD
// from the main .env. Everything after that is GET only. The page is opened in
// Playwright with every non-GET request aborted and logged, and nothing is
// clicked (no Start shift, no Claim, no Write answers, no Sign out).
// Red boxes are drawn onto the page itself (a DOM overlay, no network) from the
// real element positions, then one screenshot is taken.
// Never prints the password, the token, or the cookie.

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/live-fix-2026-09-17/hole-3";
mkdirSync(OUT, { recursive: true });

const email = process.env.CSM_STAFF_EMAIL;
const password = process.env.CSM_STAFF_PASSWORD;
if (!email || !password) {
  console.error("CSM_STAFF_EMAIL / CSM_STAFF_PASSWORD are not in the environment.");
  process.exit(1);
}

const out = { at: new Date().toISOString(), email };

// 1. The one POST.
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-hole-3-prove" },
  body: JSON.stringify({ email, password })
});
const body = await r.json().catch(() => null);
out.login = {
  status: r.status,
  ok: body?.ok ?? null,
  error: body?.error ?? null,
  principal: body?.principal ?? null,
  staff: body?.staff ? { email: body.staff.email, name: body.staff.name, role: body.staff.role } : null,
  retryAfter: r.headers.get("retry-after")
};
console.log("login:", JSON.stringify(out.login));
const setCookie = r.headers.get("set-cookie") || "";
const m = setCookie.match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookieValue = m ? m[1] : null;
out.gotCookie = !!cookieValue;
if (r.status !== 200 || !cookieValue) {
  writeFileSync(`${OUT}/prove.json`, JSON.stringify(out, null, 2));
  console.error("No session. Stopping before the look.");
  process.exit(1);
}

// 2. Who does the server think this is? GET only.
{
  const s = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: `fundhub_session=${cookieValue}` } });
  const j = await s.json().catch(() => null);
  const who = j?.staff || j?.principal || j?.account || null;
  out.session = {
    status: s.status, ok: j?.ok ?? null,
    kind: j?.principal && typeof j.principal === "string" ? j.principal : null,
    email: who?.email ?? null, name: who?.name ?? null, role: who?.role ?? null
  };
  console.log("session:", JSON.stringify(out.session));
}

// 3. Look at the queue. GET only. Nothing clicked.
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const domain of ["fundhub.ai", ".fundhub.ai"]) {
  await ctx.addCookies([{ name: "fundhub_session", value: cookieValue, domain, path: "/", httpOnly: true, secure: true }]);
}
const page = await ctx.newPage();
const net = [];
await page.route("**/*", (route) => {
  const method = route.request().method();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    net.push({ blocked: method, url: route.request().url().replace(BASE, "") });
    return route.abort();
  }
  return route.continue();
});
page.on("response", (resp) => {
  const u = resp.url();
  if (!u.includes("/api/")) return;
  net.push({ method: resp.request().method(), url: u.replace(BASE, ""), status: resp.status() });
});
const nav = await page.goto(`${BASE}/app/csm-queue.html`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForSelector("#fh-shell-chip", { timeout: 20000 }).catch(() => null);
await page.waitForTimeout(3000);
out.page = {
  status: nav?.status() ?? null,
  finalUrl: page.url().replace(BASE, ""),
  title: await page.title(),
  chip: await page.locator("#fh-shell-chip span").first().innerText().catch(() => null),
  heading: await page.locator(".topbar h1").first().innerText().catch(() => null),
  queueCount: await page.locator("#qCount").innerText().catch(() => null),
  queueLabel: await page.locator("#qCountLabel").innerText().catch(() => null),
  bannerText: await page.locator("#qBanner").innerText().catch(() => null)
};
out.net = net;
out.blockedNonGet = net.filter((n) => n.blocked);
out.apiErrors = net.filter((n) => n.status && n.status >= 400);
await page.screenshot({ path: `${OUT}/csm-queue-elena-raw.png` });

// 4. Red boxes from real element positions, numbered, with a legend.
const marks = [
  { sel: "#fh-shell-chip span", text: "Signed in as the new real person, role csm (not the demo account)" },
  { sel: ".topbar h1", text: "Her home page: the Client Success queue (csm-queue.html)" },
  { sel: "#qList > :first-child", text: "Her queue loaded with her own session. Nothing was clicked." }
];
out.marks = await page.evaluate((list) => {
  const placed = [];
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  list.forEach((mk, i) => {
    const el = document.querySelector(mk.sel);
    if (!el) { placed.push({ n: i + 1, sel: mk.sel, found: false }); return; }
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) { placed.push({ n: i + 1, sel: mk.sel, found: true, visible: false }); return; }
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:${b.left - 4}px;top:${b.top - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid #FF2828;border-radius:4px;box-sizing:border-box`;
    const tag = document.createElement("div");
    tag.textContent = String(i + 1);
    tag.style.cssText = `position:fixed;left:${Math.max(0, b.left - 16)}px;top:${Math.max(0, b.top - 16)}px;width:24px;height:24px;border-radius:12px;background:#FF2828;color:#fff;font:700 14px/24px Helvetica,Arial,sans-serif;text-align:center`;
    layer.appendChild(box);
    layer.appendChild(tag);
    placed.push({ n: i + 1, sel: mk.sel, found: true, visible: true, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) });
  });
  const legend = document.createElement("div");
  legend.style.cssText = "position:fixed;left:16px;bottom:16px;max-width:760px;background:rgba(0,0,0,.86);color:#fff;border:2px solid #FF2828;border-radius:8px;padding:10px 14px;font:500 14px/1.45 Helvetica,Arial,sans-serif";
  legend.innerHTML = "<div style='font-weight:700;margin-bottom:4px'>Hole 3 proof — a real Client Success person can sign in (demo logins stay off)</div>" +
    list.map((mk, i) => `<div><b style='color:#FF6B6B'>${i + 1}</b> — ${mk.text}</div>`).join("");
  layer.appendChild(legend);
  document.body.appendChild(layer);
  return placed;
}, marks);
await page.screenshot({ path: `${OUT}/csm-queue-elena-marked.png` });
await browser.close();

writeFileSync(`${OUT}/prove.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ page: out.page, blockedNonGet: out.blockedNonGet, apiErrors: out.apiErrors, marks: out.marks }, null, 2));
