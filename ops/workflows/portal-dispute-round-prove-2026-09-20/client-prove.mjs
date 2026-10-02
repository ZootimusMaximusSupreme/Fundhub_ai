// Live prove as CLIENT (magic link). Mint checkout only. Do not pay. Do not print the token.
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

function redactUrl(u) {
  try {
    const x = new URL(u);
    if (x.searchParams.has("t")) x.searchParams.set("t", "REDACTED");
    return x.toString();
  } catch {
    return "unparseable";
  }
}

const staffLogin = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password }),
});
const staffJson = await staffLogin.json().catch(() => ({}));
const setCookie = staffLogin.headers.get("set-cookie") || "";
const m = setCookie.match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const staffToken = m ? m[1] : staffJson.token || null;
if (!staffToken) {
  writeFileSync(`${OUT}client-ui.json`, JSON.stringify({ error: "staff login failed", status: staffLogin.status }, null, 2));
  process.exit(1);
}

const linkRes = await fetch(`${BASE}/api/auth/send-portal-link`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${staffToken}`,
    cookie: `fundhub_session=${staffToken}`,
  },
  body: JSON.stringify({ client_id: CLIENT }),
});
const linkJson = await linkRes.json().catch(() => ({}));
const magicUrl = linkJson.url || null;
const report = {
  at: new Date().toISOString(),
  client_id: CLIENT,
  client_name: "Sim Repair E2E20",
  as: "client",
  send_portal_link: {
    status: linkRes.status,
    ok: !!linkJson.ok,
    sent: linkJson.sent ?? null,
    has_url: !!magicUrl,
    url_redacted: magicUrl ? redactUrl(magicUrl) : null,
    error: linkJson.error || null,
  },
  mint: false,
  paid: false,
  bureau_mail: false,
  paid_posts: [],
};

if (!magicUrl) {
  writeFileSync(`${OUT}client-ui.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

page.on("response", async (res) => {
  try {
    const u = res.url();
    if (!u.includes("/api/paid-services") || res.request().method() !== "POST") return;
    const body = await res.json().catch(() => ({}));
    report.paid_posts.push({
      status: res.status(),
      ok: body.ok ?? null,
      has_checkout: !!(body.checkout_url || body.checkoutUrl),
      checkout_host: (() => {
        const url = body.checkout_url || body.checkoutUrl || "";
        try { return url ? new URL(url).host : null; } catch { return "unparseable"; }
      })(),
      request_status: body.request?.status || null,
      round_no: body.request?.round_no || null,
      price_total_cents: body.request?.price_total_cents || null,
      message: body.message || body.error || null,
    });
  } catch {}
});

await page.goto(magicUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2500);
report.after_magic = { url: page.url().replace(/t=[^&]+/, "t=REDACTED") };

// Portal as client (no staff ?id=)
await page.goto(`${BASE}/app/client-portal.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(3000);
const portalText = await page.locator("body").innerText();
await page.screenshot({ path: `${OUT}client-portal-1.png`, fullPage: true });
report.portal_1 = {
  url: page.url(),
  has_progress_link: /See exactly where your file stands/i.test(portalText),
  has_continue_on_portal: await page.locator("#paidGo").count(),
  has_sign_auth: /Sign to authorize/i.test(portalText),
  greeting: portalText.split("\n").slice(0, 8).join(" | ").slice(0, 240),
};
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}client-portal-2.png`, fullPage: true });
report.portal_2 = {
  url: page.url(),
  has_progress_link: /See exactly where your file stands/i.test(await page.locator("body").innerText()),
};

const progressLink = page.locator('a[href*="progress.html"]').first();
report.progress_link_href = await progressLink.getAttribute("href");
await progressLink.click();
await page.waitForURL(/progress\.html/, { timeout: 30_000 });
await page.waitForTimeout(3000);

async function snapProgress(n) {
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}client-progress-${n}.png`, fullPage: true });
  return {
    url: page.url(),
    has_run_a_round: /Run a round now/i.test(body),
    continue_visible: await page.locator("#paidGo").isVisible().catch(() => false),
    continue_text: await page.locator("#paidGo").innerText().catch(() => null),
    total_today: await page.locator("#paidTotal").innerText().catch(() => null),
    has_in_progress: /You already have one in progress/i.test(body),
    has_not_available: /Not available on your file right now/i.test(body),
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
    body: (await page.locator("#dlgB").innerText().catch(() => "")).slice(0, 400),
  };
  await page.screenshot({ path: `${OUT}client-confirm-1.png` });
  const yes = page.getByRole("button", { name: /Yes, continue/i });
  if (await yes.count()) await yes.click();
  await page.waitForTimeout(800);
  report.confirm_2 = {
    title: await page.locator("#dlgT").innerText().catch(() => null),
    body: (await page.locator("#dlgB").innerText().catch(() => "")).slice(0, 500),
  };
  await page.screenshot({ path: `${OUT}client-confirm-2.png` });
  const pay = page.getByRole("button", { name: /Take me to payment/i });
  if (await pay.count()) {
    await pay.click();
    await page.waitForTimeout(5000);
    report.mint_dialog = {
      title: await page.locator("#dlgT").innerText().catch(() => null),
      sub: await page.locator("#dlgS").innerText().catch(() => null),
    };
    await page.screenshot({ path: `${OUT}client-mint.png` });
    const openPay = page.locator("#dlgA a, #dlgA button").filter({ hasText: /Open payment page/i });
    if (await openPay.count()) {
      const href = await openPay.first().getAttribute("href");
      report.payment_host = href ? (() => { try { return new URL(href).host; } catch { return "unparseable"; } })() : null;
    }
  }
}

report.mint = report.paid_posts.some((p) => p.has_checkout);
writeFileSync(`${OUT}client-ui.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
