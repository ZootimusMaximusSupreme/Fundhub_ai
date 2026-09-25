// Load the minted Commas pay page and read what a buyer sees. Read-only:
// nothing is typed, no card field is touched.
import { chromium } from "playwright";

const url = process.argv[2];
const shot = process.argv[3] || "/tmp/slo-pay-page.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

console.log("final url:", page.url());
console.log("title:", await page.title());
const text = (await page.innerText("body")).replace(/\n{2,}/g, "\n").trim();
console.log("--- visible text ---");
console.log(text.slice(0, 1200));
await page.screenshot({ path: shot, fullPage: true });
console.log("--- screenshot:", shot);
await browser.close();
