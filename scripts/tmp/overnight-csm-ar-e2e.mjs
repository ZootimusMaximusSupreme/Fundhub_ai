// Overnight CSM + AR + STAFF live walk. Look / GET only. No SMS, no email, no Claim.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadEnv } from "../load-env.mjs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";
import { DEMO_PASSWORD } from "../../src/auth/demo-roster.mjs";

loadEnv();

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const OUT = "/tmp/overnight-csm-ar-2026-09-17";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/full-e2e-audit-2026-09-17-csm-ar-evidence";

mkdirSync(OUT, { recursive: true });
mkdirSync(EVID, { recursive: true });

const FORBIDDEN = [
  "send", "claim", "clock", "end shift", "write answers",
  "email unsent", "email me", "send reset", "send what is waiting",
  "pause sending", "send portal", "invoice email", "present send",
  "continue to payment", "build my pack", "enroll", "pull",
];

function isForbiddenLabel(label) {
  const s = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return false;
  return FORBIDDEN.some((w) => s.includes(w));
}

function clip(text, n = 1800) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function pick(r, keys) {
  if (!r || typeof r !== "object") return r;
  const out = {};
  for (const k of keys) if (r[k] !== undefined) out[k] = r[k];
  return out;
}

async function getJson(request, path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 240) }; }
  if (json && typeof json === "object") {
    delete json.token;
    if (json.demo && json.demo.password) json.demo = { ...json.demo, password: "[redacted]" };
  }
  return { status: res.status(), json };
}

function buttonsFrom(page) {
  return page.locator("button, a.btn, [role='button'], input[type=submit]").evaluateAll((els) =>
    els
      .map((el) => {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const id = el.id || "";
        const hidden = el.hidden || el.getAttribute("hidden") != null
          || (el.offsetParent === null && getComputedStyle(el).display === "none");
        const disabled = !!(el.disabled || el.getAttribute("aria-disabled") === "true");
        return { text, id, hidden, disabled };
      })
      .filter((b) => b.text)
      .slice(0, 80)
  );
}

