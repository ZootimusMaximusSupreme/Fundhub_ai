// Live prove: portal dispute-round button. Mint checkout only. Do not pay.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadEnv } from "../../../scripts/load-env.mjs";

loadEnv();

const BASE = "https://fundhub.ai";
const CLIENT = "9b58de7f-7942-4354-aa4b-c61cfe23e7a4";
const OUT = new URL(".", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const password = process.env.STAFF_E2E_PASSWORD || process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("no staff password");

const report = {
  at: new Date().toISOString(),
  client_id: CLIENT,
  client_name: "Sim Repair E2E20",
  mint: false,
  paid: false,
  bureau_mail: false,
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const paidPosts = [];
page.on("response", async (res) => {
  try {
    const u = res.url();
    if (!u.includes("/api/paid-services") || res.request().method() !== "POST") return;
    const body = await res.json().catch(() => ({}));
    paidPosts.push({
      status: res.status(),
      ok: body.ok ?? null,
      has_checkout: !!(body.checkout_url || body.checkoutUrl),
      checkout_host: (() => {
        const url = body.checkout_url || body.checkoutUrl || "";
        try { return url ? new URL(url).host : null; } catch { return "unparseable"; }
      })(),
      message: body.message || body.error || null,
      checkout_pending: body.checkout_pending ?? null,
    });
  } catch {}
});

await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
await page.click("#go");
await page.waitForURL(/\/app\//, { timeout: 30_000 });

async function walkPortal(n) {
  await page.goto(`${BASE}/app/client-portal.html?id=${CLIENT}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  const shot = `${OUT}portal-${n}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  return {
    url: page.url(),
    has_progress_link: /See exactly where your file stands/i.test(body),
    has_continue: /\bContinue\b/.test(body) && /Run a round now/i.test(body),
    has_have_us: /Have us do it/i.test(body),
    has_sign_auth: /Sign to authorize/i.test(body),
    has_paid_go: await page.locator("#paidGo").count(),
    shot,
  };
}

report.portal_1 = await walkPortal(1);
report.portal_2 = await walkPortal(2);

const progressLink = page.locator('a[href*="progress.html"]').first();
report.progress_link_href = await progressLink.getAttribute("href");
await progressLink.click();
await page.waitForURL(/progress\.html/, { timeout: 30_000 });
await page.waitForTimeout(3000);

async function snapProgress(n) {
  const body = await page.locator("body").innerText();
  const shot = `${OUT}progress-${n}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  return {
    url: page.url(),
    has_run_a_round: /Run a round now/i.test(body),
    has_continue: await page.locator("#paidGo").count(),
    continue_visible: await page.locator("#paidGo").isVisible().catch(() => false),
    continue_text: await page.locator("#paidGo").innerText().catch(() => null),
    has_have_us: /Have us do it/i.test(body),
    has_not_available: /Not available on your file right now/i.test(body),
    has_in_progress: /You already have one in progress/i.test(body),
    total_today: await page.locator("#paidTotal").innerText().catch(() => null),
    body_slice: body.replace(/\s+/g, " ").trim().slice(0, 900),
    shot,
  };
}

report.progress_1 = await snapProgress(1);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
report.progress_2 = await snapProgress(2);

if (report.progress_2.continue_visible) {
  await page.locator("#paidGo").click();
  await page.waitForTimeout(800);
  report.confirm_1 = {
    title: await page.locator("#dlgT").innerText().catch(() => null),
    sub: await page.locator("#dlgS").innerText().catch(() => null),
    body: await page.locator("#dlgB").innerText().catch(() => null),
  };
  await page.screenshot({ path: `${OUT}confirm-1.png` });
  const yes = page.getByRole("button", { name: /Yes, continue/i });
  if (await yes.count()) await yes.click();
  await page.waitForTimeout(800);
  report.confirm_2 = {
    title: await page.locator("#dlgT").innerText().catch(() => null),
    sub: await page.locator("#dlgS").innerText().catch(() => null),
    body: await page.locator("#dlgB").innerText().catch(() => null),
  };
  await page.screenshot({ path: `${OUT}confirm-2.png` });
  const pay = page.getByRole("button", { name: /Take me to payment/i });
  if (await pay.count()) {
    await pay.click();
    await page.waitForTimeout(4000);
    report.mint_dialog = {
      title: await page.locator("#dlgT").innerText().catch(() => null),
      sub: await page.locator("#dlgS").innerText().catch(() => null),
    };
    await page.screenshot({ path: `${OUT}mint.png` });
    const openPay = page.getByRole("link", { name: /Open payment page/i })
      .or(page.getByRole("button", { name: /Open payment page/i }));
    if (await openPay.count()) {
      report.payment_href = await openPay.first().getAttribute("href");
    }
  }
}

report.paid_posts = paidPosts;
report.mint = paidPosts.some((p) => p.has_checkout);

writeFileSync(`${OUT}ui.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
