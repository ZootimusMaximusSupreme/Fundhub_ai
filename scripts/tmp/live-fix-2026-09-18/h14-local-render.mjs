// Hole 14 — look only. The FIXED inquiry-remover.html from this branch, served in
// place of the live copy, reading the LIVE repair queue. Proves the new header
// before ship. Everything else (API, scripts, css) is the live site.
// No Send, no Stage. Every non-GET request in the browser is aborted.
// Never prints passwords, tokens or cookies.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h14-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-14";
mkdirSync(SHOTS, { recursive: true });
const TAG = process.argv[2] || "local-render";
const LOCAL_HTML = new URL("../../../public/app/inquiry-remover.html", import.meta.url);

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h14-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookie = m ? m[1] : null;
const out = { at: new Date().toISOString(), tag: TAG, loginStatus: r.status, gotCookie: Boolean(cookie) };
if (!cookie) { console.log(JSON.stringify(out, null, 2)); process.exit(1); }

// The API the screen uses.
{
  const a = await fetch(`${BASE}/api/read/repair-cases`, { headers: { cookie: `fundhub_session=${cookie}`, accept: "application/json" } });
  const d = await a.json().catch(() => null);
  out.api = {
    status: a.status,
    ok: d?.ok ?? null,
    need_me: d?.need_me, ready: d?.ready, waiting: d?.waiting, stalled: d?.stalled, trial_ending: d?.trial_ending, total: d?.total,
    files: (d?.files || []).map((f) => ({ name: f.name, program: f.program, stage_key: f.stage_key })),
  };
}

const browser = await chromium.launch({ headless: true });
out.passes = [];
for (let i = 1; i <= 2; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([
    { name: "fundhub_session", value: cookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  ]);
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const q = route.request();
    if (q.method() === "GET" && new URL(q.url()).pathname === "/app/inquiry-remover.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
    blocked.push(`${q.method()} ${new URL(q.url()).pathname}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.click("#tab-repair");
  await page.waitForFunction(() => {
    const t = document.getElementById("repairStalled");
    return t && t.textContent.trim() !== "—";
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const look = await page.evaluate(() => {
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
    const btn = document.getElementById("deskNext");
    const none = document.getElementById("deskNextNone");
    return {
      deskLabel: txt("deskLabel"), deskValue: txt("deskValue"), deskSub: txt("deskSub"),
      nextButton: btn && !btn.hidden ? btn.textContent.trim() : null,
      quietLine: none && !none.hidden ? none.textContent.trim() : null,
      tiles: { need: txt("repairNeedMe"), ready: txt("repairReady"), waiting: txt("repairWaiting"), stalled: txt("repairStalled"), trial: txt("repairTrial") },
      rows: [...document.querySelectorAll("[data-repair-row]")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
    };
  });
  await page.screenshot({ path: `${SHOTS}/${TAG}-pass${i}.png`, fullPage: false });
  out.passes.push({ pass: i, look, blocked });
  await ctx.close();
}
await browser.close();
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
