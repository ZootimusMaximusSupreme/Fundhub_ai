// Hole 23 VERIFY / PROVE. LOOK ONLY. Owner password login, then:
//  1. GET /api/dashboard/client?id=<#13> — what the Client Control Panel paints.
//  2. Headless chromium, every non-GET request aborted (so Pull and Get Consent
//     cannot fire even by accident). Load the control panel twice, wait for
//     "Thirteen-NoBook", read the Scores tile, the Last Credit Pull line, the
//     next-step line and the blockers. Nothing is clicked.
//  Screenshots carry red numbered boxes + a legend (CLAUDE.md §8).
// Never prints the password or the cookie.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h23-verify.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TAG = process.env.TAG || "before";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-23";
mkdirSync(SHOTS, { recursive: true });

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h23-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const token = m[1];
const H = { cookie: `fundhub_session=${token}` };

const api = await fetch(`${BASE}/api/dashboard/client?id=${ID}`, { headers: H });
const d = await api.json();
const crs0 = (d?.crs_results || [])[0]?.result || {};
const out = {
  at: new Date().toISOString(),
  tag: TAG,
  api: {
    status: api.status,
    tri_merge: d?.tri_merge ?? null,
    crs_rows: (d?.crs_results || []).length,
    crs_environment: crs0.environment ?? null,
    crs_simulated: crs0.simulated ?? null,
    crs_notice: crs0.simulatedNotice ?? null,
    next_action: d?.next_action ?? null,
    active_blockers: (d?.active_blockers || []).map((b) => `${b.key} | ${b.label} | ${b.detail}`),
  },
};
console.log(JSON.stringify(out, null, 2));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 2000 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
// LOCAL=1 serves this branch's client-control-panel.html in place of the live
// copy (everything else — the API, scripts, css — is the live site). Proves the
// fix against the live rows before ship.
const LOCAL = process.env.LOCAL === "1";
const LOCAL_HTML = new URL("../../../public/app/client-control-panel.html", import.meta.url);
const blocked = [];
await context.route("**/*", (route) => {
  const q = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) { blocked.push(`${q.method()} ${q.url()}`); return route.abort(); }
  if (LOCAL && q.method() === "GET" && new URL(q.url()).pathname === "/app/client-control-panel.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
  }
  return route.continue();
});
const page = await context.newPage();

async function mark(marks, title) {
  await page.evaluate(({ marks, title }) => {
    document.querySelectorAll(".h23-mark").forEach((n) => n.remove());
    const legend = document.createElement("div");
    legend.className = "h23-mark";
    legend.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:900px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b>${title}</b>`;
    marks.forEach((mk, i) => {
      const el = document.querySelector(mk.sel);
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${mk.caption}`;
      legend.appendChild(line);
      if (!el) return;
      const b = el.getBoundingClientRect();
      if (!b.width) return; // inside a collapsed group: caption only
      const box = document.createElement("div");
      box.className = "h23-mark";
      box.style.cssText = `position:absolute;left:${b.left + window.scrollX - 4}px;top:${b.top + window.scrollY - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid #ff2828;z-index:2147483646;pointer-events:none`;
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = "position:absolute;left:-3px;top:-26px;background:#ff2828;color:#fff;font:bold 15px Helvetica,sans-serif;padding:2px 8px";
      box.appendChild(tag);
      document.body.appendChild(box);
    });
    document.body.appendChild(legend);
  }, { marks, title });
}

const looks = [];
for (let i = 1; i <= 2; i++) {
  await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Thirteen/.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 45000 });
  await page.waitForFunction(() => {
    const t = (document.getElementById("ccp-scores")?.textContent || "").trim();
    return t && t !== "—";
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const look = await page.evaluate(() => {
    const t = (id) => (document.getElementById(id)?.textContent || "").trim().replace(/\s+/g, " ");
    const cards = [...document.querySelectorAll("#ccp-cp-blockers .blocker-card")].map((c) => c.textContent.trim().replace(/\s+/g, " "));
    return {
      name: t("ccp-name"),
      scoresTile: t("ccp-scores"),
      sampleNote: document.getElementById("ccp-scores-sample")
        ? { hidden: document.getElementById("ccp-scores-sample").hidden, text: t("ccp-scores-sample") }
        : "no such element (old page)",
      scoresTileLabel: document.getElementById("ccp-scores")?.parentElement?.querySelector(".rf-label")?.textContent.trim() || null,
      factsScores: t("ccp-facts-scores"),
      lastPull: t("ccp-last-pull"),
      nextStep: t("ccp-next-action"),
      why: t("ccp-cp-why"),
      blockerCount: t("ccp-cp-blocker-count"),
      blockers: cards,
      pageSaysSimulated: /simulat|sample|not a bureau pull|not a real/i.test(document.body.innerText),
    };
  });
  looks.push(look);
  console.log(`control panel look ${i}`, JSON.stringify(look, null, 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  // One tall window, no scroll: the sticky header stays at the top and the blockers and the Scores tile both show.
  await mark([
    { sel: ".rf-tile:has(#ccp-scores)", caption: `Scores tile says: "${look.scoresTile}"` + (look.sampleNote && look.sampleNote.hidden === false ? ` — under it: "${look.sampleNote.text}"` : " — nothing says it is a sample") },
    { sel: "#ccp-cp-blockers", caption: `Active blockers (${look.blockerCount}) — "${look.blockers[0] || "none"}"` },
    { sel: "#ccp-last-pull", caption: `System Facts (collapsed) — Last Credit Pull: "${look.lastPull}" · Scores: "${look.factsScores}"` },
  ], `Hole 23 (${TAG}${LOCAL ? ", this branch's page on live data" : ", live page"}) — #13 Thirteen-NoBook, control panel look ${i}`);
  await page.screenshot({ path: `${SHOTS}/h23-${TAG}-ccp-look${i}.png`, fullPage: false });
}

out.looks = looks;
out.blockedWrites = blocked;
writeFileSync(`${SHOTS}/h23-${TAG}.json`, JSON.stringify(out, null, 2));
console.log("blocked writes:", blocked.length, blocked.slice(0, 5));
await browser.close();
