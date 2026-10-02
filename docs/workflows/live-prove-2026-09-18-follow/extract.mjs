import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const THIRTEEN = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const password = process.env.STAFF_INITIAL_PASSWORD || "";
const OUT = new URL(".", import.meta.url).pathname;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const method = req.method();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (method === "POST" && path === "/api/auth/login") return route.continue();
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
await page.click("#go");
await page.waitForTimeout(2000);

async function grab(url, waitMs = 3000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(waitMs);
  const text = await page.locator("body").innerText();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const hit = (re) => lines.filter((l) => re.test(l)).slice(0, 20);
  return {
    url,
    sampleLines: hit(/sample|not a real/i),
    scoreLines: hit(/771|778|766|EX |EQ |TU |score/i),
    thirteenLines: hit(/Thirteen/i),
    moneyLines: hit(/\$1,000|\$2,500|INV-|void|success fee|approved/i),
  };
}

const out = { at: new Date().toISOString(), passes: [] };
for (let i = 1; i <= 2; i++) {
  out.passes.push({
    n: i,
    portal: await grab(`${BASE}/app/client-portal.html?client_id=${THIRTEEN}`),
    progress: await grab(`${BASE}/progress.html?client_id=${THIRTEEN}`),
    pipeline: await grab(`${BASE}/app/pipeline.html`),
    call: await grab(`${BASE}/app/closer-dashboard.html?client_id=${THIRTEEN}`),
    panel13: await grab(`${BASE}/app/client-control-panel.html?id=${THIRTEEN}`),
    panel8: await grab(`${BASE}/app/client-control-panel.html?id=${EIGHT}`),
  });
}

await browser.close();
writeFileSync(`${OUT}extract.json`, JSON.stringify(out, null, 2));
console.log("wrote extract.json");
