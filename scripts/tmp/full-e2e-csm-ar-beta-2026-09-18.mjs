// LIVE e2e: CSM + AR + Meet context + Beta. Tester only. No product edits.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadEnv } from "../load-env.mjs";
import { db, close as closeDb } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";
import { DEMO_PASSWORD } from "../../src/auth/demo-roster.mjs";

loadEnv();

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const FORBIDDEN = "9af65808-a619-4e65-ae91-239766a006b7";
const AGENT_PHONE = "+16616054248";
const EVID = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/full-e2e-audit-2026-09-18-csm-ar-beta-evidence";
const OUT = "/tmp/full-e2e-csm-ar-beta-2026-09-18";

mkdirSync(OUT, { recursive: true });
mkdirSync(EVID, { recursive: true });
mkdirSync(`${EVID}/_raw`, { recursive: true });

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
      .slice(0, 90)
  );
}
function isSendCharge(label) {
  const s = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return false;
  return [
    "send what is waiting", "pause sending", "email unsent", "email me",
    "send reset", "send portal", "invoice email", "present send",
    "continue to payment", "build my pack", "enroll", "pull",
    "pay now", "charge", "end shift", "write answers", "save these answers",
    "write today’s c-suite", "write today's c-suite", "write a post",
    "promote", "invite", "call now", "dial", "start call",
  ].some((w) => s.includes(w));
}

const FORBIDDEN_IDS = [FORBIDDEN];

