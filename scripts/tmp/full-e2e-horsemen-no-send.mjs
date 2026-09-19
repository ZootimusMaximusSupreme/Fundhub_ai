// GET-only overnight horsemen walk. No Send / Apply / checkout POST / portal-link / Enroll.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/full-e2e-horsemen-2026-09-17";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  ten: "22103bca-0ec9-4491-bb75-5d1b6528f116",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  thirteen: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042",
};
const ALL_IDS = Object.values(IDS);

mkdirSync(OUT, { recursive: true });

const staffRow = (await db.query(
  `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  [EMAIL]
)).rows[0];
if (!staffRow) {
  console.error("no staff row for", EMAIL);
  process.exit(1);
}

const filesDb = (await db.query(
  `SELECT id, first_name, last_name, email, phone, funded, funded_amount, outcome_tier, created_at
     FROM clients
    WHERE id = ANY($1::uuid[])
    ORDER BY first_name, last_name`,
  [ALL_IDS]
)).rows;

const comboDb = (await db.query(
  `SELECT c.id,
          TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS name,
          c.email
     FROM clients c
    WHERE EXISTS (SELECT 1 FROM funding_rounds fr WHERE fr.client_id = c.id)
      AND EXISTS (SELECT 1 FROM repair_programs rp WHERE rp.client_id = c.id)
      AND c.id = ANY($1::uuid[])`,
  [ALL_IDS]
)).rows;

const comboAny = (await db.query(
  `SELECT c.id,
          TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS name,
          c.email
     FROM clients c
    WHERE EXISTS (SELECT 1 FROM funding_rounds fr WHERE fr.client_id = c.id)
      AND EXISTS (SELECT 1 FROM repair_programs rp WHERE rp.client_id = c.id)
      AND (c.email ILIKE '%+sim-%' OR c.first_name ILIKE 'Sim%' OR c.last_name ILIKE '%Combo%')
    ORDER BY c.created_at DESC
    LIMIT 8`
)).rows;

const roundsDb = (await db.query(
  `SELECT client_id, status, product, round_number, funded_amount, submitted_amount, approved_amount, created_at
     FROM funding_rounds
    WHERE client_id = ANY($1::uuid[])
    ORDER BY created_at DESC`,
  [ALL_IDS]
)).rows;

const repairDb = (await db.query(
  `SELECT client_id, status, program, rounds_cap, created_at
     FROM repair_programs
    WHERE client_id = ANY($1::uuid[])
    ORDER BY created_at DESC`,
  [ALL_IDS]
)).rows;

const inquiryDb = (await db.query(
  `SELECT client_id, bureau, status, is_open, inquiry_name
     FROM inquiry_log
    WHERE client_id = ANY($1::uuid[])
    ORDER BY updated_at DESC
    LIMIT 40`,
  [ALL_IDS]
)).rows;

const contractsDb = (await db.query(
  `SELECT client_id, title, status, signed_at, signature_required
     FROM contracts
    WHERE client_id = ANY($1::uuid[])
    ORDER BY created_at DESC`,
  [ALL_IDS]
)).rows;

const entitlementsDb = (await db.query(
  `SELECT e.client_id, e.entitlement_code, e.revoked_at, e.granted_at, e.expires_at
     FROM entitlements e
    WHERE e.client_id = ANY($1::uuid[])
    ORDER BY e.granted_at DESC`,
  [ALL_IDS]
)).rows;

const crsDb = (await db.query(
  `SELECT client_id, outcome_tier, created_at,
          jsonb_typeof(result) AS result_type,
          (result ? 'scores' OR result ? 'bureaus' OR result ? 'tradelines') AS has_file_keys
     FROM crs_results
    WHERE client_id = ANY($1::uuid[])
    ORDER BY created_at DESC
    LIMIT 40`,
  [ALL_IDS]
)).rows;

const docsDb = (await db.query(
  `SELECT client_id, kind, subtype, title, mime_type, document_key, byte_size, created_at
     FROM documents
    WHERE client_id = ANY($1::uuid[])
    ORDER BY created_at DESC
    LIMIT 80`,
  [ALL_IDS]
)).rows;

const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const KEEP = [
  "id", "client_id", "title", "name", "status", "stage", "round_number",
  "approved_amount", "funded_amount", "submitted_amount", "amount", "amount_cents",
  "balance_cents", "total_cents", "entitlement_code", "entitlement_name", "kind",
  "active", "filename", "original_name", "doc_type", "subtype", "label", "state",
  "key", "invoice_number", "due_cents", "paid_cents", "amount_due", "amount_paid",
  "balance_due", "lender_name", "match_count", "next_step", "owner_role",
  "mime_type", "document_key", "byte_size", "email", "role", "task_id",
  "client_name", "currency", "source", "delivery_status", "code", "product",
  "paid", "first_name", "last_name", "program_kind", "rounds_cap", "current_round",
  "bureau", "score", "signed_at", "signature_required", "is_open", "inquiry_name",
  "phone", "round_kind",
];

function pick(r) {
  if (!r || typeof r !== "object") return r;
  const keep = {};
  for (const k of KEEP) {
    if (r[k] !== undefined) keep[k] = r[k];
  }
  return keep;
}

function slim(json) {
  if (!json || typeof json !== "object") return json;
  const rows = json.rows || json.items || json.queue || json.data || json.cases;
  if (Array.isArray(rows)) {
    return {
      ok: json.ok,
      status: json.status,
      count: rows.length,
      sample: rows.slice(0, 20).map(pick),
    };
  }
  const out = { ok: json.ok, error: json.error };
  if (json.client) out.client = pick(json.client);
  if (json.next_action) out.next_action = json.next_action;
  if (json.transactions) out.tx_count = json.transactions.length;
  if (json.invoices) out.invoice_count = json.invoices.length;
  if (json.crs_results) out.crs_count = json.crs_results.length;
  if (json.entitlements) out.entitlements = json.entitlements.slice?.(0, 12) || json.entitlements;
  if (json.progress) out.progress = json.progress;
  if (json.summary) out.summary = json.summary;
  if (json.pending != null) out.pending = json.pending;
  if (json.report) out.report_keys = Object.keys(json.report);
  if (json.checklist) out.checklist = json.checklist;
  if (json.agreements) out.agreements = json.agreements;
  if (json.contracts) out.contracts = Array.isArray(json.contracts) ? json.contracts.slice(0, 12).map(pick) : json.contracts;
  if (json.owned) out.owned = json.owned;
  if (json.what_you_own) out.what_you_own = json.what_you_own;
  return Object.keys(out).some((k) => out[k] !== undefined) ? out : json;
}

async function getJson(request, path) {
  const res = await request.get(BASE + path);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { parse_error: true, snippet: text.slice(0, 240) };
  }
  return { status: res.status(), json: slim(json), rawKeys: json && typeof json === "object" ? Object.keys(json) : [] };
}

function clip(text, n = 1800) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(1500);
const afterLogin = {
  url: page.url(),
  title: await page.title(),
  staff: { email: staffRow.email, role: staffRow.role, name: staffRow.name, status: staffRow.status },
  body: clip(await page.locator("body").innerText()),
};
await page.screenshot({ path: `${OUT}/00-after-login.png`, fullPage: false });

const request = context.request;
const api = {};
const paths = [
  ["/api/health", "health"],
  ["/api/auth/login", "demo_login_get"],
  [`/api/read/funding-rounds?client_id=${IDS.eight}&include_matches=1`, "eight_rounds"],
  [`/api/read/lender-matches?client_id=${IDS.eight}`, "eight_matches"],
  [`/api/read/invoices?client_id=${IDS.eight}`, "eight_invoices"],
  [`/api/read/transactions?client_id=${IDS.eight}`, "eight_tx"],
  [`/api/read/portal-summary?client_id=${IDS.eight}`, "eight_portal"],
  [`/api/read/documents?client_id=${IDS.eight}`, "eight_docs"],
  [`/api/read/underwrite?client_id=${IDS.eight}`, "eight_uwiq"],
  [`/api/dashboard/client?id=${IDS.eight}`, "eight_dash"],
  [`/api/read/contracts?client_id=${IDS.eight}`, "eight_contracts"],
  [`/api/read/client-progress?client_id=${IDS.eight}`, "eight_progress"],
  [`/api/read/repair-cases?client_id=${IDS.nine}`, "nine_repair"],
  [`/api/read/client-progress?client_id=${IDS.nine}`, "nine_progress"],
  [`/api/read/documents?client_id=${IDS.nine}`, "nine_docs"],
  [`/api/read/portal-summary?client_id=${IDS.nine}`, "nine_portal"],
  [`/api/dashboard/client?id=${IDS.nine}`, "nine_dash"],
  [`/api/read/contracts?client_id=${IDS.nine}`, "nine_contracts"],
  [`/api/read/inquiries?client_id=${IDS.nine}`, "nine_inquiries"],
  [`/api/read/repair-cases?client_id=${IDS.ten}`, "ten_repair"],
  [`/api/read/portal-summary?client_id=${IDS.ten}`, "ten_portal"],
  [`/api/read/documents?client_id=${IDS.ten}`, "ten_docs"],
  [`/api/dashboard/client?id=${IDS.ten}`, "ten_dash"],
  [`/api/read/contracts?client_id=${IDS.ten}`, "ten_contracts"],
  [`/api/read/client-progress?client_id=${IDS.ten}`, "ten_progress"],
  [`/api/read/entitlements?client_id=${IDS.eleven}`, "eleven_entitlements"],
  [`/api/read/client-progress?client_id=${IDS.eleven}`, "eleven_progress"],
  [`/api/read/portal-summary?client_id=${IDS.eleven}`, "eleven_portal"],
  [`/api/read/documents?client_id=${IDS.eleven}`, "eleven_docs"],
  [`/api/dashboard/client?id=${IDS.eleven}`, "eleven_dash"],
  [`/api/read/contracts?client_id=${IDS.eleven}`, "eleven_contracts"],
  [`/api/read/entitlements?client_id=${IDS.twelve}`, "twelve_entitlements"],
  [`/api/read/portal-summary?client_id=${IDS.twelve}`, "twelve_portal"],
  [`/api/read/documents?client_id=${IDS.twelve}`, "twelve_docs"],
  [`/api/dashboard/client?id=${IDS.twelve}`, "twelve_dash"],
  [`/api/read/contracts?client_id=${IDS.twelve}`, "twelve_contracts"],
  [`/api/read/client-progress?client_id=${IDS.twelve}`, "twelve_progress"],
  [`/api/dashboard/client?id=${IDS.thirteen}`, "thirteen_dash"],
  [`/api/read/portal-summary?client_id=${IDS.thirteen}`, "thirteen_portal"],
  [`/api/read/documents?client_id=${IDS.thirteen}`, "thirteen_docs"],
  [`/api/read/inquiries?client_id=${IDS.thirteen}`, "thirteen_inquiries"],
  [`/api/read/inquiries`, "inquiries_queue"],
  [`/api/read/repair-cases`, "repair_queue"],
  [`/api/read/search?q=${encodeURIComponent("Eight-Funding")}`, "search8"],
  [`/api/read/search?q=${encodeURIComponent("Nine-Repair")}`, "search9"],
  [`/api/read/search?q=${encodeURIComponent("Ten-Trial")}`, "search10"],
  [`/api/read/search?q=${encodeURIComponent("Twelve-Academy")}`, "search12"],
  [`/api/read/search?q=${encodeURIComponent("Thirteen-NoBook")}`, "search13"],
  [`/api/read/search?q=${encodeURIComponent("Combo")}`, "searchCombo"],
];

for (const [path, key] of paths) {
  api[key] = await getJson(request, path);
}

async function shotPage(path, key, waitMs = 2800) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(waitMs);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await page.locator("button, a.btn, [role='button']").evaluateAll((els) =>
    els
      .map((el) => (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 40)
  ).catch(() => []);
  const shot = `${OUT}/${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  return { url: page.url(), title: await page.title(), body, buttons, shot };
}

const shots = {};

await page.goto(`${BASE}/app/client-control-panel.html?id=${IDS.nine}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(400);
shots.ccp9_first_paint = {
  url: page.url(),
  title: await page.title(),
  body: clip(await page.locator("body").innerText().catch(() => "")),
  shot: `${OUT}/ccp9_first_paint.png`,
  waitMs: 400,
};
await page.screenshot({ path: shots.ccp9_first_paint.shot, fullPage: false });
await page.waitForTimeout(8000);
shots.ccp9_after_wait = {
  url: page.url(),
  title: await page.title(),
  body: clip(await page.locator("body").innerText().catch(() => "")),
  shot: `${OUT}/ccp9_after_wait.png`,
  waitMs: 8400,
};
await page.screenshot({ path: shots.ccp9_after_wait.shot, fullPage: false });

const pages = [
  [`/app/client-control-panel.html?id=${IDS.eight}`, "ccp8"],
  [`/app/lenders.html?client_id=${IDS.eight}`, "lenders8"],
  [`/app/present.html?contact=${IDS.eight}`, "present8"],
  [`/app/documents.html?client_id=${IDS.eight}`, "docs8"],
  [`/app/client-portal.html?id=${IDS.eight}`, "portal8"],
  [`/app/client-control-panel.html?id=${IDS.ten}`, "ccp10"],
  [`/app/client-portal.html?id=${IDS.ten}`, "portal10"],
  [`/app/inquiry-remover.html?client_id=${IDS.nine}`, "inq9"],
  [`/app/client-portal.html?id=${IDS.nine}`, "portal9"],
  [`/app/documents.html?client_id=${IDS.nine}`, "docs9"],
  [`/app/client-control-panel.html?id=${IDS.eleven}`, "ccp11"],
  [`/app/client-portal.html?id=${IDS.eleven}`, "portal11"],
  [`/progress.html?id=${IDS.eleven}`, "progress11"],
  [`/app/client-control-panel.html?id=${IDS.twelve}`, "ccp12"],
  [`/app/client-portal.html?id=${IDS.twelve}`, "portal12"],
  [`/app/documents.html?client_id=${IDS.twelve}`, "docs12"],
  [`/app/client-control-panel.html?id=${IDS.thirteen}`, "ccp13"],
  [`/app/inquiry-remover.html`, "inqDesk"],
  [`/app/pipeline.html`, "pipeline"],
];

for (const [path, key] of pages) {
  shots[key] = await shotPage(path, key);
}

const clicks = [];
async function recordClick(name, fn) {
  const row = { name };
  try {
    await fn(row);
    row.ok = true;
  } catch (err) {
    row.ok = false;
    row.error = String(err && err.message ? err.message : err).slice(0, 240);
  }
  clicks.push(row);
}

await recordClick("pipeline_search_eight", async (row) => {
  await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1500);
  const box = page.locator('input[type="search"], input[placeholder*="Search" i], #search, [data-testid="search"]').first();
  if (await box.count()) {
    await box.fill("Eight-Funding");
    await page.waitForTimeout(1200);
  }
  row.url = page.url();
  row.body = clip(await page.locator("body").innerText());
  row.shot = `${OUT}/click-pipeline-eight.png`;
  await page.screenshot({ path: row.shot, fullPage: false });
});

await recordClick("specialist_toggle_repair", async (row) => {
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2000);
  const toggle = page.getByRole("button", { name: /Repair/i }).first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(1500);
    row.clicked = "Repair";
  } else {
    const alt = page.locator("button, [role='tab']").filter({ hasText: /Repair/i }).first();
    if (await alt.count()) {
      await alt.click();
      await page.waitForTimeout(1500);
      row.clicked = "Repair-alt";
    } else {
      row.clicked = "none";
    }
  }
  row.url = page.url();
  row.body = clip(await page.locator("body").innerText());
  row.shot = `${OUT}/click-specialist-repair.png`;
  await page.screenshot({ path: row.shot, fullPage: false });
});

await recordClick("specialist_toggle_inquiries", async (row) => {
  const toggle = page.getByRole("button", { name: /Inquir/i }).first();
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(1500);
    row.clicked = "Inquiries";
  } else {
    row.clicked = "none";
  }
  row.url = page.url();
  row.body = clip(await page.locator("body").innerText());
  row.shot = `${OUT}/click-specialist-inquiries.png`;
  await page.screenshot({ path: row.shot, fullPage: false });
});

await recordClick("portal11_look", async (row) => {
  await page.goto(`${BASE}/app/client-portal.html?id=${IDS.eleven}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  row.url = page.url();
  row.body = clip(await page.locator("body").innerText());
  row.shot = `${OUT}/click-portal11.png`;
  await page.screenshot({ path: row.shot, fullPage: false });
});

await recordClick("present8_look_no_send", async (row) => {
  await page.goto(`${BASE}/app/present.html?contact=${IDS.eight}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  const sendish = await page.locator("button, a").evaluateAll((els) =>
    els
      .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
      .filter((t) => /send|apply|enroll|email/i.test(t))
      .slice(0, 12)
  );
  row.sendishVisible = sendish;
  row.clicked = "none — look only";
  row.url = page.url();
  row.body = clip(await page.locator("body").innerText());
  row.shot = `${OUT}/click-present8.png`;
  await page.screenshot({ path: row.shot, fullPage: false });
});

await browser.close();

const dump = {
  at: new Date().toISOString(),
  no_send: true,
  clicks_forbidden_not_used: [
    "Send", "Present send", "Apply", "SLO pay POST", "invoice email",
    "Messaging Send", "send-portal-link", "Enroll", "Claim", "Stage",
    "Build My Pack", "Continue to payment", "slo-checkout POST",
  ],
  afterLogin,
  filesDb,
  comboDb,
  comboAny,
  roundsDb,
  repairDb,
  inquiryDb,
  contractsDb: contractsDb.map((r) => ({
    client_id: r.client_id,
    title: r.title,
    status: r.status,
    signed_at: r.signed_at,
    signature_required: r.signature_required,
  })),
  entitlementsDb,
  crsDb,
  docsDb: docsDb.map((d) => ({
    client_id: d.client_id,
    title: d.title,
    mime_type: d.mime_type,
    kind: d.kind,
    subtype: d.subtype,
    document_key: d.document_key,
    byte_size: d.byte_size,
  })),
  api,
  shots,
  clicks,
};

writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));

function snipShot(v) {
  return { url: v.url, title: v.title, buttons: v.buttons, body: (v.body || "").slice(0, 800) };
}

console.log("wrote", `${OUT}/dump.json`);
console.log(JSON.stringify({
  loginUrl: afterLogin.url,
  staffRole: afterLogin.staff.role,
  health: api.health,
  demo: api.demo_login_get,
  filesDb,
  comboDb,
  comboAny,
  roundsDb,
  repairDb,
  inquiryDb,
  contractsDb: dump.contractsDb,
  entitlementsDb,
  crsDb,
  docsCount: docsDb.length,
  eight_rounds: api.eight_rounds,
  eight_matches: api.eight_matches,
  eight_invoices: api.eight_invoices,
  eight_uwiq: { status: api.eight_uwiq?.status, keys: api.eight_uwiq?.rawKeys, json: api.eight_uwiq?.json },
  eight_portal: api.eight_portal,
  eight_contracts: api.eight_contracts,
  nine_repair: api.nine_repair,
  nine_portal: api.nine_portal,
  nine_contracts: api.nine_contracts,
  nine_inquiries: api.nine_inquiries,
  ten_repair: api.ten_repair,
  ten_portal: api.ten_portal,
  ten_contracts: api.ten_contracts,
  eleven_entitlements: api.eleven_entitlements,
  eleven_progress: api.eleven_progress,
  eleven_portal: api.eleven_portal,
  twelve_entitlements: api.twelve_entitlements,
  twelve_portal: api.twelve_portal,
  twelve_contracts: api.twelve_contracts,
  thirteen_dash: api.thirteen_dash,
  thirteen_inquiries: api.thirteen_inquiries,
  inquiries_queue: api.inquiries_queue,
  repair_queue: api.repair_queue,
  search8: api.search8,
  searchCombo: api.searchCombo,
  clicks: clicks.map((c) => ({
    name: c.name,
    ok: c.ok,
    error: c.error,
    clicked: c.clicked,
    url: c.url,
    sendishVisible: c.sendishVisible,
    body: (c.body || "").slice(0, 700),
  })),
  shotKeys: Object.keys(shots),
  shotSnips: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, snipShot(v)])),
}, null, 2));
