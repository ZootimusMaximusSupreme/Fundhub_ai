#!/usr/bin/env node
// Live staff clicks for Capital Blueprint Session D + mailing proof.
// Browser MCP could not hold a tab. This is the human-path substitute.
import { chromium } from "@playwright/test";
import { liveStaffLogin, BASE } from "../../e2e/live-auth.mjs";

const CLIENT_ID = process.env.BLUEPRINT_CLIENT_ID || "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const PROOF = "docs/workflows/sim-documents/11/proof-of-address-1.png";

const out = { clientId: CLIENT_ID, checks: {} };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await liveStaffLogin(page);

  await page.goto(`${BASE}/app/csm-queue.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const csmText = await page.locator("body").innerText();
  out.checks.csmQueue = {
    url: page.url(),
    hasAssignedCsm: /Assigned CSM:\s*DEMO Client Success Manager/i.test(csmText),
    hasEleven: /Sim Eleven-Blueprint/i.test(csmText),
    snippet: csmText.includes("Assigned CSM") ? "Assigned CSM visible" : "no Assigned CSM chip"
  };

  await page.goto(`${BASE}/app/client-control-panel.html?client_id=${CLIENT_ID}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(3500);
  const bp = page.locator("#bp-group");
  if (await bp.count()) {
    const summary = bp.locator("summary, .group-title, button").first();
    if (await summary.count()) await summary.click().catch(() => {});
  }
  const bodyBefore = await page.locator("body").innerText();
  out.checks.controlPanelOpen = /Capital Blueprint|chase|Done|Skipped/i.test(bodyBefore);

  const doneBtn = page.getByRole("button", { name: /^Done$/ }).first();
  if (await doneBtn.count()) {
    await doneBtn.click();
    await page.waitForTimeout(1500);
    out.checks.clickedDone = true;
  } else {
    out.checks.clickedDone = false;
  }
  const skipBtn = page.getByRole("button", { name: /^Skipped$/ }).first();
  if (await skipBtn.count()) {
    await skipBtn.click();
    await page.waitForTimeout(1500);
    out.checks.clickedSkipped = true;
  } else {
    out.checks.clickedSkipped = false;
  }
  const putBack = page.getByRole("button", { name: /Put back on the list/i }).first();
  if (await putBack.count()) {
    await putBack.click();
    await page.waitForTimeout(1500);
    out.checks.clickedPutBack = true;
  } else {
    out.checks.clickedPutBack = false;
  }
  const afterBank = await page.locator("body").innerText();
  out.checks.bankWords = {
    done: /\bDone\b/i.test(afterBank),
    skipped: /\bSkipped\b/i.test(afterBank),
    putBack: /Put back on the list/i.test(afterBank)
  };

  await page.goto(`${BASE}/progress.html?client_id=${CLIENT_ID}`, { waitUntil: "domcontentloaded" });
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