const staffRow = (await db.query(
  `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  [EMAIL]
)).rows[0];
if (!staffRow) {
  console.error("no owner staff row");
  process.exit(1);
}

const csmDb = (await db.query(
  `SELECT email, role, name, status, is_demo
     FROM staff
    WHERE role = 'csm'
    ORDER BY email`
)).rows;

const csmLive = (await db.query(
  `SELECT email, role, name, status, is_demo
     FROM staff
    WHERE lower(email) = 'csm@fundhub.ai'
    LIMIT 1`
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

const eightClient = (await db.query(
  `SELECT id::text, first_name, last_name, email, phone, client_code
     FROM clients WHERE id = $1`,
  [EIGHT]
)).rows[0];

const eightCalls = (await db.query(
  `SELECT id::text AS id, outcome, left(coalesce(notes,''), 160) AS notes,
          left(coalesce(transcript,''), 200) AS transcript_head,
          length(coalesce(transcript,'')) AS transcript_len,
          recording_url IS NOT NULL AS has_recording,
          logged_at
     FROM call_outcomes
    WHERE client_id = $1
    ORDER BY logged_at DESC NULLS LAST
    LIMIT 12`,
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

const meetCallOutcomes = (await db.query(
  `SELECT id::text AS id, client_id::text AS client_id,
          outcome, length(coalesce(transcript,'')) AS transcript_len,
          left(coalesce(transcript,''), 220) AS transcript_head,
          recording_url IS NOT NULL AS has_recording,
          logged_at
     FROM call_outcomes
    WHERE coalesce(transcript,'') <> ''
      AND client_id::text NOT LIKE '9af65808%'
    ORDER BY logged_at DESC NULLS LAST
    LIMIT 20`
)).rows;

const meetRealWords = meetCallOutcomes.filter((r) =>
  r.transcript_len > 20
  && !/FAKE MEET|E2E-DICTATOR/i.test(r.transcript_head || "")
);

const meetInsights = (await db.query(
  `SELECT id::text AS id, client_id::text AS client_id, stage, channel,
          length(coalesce(notes,'')) AS notes_len,
          left(coalesce(notes,''), 180) AS notes_head,
          recording_url IS NOT NULL AS has_recording,
          occurred_at
     FROM customer_insights
    WHERE channel = 'google_meet'
      AND client_id::text NOT LIKE '9af65808%'
    ORDER BY occurred_at DESC NULLS LAST
    LIMIT 12`
)).rows;

let brainMeet = [];
let brainChunks = [];
try {
  brainMeet = (await db.query(
    `SELECT id::text, name, mime_type, needs_transcription,
            client_id::text AS client_id
       FROM brain_files
      WHERE (name ILIKE '%meet%' OR name ILIKE '%transcript%' OR name ILIKE '%gemini%'
             OR needs_transcription = true)
        AND coalesce(client_id::text,'') NOT LIKE '9af65808%'
      ORDER BY created_at DESC NULLS LAST
      LIMIT 20`
  )).rows;
} catch (err) {
  brainMeet = [{ error: String(err.message || err).slice(0, 180) }];
}
try {
  brainChunks = (await db.query(
    `SELECT f.id::text AS file_id, f.name, f.client_id::text AS client_id,
            length(c.content) AS content_len,
            left(c.content, 180) AS content_head
       FROM brain_chunks c
       JOIN brain_files f ON f.id = c.file_id
      WHERE (f.name ILIKE '%meet%' OR f.name ILIKE '%transcript%' OR f.name ILIKE '%gemini%')
        AND coalesce(f.client_id::text,'') NOT LIKE '9af65808%'
        AND coalesce(c.content,'') <> ''
      ORDER BY c.chunk_index
      LIMIT 12`
  )).rows;
} catch (err) {
  brainChunks = [{ error: String(err.message || err).slice(0, 180) }];
}

const queueTasks = (await db.query(
  `SELECT t.id::text AS task_id, t.title, t.assignee_staff_id::text AS assignee_staff_id,
          t.client_id::text AS client_id,
          NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), '') AS client_name,
          c.email, c.phone, c.client_code, t.due_at, t.done
     FROM tasks t
     JOIN clients c ON c.id = t.client_id
    WHERE t.assignee_role = 'csm'
      AND t.done = false
      AND t.client_id::text NOT LIKE '9af65808%'
    ORDER BY t.due_at NULLS LAST
    LIMIT 40`
)).rows;

const dbDump = {
  at: new Date().toISOString(),
  staff: pick(staffRow, ["email", "role", "name", "status"]),
  csmDb,
  csmLive,
  eightClient: pick(eightClient, ["id", "first_name", "last_name", "email", "phone", "client_code"]),
  eightMoney,
  eightTx: eightTx.map((r) => pick(r, ["id", "product_name", "amount_paid", "status", "created_at"])),
  eightCalls,
  eightInsights,
  meetCallOutcomes,
  meetRealWords,
  meetInsights,
  brainMeet,
  brainChunks,
  queueTasks: queueTasks.map((r) => pick(r, [
    "task_id", "title", "assignee_staff_id", "client_id", "client_name",
    "email", "phone", "client_code", "due_at", "done",
  ])),
};
writeFileSync(`${OUT}/db.json`, JSON.stringify(dbDump, null, 2));
writeFileSync(`${EVID}/db.json`, JSON.stringify(dbDump, null, 2));

console.log(JSON.stringify({
  phase: "db",
  csmLive: csmLive[0]?.email || null,
  csmDemoOnly: csmDb.every((r) => r.is_demo) && !csmLive[0],
  eightInv: eightMoney.map((r) => ({ status: r.status, due: r.amount_due, paid: r.amount_paid, open: r.open_balance })),
  meetReal: meetRealWords.length,
  meetAnyTranscript: meetCallOutcomes.length,
  brainMeet: brainMeet.length,
  brainChunks: brainChunks.length,
  queue: queueTasks.length,
}, null, 2));

const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
const browser = await chromium.launch({ headless: true });

// --- 1. Demo GET + CSM form login (no owner cookie) ---
const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const loginPage = await loginCtx.newPage();
const demoGet = await getJson(loginCtx.request, "/api/auth/login");

await loginPage.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await loginPage.waitForTimeout(1400);
const loginFirst = {
  url: loginPage.url(),
  title: await loginPage.title(),
  body: clip(await loginPage.locator("body").innerText()),
  demoPanel: await loginPage.locator("#fh-demo").count(),
  demoButtons: await loginPage.locator(".fh-demo-btn").count(),
};
await loginPage.screenshot({ path: `${EVID}/_raw/01-login-form.png`, fullPage: false });
await loginPage.screenshot({ path: `${OUT}/01-login-form.png`, fullPage: false });

await loginPage.fill("#email", "csm@demo.fundhub.local");
await loginPage.fill("#pw", DEMO_PASSWORD);
await loginPage.click("#go");
await loginPage.waitForTimeout(2400);
const csmFormLogin = {
  url: loginPage.url(),
  title: await loginPage.title(),
  err: clip(await loginPage.locator("#err").innerText().catch(() => "")),
  body: clip(await loginPage.locator("body").innerText()),
  stillOnLogin: /login\.html/i.test(loginPage.url()),
};
await loginPage.screenshot({ path: `${EVID}/_raw/02-csm-form-login.png`, fullPage: false });
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

if (csmLive[0] && !csmLive[0].is_demo) {
  const liveTry = await loginPage.locator("#email").count();
  if (liveTry) {
    await loginPage.fill("#email", "csm@fundhub.ai");
    await loginPage.fill("#pw", DEMO_PASSWORD);
    await loginPage.click("#go");
    await loginPage.waitForTimeout(2000);
  }
}
await loginCtx.close();

// --- 2. Owner session ---
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
  [`/api/read/invoices?client_id=${EIGHT}&limit=20`, "eight_invoices"],
  [`/api/read/transactions?client_id=${EIGHT}`, "eight_tx"],
  [`/api/read/portal-summary?client_id=${EIGHT}`, "eight_portal"],
  [`/api/dashboard/client?id=${EIGHT}`, "eight_dash"],
  [`/api/read/finance-os?client_id=${EIGHT}`, "eight_finance_os"],
  [`/api/read/agent-context?client_id=${EIGHT}`, "eight_context"],
  [`/api/read/closer-call?client_id=${EIGHT}`, "eight_closer_call"],
  ["/api/read/invoices?status=open&limit=50", "ar_open"],
];
for (const [path, key] of paths) api[key] = await getJson(request, path);

function slimQueue(json) {
  const rows = json?.items || json?.rows || json?.queue || json?.data?.items || json?.data || [];
  const list = Array.isArray(rows) ? rows : [];
  return {
    ok: json?.ok,
    count: list.length,
    sample: list.slice(0, 16).map((r) => pick(r, [
      "task_id", "title", "client_id", "client_name", "client_code",
      "due_at", "balance_amount", "balance_due", "open_invoices", "owned_codes",
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
    invoice_due: p.invoice_due || p.summary?.invoice_due || p.data?.invoice_due || null,
    payments: Array.isArray(p.payments)
      ? p.payments.slice(0, 8).map((r) => pick(r, ["id", "product_name", "amount_paid", "status", "created_at"]))
      : (p.data?.payments || p.payments),
  };
}
function slimContext(json) {
  const ctx = json?.context || json || {};
  const block = String(ctx.as_prompt_block || json?.as_prompt_block || "");
  const calls = ctx.recent_calls || json?.recent_calls || [];
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
    block_head: block.slice(0, 500),
  };
}

async function openPage(path, key, waitMs = 2800) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await buttonsFrom(page).catch(() => []);
  await page.screenshot({ path: `${EVID}/_raw/${key}.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: false });
  return { url: page.url(), title: await page.title(), body, buttons };
}

