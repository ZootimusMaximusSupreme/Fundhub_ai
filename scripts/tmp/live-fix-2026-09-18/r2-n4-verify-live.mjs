// HOLE N4 VERIFY / PROVE — LOOK ONLY. Owner password login, then:
//  1. GET /api/dashboard/client?id=<#9> — what the Client Control Panel paints.
//  2. Headless chromium, every non-GET request aborted. Load #9's control panel
//     twice and read "Do this next" and the blocker cards.
// The document reader already read #9's three queued documents at 17:20 UTC.
// If the screen still says "Waiting on the document reader — … has not been
// read yet", the retry clock's result never reached the file.
// Screenshots carry red numbered boxes + a legend (CLAUDE.md §8).
// Never prints the password or the cookie.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n4-verify-live.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const NINE = process.env.CLIENT || "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const TAG = process.env.TAG || "before";
const SHOTS = `/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N4/${TAG}`;
mkdirSync(SHOTS, { recursive: true });

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n4-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const token = m[1];
const H = { cookie: `fundhub_session=${token}` };

const api = await fetch(`${BASE}/api/dashboard/client?id=${NINE}`, { headers: H });
const d = await api.json();
const out = {
  at: new Date().toISOString(),
  tag: TAG,
  detail: {
    status: api.status,
    next_action: d?.next_action ?? null,
    next_action_degraded: d?.next_action_degraded ?? null,
    active_blockers: (d?.active_blockers || []).map((b) => `${b.source} | ${b.label}`),
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

async function mark(marks, title) {
  await page.evaluate(({ marks, title }) => {
    document.querySelectorAll(".n4-mark").forEach((n) => n.remove());
    const legend = document.createElement("div");
    legend.className = "n4-mark";
    legend.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:760px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b>${title}</b>`;
    marks.forEach((mk, i) => {
      const el = typeof mk.sel === "string" ? document.querySelector(mk.sel) : null;
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${mk.caption}`;
      legend.appendChild(line);
      if (!el) return;
      const b = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "n4-mark";
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
    return { name: t("ccp-name"), nextStep: t("ccp-next-action"), why: t("ccp-cp-why"), blockerCount: t("ccp-cp-blocker-count"), blockers };
  });
  looks.push(look);
  console.log(`control panel look ${i}`, JSON.stringify(look, null, 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  const waiting = /Waiting on the document reader/i.test(look.nextStep + " " + look.blockers.join(" "));
  await mark([
    { sel: "#ccp-next-action", caption: `Do this next: ${look.nextStep.slice(0, 140)}` },
    { sel: "#ccp-cp-blockers", caption: waiting
      ? "Still says the reader has not read the document — the reader read all three at 17:20 UTC"
      : "No 'Waiting on the document reader' job left for documents the reader already read" },
  ], `Hole N4 (${TAG}) — Sim Nine-Repair #9, look ${i} of 2`);
  await page.screenshot({ path: `${SHOTS}/control-panel-look-${i}.png`, fullPage: false });
}
await browser.close();
out.looks = looks;
out.blocked = blocked;
writeFileSync(`${SHOTS}/result.json`, JSON.stringify(out, null, 2));
console.log("blocked non-GET requests:", blocked.length);
