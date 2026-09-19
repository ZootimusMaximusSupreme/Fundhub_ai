import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/tmp/full-e2e-2026-09-18-funding";
const BASE = "https://fundhub.ai";
const CID = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const token = readFileSync(`${OUT}/session.cookie`, "utf8").trim();
function clip(t, n = 1800) { return String(t || "").replace(/\s+/g, " ").trim().slice(0, n); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();

await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2000);
const lens = page.locator("#lensFulfillment");
if (await lens.count()) await lens.click();
await page.waitForTimeout(2500);
const eight = page.locator("text=/Sim Eight-Funding/i").first();
const found = await eight.count();
if (found) {
  await eight.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await page.waitForTimeout(800);
}
await page.screenshot({ path: `${OUT}/pipeline-fulfillment-eight.png`, fullPage: false });
const eightCard = found
  ? clip(await eight.locator("xpath=ancestor::*[self::article or self::li or self::div][1]").innerText().catch(() => eight.innerText()))
  : null;

await page.goto(`${BASE}/app/finance-os.html?client_id=${CID}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/finance8.png`, fullPage: false });
const financeBody = clip(await page.locator("body").innerText());

await page.goto(`${BASE}/app/client-portal.html?id=${CID}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
const payTab = page.locator("text=/Payments|Account/i").first();
if (await payTab.count()) {
  await payTab.click().catch(() => {});
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${OUT}/portal8-payments.png`, fullPage: false });
const portalBody = clip(await page.locator("body").innerText());

await page.goto(`${BASE}/app/lenders.html?client_id=${CID}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
const matchTab = page.locator("text=/Match|Fit|Eligible/i").first();
if (await matchTab.count()) await matchTab.click().catch(() => {});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/lenders8-scrolled.png`, fullPage: false });
const lendersBody = clip(await page.locator("body").innerText());

await page.goto(`${BASE}/app/client-control-panel.html?id=${CID}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(8000);
const applyDoor = page.locator("text=/Native American Bank|APPLY DOOR|Apply door/i").first();
if (await applyDoor.count()) {
  await applyDoor.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/ccp8-apply-door.png`, fullPage: false });
const ccpLower = clip(await page.locator("body").innerText(), 3500);

writeFileSync(`${OUT}/followup.json`, JSON.stringify({
  eightFound: found > 0,
  eightCard,
  financeBody,
  portalBody,
  lendersBody,
  ccpLower,
}, null, 2));
console.log(JSON.stringify({
  eightFound: found > 0,
  eightCard,
  financeHas2500: /2,500|2500/.test(financeBody),
  financeHasEight: /Eight-Funding/.test(financeBody),
  financeSlice: financeBody.slice(0, 500),
  portalHas2500: /2,500|2500/.test(portalBody),
  portalHas3000: /3,000|3000/.test(portalBody),
  portalSlice: portalBody.slice(0, 600),
  lendersHasNative: /Native American/.test(lendersBody),
  lendersSlice: lendersBody.slice(0, 500),
  ccpHas10000: /10,000|10000/.test(ccpLower),
  ccpHasRounds: /Round 1|Round 2/.test(ccpLower),
}, null, 2));
await browser.close();
process.exit(0);