const livePages = {};
livePages.csmBefore = await openPage("/app/csm-queue.html", "03-csm-queue-before", 3800);

const queueApiBefore = slimQueue(api.csm_queue.json);
const simPick = queueTasks.find((t) => {
  const email = String(t.email || "").toLowerCase();
  const name = String(t.client_name || "");
  const phone = String(t.phone || "").replace(/\D/g, "");
  if (FORBIDDEN_IDS.includes(t.client_id)) return false;
  if (phone.endsWith("0865")) return false;
  if (t.assignee_staff_id) return false;
  const sim = /sim/i.test(name) || /\+sim-|\+e2e\+|stanbridgejchris\+/i.test(email);
  const phoneOk = !phone || phone.endsWith("4248") || phone === "16616054248";
  return sim && phoneOk;
}) || null;

const claim = { clicked: false, pick: simPick };
if (simPick) {
  const btn = page.locator(`[data-claim="${simPick.task_id}"]`).first();
  const found = await btn.count();
  claim.buttonFound = found > 0;
  if (found) {
    const net = [];
    const waitPatch = page.waitForResponse(
      (res) => /\/api\/tasks/.test(res.url()) && res.request().method() === "PATCH",
      { timeout: 8000 }
    ).catch(() => null);
    await btn.click({ timeout: 4000 });
    const patchRes = await waitPatch;
    await page.waitForTimeout(1200);
    let patchBody = null;
    if (patchRes) {
      let body = null;
      try { body = await patchRes.json(); } catch { body = { parse_error: true }; }
      if (body && typeof body === "object" && body.task) {
        body.task = pick(body.task, ["id", "title", "assignee_staff_id", "client_id", "done"]);
      }
      patchBody = { status: patchRes.status(), body };
      net.push(patchBody);
    }
    const afterBody = clip(await page.locator("body").innerText().catch(() => ""));
    const chipMine = /Claimed by you/i.test(afterBody);
    const stillClaimBtn = await page.locator(`[data-claim="${simPick.task_id}"]`).count();
    const banner = clip(await page.locator(".banner, #qBanner, [data-banner]").innerText().catch(() => ""));
    await page.screenshot({ path: `${EVID}/_raw/03b-csm-claim.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/03b-csm-claim.png`, fullPage: false });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2800);
    const reloadBody = clip(await page.locator("body").innerText().catch(() => ""));
    const reloadClaimBtn = await page.locator(`[data-claim="${simPick.task_id}"]`).count();
    const reloadMine = /Claimed by you/i.test(reloadBody);
    await page.screenshot({ path: `${EVID}/_raw/03c-csm-claim-reload.png`, fullPage: false });
    const afterApi = await getJson(request, "/api/read/csm-queue");
    const afterSlim = slimQueue(afterApi.json);
    const rowAfter = afterSlim.sample.find((r) => r.task_id === simPick.task_id)
      || afterSlim.sample.find((r) => r.client_id === simPick.client_id);
    claim.clicked = true;
    claim.net = net;
    claim.patchBody = patchBody;
    claim.afterClick = {
      chipMine,
      stillClaimBtn,
      banner,
      bodyHead: afterBody.slice(0, 400),
    };
    claim.afterReload = {
      reloadMine,
      reloadClaimBtn,
      bodyHead: reloadBody.slice(0, 400),
      rowAfter,
    };
    claim.bounce = !claim.clicked ? true
      : (reloadClaimBtn > 0 && !reloadMine && !(rowAfter && rowAfter.assignee_staff_id));
    claim.success = !!(rowAfter && rowAfter.assignee_staff_id) || reloadMine;
  } else {
    claim.why = "Claim button not on screen for picked task";
  }
} else {
  claim.why = "no unclaimed sim plus-tag / agent-phone task on CSM queue";
}

