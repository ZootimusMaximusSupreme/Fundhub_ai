// Live look at Specialist Repair for #9. GET only after login. No Send.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-18-letter-brain";
mkdirSync(OUT, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: pw })
});
const login = await loginRes.json();
const token = login.token;
const pair = (loginRes.headers.get("set-cookie") || "").split(";")[0] || "";
const cookieName = pair.split("=")[0] || "fundhub_session";
const cookieVal = pair.split("=").slice(1).join("=");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: cookieName, value: cookieVal || token, url: BASE }]);
await ctx.route("**/*", (route) => {
  const m = route.request().method();
  const p = new URL(route.request().url()).pathname;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  return route.abort();
});
const page = await ctx.newPage();

async function walk(pass) {
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const tab = page.locator("#tab-repair");
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(2000);
  const row = page.locator(`[data-client-id="${NINE}"], tr:has-text("Nine-Repair")`).first();
  if (await row.count()) await row.click();
  await page.waitForTimeout(2500);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${OUT}/desk-pass${pass}.png`, fullPage: false });
  return {
    pass,
    hasNine: /sim nine-repair/i.test(text),
    readyToSend: /ready to send/i.test(text),
    sendVisible: /send letters/i.test(text),
    letterCountHint: (text.match(/experian|equifax|transunion/gi) || []).slice(0, 8)
  };
}

const a = await walk(1);
const b = await walk(2);
await browser.close();
writeFileSync(`${OUT}/desk-shots.json`, JSON.stringify({ a, b }, null, 2));
console.log(JSON.stringify({ a, b }, null, 2));
