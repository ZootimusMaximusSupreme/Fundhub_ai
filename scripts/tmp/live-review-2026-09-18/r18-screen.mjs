// Hole 18 reviewer — look-only screen pass on live. Signs in with the real password form,
// then opens Combo's client portal and the Funding: Card Stacking board. Blocks every
// non-GET request except the sign-in POST. Draws red numbered boxes + legend, saves shots.
// Usage: node --env-file=<.env> r18-screen.mjs <lookN>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const LOOK = process.argv[2] || "look1";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-18/review";
mkdirSync(OUT, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }
const mask = (s) => String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]").replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const blocked = [], apiSeen = [];
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method(); const u = new URL(r.url());
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${u.hostname}${u.pathname}`); return route.abort();
});
const page = await ctx.newPage();
page.on("response", (res) => { try { const u = new URL(res.url()); if (u.hostname === "fundhub.ai" && u.pathname.startsWith("/api/")) apiSeen.push(`${res.request().method()} ${u.pathname} ${res.status()}`); } catch {} });

// Sign in with the password form.
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), page.click("#go")]);
await page.waitForTimeout(4000);
const afterLogin = page.url();
const signedIn = !/login\.html/.test(afterLogin);
console.log("sign-in:", signedIn ? "ok" : "FAILED", "landed on", new URL(afterLogin).pathname);

async function mark(boxes, legendTitle) {
  // boxes: [{n, rect:{x,y,w,h}, caption}] in page coords
  await page.evaluate(({ boxes, legendTitle }) => {
    document.querySelectorAll(".r18-mark").forEach((e) => e.remove());
    for (const b of boxes) {
      if (!b.rect) continue;
      const d = document.createElement("div"); d.className = "r18-mark";
      Object.assign(d.style, { position: "absolute", left: b.rect.x - 4 + "px", top: b.rect.y - 4 + "px", width: b.rect.w + 8 + "px", height: b.rect.h + 8 + "px", border: "3px solid #e00000", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
      const t = document.createElement("div");
      Object.assign(t.style, { position: "absolute", left: "-3px", top: "-26px", background: "#e00000", color: "#fff", font: "bold 15px/22px Arial", padding: "0 8px", borderRadius: "3px" });
      t.textContent = String(b.n); d.appendChild(t); document.body.appendChild(d);
    }
    const lg = document.createElement("div"); lg.className = "r18-mark";
    Object.assign(lg.style, { position: "fixed", right: "12px", bottom: "12px", maxWidth: "560px", background: "#fff", color: "#111", border: "3px solid #e00000", font: "14px/20px Arial", padding: "8px 12px", zIndex: 2147483647, boxShadow: "0 2px 8px rgba(0,0,0,.3)" });
    lg.innerHTML = `<b>${legendTitle}</b><br>` + boxes.map((b) => `<b style="color:#e00000">${b.n}</b> ${b.caption}${b.rect ? "" : " <i>(not found on screen)</i>"}`).join("<br>");
    document.body.appendChild(lg);
  }, { boxes, legendTitle });
}

// Find the smallest visible element whose text matches a regex; return page-coord rect.
async function findRect(reSrc, flags = "i", within = null) {
  return page.evaluate(({ reSrc, flags, within }) => {
    const re = new RegExp(reSrc, flags);
    const root = within ? document.querySelector(within) : document.body;
    if (!root) return null;
    let best = null;
    for (const el of root.querySelectorAll("*")) {
      if (el.closest(".r18-mark")) continue;
      const txt = (el.innerText || "").trim();
      if (!txt || !re.test(txt)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const st = getComputedStyle(el); if (st.visibility === "hidden" || st.display === "none") continue;
      if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, text: txt.slice(0, 160) };
    }
    return best;
  }, { reSrc, flags, within });
}

const result = { look: LOOK, at: new Date().toISOString(), signedIn, portal: null, board: null };

// ---------- Combo's client portal ----------
await page.goto(`${BASE}/app/client-portal.html?id=${COMBO}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
const portalText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
writeFileSync(`${OUT}/${LOOK}-portal-text.txt`, mask(portalText));
// Open the "Account & history" drawer (a local toggle; Payments tab is the default pane).
await page.click("#acct > summary").catch((e) => console.log("drawer click failed", e.message));
await page.waitForTimeout(2500);
const payText = await page.evaluate(() => { const el = document.querySelector("#tp-pay"); return el ? el.innerText.replace(/\s+/g, " ").trim() : null; });
const payRect = await page.evaluate(() => { const el = document.querySelector("#tp-pay"); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
const pNeedles = {
  name: await findRect("^Sim Combo-20260918$"),
  status: await findRect("CURRENT STATUS[\\s\\S]*round", "i"),
  funding: await findRect("Funding, done-for-you[\\s\\S]*Included", "i"),
  paid3000: await findRect("\\$3,000", "", "#tp-pay"),
};
result.portal = {
  url: page.url().replace(BASE, ""), title: await page.title(),
  has3000: /\$3,000/.test(portalText + " " + (payText || "")), paymentsPane: payText ? mask(payText).slice(0, 600) : null,
  snippets: Object.fromEntries(Object.entries(pNeedles).map(([k, v]) => [k, v ? mask(v.text) : null])),
};
await page.screenshot({ path: `${OUT}/${LOOK}-portal-raw.png`, fullPage: true });
const pBoxes = [
  { n: 1, rect: pNeedles.name, caption: "Client on screen is Sim Combo-20260918." },
  { n: 2, rect: pNeedles.status, caption: "Current status: funding file open, round moving." },
  { n: 3, rect: pNeedles.funding, caption: "Funding, done-for-you now reads Included — you own this." },
  { n: 4, rect: pNeedles.paid3000 || payRect, caption: pNeedles.paid3000 ? "Payments tab: the $3,000 payment." : "Payments tab: no $3,000 line found." },
];
await mark(pBoxes, `Hole 18 review ${LOOK} — Combo client portal (staff view)`);
await page.screenshot({ path: `${OUT}/${LOOK}-portal-marked.png`, fullPage: true });

// ---------- Funding board (Pipeline, R-02 Funding: Card Stacking) ----------
await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.click('.rail-tab[data-rail="R-02"]').catch((e) => console.log("rail click failed", e.message));
await page.waitForTimeout(6000);
const tab = await findRect("Funding: Card Stacking", "i", ".railbar");
const card = await page.evaluate(() => {
  const els = [...document.querySelectorAll(".board *")].filter((el) => /Combo/i.test(el.innerText || ""));
  let best = null;
  for (const el of els) { const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 20) continue; if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, text: (el.innerText || "").trim().slice(0, 200) }; }
  // column the card sits in
  let col = null;
  if (best) { const el = els.find((e) => (e.innerText || "").trim().slice(0, 200) === best.text); const c = el && el.closest(".col, .column, [data-stage-key], [data-stage]"); if (c) { const h = c.querySelector("h2,h3,h4,.col-h,.col-title,header"); col = (h ? h.innerText : c.getAttribute("data-stage-key") || "").trim().slice(0, 80); } }
  return best ? { ...best, col } : null;
});
const colRect = card && card.col ? await findRect(card.col.split("\n")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i", ".board") : null;
const boardText = await page.evaluate(() => (document.querySelector(".board") || document.body).innerText.replace(/\s+/g, " ").trim());
writeFileSync(`${OUT}/${LOOK}-board-text.txt`, mask(boardText));
result.board = { activeTab: tab ? tab.text : null, comboCard: card ? mask(card.text) : null, column: card ? card.col : null, boardHasCombo: /Combo/i.test(boardText) };
if (card) await page.evaluate(({ y }) => window.scrollTo(0, Math.max(0, y - 300)), { y: card.y });
await page.screenshot({ path: `${OUT}/${LOOK}-board-raw.png`, fullPage: true });
await mark([
  { n: 1, rect: tab, caption: "Board shown is R-02 Funding: Card Stacking." },
  { n: 2, rect: colRect, caption: `Column the Combo card sits in${card && card.col ? `: ${card.col.split("\n")[0]}` : ""}.` },
  { n: 3, rect: card, caption: card ? "Sim Combo-20260918 card is on the funding board." : "No Combo card found on the funding board." },
], `Hole 18 review ${LOOK} — Funding board`);
await page.screenshot({ path: `${OUT}/${LOOK}-board-marked.png`, fullPage: true });

result.blockedRequests = [...new Set(blocked)];
result.apiSeen = [...new Set(apiSeen)];
console.log(JSON.stringify(result, null, 2));
await browser.close();