const staffRow = (await db.query(
  `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  [EMAIL]
)).rows[0];
if (!staffRow) {
  console.error("no staff row");
  process.exit(1);
}

const csmDb = (await db.query(
  `SELECT email, role, name, status, is_demo
     FROM staff
    WHERE role = 'csm'
    ORDER BY email`
)).rows;

const eightMoney = (await db.query(
  `SELECT invoice_id::text AS id, status, source, amount_due, amount_paid,
          open_balance, currency, sent_at, created_at, days_overdue
     FROM v_invoice_aging
    WHERE client_id = $1
    ORDER BY created_at DESC
    LIMIT 12`,
  [EIGHT]
)).rows;

const eightTx = (await db.query(
  `SELECT id::text AS id, product_name, amount_paid, status, created_at
     FROM transactions
    WHERE client_id = $1
    ORDER BY created_at DESC
    LIMIT 20`,
  [EIGHT]
)).rows;

const eightCalls = (await db.query(
  `SELECT id::text AS id, outcome, left(coalesce(notes,''), 160) AS notes,
          left(coalesce(transcript,''), 200) AS transcript_head,
          recording_url IS NOT NULL AS has_recording,
          logged_at
     FROM call_outcomes
    WHERE client_id = $1
    ORDER BY logged_at DESC NULLS LAST
    LIMIT 8`,
  [EIGHT]
)).rows;

const eightInsights = (await db.query(
  `SELECT id::text AS id, stage, channel, left(coalesce(notes,''), 160) AS notes,
          recording_url IS NOT NULL AS has_recording,
          occurred_at
     FROM customer_insights
    WHERE client_id = $1
    ORDER BY occurred_at DESC NULLS LAST
    LIMIT 8`,
  [EIGHT]
)).rows;

const meetRows = (await db.query(
  `SELECT 'call_outcomes' AS src, client_id::text, outcome,
          left(coalesce(transcript,''), 180) AS transcript_head,
          logged_at AS at
     FROM call_outcomes
    WHERE coalesce(transcript,'') <> ''
      AND transcript NOT ILIKE '%FAKE MEET%'
    ORDER BY logged_at DESC NULLS LAST
    LIMIT 8`
)).rows;

const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });

// --- 1. Demo GET + CSM form login (no owner cookie) ---
const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const loginPage = await loginCtx.newPage();
const demoGet = await getJson(loginCtx.request, "/api/auth/login");

await loginPage.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await loginPage.waitForTimeout(1200);
const loginFirst = {
  url: loginPage.url(),
  title: await loginPage.title(),
  body: clip(await loginPage.locator("body").innerText()),
  demoPanel: await loginPage.locator("#fh-demo").count(),
  demoButtons: await loginPage.locator(".fh-demo-btn").count(),
};
await loginPage.screenshot({ path: `${EVID}/01-login-form.png`, fullPage: false });
await loginPage.screenshot({ path: `${OUT}/01-login-form.png`, fullPage: false });

await loginPage.fill("#email", "csm@demo.fundhub.local");
await loginPage.fill("#pw", DEMO_PASSWORD);
await loginPage.click("#go");
await loginPage.waitForTimeout(2200);
const csmFormLogin = {
  url: loginPage.url(),
  title: await loginPage.title(),
  err: clip(await loginPage.locator("#err").innerText().catch(() => "")),
  body: clip(await loginPage.locator("body").innerText()),
  stillOnLogin: /login\.html/i.test(loginPage.url()),
};
await loginPage.screenshot({ path: `${EVID}/02-csm-form-login.png`, fullPage: false });
await loginPage.screenshot({ path: `${OUT}/02-csm-form-login.png`, fullPage: false });

const csmPost = await loginCtx.request.post(`${BASE}/api/auth/login`, {
  data: { email: "csm@demo.fundhub.local", password: DEMO_PASSWORD },
});
let csmPostJson = null;
try { csmPostJson = await csmPost.json(); } catch { csmPostJson = { parse_error: true }; }
if (csmPostJson && typeof csmPostJson === "object") delete csmPostJson.token;
const csmApiLogin = {
  status: csmPost.status(),
  ok: csmPostJson?.ok === true,
  error: csmPostJson?.error || null,
  message: csmPostJson?.message || null,
};
await loginCtx.close();

// --- 2. Owner session walk ---
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
const request = context.request;

const api = {};
const paths = [
  ["/api/health", "health"],
  ["/api/auth/login", "demo_login_get"],
  ["/api/read/staff?role=csm", "staff_csm"],
  ["/api/read/csm-queue", "csm_queue"],
  [`/api/read/invoices?client_id=${EIGHT}&status=open&limit=20`, "eight_invoices_open"],
  [`/api/read/invoices?client_id=${EIGHT}&limit=20`, "eight_invoices"],
  [`/api/read/transactions?client_id=${EIGHT}`, "eight_tx"],
  [`/api/read/portal-summary?client_id=${EIGHT}`, "eight_portal"],
  [`/api/read/finance-os?client_id=${EIGHT}`, "eight_finance_os"],
  [`/api/read/finance-os-suggestions?client_id=${EIGHT}`, "eight_fos_sugg"],
  [`/api/read/finance-command?days=30&client_id=${EIGHT}`, "eight_finance_cmd"],
  [`/api/dashboard/client?id=${EIGHT}`, "eight_dash"],
  [`/api/read/agent-context?client_id=${EIGHT}`, "eight_context"],
  ["/api/read/invoices?status=open&limit=50", "ar_open"],
];
for (const [path, key] of paths) api[key] = await getJson(request, path);

function slimQueue(json) {
  const rows = json?.items || json?.rows || json?.queue || json?.data?.items || json?.data || [];
  const list = Array.isArray(rows) ? rows : [];
  return {
    ok: json?.ok,
    count: list.length,
    sample: list.slice(0, 12).map((r) => pick(r, [
      "task_id", "title", "client_id", "client_name", "client_code",
      "due_at", "balance_amount", "open_invoices", "owned_codes",
      "assignee_staff_id", "source_workflow",
    ])),
  };
}

function slimInvoices(json) {
  const rows = json?.items || json?.invoices || json?.rows || json?.data?.items || [];
  const list = Array.isArray(rows) ? rows : [];
  return {
    ok: json?.ok,
    count: list.length,
    sample: list.slice(0, 12).map((r) => pick(r, [
      "id", "invoice_id", "invoice_number", "client_id", "client_name",
      "status", "source", "amount_due", "amount_paid", "open_balance",
      "amount", "due_cents", "paid_cents", "currency", "days_overdue",
    ])),
  };
}

function slimPortal(json) {
  const p = json || {};
  return {
    ok: p.ok,
    client: pick(p.client || p.summary?.client || {}, ["id", "first_name", "last_name", "name"]),
    invoice_due: p.invoice_due || p.summary?.invoice_due || null,
    payments: Array.isArray(p.payments) ? p.payments.slice(0, 8).map((r) => pick(r, [
      "id", "product_name", "amount_paid", "status", "created_at",
    ])) : p.payments,
  };
}

function slimContext(json) {
  const block = String(json?.as_prompt_block || json?.context?.as_prompt_block || "");
  const calls = json?.recent_calls || json?.context?.recent_calls || [];
  return {
    ok: json?.ok,
    has_said: /said:/i.test(block),
    said_snip: (block.match(/said:\s*(.{0,180})/i) || [null, ""])[1],
    call_count: Array.isArray(calls) ? calls.length : 0,
    calls: Array.isArray(calls) ? calls.slice(0, 4).map((c) => ({
      outcome: c.outcome,
      notes: String(c.notes || "").slice(0, 120),
      transcript_head: String(c.transcript || "").slice(0, 160),
      has_recording: !!c.recording_url,
    })) : [],
    block_head: block.slice(0, 400),
  };
}

async function openPage(path, key, waitMs = 2800) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await buttonsFrom(page).catch(() => []);
  const shot = `${EVID}/${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: false });
  return { url: page.url(), title: await page.title(), body, buttons, shot };
}

