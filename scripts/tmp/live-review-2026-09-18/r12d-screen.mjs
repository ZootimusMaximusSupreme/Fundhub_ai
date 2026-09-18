// r12d — reviewer 4, hole 12. LOOK ONLY. Own headless Playwright (not the shared MCP browser).
// Password sign-in at /login.html, then open the #8 control panel TWICE (two fresh browsers).
// Each load: wait for the name, record the big "next step" line; open the collapsed Details
// (show/hide toggle only, no save) and record whether "Saved on the record" shows.
// Blocks every non-GET except the one sign-in POST. Never prints the password, token or cookie.
// Red numbered boxes + one-line legend on each shot (CLAUDE.md §8).
//   node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r12d-screen.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = "https://fundhub.ai";
const ID = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12/review4";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD missing"); process.exit(1); }
const out = { started: new Date().toISOString(), client: ID, loads: [], blocked: [] };

async function mark(page, items, file) {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), items[0].sel);
  await page.waitForTimeout(400);
  const clip = await page.evaluate((items) => {
    const layer = document.createElement("div");
    layer.id = "__r12d";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    const legend = []; let top = Infinity, bottom = 0;
    for (const it of items) {
      const el = document.querySelector(it.sel);
      const r = el ? el.getBoundingClientRect() : null;
      if (!el || el.hidden || !r || r.height === 0) { legend.push(`${it.n} = ${it.label}: ${it.missing}`); continue; }
      const b = document.createElement("div");
      b.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 4}px;width:${r.width + 10}px;height:${r.height + 8}px;border:3px solid #e00;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = it.n;
      tag.style.cssText = `position:fixed;left:${Math.max(0, r.left - 30)}px;top:${r.top - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
      layer.append(b, tag);
      const w = (el.innerText || "").trim().replace(/\s*\n\s*/g, " / ");
      legend.push(`${it.n} = ${it.label}: "${w.length > 200 ? w.slice(0, 200) + "…" : w}"`);
      top = Math.min(top, r.top - 14); bottom = Math.max(bottom, r.bottom + 10);
    }
    if (top === Infinity) { top = 0; bottom = 200; }
    const lg = document.createElement("div");
    lg.style.cssText = `position:fixed;left:240px;top:${Math.min(bottom + 12, innerHeight - 110)}px;width:980px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px`;
    lg.innerHTML = legend.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    layer.append(lg); document.body.append(layer);
    bottom = Math.max(bottom, lg.getBoundingClientRect().bottom + 10);
    const y0 = Math.max(0, top - 60);
    return { y: y0, width: document.documentElement.clientWidth, height: Math.min(innerHeight - y0, bottom - y0 + 10), legend };
  }, items);
  await page.screenshot({ path: file, clip: { x: 0, y: clip.y, width: clip.width, height: clip.height } });
  await page.evaluate(() => document.getElementById("__r12d")?.remove()).catch(() => {});
  return { file, legend: clip.legend };
}

const READ = () => {
  const vis = (s) => { const el = document.querySelector(s); return el && !el.hidden ? el.innerText.trim() : null; };
  const sv = document.getElementById("ccp-saved");
  const body = document.body.innerText;
  return {
    name_on_page: body.includes("Sim Eight-Funding"),
    big: vis("#ccp-next-action"),
    why: vis("#ccp-cp-why"),
    inquiries: vis("#ccp-next-inquiries"),
    details_open: !(document.getElementById("details-body")?.hidden ?? true),
    saved_line_hidden: sv ? sv.hidden : null,
    saved_line_text: sv ? sv.innerText.trim() : null,
    saved_on_record_anywhere: body.match(/Saved on the record[^\n]{0,80}/g) || [],
  };
};

for (const n of [1, 2]) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route("**/*", (route) => {
    const r = route.request(); const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const p = new URL(r.url()).pathname;
    if (m === "POST" && p === "/api/auth/login") return route.continue();
    out.blocked.push(`load${n} ${m} ${p}`); return route.abort();
  });
  const load = { n };
  try {
    const lp = await ctx.newPage();
    await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
    await lp.fill("#email", "chris@fundhub.ai");
    await lp.fill("#pw", pw);
    const lr = lp.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
    await lp.click("#go");
    load.sign_in_status = (await lr).status();
    await lp.waitForTimeout(2500);
    load.landed = new URL(lp.url()).pathname;
    await lp.close();
    if (load.sign_in_status !== 200) { out.loads.push(load); console.log(`load ${n}: sign-in failed ${load.sign_in_status}`); await browser.close(); break; }

    const page = await ctx.newPage();
    let api = null;
    page.on("response", async (res) => {
      const u = new URL(res.url());
      if (u.pathname === "/api/dashboard/client" && u.searchParams.get("id") === ID) {
        try { const d = await res.json(); api = { status: res.status(), shown: d?.next_action?.label ?? null, degraded: d?.next_action_degraded ?? null, saved: d?.client?.custom_fields?.employee_next_action ?? null, scores_on_file: d?.scores_on_file ?? null }; } catch {}
      }
    });
    await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("Sim Eight-Funding"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    load.at = new Date().toISOString();
    load.before_details = await page.evaluate(READ);
    load.shot_big = await mark(page, [
      { n: "1", sel: "#ccp-next-action", label: `Load ${n} big next-step line`, missing: "not on the page" },
      { n: "2", sel: "#ccp-next-inquiries", label: "Inquiries under it", missing: "none shown" },
    ], `${SHOTS}/h12-r4-load${n}-big.png`);
    // Open Details — a show/hide toggle only, no save.
    const tog = page.locator('button.tog[aria-controls="details-body"]');
    await tog.scrollIntoViewIfNeeded();
    await tog.click();
    await page.waitForTimeout(800);
    load.after_details = await page.evaluate(READ);
    load.shot_details = await mark(page, [
      { n: "1", sel: 'button.tog[aria-controls="details-body"]', label: `Load ${n} Details opened`, missing: "not found" },
      { n: "2", sel: "#ccp-saved", label: "\"Saved on the record\" line", missing: "NOT SHOWN (hidden) — no Saved on the record line" },
    ], `${SHOTS}/h12-r4-load${n}-details.png`);
    load.api = api;
    await page.close();
  } catch (e) { load.error = String(e).slice(0, 300); }
  out.loads.push(load);
  await browser.close();
  const b = load.before_details || {}, a = load.after_details || {};
  console.log(`load ${n} @${load.at} sign-in=${load.sign_in_status} landed=${load.landed} name=${b.name_on_page} big=${JSON.stringify(b.big)} inquiries=${JSON.stringify(b.inquiries)} details_open=${a.details_open} saved_line_hidden=${a.saved_line_hidden} saved_line_text=${JSON.stringify(a.saved_line_text)} anywhere=${JSON.stringify(a.saved_on_record_anywhere)} api=${JSON.stringify(api)}${load.error ? " ERROR " + load.error : ""}`);
  if (n === 1) await new Promise((r) => setTimeout(r, 5000));
}
out.finished = new Date().toISOString();
writeFileSync(`${SHOTS}/r12d-screen.json`, JSON.stringify(out, null, 2));
console.log(`blocked non-GET: ${JSON.stringify(out.blocked)}`);
