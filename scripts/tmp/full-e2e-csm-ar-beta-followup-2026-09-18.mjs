// Follow-up: Elena login, deeper Meet search, AR table shot, beta clicks (CSS.escape fix).
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { loadEnv } from "../load-env.mjs";
import { db, close as closeDb } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";
import { DEMO_PASSWORD } from "../../src/auth/demo-roster.mjs";

loadEnv();
if (typeof globalThis.CSS === "undefined") {
  globalThis.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`).replace(/^([0-9])/, "\\3$1 ") };
}

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/full-e2e-audit-2026-09-18-csm-ar-beta-evidence";
const OUT = "/tmp/full-e2e-csm-ar-beta-2026-09-18";
mkdirSync(EVID, { recursive: true });
mkdirSync(`${EVID}/_raw`, { recursive: true });

function clip(text, n = 2200) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}
function isSendCharge(label) {
  const s = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  return [
    "send what is waiting", "pause sending", "email unsent", "email me",
    "send reset", "send portal", "invoice email", "present send",
    "continue to payment", "build my pack", "enroll", "pay now", "charge",
    "end shift", "write answers", "save these answers", "write today’s c-suite",
    "write today's c-suite", "write a post", "promote", "invite", "call now",
    "dial", "start call", "claim this",
  ].some((w) => s.includes(w));
}
async function getJson(request, path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 200) }; }
  if (json?.demo?.password) json.demo = { ...json.demo, password: "[redacted]" };
  delete json.token;
  return { status: res.status(), json };
}

const meet = {
  transcriptNonempty: (await db.query(
    `SELECT count(*)::int AS n FROM call_outcomes
      WHERE coalesce(transcript,'') <> '' AND client_id::text NOT LIKE '9af65808%'`
  )).rows[0],
  transcriptFake: (await db.query(
    `SELECT count(*)::int AS n FROM call_outcomes
      WHERE transcript ILIKE '%FAKE MEET%' AND client_id::text NOT LIKE '9af65808%'`
  )).rows[0],
  recordings: (await db.query(
    `SELECT count(*)::int AS n FROM call_outcomes
      WHERE recording_url IS NOT NULL AND client_id::text NOT LIKE '9af65808%'`
  )).rows[0],
  googleMeetInsights: (await db.query(
    `SELECT count(*)::int AS n FROM customer_insights
      WHERE channel = 'google_meet' AND client_id::text NOT LIKE '9af65808%'`
  )).rows[0],
  brainMeetNamed: (await db.query(
    `SELECT count(*)::int AS n FROM brain_files
      WHERE (name ILIKE '%google meet%' OR name ILIKE '%meet recording%'
             OR name ILIKE '%gemini notes%' OR name ILIKE '%transcript%')
        AND mime_type NOT ILIKE '%folder%'
        AND coalesce(client_id::text,'') NOT LIKE '9af65808%'`
  )).rows[0],
  brainMeetChunks: (await db.query(
    `SELECT count(*)::int AS n FROM brain_chunks c
       JOIN brain_files f ON f.id = c.file_id
      WHERE (f.name ILIKE '%google meet%' OR f.name ILIKE '%meet%' OR f.name ILIKE '%transcript%')
        AND coalesce(c.content,'') <> ''
        AND coalesce(f.client_id::text,'') NOT LIKE '9af65808%'`
  )).rows[0],
  elena: (await db.query(
    `SELECT email, name, role, status, is_demo,
            password_hash IS NOT NULL AS has_password
       FROM staff WHERE lower(email) = 'elena.brooks@fundhub.ai'`
  )).rows[0],
  csmAtFundhub: (await db.query(
    `SELECT count(*)::int AS n FROM staff WHERE lower(email) = 'csm@fundhub.ai'`
  )).rows[0],
};

writeFileSync(`${OUT}/meet-deep.json`, JSON.stringify(meet, null, 2));
writeFileSync(`${EVID}/meet-deep.json`, JSON.stringify(meet, null, 2));
console.log(JSON.stringify({ phase: "meet-deep", meet }, null, 2));

const staffRow = (await db.query(
  `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`, [EMAIL]
)).rows[0];
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
const browser = await chromium.launch({ headless: true });

const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const loginPage = await loginCtx.newPage();
await loginPage.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await loginPage.waitForTimeout(1000);
await loginPage.fill("#email", "elena.brooks@fundhub.ai");
await loginPage.fill("#pw", DEMO_PASSWORD);
await loginPage.click("#go");
await loginPage.waitForTimeout(2200);
const elenaForm = {
  url: loginPage.url(),
  err: clip(await loginPage.locator("#err").innerText().catch(() => "")),
  stillOnLogin: /login\.html/i.test(loginPage.url()),
  body: clip(await loginPage.locator("body").innerText()),
};
await loginPage.screenshot({ path: `${EVID}/_raw/02b-elena-form-login.png`, fullPage: false });
const elenaPost = await loginCtx.request.post(`${BASE}/api/auth/login`, {
  data: { email: "elena.brooks@fundhub.ai", password: DEMO_PASSWORD },
});
let elenaJson = null;
try { elenaJson = await elenaPost.json(); } catch { elenaJson = { parse_error: true }; }
delete elenaJson?.token;
const elenaApi = { status: elenaPost.status(), ok: elenaJson?.ok === true, error: elenaJson?.error || null, message: elenaJson?.message || null };
await loginCtx.close();
console.log(JSON.stringify({ phase: "elena", elenaForm, elenaApi, has_password: meet.elena?.has_password }, null, 2));

const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
const request = context.request;

await page.goto(`${BASE}/app/ops-admin.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
const ar = page.locator("#ar-table");
if (await ar.count()) await ar.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(800);
const arText = clip(await ar.innerText().catch(() => ""));
await page.screenshot({ path: `${EVID}/_raw/09-ops-ar-table.png`, fullPage: false });
const arTotal = clip(await page.locator("#ar-total").innerText().catch(() => ""));

await page.goto(`${BASE}/app/finance-os.html?client_id=${EIGHT}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(5000);
const financeBody = clip(await page.locator("body").innerText().catch(() => ""), 3500);
const financeHas2500 = /2,?500/.test(financeBody);
const financeHas3000 = /3,?000/.test(financeBody);
await page.screenshot({ path: `${EVID}/_raw/08-finance-os-invoiced.png`, fullPage: true });

const extraContext = {};
for (const id of [
  EIGHT,
  "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  "22103bca-0ec9-4491-bb75-5d1b6528f116",
  "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
]) {
  const r = await getJson(request, `/api/read/agent-context?client_id=${id}`);
  const block = String(r.json?.context?.as_prompt_block || r.json?.as_prompt_block || "");
  extraContext[id] = { status: r.status, has_said: /said:/i.test(block), call_count: (r.json?.context?.recent_calls || r.json?.recent_calls || []).length };
}

function buttonsFrom(p) {
  return p.locator("button, a.btn, [role='button'], input[type=submit]").evaluateAll((els) =>
    els.map((el) => {
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      const id = el.id || "";
      const hidden = el.hidden || el.getAttribute("hidden") != null
        || (el.offsetParent === null && getComputedStyle(el).display === "none");
      const disabled = !!(el.disabled || el.getAttribute("aria-disabled") === "true");
      return { text, id, hidden, disabled };
    }).filter((b) => b.text).slice(0, 90)
  );
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
    await page.waitForTimeout(2400);
    const body = clip(await page.locator("body").innerText().catch(() => ""));
    const buttons = await buttonsFrom(page).catch(() => []);
    await page.screenshot({ path: `${EVID}/_raw/${key}.png`, fullPage: false });
    const clicks = [];
    for (const b of buttons.filter((x) => !x.hidden && !x.disabled).slice(0, 16)) {
      if (isSendCharge(b.text) || isSendCharge(b.id) || /sign out|log out|delete|wipe|run now|\brun\b|promote|invite|generate|sync|upload|reset password|ask\b|write a post/i.test(b.text)) {
        clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "send/write/signout" });
        continue;
      }
      const before = page.url();
      const loc = b.id
        ? page.locator(`#${CSS.escape(b.id)}`).first()
        : page.getByRole("button", { name: b.text, exact: true }).first();
      try {
        if (!(await loc.count())) {
          clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "not found" });
          continue;
        }
        await loc.click({ timeout: 2500, force: true });
        await page.waitForTimeout(600);
        const afterBody = clip(await page.locator("body").innerText().catch(() => ""));
        const errish = /could not load|not signed in|internal_error|something went wrong/i.test(afterBody)
          && !/could not load unpaid invoices/i.test(afterBody);
        clicks.push({ label: b.text, id: b.id, result: errish ? "FAIL" : "PASS", afterUrl: page.url() });
        if (page.url() !== before && !page.url().includes(path.split("/").pop().replace(".html", ""))) {
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForTimeout(900);
        }
      } catch (err) {
        const msg = String(err.message || err).slice(0, 160);
        clicks.push({ label: b.text, id: b.id, result: /Timeout|not visible|intercepts/i.test(msg) ? "SKIP" : "FAIL", why: msg });
      }
    }
    const fails = clicks.filter((c) => c.result === "FAIL");
    const pageResult = /login\.html/i.test(page.url()) ? "FAIL"
      : (/could not load|not signed in|internal_error/i.test(body) && !/No unpaid/.test(body)) ? "FAIL"
      : fails.length ? "FAIL" : "PASS";
    beta.push({ path, key, pageResult, failClicks: fails.map((c) => c.label), clicks, buttons: buttons.map((b) => b.text).slice(0, 24), body: body.slice(0, 400) });
  } catch (err) {
    beta.push({ path, key, pageResult: "FAIL", error: String(err.message || err).slice(0, 200), failClicks: ["page open"] });
  }
}

await browser.close();
const dump = { elenaForm, elenaApi, arText, arTotal, financeHas2500, financeHas3000, financeBody: financeBody.slice(0, 1200), extraContext, beta };
writeFileSync(`${OUT}/followup.json`, JSON.stringify(dump, null, 2));
writeFileSync(`${EVID}/followup.json`, JSON.stringify(dump, null, 2));
console.log(JSON.stringify({
  phase: "followup",
  elenaApi,
  elenaStillOnLogin: elenaForm.stillOnLogin,
  arTotal,
  arHas2500: /2,?500/.test(arText),
  arHasEight: /eight/i.test(arText),
  financeHas2500,
  financeHas3000,
  extraSaid: extraContext,
  beta: beta.map((b) => ({ path: b.path, pageResult: b.pageResult, failClicks: b.failClicks })),
}, null, 2));
await closeDb();
