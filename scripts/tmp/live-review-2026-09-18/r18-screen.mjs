// Hole 18 reviewer — look-only screen pass on live. Signs in with the real password form,
// then opens Combo's client portal and the Funding: Card Stacking board. Blocks every
// non-GET request except the sign-in POST. Masks phones/emails in the headless page before
// each shot, draws red numbered boxes + a legend, and saves the shots.
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
await page.click("#go");
await page.waitForTimeout(5000);
const signedIn = !/login\.html/.test(page.url());
console.log("sign-in:", signedIn ? "ok" : "FAILED", "landed on", new URL(page.url()).pathname);
if (!signedIn) { await browser.close(); process.exit(2); }

// Hide phones and emails in the headless page only (nothing is sent anywhere).
async function maskPage() {
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const em = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*…?\.{0,3}$/g;
    const ph = /\+?\d[\d\s().-]{8,}\d/g;
    let n; while ((n = w.nextNode())) {
      const t = n.nodeValue; if (!t) continue;
      let v = t.replace(em, "[email hidden]").replace(ph, "[phone hidden]");
      if (/^\s*[A-Za-z0-9._%+-]+\+sim[^\s]*/.test(v)) v = "[email hidden]";
      if (v !== t) n.nodeValue = v;
    }
  });
}

// Rects are viewport coords; boxes are position:fixed so inner scroll areas do not matter.
async function mark(boxes, legendTitle) {
  await page.evaluate(({ boxes, legendTitle }) => {
    document.querySelectorAll(".r18-mark").forEach((e) => e.remove());
    for (const b of boxes) {
      if (!b.rect) continue;
      const d = document.createElement("div"); d.className = "r18-mark";
      Object.assign(d.style, { position: "fixed", left: b.rect.x - 4 + "px", top: b.rect.y - 4 + "px", width: b.rect.w + 8 + "px", height: b.rect.h + 8 + "px", border: "3px solid #e00000", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
      const t = document.createElement("div");
      Object.assign(t.style, { position: "absolute", left: "-3px", top: "-26px", background: "#e00000", color: "#fff", font: "bold 15px/22px Arial", padding: "0 8px", borderRadius: "3px" });
      t.textContent = String(b.n); d.appendChild(t); document.body.appendChild(d);
    }
    const lg = document.createElement("div"); lg.className = "r18-mark";
    Object.assign(lg.style, { position: "fixed", right: "12px", bottom: "12px", maxWidth: "600px", background: "#fff", color: "#111", border: "3px solid #e00000", font: "14px/20px Arial", padding: "8px 12px", zIndex: 2147483647, boxShadow: "0 2px 8px rgba(0,0,0,.3)" });
    lg.innerHTML = `<b>${legendTitle}</b><br>` + boxes.map((b) => `<b style="color:#e00000">${b.n}</b> ${b.caption}${b.rect ? "" : " <i>(not found on screen)</i>"}`).join("<br>");
    document.body.appendChild(lg);
  }, { boxes, legendTitle });
}

async function rectOf(selector) {
  return page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, text: (el.innerText || "").trim().slice(0, 200) }; }, selector);
}
// Smallest visible element whose text matches the regex.
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
      if (!best || r.width * r.height < best.a) best = { a: r.width * r.height, x: r.left, y: r.top, w: r.width, h: r.height, text: txt.slice(0, 200) };
    }
    return best;
  }, { reSrc, flags, within });
}

const result = { look: LOOK, at: new Date().toISOString(), signedIn, portal: null, board: null };

