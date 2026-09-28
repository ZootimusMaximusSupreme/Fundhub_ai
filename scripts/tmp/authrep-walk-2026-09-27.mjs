// Live walk: add a person on two test files, sign in as him, switch files.
// Prints pass/fail only. Does not print the sign-in link.
import { chromium } from "playwright";
import { loadEnv } from "../load-env.mjs";

loadEnv();
const { db, close } = await import("../../src/db.mjs");

const BASE = "https://fundhub.ai";
const TAG = "e2e+authrep-20260927";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) {
  console.log("FAIL missing staff password");
  process.exit(1);
}

const org = (await db.query(`SELECT id FROM orgs WHERE is_default LIMIT 1`)).rows[0].id;

async function kid(first, email, phone) {
  const found = await db.query(
    `SELECT id FROM clients WHERE org_id = $1 AND lower(email) = $2 LIMIT 1`,
    [org, email]
  );
  if (found.rows[0]) return found.rows[0].id;
  const ins = await db.query(
    `INSERT INTO clients (org_id, first_name, last_name, email, phone)
     VALUES ($1, $2, 'Authrep', $3, $4) RETURNING id`,
    [org, first, email, phone]
  );
  return ins.rows[0].id;
}

const ada = await kid("Ada", `${TAG}-ada@fundhub.ai`, "+15555550121");
const ben = await kid("Ben", `${TAG}-ben@fundhub.ai`, "+15555550122");
await close();

const browser = await chromium.launch({ headless: true });
const staff = await browser.newContext();
const page = await staff.newPage();
const out = {};

try {
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", pw);
  const login = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
  await page.click("#go");
  out.login = (await login).status();
  if (out.login !== 200) throw new Error("staff sign-in " + out.login);
  await page.waitForURL(/\/app\//, { timeout: 20000 });

  await page.goto(`${BASE}/app/client-control-panel.html?id=${ada}`, { waitUntil: "commit" });
  await page.waitForLoadState("domcontentloaded");
  out.panel_url = page.url();
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
  const now = await page.textContent("#ccp-rep-now");
  out.added = /Dana Rep/.test(now || "");

  await page.goto(`${BASE}/app/client-control-panel.html?id=${ben}`, { waitUntil: "commit" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#ccp-rep-name", { state: "visible", timeout: 20000 });
  await page.fill("#ccp-rep-name", "Dana Rep");
  await page.fill("#ccp-rep-email", `${TAG}-dana@fundhub.ai`);
  await page.fill("#ccp-rep-phone", "5555550123");
  await page.click("#ccp-rep-add");
  await page.waitForFunction(() => {
    const line = document.querySelector("#ccp-rep-now");
    return line && /Dana Rep/.test(line.textContent || "");
  }, null, { timeout: 20000 });

  const dad = await browser.newContext();
  const dadPage = await dad.newPage();
  await dadPage.goto(link, { waitUntil: "domcontentloaded" });
  await dadPage.waitForTimeout(4000);
  out.dad_url = dadPage.url().split("?")[0];
  out.dad_greeting = await dadPage.locator("#greeting").textContent().catch(() => "");
  out.dad_err = await dadPage.locator("#err").textContent().catch(() => "");
  await dadPage.waitForFunction(() => {
    const g = document.querySelector("#greeting");
    return g && /Welcome back, Ada/.test(g.textContent || "");
  }, null, { timeout: 25000 });
  out.first_file = "Ada";

  const buttons = await dadPage.locator("#rep-files button").allTextContents();
  out.buttons = buttons;
  const benBtn = dadPage.locator("#rep-files button", { hasText: "Ben Authrep" });
  await benBtn.click();
  await dadPage.waitForFunction(() => {
    const g = document.querySelector("#greeting");
    return g && /Welcome back, Ben/.test(g.textContent || "");
  }, null, { timeout: 25000 });
  out.second_file = "Ben";
  out.still_two = (await dadPage.locator("#rep-files button").count()) === 2;

  const pass = out.login === 200 && out.added && out.first_file === "Ada" && out.second_file === "Ben" && out.still_two;
  console.log(JSON.stringify({ pass, login: out.login, added: out.added, first_file: out.first_file, second_file: out.second_file, buttons: out.buttons, still_two: out.still_two }));
  if (!pass) process.exitCode = 1;
} catch (err) {
  out.where = page.url();
  out.role = await page.evaluate(() => localStorage.getItem("fh_role")).catch(() => null);
  out.visible = await page.locator("#ccp-rep-wrap").count().catch(() => -1);
  console.log(JSON.stringify({ pass: false, error: String(err && err.message || err), out }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