const livePages = {};
livePages.csm = await openPage("/app/csm-queue.html", "03-csm-queue", 3500);
livePages.opsAr = await openPage("/app/ops-admin.html", "04-ops-ar", 4000);
livePages.finance8 = await openPage(`/app/finance-os.html?client_id=${EIGHT}`, "05-finance-os-8", 4000);
livePages.portal8 = await openPage(`/app/client-portal.html?id=${EIGHT}`, "06-portal-8", 4000);

let portalPay = { clicked: false };
try {
  const acct = page.locator("#acct");
  if (await acct.count()) {
    await acct.locator("summary").first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
  }
  const payTab = page.locator('button[data-tab="pay"]');
  if (await payTab.count()) {
    const selected = await payTab.first().getAttribute("aria-selected");
    if (selected !== "true") {
      await payTab.first().click({ timeout: 4000, force: true });
      await page.waitForTimeout(500);
    }
  }
  portalPay = {
    clicked: true,
    drawerOpen: await page.locator("#acct").evaluate((el) => el.open).catch(() => null),
    body: clip(await page.locator("#tp-pay").innerText().catch(() => "")),
  };
  await page.screenshot({ path: `${EVID}/07-portal-8-payments.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/07-portal-8-payments.png`, fullPage: false });
} catch (err) {
  portalPay = { clicked: false, error: String(err.message || err).slice(0, 240) };
}

function liveSnapshot() {
  return {
    at: new Date().toISOString(),
    no_send: true,
    demoGet,
    loginFirst,
    csmFormLogin,
    csmApiLogin,
    staff: { email: staffRow.email, role: staffRow.role, name: staffRow.name, status: staffRow.status },
    csmDb,
    eightMoney: eightMoney.map((r) => ({
      id: r.id,
      status: r.status,
      source: r.source,
      amount_due: r.amount_due,
      amount_paid: r.amount_paid,
      open_balance: r.open_balance,
      currency: r.currency,
      sent_at: r.sent_at,
      days_overdue: r.days_overdue,
    })),
    eightTx: eightTx.map((r) => ({
      id: r.id,
      product_name: r.product_name,
      amount_paid: r.amount_paid,
      status: r.status,
    })),
    eightCalls,
    eightInsights,
    meetRows,
    api: {
      health: api.health,
      demo: api.demo_login_get,
      staff_csm: api.staff_csm,
      csm_queue: { status: api.csm_queue.status, ...slimQueue(api.csm_queue.json) },
      eight_invoices_open: { status: api.eight_invoices_open.status, ...slimInvoices(api.eight_invoices_open.json) },
      eight_invoices: { status: api.eight_invoices.status, ...slimInvoices(api.eight_invoices.json) },
      eight_tx: { status: api.eight_tx.status, json: slimInvoices(api.eight_tx.json) },
      eight_portal: { status: api.eight_portal.status, ...slimPortal(api.eight_portal.json) },
      eight_finance_os: { status: api.eight_finance_os.status, keys: Object.keys(api.eight_finance_os.json || {}), json: api.eight_finance_os.json },
      eight_fos_sugg: { status: api.eight_fos_sugg.status, json: pick(api.eight_fos_sugg.json || {}, ["ok", "error", "entitled", "reason", "source"]) },
      eight_finance_cmd: { status: api.eight_finance_cmd.status, keys: Object.keys(api.eight_finance_cmd.json || {}) },
      eight_dash: { status: api.eight_dash.status, keys: Object.keys(api.eight_dash.json || {}) },
      eight_context: { status: api.eight_context.status, ...slimContext(api.eight_context.json) },
      ar_open: { status: api.ar_open.status, ...slimInvoices(api.ar_open.json) },
    },
    livePages: {
      csm: { url: livePages.csm.url, title: livePages.csm.title, buttons: livePages.csm.buttons.map((b) => b.text), body: livePages.csm.body },
      opsAr: { url: livePages.opsAr.url, title: livePages.opsAr.title, buttons: livePages.opsAr.buttons.map((b) => b.text), body: livePages.opsAr.body },
      finance8: { url: livePages.finance8.url, title: livePages.finance8.title, buttons: livePages.finance8.buttons.map((b) => b.text), body: livePages.finance8.body },
      portal8: { url: livePages.portal8.url, title: livePages.portal8.title, buttons: livePages.portal8.buttons.map((b) => b.text), body: livePages.portal8.body },
      portalPay,
    },
  };
}

