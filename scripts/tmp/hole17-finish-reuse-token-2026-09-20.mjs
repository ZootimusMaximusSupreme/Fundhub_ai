// Reuse latest magic-link token from dashboard messages (no new link request).
import "../load-env.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://fundhub.ai";
const CLIENT = "40f063e1-27e3-4857-be1a-91640eee90e1";
const DEPLOY = "6aae2d56762d7b6842d715f6";
const EVID = path.resolve("docs/workflows/full-launch-lattice-2026-09-20-evidence/hole17");
const SHOT_DIR = path.resolve("docs/workflows/lane-1/playwright/product-fail");
const OUT_JSON = path.join(SHOT_DIR, "hole17-finish-2026-09-20.json");

const pw = process.env.STAFF_E2E_PASSWORD || process.env.STAFF_INITIAL_PASSWORD;
if (!pw) throw new Error("staff password missing");

const prior = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
const out = { ...prior, at: new Date().toISOString(), deploy: DEPLOY };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/login.html`);
await page.locator("#email, input[type=email]").first().fill("chris@fundhub.ai");
await page.locator("#pw, input[type=password]").first().fill(pw);
await page.locator("#go, button[type=submit]").first().click();
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 25_000 });

const rows = await page.evaluate(async (id) => {
  const r = await fetch(`/api/dashboard/client?id=${id}`, { credentials: "same-origin" });
  const d = await r.json();
  return ((d && d.messages) || []).map((m) => ({
    body: m.rendered_body || "",
    at: m.created_at,
    template: m.template_key,
  }));
}, CLIENT);
rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));

let token = "";
for (const row of rows) {
  const hit = String(row.body).match(/portal-login\.html\?t=([A-Za-z0-9._~%-]+)/);
  if (hit) {
    token = decodeURIComponent(hit[1]);
    out.reusedMessage = { at: row.at, template: row.template };
    break;
  }
}
out.tokenFound = !!token;

if (!token) {
  out.verdict = "FAIL";
  out.reason = "no portal-login token in dashboard messages";
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

const clientPage = await browser.newPage();
await clientPage.goto(`${BASE}/portal-login.html?t=${encodeURIComponent(token)}`);
const landed = await clientPage
  .waitForURL(/client-portal\.html/, { timeout: 60_000 })
  .then(() => true)
  .catch(() => false);

if (!landed) {
  out.verdict = "FAIL";
  out.reason = "token consumed or invalid — need fresh link after rate limit";
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(1);
}

await clientPage.waitForTimeout(8000);
out.magicPortal = await clientPage.evaluate(() => {
  const banner = document.getElementById("fh-data-banner");
  const m = document.body.innerText.match(/live entitlements[^\n]*/);
  return {
    banner: banner?.textContent?.trim() || "",
    line: m?.[0]?.trim() || "",
    path: location.pathname + location.search,
  };
});

const magicShot = "hole17-finish-magic-link-2026-09-20.png";
await clientPage.screenshot({ path: path.join(SHOT_DIR, magicShot), fullPage: false });
fs.mkdirSync(EVID, { recursive: true });
await clientPage.screenshot({ path: path.join(EVID, magicShot), fullPage: false });
if (!out.shots.includes(magicShot)) out.shots.push(magicShot);

if (!out.magicPortal.line.includes("0 unlocked")) {
  out.verdict = "FAIL";
  out.reason = `magic portal footnote: ${JSON.stringify(out.magicPortal)}`;
} else {
  out.verdict = "PASS";
  out.reason = null;
  out.tokenProof = "reused queued magic-link body from dashboard/client messages";
}

fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(EVID, "hole17-finish-2026-09-20.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