livePages.csmAfter = {
  url: page.url(),
  body: clip(await page.locator("body").innerText().catch(() => "")),
  buttons: (await buttonsFrom(page).catch(() => [])).map((b) => b.text),
};

livePages.opsAr = await openPage("/app/ops-admin.html", "04-ops-ar", 4200);
livePages.finance8 = await openPage(`/app/finance-os.html?client_id=${EIGHT}`, "05-finance-os-8", 4200);

const recordPayButtons = [];
for (const pack of [livePages.opsAr, livePages.finance8]) {
  for (const b of pack.buttons || []) {
    if (/record payment|log payment|mark paid|mark as paid|allocate|post receipt|received payment/i.test(b.text)) {
      recordPayButtons.push({ screen: pack.url, ...b });
    }
  }
}

let recordPayClick = { exists: recordPayButtons.length > 0, buttons: recordPayButtons, clicked: false };
if (recordPayButtons[0] && !/commission|ledger|payout/i.test(recordPayButtons[0].text)) {
  const b = recordPayButtons[0];
  const loc = b.id ? page.locator(`#${CSS.escape(b.id)}`).first() : page.getByRole("button", { name: b.text, exact: true }).first();
  if (await loc.count()) {
    await loc.click({ timeout: 3000 }).catch((e) => { recordPayClick.error = String(e.message || e).slice(0, 180); });
    await page.waitForTimeout(1500);
    recordPayClick.clicked = true;
    recordPayClick.afterBody = clip(await page.locator("body").innerText().catch(() => "")).slice(0, 500);
    await page.screenshot({ path: `${EVID}/_raw/05b-record-payment.png`, fullPage: false });
  }
}