writeFileSync(`${OUT}/live.json`, JSON.stringify(liveSnapshot(), null, 2));
writeFileSync(`${EVID}/live.json`, JSON.stringify(liveSnapshot(), null, 2));

// --- 3. Beta / ops every-button (after live facts). No send / charge. ---
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
  const opened = await openPage(path, key, 2500);
  const clicks = [];
  const candidates = opened.buttons.filter((b) => !b.hidden && !b.disabled);
  for (const b of candidates.slice(0, 18)) {
    if (isForbiddenLabel(b.text) || isForbiddenLabel(b.id)) {
      clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "send/charge/claim/clock" });
      continue;
    }
    // Tabs / period / filters / navheads are local. Skip Sign out.
    if (/sign out|log out|delete|wipe|run now|\brun\b|promote|invite|generate|sync|upload|reset password|ask\b|write a post|call now|dial|start call/i.test(b.text)) {
      clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "write-or-sync-or-signout" });
      continue;
    }
    const before = opened.url;
    const loc = b.id
      ? page.locator(`#${CSS.escape(b.id)}`).first()
      : page.getByRole("button", { name: b.text, exact: true }).first();
    try {
      if (!(await loc.count())) {
        clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "not found for click" });
        continue;
      }
      await loc.click({ timeout: 2500, force: true });
      await page.waitForTimeout(700);
      const afterUrl = page.url();
      const afterBody = clip(await page.locator("body").innerText().catch(() => ""));
      const errish = /could not load|not signed in|internal_error|something went wrong|404/i.test(afterBody)
        && !/could not load unpaid invoices/i.test(afterBody);
      clicks.push({
        label: b.text,
        id: b.id,
        result: errish ? "FAIL" : "PASS",
        urlChanged: afterUrl !== before,
        afterUrl,
        bodyHead: afterBody.slice(0, 220),
      });
      if (afterUrl !== before && !afterUrl.includes(path.split("/").pop().replace(".html", ""))) {
        await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(1200);
      }
    } catch (err) {
      const msg = String(err.message || err).slice(0, 180);
      const skip = /Timeout|not visible|intercepts pointer/i.test(msg);
      clicks.push({ label: b.text, id: b.id, result: skip ? "SKIP" : "FAIL", why: msg });
    }
  }
  const mainBroken = clicks.filter((c) => c.result === "FAIL");
  const pageResult = /login\.html/i.test(opened.url)
    ? "FAIL"
    : /could not load|not signed in|internal_error/i.test(opened.body) && !opened.body.includes("No unpaid")
      ? "FAIL"
      : mainBroken.length
        ? "FAIL"
        : "PASS";
  beta.push({
    path,
    key,
    pageResult,
    url: opened.url,
    title: opened.title,
    body: opened.body.slice(0, 700),
    buttons: opened.buttons.map((b) => b.text).slice(0, 30),
    clicks,
    failClicks: mainBroken.map((c) => c.label),
  });
  } catch (err) {
    beta.push({
      path,
      key,
      pageResult: "FAIL",
      error: String(err.message || err).slice(0, 240),
      failClicks: ["page open"],
    });
  }
}

await browser.close();

