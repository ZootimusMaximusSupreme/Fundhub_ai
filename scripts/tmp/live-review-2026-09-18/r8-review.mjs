// Hole 8 REVIEWER (not the fixer). Look only, on live.
// Signs in through the real password form. Twice, each on fresh page loads, opens:
//   1) #8 control panel -> System Facts -> Funded line
//   2) Pipeline -> Fulfillment -> Total Approved tile + note (after Total clients shows a number)
//   3) Ops Admin -> Money -> Funded tile + CEO brief "Funded files / Funded dollars"
// Marks each with red numbered boxes + an on-image legend, screenshots.
// Every request that is not a GET is aborted, except the one sign-in POST.
// Never prints a password, token or cookie.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r8-review.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const TAG = process.argv[2] || "review";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-8/review";
mkdirSync(SHOTS, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG, blocked: [], loads: [] };

const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let signInPosts = 0;
await ctx.route("**/*", (route) => {
  const r = route.request();
  const u = new URL(r.url());
  if (r.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login" && signInPosts === 0) { signInPosts++; return route.continue(); }
  if (r.method() !== "GET") { out.blocked.push(`${r.method()} ${u.hostname}${u.pathname}`); return route.abort(); }
  return route.continue();
});

// sign in like a person
const login = await ctx.newPage();
await login.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await login.fill("#email", "chris@fundhub.ai");
await login.fill("#pw", pw);
const [lr] = await Promise.all([
  login.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 30_000 }),
  login.click("#go"),
]);
out.loginStatus = lr.status();
await login.waitForTimeout(2500);
out.signedIn = (await ctx.cookies(BASE)).some((c) => c.name === "fundhub_session");
await login.close();
if (out.loginStatus !== 200 || !out.signedIn) {
  writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
  console.log("SIGN-IN FAILED", out.loginStatus, out.signedIn);
  await browser.close();
  process.exit(1);
}