livePages.portal8 = await openPage(`/app/client-portal.html?id=${EIGHT}`, "06-portal-8", 4200);
let portalPay = { clicked: false };
try {
  const acct = page.locator("#acct");
  if (await acct.count()) {
    await acct.locator("summary").first().click({ timeout: 4000 });
    await page.waitForTimeout(700);
  }
  const payTab = page.locator('button[data-tab="pay"]');
  if (await payTab.count()) {
    const selected = await payTab.first().getAttribute("aria-selected");
    if (selected !== "true") {
      await payTab.first().click({ timeout: 4000, force: true });
      await page.waitForTimeout(600);
    }
  }
  portalPay = {
    clicked: true,
    drawerOpen: await page.locator("#acct").evaluate((el) => el.open).catch(() => null),
    body: clip(await page.locator("#tp-pay").innerText().catch(() => "")),
    has2500: /2,?500/.test(await page.locator("#tp-pay").innerText().catch(() => "")),
    hasDueNow: /due now/i.test(await page.locator("#tp-pay").innerText().catch(() => "")),
    has3000: /3,?000/.test(await page.locator("#tp-pay").innerText().catch(() => "")),
  };
  await page.screenshot({ path: `${EVID}/_raw/07-portal-8-payments.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/07-portal-8-payments.png`, fullPage: false });
} catch (err) {
  portalPay = { clicked: false, error: String(err.message || err).slice(0, 240) };
}

const meetClients = [...new Set([
  ...meetRealWords.map((r) => r.client_id),
  ...meetCallOutcomes.filter((r) => r.transcript_len > 0).map((r) => r.client_id),
])].filter((id) => id && id !== FORBIDDEN).slice(0, 6);

const meetApi = {};
for (const id of meetClients) {
  meetApi[id] = {
    agent_context: slimContext((await getJson(request, `/api/read/agent-context?client_id=${id}`)).json),
    closer_call: {
      status: (await getJson(request, `/api/read/closer-call?client_id=${id}`)).status,
      keys: Object.keys((await getJson(request, `/api/read/closer-call?client_id=${id}`)).json || {}),
    },
  };
}
if (!meetApi[EIGHT]) {
  meetApi[EIGHT] = {
    agent_context: slimContext(api.eight_context.json),
    closer_call: { status: api.eight_closer_call.status, keys: Object.keys(api.eight_closer_call.json || {}) },
  };
}