// ---------- Combo's client portal (tall viewport so the whole page fits) ----------
await page.setViewportSize({ width: 1440, height: 3600 });
await page.goto(`${BASE}/app/client-portal.html?id=${COMBO}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await page.click("#acct > summary").catch((e) => console.log("drawer click failed", e.message)); // local toggle only
await page.waitForTimeout(2500);
await page.evaluate(() => { const m = document.querySelector("main"); if (m) m.scrollTop = 0; });
await page.waitForTimeout(500);
const portalText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
writeFileSync(`${OUT}/${LOOK}-portal-text.txt`, mask(portalText));
const payText = await page.evaluate(() => { const el = document.querySelector("#tp-pay"); return el ? el.innerText.replace(/\s+/g, " ").trim() : null; });
await maskPage();
const pN = {
  name: await findRect("^Sim Combo-20260918$"),
  status: await findRect("CURRENT STATUS[\\s\\S]*round", "i"),
  funding: await findRect("Funding, done-for-you[\\s\\S]*Included", "i"),
  paid: await findRect("Card Stacking DFY[\\s\\S]*3,?000\\.00[\\s\\S]*succeeded", "i", "#tp-pay"),
  payPane: await rectOf("#tp-pay"),
};
result.portal = {
  url: page.url().replace(BASE, ""),
  paymentsPane: payText ? mask(payText).slice(0, 600) : null,
  has3000Paid: /3,?000\.00\s*succeeded/i.test(payText || ""),
  statusCard: pN.status ? mask(pN.status.text) : null,
  fundingCard: pN.funding ? mask(pN.funding.text) : null,
  mentionsPendingOrUnpaid: /\bpending\b|unpaid|not paid|awaiting payment/i.test(portalText + " " + (payText || "")),
  mentionsPayLink: /pay(ment)? link|pay now/i.test(portalText),
};
await mark([
  { n: 1, rect: pN.name, caption: "Client on screen is Sim Combo-20260918." },
  { n: 2, rect: pN.status, caption: "Current status: funding file is open, round will move." },
  { n: 3, rect: pN.funding, caption: "Funding, done-for-you reads Included — you own this." },
  { n: 4, rect: pN.paid || pN.payPane, caption: pN.paid ? "Payments: Card Stacking DFY 3000.00 succeeded." : "Payments: no $3,000 line found." },
], `Hole 18 review ${LOOK} (${result.at.slice(11, 19)} UTC) — Combo client portal, staff view`);
await page.screenshot({ path: `${OUT}/${LOOK}-portal-marked.png` });

// ---------- Funding board (Pipeline, R-02 Funding: Card Stacking) ----------
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.click('.rail-tab[data-rail="R-02"]').catch((e) => console.log("rail click failed", e.message)); // switches board view (GET only)
await page.waitForTimeout(6000);
const boardText = await page.evaluate(() => (document.querySelector(".board") || document.body).innerText.replace(/\s+/g, " ").trim());
writeFileSync(`${OUT}/${LOOK}-board-text.txt`, mask(boardText));
const cardInfo = await page.evaluate(() => {
  const card = [...document.querySelectorAll(".board .card")].find((el) => /Combo-20260918/.test(el.innerText || ""));
  if (!card) return null;
  card.scrollIntoView({ block: "center" });
  const col = card.closest("section.col");
  return { text: (card.innerText || "").trim().slice(0, 300), colName: col ? (col.querySelector(".col-name") || {}).innerText : null, colKey: col ? col.dataset.stageKey : null };
});
await page.waitForTimeout(500);
await maskPage();
const tabR = await rectOf('.rail-tab[data-rail="R-02"]');
const cardR = await page.evaluate(() => { const c = [...document.querySelectorAll(".board .card")].find((el) => /Combo-20260918/.test(el.innerText || "")); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const colR = await page.evaluate(() => { const c = [...document.querySelectorAll(".board .card")].find((el) => /Combo-20260918/.test(el.innerText || "")); const h = c && c.closest("section.col") && c.closest("section.col").querySelector(".col-head"); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
result.board = { activeTabActive: await page.evaluate(() => { const t = document.querySelector('.rail-tab[data-rail="R-02"]'); return !!(t && t.classList.contains("active")); }), comboCard: cardInfo ? mask(cardInfo.text) : null, column: cardInfo ? `${cardInfo.colName} (${cardInfo.colKey})` : null };
await mark([
  { n: 1, rect: tabR, caption: "Board shown is R-02 Funding: Card Stacking." },
  { n: 2, rect: colR, caption: `Column: ${cardInfo ? cardInfo.colName : "?"}.` },
  { n: 3, rect: cardR, caption: cardR ? "Sim Combo-20260918 card is on the funding board." : "No Combo card on the funding board." },
], `Hole 18 review ${LOOK} (${new Date().toISOString().slice(11, 19)} UTC) — Funding board`);
await page.screenshot({ path: `${OUT}/${LOOK}-board-marked.png` });

result.blockedRequests = [...new Set(blocked)];
result.apiSeen = [...new Set(apiSeen)];
console.log(JSON.stringify(result, null, 2));
await browser.close();