// draw fixed-position red numbered boxes around the given rects + a legend, in viewport coordinates
async function mark(page, title, items) {
  await page.evaluate(({ title, items }) => {
    document.querySelectorAll(".r8-mark").forEach((e) => e.remove());
    items.forEach((it, i) => {
      const b = it.rect;
      if (!b) return;
      const box = document.createElement("div");
      box.className = "r8-mark";
      Object.assign(box.style, { position: "fixed", left: `${b.left - 5}px`, top: `${b.top - 5}px`, width: `${b.width + 10}px`, height: `${b.height + 10}px`, border: "3px solid #e00", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      Object.assign(tag.style, { position: "absolute", left: "-15px", top: "-15px", background: "#e00", color: "#fff", font: "bold 14px sans-serif", width: "24px", height: "24px", borderRadius: "12px", textAlign: "center", lineHeight: "24px" });
      box.appendChild(tag);
      document.body.appendChild(box);
    });
    const legend = document.createElement("div");
    legend.className = "r8-mark";
    legend.innerHTML = `<b>${title.replace(/</g, "&lt;")}</b><br>` + items.map((it, i) => `${i + 1}. ${it.cap.replace(/</g, "&lt;")}`).join("<br>");
    Object.assign(legend.style, { position: "fixed", left: "240px", right: "16px", bottom: "12px", background: "#fff", color: "#111", border: "3px solid #e00", padding: "8px 10px", font: "14px/1.45 sans-serif", zIndex: 2147483647 });
    document.body.appendChild(legend);
  }, { title, items });
}
const rectOf = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, sel);
const stamp = () => new Date().toISOString().slice(0, 19) + "Z";

for (const n of [1, 2]) {
  const load = { n };

  // ---------- 1. control panel ----------
  {
    const pg = await ctx.newPage();
    const api = {};
    pg.on("response", async (resp) => {
      const u = new URL(resp.url());
      if (u.hostname !== "fundhub.ai" || !/\/api\/dashboard\/client$/.test(u.pathname)) return;
      try { const j = await resp.json(); const d = j?.data || j || {}; const c = d.client || {};
        api.status = resp.status(); api.funded = c.funded; api.funded_amount = c.funded_amount;
        api.rounds = (d.funding_rounds || []).map((x) => ({ n: x.round_number, status: x.status, approved: x.approved_amount, funded: x.funded_amount }));
      } catch { api.status = resp.status(); api.json = false; }
    });
    await pg.goto(`${BASE}/app/client-control-panel.html?id=${EIGHT}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await pg.waitForFunction(() => { const e = document.getElementById("ccp-facts-funded"); const t = e ? e.textContent.trim() : ""; return t !== "" && t !== "—"; }, null, { timeout: 30_000 }).catch(() => {});
    await pg.waitForTimeout(2500);
    const tog = pg.locator("button.tog", { hasText: /System Facts/i }).first();
    load.ccpToggleFound = await tog.count();
    if (load.ccpToggleFound && (await tog.getAttribute("aria-expanded")) !== "true") await tog.click();
    await pg.waitForTimeout(800);
    const row = pg.locator(".fact-row", { has: pg.locator("#ccp-facts-funded") }).first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await pg.waitForTimeout(400);
    load.ccp = await pg.evaluate(() => {
      const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
      const f = document.getElementById("ccp-facts-funded");
      const r = f?.closest(".fact-row");
      return { name: t("ccp-name"), fundedRow: r ? r.innerText.replace(/\s+/g, " ").trim() : null, fundedValue: t("ccp-facts-funded"), visible: !!f && f.offsetParent !== null, roundStatus: t("ccp-cp-round-status") };
    });
    load.ccpApi = api;
    const rr = await pg.evaluate(() => { const e = document.getElementById("ccp-facts-funded")?.closest(".fact-row"); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
    await mark(pg, `Hole 8 review — control panel #8 — load ${n} — ${stamp()}`, [
      { rect: rr, cap: `System Facts → Funded line reads: "${load.ccp.fundedValue}" (live rounds: 2 funded × $25,000 = $50,000)` },
    ]);
    load.ccpShot = `${SHOTS}/${TAG}-ccp-load${n}-marked.png`;
    await pg.screenshot({ path: load.ccpShot });
    await pg.close();
  }

  // ---------- 2. pipeline -> fulfillment ----------
  {
    const pg = await ctx.newPage();
    const api = [];
    pg.on("response", async (resp) => {
      const u = new URL(resp.url());
      if (u.hostname !== "fundhub.ai" || !u.pathname.startsWith("/api/")) return;
      try { const j = await resp.json(); const d = j?.data || j || {};
        if (d.rollups) api.push({ path: u.pathname + (u.search.includes("fulfillment") ? "?fulfillment" : ""), status: resp.status(), rollups: d.rollups });
      } catch {}
    });
    await pg.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await pg.waitForTimeout(2500);
    const lens = pg.locator("button,[role=tab]", { hasText: /^\s*Fulfillment\s*$/i }).first();
    load.fulfillmentTabFound = await lens.count();
    await lens.click();
    const t0 = Date.now();
    await pg.waitForFunction(() => {
      const tile = [...document.querySelectorAll(".fh-lens-tile")].find((t) => /total clients/i.test(t.textContent));
      return tile && /\d/.test(tile.textContent.replace(/total clients/i, ""));
    }, null, { timeout: 60_000 }).catch(() => {});
    load.fulfillmentWaitMs = Date.now() - t0;
    await pg.waitForTimeout(1500);
    load.fulfillment = await pg.evaluate(() => {
      const tiles = [...document.querySelectorAll(".fh-lens-tile")].filter((t) => t.offsetParent !== null);
      const pick = (re) => { const t = tiles.find((x) => re.test(x.querySelector(".lt-k")?.textContent || x.textContent)); return t ? t.innerText.replace(/\s+/g, " ").trim() : null; };
      return { totalClients: pick(/total clients/i), totalApproved: pick(/total approved/i), allTiles: tiles.map((t) => t.innerText.replace(/\s+/g, " ").trim()) };
    });
    load.fulfillmentApi = api;
    const tile = pg.locator(".fh-lens-tile", { hasText: /Total Approved/i }).first();
    await tile.scrollIntoViewIfNeeded().catch(() => {});
    await pg.waitForTimeout(300);
    const rects = await pg.evaluate(() => {
      const tiles = [...document.querySelectorAll(".fh-lens-tile")].filter((t) => t.offsetParent !== null);
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; };
      return { approved: r(tiles.find((x) => /total approved/i.test(x.textContent))), clients: r(tiles.find((x) => /total clients/i.test(x.textContent))) };
    });
    await mark(pg, `Hole 8 review — Pipeline → Fulfillment — load ${n} — ${stamp()}`, [
      { rect: rects.approved, cap: `Total Approved tile + note: "${load.fulfillment.totalApproved}" (live: only real approved round is #8 Round 2, $10,000; #8 Round 1 funded with no approval)` },
      { rect: rects.clients, cap: `Total clients loaded first: "${load.fulfillment.totalClients}"` },
    ]);
    load.fulfillmentShot = `${SHOTS}/${TAG}-fulfillment-load${n}-marked.png`;
    await pg.screenshot({ path: load.fulfillmentShot });
    await pg.close();
  }

  // ---------- 3. ops admin -> money ----------
  {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/app/ops-admin.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await pg.waitForTimeout(2000);
    const money = pg.locator("button.zonetab", { hasText: /Money/i }).first();
    load.moneyTabFound = await money.count();
    load.moneyTabWasOn = load.moneyTabFound ? /\bon\b/.test((await money.getAttribute("class")) || "") : null;
    if (load.moneyTabFound && !load.moneyTabWasOn) await money.click();
    await pg.waitForFunction(() => {
      const t = [...document.querySelectorAll(".kpi-tile")].find((x) => /^\s*Funded/i.test(x.querySelector(".kpi-label")?.textContent || ""));
      return t && /\d/.test(t.textContent);
    }, null, { timeout: 30_000 }).catch(() => {});
    await pg.waitForFunction(() => /Funded dollars:/.test(document.body.innerText), null, { timeout: 30_000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    load.ops = await pg.evaluate(() => {
      const t = [...document.querySelectorAll(".kpi-tile")].find((x) => /^\s*Funded\s*$/i.test(x.querySelector(".kpi-label")?.textContent || ""));
      const lines = document.body.innerText.split("\n").filter((l) => /funded/i.test(l) && l.length < 200);
      return { fundedTile: t ? t.innerText.replace(/\s+/g, " ").trim() : null, window: (document.body.innerText.match(/last \d+ days|last \w+/i) || [null])[0], fundedLines: lines };
    });
    const rects = await pg.evaluate(() => {
      const r = (b) => b ? { left: b.left, top: b.top, width: b.width, height: b.height } : null;
      const t = [...document.querySelectorAll(".kpi-tile")].find((x) => /^\s*Funded\s*$/i.test(x.querySelector(".kpi-label")?.textContent || ""));
      // precise box around the two brief lines "Funded files: N" + "Funded dollars: $X"
      let brief = null;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode; const s = node.textContent;
        const i = s.indexOf("Funded files:"); if (i < 0) continue;
        const m = s.slice(i).match(/Funded files:[^\n]*\nFunded dollars:[^\n]*/);
        if (!m) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + m[0].length);
        brief = r(range.getBoundingClientRect()); break;
      }
      return { tile: r(t?.getBoundingClientRect()), brief };
    });
    const briefLines = load.ops.fundedLines.filter((l) => /Funded (files|dollars):/.test(l)).join(" / ");
    await mark(pg, `Hole 8 review — Ops Admin → Money — load ${n} — ${stamp()}`, [
      { rect: rects.tile, cap: `FUNDED tile (${load.ops.window || "window ?"}): "${load.ops.fundedTile}" (live: 1 funded file, #8)` },
      { rect: rects.brief, cap: `CEO brief: "${briefLines}" (live: #8's two funded rounds = $50,000)` },
    ]);
    load.opsShot = `${SHOTS}/${TAG}-ops-money-load${n}-marked.png`;
    await pg.screenshot({ path: load.opsShot });
    await pg.close();
  }
  load.at = stamp();
  out.loads.push(load);
}
out.blockedCount = out.blocked.length;
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
