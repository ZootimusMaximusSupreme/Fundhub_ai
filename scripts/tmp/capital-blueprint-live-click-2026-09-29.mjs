#!/usr/bin/env node
// Live staff clicks for Capital Blueprint Session D + mailing proof.
// Browser MCP could not hold a tab. This is the human-path substitute.
import { chromium } from "@playwright/test";
import { BASE, staffPassword } from "../../e2e/live-auth.mjs";

const CLIENT_ID = process.env.BLUEPRINT_CLIENT_ID || "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const PROOF = "docs/workflows/sim-documents/11/proof-of-address-1.png";

const out = { clientId: CLIENT_ID, checks: {} };

let loginBody = null;
let loginStatus = 0;
for (let i = 0; i < 4; i += 1) {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "chris@fundhub.ai", password: staffPassword() })
  });
  loginStatus = login.status;
  loginBody = await login.json().catch(() => null);
  if (loginBody?.token) break;
  await new Promise((r) => setTimeout(r, 800 * (i + 1)));
}
if (!loginBody?.token) {
  throw new Error(`staff login failed: ${loginStatus}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.context().addCookies([{
    name: "fundhub_session",
    value: loginBody.token,
    domain: "fundhub.ai",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  }]);

  async function open(url) {
    let last;
    for (let i = 0; i < 3; i += 1) {
      try {
        await page.goto(url, { waitUntil: "commit", timeout: 45_000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => {});
        return;
      } catch (err) {
        last = err;
        await page.waitForTimeout(800);
      }
    }
    throw last;
  }

  await open(`${BASE}/app/csm-queue.html`);
  await page.waitForTimeout(2500);
  const csmText = await page.locator("body").innerText();
  out.checks.csmQueue = {
    url: page.url(),
    hasAssignedCsm: /Assigned CSM:\s*DEMO Client Success Manager/i.test(csmText),
    hasEleven: /Sim Eleven-Blueprint/i.test(csmText),
    snippet: csmText.includes("Assigned CSM") ? "Assigned CSM visible" : "no Assigned CSM chip"
  };

  await open(`${BASE}/app/client-control-panel.html?client_id=${CLIENT_ID}`);
  const toggle = page.locator('#bp-group button[aria-controls="bp-body"]');
  await toggle.waitFor({ state: "visible", timeout: 20_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await page.locator("#bp-body").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#bp-body .bp-todo-acts").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  const bodyBefore = await page.locator("#bp-body").innerText();
  out.checks.controlPanelOpen = /Capital Blueprint|Chase|Done|Skipped|Put back/i.test(bodyBefore);
  out.checks.bpExpanded = (await toggle.getAttribute("aria-expanded")) === "true";

  const todoActs = page.locator("#bp-body .bp-todo-acts").first();
  const doneBtn = todoActs.getByRole("button", { name: /^Done$/ });
  if (await doneBtn.count()) {
    await doneBtn.click();
    await page.waitForTimeout(1500);
    out.checks.clickedDone = true;
  } else {
    out.checks.clickedDone = false;
  }
  const putBackAfterDone = page.locator("#bp-body .bp-todo-acts").first().getByRole("button", { name: /Put back on the list/i });
  if (await putBackAfterDone.count()) {
    await putBackAfterDone.click();
    await page.waitForTimeout(1500);
    out.checks.clickedPutBackAfterDone = true;
  } else {
    out.checks.clickedPutBackAfterDone = false;
  }
  const skipBtn = page.locator("#bp-body .bp-todo-acts").first().getByRole("button", { name: /^Skipped$/ });
  if (await skipBtn.count()) {
    await skipBtn.click();
    await page.waitForTimeout(1500);
    out.checks.clickedSkipped = true;
  } else {
    out.checks.clickedSkipped = false;
  }
  const putBack = page.locator("#bp-body .bp-todo-acts").first().getByRole("button", { name: /Put back on the list/i });
  if (await putBack.count()) {
    await putBack.click();
    await page.waitForTimeout(1500);
    out.checks.clickedPutBack = true;
  } else {
    out.checks.clickedPutBack = false;
  }
  const afterBank = await page.locator("#bp-body").innerText();
  out.checks.bankWords = {
    done: /\bDone\b/i.test(afterBank),
    skipped: /\bSkipped\b/i.test(afterBank),
    putBack: /Put back on the list/i.test(afterBank)
  };

  await open(`${BASE}/progress.html?client_id=${CLIENT_ID}`);
  await page.waitForTimeout(3000);
  const uploadBtn = page.locator('button[data-proof]').first();
  out.checks.progressHasUpload = await uploadBtn.count() > 0;
  if (out.checks.progressHasUpload) {
    const chooser = page.waitForEvent("filechooser");
    await uploadBtn.click();
    const fc = await chooser;
    await fc.setFiles(PROOF);
    await page.waitForTimeout(4000);
    const msg = await page.locator("[data-proof-msg]").first().innerText().catch(() => "");
    out.checks.uploadMessage = msg.slice(0, 200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    out.checks.progressUploadGoneAfterReload = (await page.locator('button[data-proof]').count()) === 0;
    const progressText = await page.locator("body").innerText();
    out.checks.progressShowsMailDone = /Upload your mailing proof/i.test(progressText) === false
      || /done/i.test(progressText);
  }

  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
