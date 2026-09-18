// Hole N21 VERIFY / PROVE. LOOK ONLY. Control panel "System Facts" header says
// "collapsed" while the group is open.
// Owner password login (API), then headless chromium with every non-GET
// request aborted. Loads #13's control panel twice. On each load it reads the
// System Facts header (state words + aria-expanded + whether the body shows)
// three times: as loaded, after one click (open), after a second click (shut).
// Screenshots carry red numbered boxes + a legend (CLAUDE.md §8).
// Never prints the password or the cookie.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n21-verify.mjs
//   LOCAL=1 TAG=branch ...  serves this branch's client-control-panel.html in
//   place of the live copy (API, scripts and css stay the live site).
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042"; // Thirteen-NoBook #13 (sim)
const TAG = process.env.TAG || "before";
const LOCAL = process.env.LOCAL === "1";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N21";
mkdirSync(SHOTS, { recursive: true });

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n21-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const token = m[1];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const LOCAL_HTML = new URL("../../../public/app/client-control-panel.html", import.meta.url);
const blocked = [];
await context.route("**/*", (route) => {
  const q = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) { blocked.push(`${q.method()} ${new URL(q.url()).pathname}`); return route.abort(); }
  if (LOCAL && new URL(q.url()).pathname === "/app/client-control-panel.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
  }
  return route.continue();
});
const page = await context.newPage();

const BTN = 'button.tog[aria-controls="facts-body"]';

async function read(step) {
  return page.evaluate(({ BTN, step }) => {
    const b = document.querySelector(BTN);
    const body = document.getElementById("facts-body");
    const chev = b?.querySelector(".chev");
    return {
      step,
      headerText: (b?.textContent || "").trim().replace(/\s+/g, " "),
      stateWords: (chev?.textContent || "").replace("⌄", "").trim().replace(/\s+/g, " "),
      ariaExpanded: b?.getAttribute("aria-expanded"),
      bodyShowing: Boolean(body && !body.hidden && body.getBoundingClientRect().height > 0),
      funded: (document.getElementById("ccp-facts-funded")?.textContent || "").trim(),
    };
  }, { BTN, step });
}

function verdict(x) {
  const saysShut = /collapsed/i.test(x.stateWords);
  const saysOpen = /\bopen\b/i.test(x.stateWords) && !saysShut;
  const ariaOk = x.ariaExpanded === (x.bodyShowing ? "true" : "false");
  const textOk = x.bodyShowing ? saysOpen : saysShut;
  return { ...x, textMatches: textOk, ariaMatches: ariaOk, ok: textOk && ariaOk };
}

async function mark(caption, title) {
  await page.evaluate(({ BTN, caption, title }) => {
    document.querySelectorAll(".n21-mark").forEach((n) => n.remove());
    const el = document.querySelector(BTN);
    const bb = el.getBoundingClientRect();
    const box = document.createElement("div");
    box.className = "n21-mark";
    box.style.cssText = `position:absolute;left:${bb.left + window.scrollX - 5}px;top:${bb.top + window.scrollY - 5}px;width:${bb.width + 10}px;height:${bb.height + 10}px;border:3px solid #ff2828;z-index:2147483646;pointer-events:none`;
    const tag = document.createElement("div");
    tag.textContent = "1";
    tag.style.cssText = "position:absolute;left:-3px;top:-26px;background:#ff2828;color:#fff;font:bold 15px Helvetica,sans-serif;padding:2px 8px";
    box.appendChild(tag);
    document.body.appendChild(box);
    const legend = document.createElement("div");
    legend.className = "n21-mark";
    legend.style.cssText = "position:fixed;left:12px;top:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:760px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b></b><div></div>`;
    legend.querySelector("b").textContent = title;
    legend.querySelector("div").textContent = `1. ${caption}`;
    document.body.appendChild(legend);
  }, { BTN, caption, title });
}

const loads = [];
for (let i = 1; i <= 2; i++) {
  await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Thirteen/.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  const steps = [];
  steps.push(verdict(await read("as loaded")));
  await page.locator(BTN).scrollIntoViewIfNeeded();
  await page.locator(BTN).click();
  await page.waitForTimeout(400);
  const opened = verdict(await read("after click 1 (open)"));
  steps.push(opened);
  await page.locator(BTN).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  await mark(
    `System Facts header while the list is OPEN: state words "${opened.stateWords}", aria-expanded="${opened.ariaExpanded}", list showing=${opened.bodyShowing}`,
    `Hole N21 (${TAG}${LOCAL ? ", this branch's page on live data" : ", live page"}) — #13 control panel, load ${i}`,
  );
  await page.screenshot({ path: `${SHOTS}/n21-${TAG}-open-load${i}.png`, fullPage: false });
  await page.evaluate(() => document.querySelectorAll(".n21-mark").forEach((n) => n.remove()));
  await page.locator(BTN).click();
  await page.waitForTimeout(400);
  const shut = verdict(await read("after click 2 (shut)"));
  steps.push(shut);
  await mark(
    `System Facts header after closing again: state words "${shut.stateWords}", aria-expanded="${shut.ariaExpanded}", list showing=${shut.bodyShowing}`,
    `Hole N21 (${TAG}${LOCAL ? ", this branch's page on live data" : ", live page"}) — #13 control panel, load ${i}`,
  );
  await page.screenshot({ path: `${SHOTS}/n21-${TAG}-shut-load${i}.png`, fullPage: false });
  loads.push(steps);
  console.log(`load ${i}`, JSON.stringify(steps, null, 2));
}

const out = { at: new Date().toISOString(), tag: TAG, local: LOCAL, loads, allOk: loads.flat().every((s) => s.ok), blockedWrites: blocked };
writeFileSync(`${SHOTS}/n21-${TAG}.json`, JSON.stringify(out, null, 2));
console.log("ALL OK:", out.allOk, "| blocked writes:", blocked.length, blocked.slice(0, 5));
await browser.close();
