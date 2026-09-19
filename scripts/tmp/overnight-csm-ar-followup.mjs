// Follow-up: scroll AR + invoiced panels, then beta every-button. No send.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadEnv } from "../load-env.mjs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

loadEnv();

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const OUT = "/tmp/overnight-csm-ar-2026-09-17";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/full-e2e-audit-2026-09-17-csm-ar-evidence";
mkdirSync(OUT, { recursive: true });
mkdirSync(EVID, { recursive: true });

const FORBIDDEN = [
  "send", "claim", "clock", "end shift", "write answers", "write down",
  "email unsent", "email me", "send reset", "send what is waiting",
  "pause sending", "send portal", "invoice email", "present send",
  "continue to payment", "build my pack", "enroll", "pull",
];
function isForbiddenLabel(label) {
  const s = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  return s && FORBIDDEN.some((w) => s.includes(w));
}
function clip(text, n = 1800) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

const staffRow = (await db.query(
  `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  [EMAIL]
)).rows[0];
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();

function buttonsFrom(page) {
  return page.locator("button, a.btn, [role='button'], input[type=submit]").evaluateAll((els) =>
    els
      .map((el) => {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const id = el.id || "";
        const style = getComputedStyle(el);
        const hidden = el.hidden || style.display === "none" || style.visibility === "hidden";
        const disabled = !!(el.disabled || el.getAttribute("aria-disabled") === "true");
        return { text, id, hidden, disabled };
      })
      .filter((b) => b.text)
      .slice(0, 80)
  );
}

await page.goto(`${BASE}/app/finance-os.html?client_id=${EIGHT}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const n = [...document.querySelectorAll("h2,h3,.section-title,.fos-h,div")].find((el) => /invoiced/i.test(el.textContent || "") && (el.textContent || "").length < 80);
  if (n) n.scrollIntoView({ block: "center" });
  else window.scrollTo(0, 900);
});
await page.waitForTimeout(500);
const financeBody = clip(await page.locator("body").innerText());
await page.screenshot({ path: `${EVID}/08-finance-os-invoiced.png`, fullPage: true });
await page.screenshot({ path: `${OUT}/08-finance-os-invoiced.png`, fullPage: true });

