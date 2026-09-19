import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const OUT = "/tmp/full-e2e-2026-09-18-funding";
const BASE = "https://fundhub.ai";
const CID = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const token = readFileSync(`${OUT}/session.cookie`, "utf8").trim();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
await page.goto(`${BASE}/app/client-portal.html?id=${CID}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(5000);
const acct = page.locator("text=/Account & history/i").first();
console.log("acct", await acct.count());
if (await acct.count()) {
  await acct.click();
  await page.waitForTimeout(1500);
}
const pay = page.locator('button[data-tab="pay"], button:has-text("Payments")').first();
console.log("pay", await pay.count());
if (await pay.count()) {
  await pay.click();
  await page.waitForTimeout(1000);
}
await page.screenshot({ path: `${OUT}/portal8-account-pay.png`, fullPage: false });
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
console.log(JSON.stringify({
  has2500: /2,500|2500/.test(body),
  has3000: /3,000|3000/.test(body),
  hasDue: /Due now|success fee|INV-/i.test(body),
  slice: body.slice(body.search(/Account|Payments|What You Own|Due/i) || 0, 900),
}, null, 2));
await browser.close();
process.exit(0);
