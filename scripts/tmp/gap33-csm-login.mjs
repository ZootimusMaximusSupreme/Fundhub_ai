#!/usr/bin/env node
// GAP 33: live login.html as CSM. Notes only. No product code. No new staff.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { db, close as closeDb } from "../../src/db.mjs";
import { DEMO_PASSWORD } from "../../src/auth/demo-roster.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://fundhub.ai";
const OUT = "/tmp/gap33-csm-login";
fs.mkdirSync(OUT, { recursive: true });

const log = [];
function rec(step, result, saw, extra = {}) {
  const row = {
    step,
    result,
    saw: String(saw || "").replace(/\s+/g, " ").slice(0, 900),
    extra,
    at: new Date().toISOString()
  };
  log.push(row);
  fs.appendFileSync(path.join(OUT, "log.jsonl"), JSON.stringify(row) + "\n");
  console.log(`${step}  ${result}  ${row.saw.slice(0, 280)}`);
}

function maskPw(pw) {
  if (!pw) return { present: false, length: 0, looksStars: false };
  const looksStars = (String(pw).match(/\*/g) || []).length >= 4;
  return { present: true, length: String(pw).length, looksStars };
}

function chromiumPath() {
  const homeCache = path.join(process.env.HOME || "", "Library/Caches/ms-playwright");
  if (!fs.existsSync(homeCache)) return undefined;
  const dirs = fs.readdirSync(homeCache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  const rel = "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
  for (const d of dirs) {
    const exe = path.join(homeCache, d, rel);
    if (fs.existsSync(exe)) return exe;
  }
}

let signedIn = false;
let leftover = [];

try {
  const staff = await db.query(
    `SELECT email, name, role, status,
            COALESCE(to_jsonb(s)->>'is_demo', 'unknown') AS is_demo
       FROM staff s
      WHERE lower(btrim(role)) = 'csm'
      ORDER BY email`
  );
  rec(
    "CSM_STAFF_ROWS",
    staff.rows.length ? "PASS" : "FAIL",
    staff.rows.map((r) => `${r.email} status=${r.status} demo=${r.is_demo}`).join(" | ") || "none",
    { count: staff.rows.length, emails: staff.rows.map((r) => r.email) }
  );

  const liveCsm = staff.rows.filter((r) => r.is_demo !== "true" && r.is_demo !== "t");
  const demoCsm = staff.rows.filter((r) => r.is_demo === "true" || r.is_demo === "t");
  rec("LIVE_CSM_EXISTS", liveCsm.length ? "PASS" : "FAIL", liveCsm.map((r) => r.email).join(" | ") || "no non-demo CSM staff row");
  rec("DEMO_CSM_EXISTS", demoCsm.length ? "PASS" : "FAIL", demoCsm.map((r) => r.email).join(" | ") || "no demo CSM staff row");

  const demoGet = await fetch(`${BASE}/api/auth/login`);
  const demoBody = await demoGet.json().catch(() => ({}));
  rec(
    "DEMO_SWITCH_GET",
    "PASS",
    `status=${demoGet.status} enabled=${!!(demoBody.demo && demoBody.demo.enabled)} options=${(demoBody.demo && demoBody.demo.options && demoBody.demo.options.length) || 0}`
  );

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumPath()
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(800);
  const demoPanel = await page.locator("#fh-demo, .fh-demo-btn").count();
  const pageText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500);
  rec("LOGIN_PAGE", "PASS", `url=${page.url()} demoPanel=${demoPanel} body=${pageText}`);
  await page.screenshot({ path: path.join(OUT, "01-login.png") }).catch(() => {});

  // Existing demo CSM sim — do not mint a new staff row.
  await page.locator("#email").fill("csm@demo.fundhub.local");
  await page.locator("#pw").fill(DEMO_PASSWORD);
  await page.locator("#go").click();
  await page.waitForTimeout(2500);
  const err1 = (await page.locator("#err").innerText().catch(() => "")).trim();
  const stillLogin1 = /login\.html/.test(page.url());
  rec(
    "CSM_FORM_DEMO",
    stillLogin1 ? "FAIL" : "PASS",
    `url=${page.url()} err=${err1} stillOnLogin=${stillLogin1}`
  );
  await page.screenshot({ path: path.join(OUT, "02-demo-csm.png") }).catch(() => {});
  if (!stillLogin1) signedIn = true;

  const staffPw = process.env.STAFF_E2E_PASSWORD || process.env.STAFF_INITIAL_PASSWORD || "";
  rec("STAFF_PW_META", staffPw ? "PASS" : "FAIL", JSON.stringify(maskPw(staffPw)));

  // Only try a live CSM email if that staff row already exists. Never invent.
  if (liveCsm.length && staffPw && !maskPw(staffPw).looksStars) {
    await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(liveCsm[0].email);
    await page.locator("#pw").fill(staffPw);
    await page.locator("#go").click();
    await page.waitForTimeout(2500);
    const err2 = (await page.locator("#err").innerText().catch(() => "")).trim();
    const stillLogin2 = /login\.html/.test(page.url());
    rec(
      "CSM_FORM_LIVE_ROW",
      stillLogin2 ? "FAIL" : "PASS",
      `email=${liveCsm[0].email} url=${page.url()} err=${err2} stillOnLogin=${stillLogin2}`
    );
    await page.screenshot({ path: path.join(OUT, "03-live-csm.png") }).catch(() => {});
    if (!stillLogin2) signedIn = true;
  } else if (!liveCsm.length) {
    rec("CSM_FORM_LIVE_ROW", "FAIL", "skipped — no non-demo CSM staff row; did not create one");
  } else {
    rec("CSM_FORM_LIVE_ROW", "FAIL", "skipped — staff password missing or masked; did not invent one");
  }

  await browser.close();

  leftover = [
    signedIn ? "none" : "CSM cannot sign in on the live form",
    demoCsm.length && stillLogin1 ? "demo CSM refused (demo switch off)" : null,
    liveCsm.length ? null : "no live non-demo CSM staff row; did not create one"
  ].filter(Boolean);

  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({
    canSignIn: signedIn,
    leftover,
    log
  }, null, 2));
  rec("GAP33_ANSWER", signedIn ? "PASS" : "FAIL", `canSignIn=${signedIn ? "yes" : "no"} leftover=${leftover.join("; ")}`);
} catch (err) {
  rec("GAP33_CRASH", "FAIL", String(err && err.stack || err).slice(0, 600));
  leftover = ["script crashed before a clean yes/no"];
} finally {
  await closeDb().catch(() => {});
}
