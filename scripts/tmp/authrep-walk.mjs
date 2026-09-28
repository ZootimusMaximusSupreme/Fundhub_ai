import { chromium } from "playwright";
import { loadEnv } from "/Users/chrisstanbridge/Developer/fundhub-platform/scripts/load-env.mjs";
loadEnv();
const { db, close } = await import("/Users/chrisstanbridge/Developer/fundhub-platform/src/db.mjs");
const BASE = "https://fundhub.ai";
const TAG = "e2e+authrep-20260927";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("FAIL missing staff password"); process.exit(1); }
const org = (await db.query(`SELECT id FROM orgs WHERE is_default LIMIT 1`)).rows[0].id;
async function kid(first, email) {
  const found = await db.query(`SELECT id FROM clients WHERE org_id = $1 AND lower(email) = $2 LIMIT 1`, [org, email]);
  return found.rows[0].id;
}
const ada = await kid("Ada", `${TAG}-ada@fundhub.ai`);
const ben = await kid("Ben", `${TAG}-ben@fundhub.ai`);
await close();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const out = {};
try {
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", pw);
  const login = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
  await page.click("#go");
  out.login = (await login).status();
  await page.waitForURL(/\/app\//, { timeout: 20000 });
  await page.goto(`${BASE}/app/client-control-panel.html?id=${ada}`, { waitUntil: "commit" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#ccp-rep-name", { state: "visible", timeout: 20000 });
  await page.fill("#ccp-rep-name", "Dana Rep");
  await page.fill("#ccp-rep-email", `${TAG}-dana@fundhub.ai`);
  await page.fill("#ccp-rep-phone", "5555550123");
  await page.click("#ccp-rep-add");
  await page.waitForFunction(() => {
    const box = document.querySelector("#ccp-rep-url");
    return box && box.value && box.value.includes("t=");
  }, null, { timeout: 20000 });
  const link = await page.inputValue("#ccp-rep-url");
  const dadPage = await (await browser.newContext()).newPage();
  await dadPage.goto(link, { waitUntil: "domcontentloaded" });
  await dadPage.waitForFunction(() => {
    const g = document.querySelector("#greeting");
    const cur = document.querySelector("#rep-files button[aria-current='true']");
    return g && /Welcome back, Ada/.test(g.textContent || "") && cur && /Ada/.test(cur.textContent || "");
  }, null, { timeout: 25000 });
  out.first = await dadPage.locator("#greeting").textContent();
  out.buttons = await dadPage.locator("#rep-files button").allTextContents();
  await dadPage.locator("#rep-files button", { hasText: "Ben Authrep" }).click();
  await dadPage.waitForFunction(() => {
    const g = document.querySelector("#greeting");
    const cur = document.querySelector("#rep-files button[aria-current='true']");
    return g && /Welcome back, Ben/.test(g.textContent || "") && cur && /Ben/.test(cur.textContent || "");
  }, null, { timeout: 25000 });
  out.second = await dadPage.locator("#greeting").textContent();
  const sessionId = await dadPage.evaluate(async () => {
    const t = localStorage.getItem("fh_token") || "";
    const r = await fetch("/api/auth/session", { headers: { authorization: "Bearer " + t } });
    const d = await r.json();
    return d && d.staff && d.staff.client_id;
  });
  out.session_is_ben = sessionId === ben;
  out.pass = out.login === 200 && /Ada/.test(out.first) && /Ben/.test(out.second) && out.session_is_ben && out.buttons.length === 2;
  console.log(JSON.stringify({ pass: out.pass, login: out.login, first: out.first, second: out.second, buttons: out.buttons, session_is_ben: out.session_is_ben }));
  if (!out.pass) process.exitCode = 1;
} catch (err) {
  console.log(JSON.stringify({ pass: false, error: String(err && err.message || err) }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