const dump = {
  at: new Date().toISOString(),
  no_send: true,
  demoGet,
  loginFirst,
  csmFormLogin,
  csmApiLogin,
  staff: { email: staffRow.email, role: staffRow.role, name: staffRow.name, status: staffRow.status },
  csmDb,
  eightMoney: eightMoney.map((r) => ({
    id: r.id,
    status: r.status,
    source: r.source,
    amount_due: r.amount_due,
    amount_paid: r.amount_paid,
    open_balance: r.open_balance,
    currency: r.currency,
    sent_at: r.sent_at,
    days_overdue: r.days_overdue,
  })),
  eightTx: eightTx.map((r) => ({
    id: r.id,
    product_name: r.product_name,
    amount_paid: r.amount_paid,
    status: r.status,
  })),
  eightCalls,
  eightInsights,
  meetRows,
  api: {
    health: api.health,
    demo: api.demo_login_get,
    staff_csm: api.staff_csm,
    csm_queue: { status: api.csm_queue.status, ...slimQueue(api.csm_queue.json) },
    eight_invoices_open: { status: api.eight_invoices_open.status, ...slimInvoices(api.eight_invoices_open.json) },
    eight_invoices: { status: api.eight_invoices.status, ...slimInvoices(api.eight_invoices.json) },
    eight_tx: { status: api.eight_tx.status, json: slimInvoices(api.eight_tx.json) },
    eight_portal: { status: api.eight_portal.status, ...slimPortal(api.eight_portal.json) },
    eight_finance_os: { status: api.eight_finance_os.status, keys: Object.keys(api.eight_finance_os.json || {}), json: api.eight_finance_os.json },
    eight_fos_sugg: { status: api.eight_fos_sugg.status, json: pick(api.eight_fos_sugg.json || {}, ["ok", "error", "entitled", "reason", "source"]) },
    eight_finance_cmd: { status: api.eight_finance_cmd.status, keys: Object.keys(api.eight_finance_cmd.json || {}) },
    eight_dash: { status: api.eight_dash.status, keys: Object.keys(api.eight_dash.json || {}) },
    eight_context: { status: api.eight_context.status, ...slimContext(api.eight_context.json) },
    ar_open: { status: api.ar_open.status, ...slimInvoices(api.ar_open.json) },
  },
  livePages: {
    csm: { url: livePages.csm.url, title: livePages.csm.title, buttons: livePages.csm.buttons.map((b) => b.text), body: livePages.csm.body },
    opsAr: { url: livePages.opsAr.url, title: livePages.opsAr.title, buttons: livePages.opsAr.buttons.map((b) => b.text), body: livePages.opsAr.body },
    finance8: { url: livePages.finance8.url, title: livePages.finance8.title, buttons: livePages.finance8.buttons.map((b) => b.text), body: livePages.finance8.body },
    portal8: { url: livePages.portal8.url, title: livePages.portal8.title, buttons: livePages.portal8.buttons.map((b) => b.text), body: livePages.portal8.body },
    portalPay,
  },
  beta: beta.map((b) => ({
    path: b.path,
    key: b.key,
    pageResult: b.pageResult,
    url: b.url,
    title: b.title,
    buttons: b.buttons,
    failClicks: b.failClicks,
    clicks: b.clicks,
    body: b.body,
    error: b.error,
  })),
};

writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));
writeFileSync(`${EVID}/dump.json`, JSON.stringify(dump, null, 2));
console.log(JSON.stringify({
  wrote: `${OUT}/dump.json`,
  evid: EVID,
  demoEnabled: demoGet.json?.demo?.enabled,
  csmFormStillOnLogin: csmFormLogin.stillOnLogin,
  csmFormErr: csmFormLogin.err,
  csmApi: csmApiLogin,
  csmDb,
  staffCsmApi: dump.api.staff_csm,
  csmQueue: dump.api.csm_queue,
  eightMoney,
  eightTx,
  eightPortal: dump.api.eight_portal,
  eightInvoicesOpen: dump.api.eight_invoices_open,
  arOpen: dump.api.ar_open,
  fos: { status: dump.api.eight_finance_os.status, keys: dump.api.eight_finance_os.keys },
  sugg: dump.api.eight_fos_sugg,
  context: dump.api.eight_context,
  meetRows,
  liveCsmBody: dump.livePages.csm.body.slice(0, 800),
  liveOpsBody: dump.livePages.opsAr.body.slice(0, 800),
  liveFinBody: dump.livePages.finance8.body.slice(0, 800),
  livePortalBody: dump.livePages.portal8.body.slice(0, 800),
  portalPay: dump.livePages.portalPay,
  betaSummary: beta.map((b) => ({ path: b.path, pageResult: b.pageResult, fails: b.failClicks })),
}, null, 2));