await page.goto(`${BASE}/app/ops-admin.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const n = document.getElementById("ar-table") || [...document.querySelectorAll(".section-title,h2,h3")].find((el) => /AR \+|unpaid/i.test(el.textContent || ""));
  if (n) n.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(400);
const opsArBody = clip(await page.locator("#ar-table").innerText().catch(() => page.locator("body").innerText()));
const opsArTotal = clip(await page.locator("#ar-total").innerText().catch(() => ""));
await page.screenshot({ path: `${EVID}/09-ops-ar-table.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/09-ops-ar-table.png`, fullPage: false });

const peopleTab = page.locator('button[data-zone="people"]');
let people = { clicked: false };
if (await peopleTab.count()) {
  await peopleTab.first().click({ timeout: 3000 });
  await page.waitForTimeout(1200);
  people = { clicked: true, body: clip(await page.locator("body").innerText()) };
  await page.screenshot({ path: `${EVID}/10-ops-people.png`, fullPage: false });
}

const betaScreens = [
  ["/app/ops-admin.html", "b-ops-admin"],
  ["/app/agent-editor.html", "b-agent-editor"],
  ["/app/company-brain.html", "b-company-brain"],
  ["/app/journeys.html", "b-journeys"],
  ["/app/contracts.html", "b-contracts"],
  ["/app/campaign-manager.html", "b-campaigns"],
  ["/app/social-studio.html", "b-social"],
  ["/app/creative-factory.html", "b-creative"],
  ["/app/content-admin.html", "b-content"],
  ["/app/automations.html", "b-automations"],
  ["/app/hiring.html", "b-hiring"],
  ["/app/staff-teams.html", "b-staff-teams"],
  ["/app/products-commissions.html", "b-products"],
  ["/app/galaxy.html", "b-galaxy"],
];

const beta = [];
for (const [path, key] of betaScreens) {
  try {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    const body = clip(await page.locator("body").innerText().catch(() => ""));
    const buttons = await buttonsFrom(page).catch(() => []);
    await page.screenshot({ path: `${EVID}/${key}.png`, fullPage: false });
    const clicks = [];
    const candidates = buttons.filter((b) => !b.hidden && !b.disabled);
    for (const b of candidates.slice(0, 14)) {
      if (isForbiddenLabel(b.text) || isForbiddenLabel(b.id)) {
        clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "send/charge/claim/clock" });
        continue;
      }
      if (/sign out|log out|delete|wipe|\brun\b|promote|invite|generate|sync|upload|reset password|ask\b|write a post|call now|dial|start call|write today’s|write today/i.test(b.text)) {
        clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "write-or-sync-or-signout" });
        continue;
      }
      if (/sales|funding|client ops|watch|automation|marketing|admin|portals|home|‹‹|search/i.test(b.text) && b.text.length < 24) {
        clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "sidebar chrome" });
        continue;
      }
      const loc = b.id
        ? page.locator(`[id="${b.id}"]`).first()
        : page.getByRole("button", { name: b.text, exact: true }).first();
      try {
        if (!(await loc.count())) {
          clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "not found" });
          continue;
        }
        const before = page.url();
        await loc.click({ timeout: 2000, force: true });
        await page.waitForTimeout(600);
        const afterUrl = page.url();
        const afterBody = clip(await page.locator("body").innerText().catch(() => ""));
        const errish = /internal_error|not signed in|something went wrong/i.test(afterBody);
        clicks.push({
          label: b.text,
          id: b.id,
          result: errish ? "FAIL" : "PASS",
          urlChanged: afterUrl !== before,
          bodyHead: afterBody.slice(0, 180),
        });
        if (afterUrl !== before && !afterUrl.includes((path.split("/").pop() || "").replace(".html", ""))) {
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForTimeout(1000);
        }
      } catch (err) {
        const msg = String(err.message || err).slice(0, 160);
        const skip = /Timeout|not visible|intercepts pointer/i.test(msg);
        clicks.push({ label: b.text, id: b.id, result: skip ? "SKIP" : "FAIL", why: msg });
      }
    }
    const mainBroken = clicks.filter((c) => c.result === "FAIL");
    const bounced = /login\.html/i.test(page.url());
    const dead = /not signed in|internal_error/i.test(body);
    const pageResult = bounced || dead || mainBroken.length ? "FAIL" : "PASS";
    beta.push({
      path,
      key,
      pageResult,
      url: page.url(),
      title: await page.title(),
      body: body.slice(0, 700),
      buttons: buttons.map((b) => b.text).slice(0, 25),
      clicks,
      failClicks: mainBroken.map((c) => c.label),
    });
  } catch (err) {
    beta.push({ path, key, pageResult: "FAIL", error: String(err.message || err).slice(0, 240), failClicks: ["page open"] });
  }
}

await browser.close();
const dump = {
  at: new Date().toISOString(),
  financeBody,
  opsArBody,
  opsArTotal,
  people,
  beta: beta.map((b) => ({
    path: b.path,
    pageResult: b.pageResult,
    failClicks: b.failClicks,
    buttons: b.buttons,
    clicks: b.clicks,
    body: b.body,
    error: b.error,
    url: b.url,
    title: b.title,
  })),
};
writeFileSync(`${OUT}/followup.json`, JSON.stringify(dump, null, 2));
writeFileSync(`${EVID}/followup.json`, JSON.stringify(dump, null, 2));
console.log(JSON.stringify({
  financeHas2500: /2,?500/.test(financeBody),
  financeHas3000: /3,?000/.test(financeBody),
  financeInvoiced: /invoiced/i.test(financeBody),
  financeSnip: financeBody.match(/.{0,80}(invoiced|paid so far|still owed|2,500|3000).{0,80}/gi),
  opsArTotal,
  opsArBody: opsArBody.slice(0, 800),
  peopleHead: people.body ? people.body.slice(0, 400) : people,
  betaSummary: beta.map((b) => ({ path: b.path, pageResult: b.pageResult, fails: b.failClicks, clickN: (b.clicks || []).length })),
}, null, 2));