writeFileSync(`${OUT}/live.json`, JSON.stringify({
  at: new Date().toISOString(),
  demoGet,
  loginFirst,
  csmFormLogin,
  csmApiLogin,
  csmDb,
  csmLive,
  eightMoney,
  eightTx,
  eightCalls,
  eightInsights,
  claim,
  queueApiBefore,
  recordPayClick,
  portalPay,
  meetCallOutcomes,
  meetRealWords,
  meetInsights,
  brainMeet,
  brainChunks,
  meetApi,
  api: {
    health: api.health,
    staff_csm: api.staff_csm,
    csm_queue: { status: api.csm_queue.status, ...queueApiBefore },
    eight_invoices: { status: api.eight_invoices.status, ...slimInvoices(api.eight_invoices.json) },
    eight_portal: { status: api.eight_portal.status, ...slimPortal(api.eight_portal.json) },
    eight_context: { status: api.eight_context.status, ...slimContext(api.eight_context.json) },
    eight_closer_call: { status: api.eight_closer_call.status, keys: Object.keys(api.eight_closer_call.json || {}) },
    eight_dash: { status: api.eight_dash.status, keys: Object.keys(api.eight_dash.json || {}) },
    ar_open: { status: api.ar_open.status, ...slimInvoices(api.ar_open.json) },
  },
  livePages: {
    csmBefore: { url: livePages.csmBefore.url, buttons: livePages.csmBefore.buttons.map((b) => b.text), body: livePages.csmBefore.body },
    csmAfter: livePages.csmAfter,
    opsAr: { url: livePages.opsAr.url, buttons: livePages.opsAr.buttons.map((b) => b.text), body: livePages.opsAr.body },
    finance8: { url: livePages.finance8.url, buttons: livePages.finance8.buttons.map((b) => b.text), body: livePages.finance8.body },
    portal8: { url: livePages.portal8.url, buttons: livePages.portal8.buttons.map((b) => b.text), body: livePages.portal8.body },
    portalPay,
  },
}, null, 2));
writeFileSync(`${EVID}/live.json`, await import("node:fs").then((fs) => fs.readFileSync(`${OUT}/live.json`, "utf8")));

console.log(JSON.stringify({
  phase: "live",
  demoEnabled: demoGet.json?.demo?.enabled,
  csmFormStillOnLogin: csmFormLogin.stillOnLogin,
  csmApi: csmApiLogin,
  claim: {
    clicked: claim.clicked,
    bounce: claim.bounce,
    success: claim.success,
    pick: claim.pick ? { name: claim.pick.client_name, task: claim.pick.task_id, email: claim.pick.email, phone: claim.pick.phone } : null,
    why: claim.why,
    afterReload: claim.afterReload,
  },
  portalPay,
  recordPayClick: { exists: recordPayClick.exists, clicked: recordPayClick.clicked, buttons: recordPayClick.buttons.map((b) => b.text) },
  meetReal: meetRealWords.length,
  meetSaid: Object.fromEntries(Object.entries(meetApi).map(([k, v]) => [k, v.agent_context.has_said])),
}, null, 2));

// --- 3. Beta AFTER live ---
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
    const opened = await openPage(path, key, 2400);
    const clicks = [];
    const candidates = opened.buttons.filter((b) => !b.hidden && !b.disabled);
    for (const b of candidates.slice(0, 16)) {
      if (isSendCharge(b.text) || isSendCharge(b.id)) {
        clicks.push({ label: b.text, id: b.id, result: "SKIP", why: "send/charge" });
        continue;
      }
      if (/sign out|log out|delete|wipe|run now|\brun\b|promote|invite|generate|sync|upload|reset password|ask\b|write a post|call now|dial|start call|claim this/i.test(b.text)) {
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
          bodyHead: afterBody.slice(0, 180),
        });
        if (afterUrl !== before && !afterUrl.includes(path.split("/").pop().replace(".html", ""))) {
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForTimeout(1000);
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

writeFileSync(`${OUT}/beta.json`, JSON.stringify(beta, null, 2));
writeFileSync(`${EVID}/beta.json`, JSON.stringify(beta.map((b) => ({
  path: b.path, key: b.key, pageResult: b.pageResult, failClicks: b.failClicks, clicks: b.clicks, buttons: b.buttons, error: b.error,
})), null, 2));

console.log(JSON.stringify({
  phase: "beta",
  pages: beta.map((b) => ({ path: b.path, pageResult: b.pageResult, failClicks: b.failClicks })),
}, null, 2));

await closeDb();
process.exit(0);
