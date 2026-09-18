// Hole 7 VERIFY / PROVE. LOOK ONLY. Owner password login, then:
//  1. GET /api/dashboard/client?id=<#9>          — what the Client Control Panel paints.
//  2. GET /api/dashboard/clients?fulfillment=1   — what the Fulfillment list paints.
//  3. Headless chromium, every non-GET request aborted. Load the control panel
//     twice, wait for "Sim Nine-Repair", read the next-step line and the
//     blockers. Then open the Fulfillment list and read #9's row.
//  Screenshots carry red numbered boxes + a legend (CLAUDE.md §8), drawn by an
//  overlay injected into the page just before the shot. Nothing is clicked
//  except the Board / Fulfillment view toggle, which only reads.
// Never prints the password or the cookie.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h7-verify.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const TAG = process.env.TAG || "before";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-7";
mkdirSync(SHOTS, { recursive: true });

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h7-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const token = m[1];
const H = { cookie: `fundhub_session=${token}` };

const api = await fetch(`${BASE}/api/dashboard/client?id=${NINE}`, { headers: H });
const d = await api.json();
const list = await fetch(`${BASE}/api/dashboard/clients?limit=200&fulfillment=1`, { headers: H });
const lj = await list.json();
const row = (lj?.clients || []).find((c) => c.id === NINE) || null;
const out = {
  at: new Date().toISOString(),
  tag: TAG,
  detail: {
    status: api.status,
    next_action: d?.next_action ?? null,
    next_action_degraded: d?.next_action_degraded ?? null,
    outcome_tier: d?.client?.outcome_tier ?? null,
    active_blockers: (d?.active_blockers || []).map((b) => `${b.source} | ${b.label}`),
  },
  list: {
    status: list.status,
    found: Boolean(row),
    next_action: row?.next_action ?? null,
    next_action_degraded: row?.next_action_degraded ?? null,
    active_blockers: (row?.active_blockers || []).map((b) => `${b.source} | ${b.label}`),
  },
};
console.log(JSON.stringify(out, null, 2));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const blocked = [];
await context.route("**/*", (route) => {
  const q = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) { blocked.push(`${q.method()} ${q.url()}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();

// Red numbered boxes + legend, drawn over the live page right before a shot.
async function mark(marks, title) {
  await page.evaluate(({ marks, title }) => {
    document.querySelectorAll(".h7-mark").forEach((n) => n.remove());
    const legend = document.createElement("div");
    legend.className = "h7-mark";
    legend.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:760px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b>${title}</b>`;
    marks.forEach((mk, i) => {
      const el = document.querySelector(mk.sel);
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${mk.caption}`;
      legend.appendChild(line);
      if (!el) return;
      const b = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "h7-mark";
      box.style.cssText = `position:fixed;left:${b.left - 4}px;top:${b.top - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid #ff2828;z-index:2147483646;pointer-events:none`;
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
  await page.goto(`${BASE}/app/client-control-panel.html?id=${NINE}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Nine-Repair/.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 45000 });
  await page.waitForFunction(() => {
    const t = (document.getElementById("ccp-next-action")?.textContent || "").trim();
    return t && t !== "—" && !/Pick a client/i.test(t);
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const look = await page.evaluate(() => {
    const t = (id) => (document.getElementById(id)?.textContent || "").trim();
    const blockers = [...document.querySelectorAll("#ccp-cp-blockers .blocker-card .blocker-reason")].map((c) => c.textContent.trim());
    return {
      name: t("ccp-name"),
      nextStep: t("ccp-next-action"),
      why: t("ccp-cp-why"),
      blockerCount: t("ccp-cp-blocker-count"),
      blockers,
    };
  });
  looks.push(look);
  console.log(`control panel look ${i}`, JSON.stringify(look, null, 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  await mark([
    { sel: "#ccp-next-action", caption: `Next step says: "${look.nextStep}"` },
    { sel: "#ccp-cp-why", caption: `Why line: "${look.why}"` },
    { sel: "#ccp-cp-blockers", caption: `Active blockers (${look.blockerCount}) — first: "${look.blockers[0] || "none"}"` },
  ], `Hole 7 (${TAG}) — #9 Sim Nine-Repair, control panel look ${i}`);
  await page.screenshot({ path: `${SHOTS}/h7-${TAG}-ccp-look${i}.png`, fullPage: true });
}

// Fulfillment list: Pipeline page, Fulfillment view toggle (reads only).
await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#lensFulfillment", { timeout: 45000 });
await page.click("#lensFulfillment");
const rowSel = `.fh-lens-row[data-client-id="${NINE}"]`;
let listLook = null;
try {
  await page.waitForSelector(rowSel, { timeout: 60000 });
  await page.locator(rowSel).scrollIntoViewIfNeeded();
  listLook = await page.evaluate((sel) => {
    const rowEl = document.querySelector(sel);
    return {
      name: rowEl.querySelector(".lr-name")?.textContent.trim(),
      chip: rowEl.querySelector(".fh-chip")?.textContent.trim(),
      why: rowEl.querySelector(".lr-why")?.textContent.trim(),
      blockers: [...rowEl.querySelectorAll(".lr-blocker")].map((b) => b.textContent.trim()),
    };
  }, rowSel);
  console.log("fulfillment list row", JSON.stringify(listLook, null, 2));
  await mark([
    { sel: `${rowSel} .fh-chip`, caption: `Next step chip: "${listLook.chip}"` },
    { sel: `${rowSel} .lr-blockers`, caption: `Open jobs under it — first: "${listLook.blockers[0] || "none"}"` },
  ], `Hole 7 (${TAG}) — Fulfillment list, #9 Sim Nine-Repair`);
  await page.screenshot({ path: `${SHOTS}/h7-${TAG}-fulfillment-row.png`, fullPage: false });
} catch (e) {
  console.log("fulfillment row not found:", e.message.split("\n")[0]);
}

out.looks = looks;
out.listLook = listLook;
out.blockedWrites = blocked;
writeFileSync(`${SHOTS}/h7-${TAG}.json`, JSON.stringify(out, null, 2));
console.log("blocked writes:", blocked.length, blocked.slice(0, 5));
await browser.close();
