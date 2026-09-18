// GET-only fulfillment live prove. No Send / Apply / Stage / Mark funded / invoice email.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/full-e2e-2026-09-17-fulfillment";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
};

mkdirSync(OUT, { recursive: true });

function clip(text, n = 2400) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function pick(r, keys) {
  if (!r || typeof r !== "object") return r;
  const out = {};
  for (const k of keys) if (r[k] !== undefined) out[k] = r[k];
  return out;
}

const KEEP = [
  "id", "client_id", "title", "name", "status", "stage", "stage_key", "round_number",
  "approved_amount", "funded_amount", "submitted_amount", "amount", "amount_cents",
  "balance_cents", "total_cents", "kind", "filename", "original_name", "doc_type",
  "subtype", "label", "state", "key", "invoice_number", "due_cents", "paid_cents",
  "amount_due", "amount_paid", "balance_due", "lender_name", "match_count",
  "next_step", "next_action", "owner_role", "mime_type", "document_key", "byte_size",
  "email", "role", "task_id", "client_name", "currency", "source", "delivery_status",
  "code", "product", "paid", "first_name", "last_name", "phone", "program",
  "letters_count", "letter_count", "items_count", "can_send", "can_stage",
  "identity_status", "id_status", "blocker", "blockers", "hold_reason",
  "lifecycle_status", "employee_next_action", "play_name", "card_stacking_round",
  "round_type", "product_path", "pay_url", "href", "url", "outcome",
];

function slim(json) {
  if (!json || typeof json !== "object") return json;
  const rows = json.rows || json.items || json.queue || json.data || json.clients || json.cases;
  if (Array.isArray(rows)) {
    return { ok: json.ok, status: json.status, count: rows.length, sample: rows.slice(0, 30).map((r) => pick(r, KEEP)) };
  }
  const out = { ok: json.ok, error: json.error };
  for (const k of KEEP) if (json[k] !== undefined) out[k] = json[k];
  if (json.client) out.client = pick(json.client, KEEP);
  if (json.next_action) out.next_action = json.next_action;
  if (json.fulfillment) out.fulfillment = json.fulfillment;
  if (json.invoices) out.invoice_count = json.invoices.length;
  if (json.transactions) out.tx_count = json.transactions.length;
  if (json.tasks) out.task_count = json.tasks.length;
  if (json.summary) out.summary = json.summary;
  if (json.progress) out.progress = json.progress;
  if (json.rounds) out.rounds = Array.isArray(json.rounds) ? json.rounds.slice(0, 8).map((r) => pick(r, KEEP)) : json.rounds;
  if (json.matches) out.matches = Array.isArray(json.matches) ? json.matches.slice(0, 12).map((r) => pick(r, KEEP)) : json.matches;
  if (json.letters) out.letter_count = Array.isArray(json.letters) ? json.letters.length : json.letters;
  if (json.blockers) out.blockers = json.blockers;
  if (json.identity) out.identity = json.identity;
  return Object.keys(out).some((k) => out[k] !== undefined) ? out : { keys: Object.keys(json).slice(0, 40) };
}

async function getJson(request, path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 240) }; }
  return { status: res.status(), json: slim(json), rawKeys: json && typeof json === "object" ? Object.keys(json) : [] };
}

const staffRow = (await db.query(
  `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  [EMAIL]
)).rows[0];
if (!staffRow) {
  console.error("no staff row");
  process.exit(1);
}

const dbEight = {
  client: (await db.query(
    `SELECT id, first_name, last_name, email, phone, custom_fields, funded, funded_amount, outcome_tier
       FROM clients WHERE id = $1`, [IDS.eight]
  )).rows[0],
  rounds: (await db.query(
    `SELECT id, status, round_number, product, funded_amount, approved_amount,
            submitted_amount, hold_reason, created_at
       FROM funding_rounds WHERE client_id = $1 ORDER BY round_number, created_at`,
    [IDS.eight]
  )).rows,
  invoices: (await db.query(
    `SELECT id, status, amount_due, currency, source, invoice_type, emailed_at, created_at
       FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 12`,
    [IDS.eight]
  )).rows,
  docs: (await db.query(
    `SELECT id, document_key, kind, subtype, title, mime_type, byte_size, created_at
       FROM documents WHERE client_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [IDS.eight]
  )).rows,
  tasks: (await db.query(
    `SELECT id, title, done, source_workflow, assignee_role, created_at
       FROM tasks WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [IDS.eight]
  )).rows,
  payment_links: [],
};

try {
  const hasPl = (await db.query(
    `SELECT to_regclass('payment_links') AS n`
  )).rows[0]?.n;
  if (hasPl) {
    dbEight.payment_links = (await db.query(
      `SELECT * FROM payment_links WHERE client_id = $1 ORDER BY created_at DESC LIMIT 8`,
      [IDS.eight]
    )).rows.map((r) => {
      const keep = {};
      for (const k of Object.keys(r)) {
        if (/token|secret|url|href|link/i.test(k)) keep[k] = r[k] ? "[set]" : null;
        else keep[k] = r[k];
      }
      return keep;
    });
  }
} catch {
  dbEight.payment_links = { error: "payment_links query failed" };
}

const dbNine = {
  client: (await db.query(
    `SELECT id, first_name, last_name, email, phone, custom_fields, funded, funded_amount, outcome_tier
       FROM clients WHERE id = $1`, [IDS.nine]
  )).rows[0],
  docs: (await db.query(
    `SELECT id, document_key, kind, subtype, title, mime_type, byte_size, created_at
       FROM documents WHERE client_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [IDS.nine]
  )).rows,
  tasks: (await db.query(
    `SELECT id, title, done, source_workflow, assignee_role, created_at
       FROM tasks WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [IDS.nine]
  )).rows,
};

let identityNine = null;
try {
  identityNine = (await db.query(
    `SELECT client_id,
            verified_legal_name IS NOT NULL AS has_name,
            verified_address IS NOT NULL AS has_address,
            verified_dob IS NOT NULL AS has_dob,
            updated_at
       FROM pii_identity WHERE client_id = $1`,
    [IDS.nine]
  )).rows[0] || null;
} catch {
  identityNine = { error: "pii_identity query failed" };
}

let repairNine = null;
try {
  repairNine = (await db.query(
    `SELECT id, program, rounds_cap, status, created_at
       FROM repair_programs WHERE client_id = $1 ORDER BY created_at DESC LIMIT 4`,
    [IDS.nine]
  )).rows;
} catch {
  repairNine = { error: "repair_programs query failed" };
}

let cardNine = null;
try {
  cardNine = (await db.query(
    `SELECT p.key AS pipeline_key, ps.key AS stage_key, c.updated_at
       FROM cards c
       JOIN pipelines p ON p.id = c.pipeline_id
       JOIN pipeline_stages ps ON ps.id = c.stage_id
      WHERE c.client_id = $1
      ORDER BY c.updated_at DESC`,
    [IDS.nine]
  )).rows;
} catch {
  cardNine = { error: "cards query failed" };
}

let lettersNine = null;
try {
  lettersNine = (await db.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE status IN ('generated','ready'))::int AS ready,
            count(*) FILTER (WHERE status IN ('sent','delivered'))::int AS sent
       FROM dispute_letters WHERE client_id = $1`,
    [IDS.nine]
  )).rows[0];
} catch {
  lettersNine = { error: "dispute_letters query failed" };
}

const liveAgents = (await db.query(
  `SELECT code, name, status, channel, length(coalesce(prompt,'')) AS prompt_letters
     FROM agents WHERE status = 'live' ORDER BY code`
)).rows;

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const loginStatus = loginRes.status;
let loginToken = null;
if (loginStatus === 200) {
  const j = await loginRes.json().catch(() => ({}));
  loginToken = j.token || null;
}

let sessionSource = "password_login";
let token = loginToken;
if (!token) {
  const minted = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
  token = minted.token;
  sessionSource = "createSession_inject";
}

const eightCf = dbEight.client?.custom_fields || {};
const nineCf = dbNine.client?.custom_fields || {};

writeFileSync(`${OUT}/db-look.json`, JSON.stringify({
  at: new Date().toISOString(),
  loginStatus,
  sessionSource,
  staff: { email: staffRow.email, role: staffRow.role, name: staffRow.name, status: staffRow.status },
  eight: {
    name: `${dbEight.client?.first_name || ""} ${dbEight.client?.last_name || ""}`.trim(),
    email: dbEight.client?.email,
    phone: dbEight.client?.phone,
    funded: dbEight.client?.funded,
    funded_amount: dbEight.client?.funded_amount,
    outcome_tier: dbEight.client?.outcome_tier,
    next_action: eightCf.employee_next_action || null,
    lifecycle: eightCf.lifecycle_status || null,
    rounds: dbEight.rounds.map((r) => ({
      status: r.status,
      round_number: r.round_number,
      product: r.product,
      funded_amount: r.funded_amount,
      approved_amount: r.approved_amount,
      hold_reason: r.hold_reason,
    })),
    invoices: dbEight.invoices.map((r) => ({
      status: r.status,
      amount_due: r.amount_due,
      source: r.source,
      invoice_type: r.invoice_type,
      emailed_at: r.emailed_at,
    })),
    docs: dbEight.docs.map((d) => ({
      title: d.title, kind: d.kind, subtype: d.subtype, mime_type: d.mime_type, document_key: d.document_key,
    })),
    tasks: dbEight.tasks.map((t) => ({
      title: t.title, done: t.done, source_workflow: t.source_workflow, assignee_role: t.assignee_role,
    })),
    payment_links: dbEight.payment_links,
  },
  nine: {
    name: `${dbNine.client?.first_name || ""} ${dbNine.client?.last_name || ""}`.trim(),
    email: dbNine.client?.email,
    phone: dbNine.client?.phone,
    funded: dbNine.client?.funded,
    funded_amount: dbNine.client?.funded_amount,
    outcome_tier: dbNine.client?.outcome_tier,
    next_action: nineCf.employee_next_action || null,
    lifecycle: nineCf.lifecycle_status || null,
    identity: identityNine,
    repair_programs: repairNine,
    cards: cardNine,
    letters: lettersNine,
    docs: dbNine.docs.map((d) => ({
      title: d.title, kind: d.kind, subtype: d.subtype, mime_type: d.mime_type, document_key: d.document_key,
    })),
    tasks: dbNine.tasks.map((t) => ({
      title: t.title, done: t.done, source_workflow: t.source_workflow, assignee_role: t.assignee_role,
    })),
  },
  liveAgents,
}, null, 2));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
const request = context.request;

await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.waitForTimeout(1200);
const afterLogin = {
  url: page.url(),
  title: await page.title(),
  body: clip(await page.locator("body").innerText()),
};
await page.screenshot({ path: `${OUT}/00-after-login.png` });

const api = {};
const paths = [
  ["/api/health", "health"],
  [`/api/dashboard/clients?limit=200&fulfillment=1`, "fulfillment_clients"],
  [`/api/dashboard/client?id=${IDS.eight}`, "eight_dash"],
  [`/api/read/funding-rounds?client_id=${IDS.eight}&include_matches=1`, "eight_rounds"],
  [`/api/read/lender-matches?client_id=${IDS.eight}`, "eight_matches"],
  [`/api/read/invoices?client_id=${IDS.eight}`, "eight_invoices"],
  [`/api/read/transactions?client_id=${IDS.eight}`, "eight_tx"],
  [`/api/read/documents?client_id=${IDS.eight}`, "eight_docs"],
  [`/api/read/portal-summary?client_id=${IDS.eight}`, "eight_portal"],
  [`/api/read/underwrite?client_id=${IDS.eight}`, "eight_uwiq"],
  [`/api/dashboard/client?id=${IDS.nine}`, "nine_dash"],
  [`/api/read/repair-cases?client_id=${IDS.nine}`, "nine_repair"],
  [`/api/read/documents?client_id=${IDS.nine}`, "nine_docs"],
  [`/api/read/portal-summary?client_id=${IDS.nine}`, "nine_portal"],
  [`/api/read/client-progress?client_id=${IDS.nine}`, "nine_progress"],
  [`/api/read/invoices?client_id=${IDS.nine}`, "nine_invoices"],
];

for (const [path, key] of paths) api[key] = await getJson(request, path);

async function shotPage(path, key, extraWait = 2800) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(extraWait);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await page.locator("button, a.btn, [role='button'], a[data-fh-apply], [data-fh-apply]").evaluateAll((els) =>
    els.map((el) => {
      const t = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("data-act") || "").replace(/\s+/g, " ").trim();
      return {
        text: t.slice(0, 80),
        disabled: !!el.disabled,
        hidden: el.hidden || el.getAttribute("hidden") != null,
        apply: el.getAttribute("data-fh-apply") || null,
        act: el.getAttribute("data-act") || null,
        id: el.id || null,
      };
    }).filter((b) => b.text || b.apply || b.act).slice(0, 50)
  ).catch(() => []);
  const shot = `${OUT}/${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  return { url: page.url(), title: await page.title(), body, buttons, shot };
}

const shots = {};
shots.pipeline = await shotPage("/app/pipeline.html", "pipeline", 3500);

// Click Fulfillment lens if present — look only.
const lens = page.locator("#lensFulfillment");
if (await lens.count()) {
  await lens.click();
  await page.waitForTimeout(3500);
  shots.pipeline_fulfillment = {
    url: page.url(),
    title: await page.title(),
    body: clip(await page.locator("body").innerText().catch(() => "")),
    buttons: await page.locator("button, a.btn, [role='button']").evaluateAll((els) =>
      els.map((el) => (el.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40)
    ).catch(() => []),
    shot: `${OUT}/pipeline-fulfillment.png`,
  };
  await page.screenshot({ path: shots.pipeline_fulfillment.shot, fullPage: false });
  const eightRow = page.locator("text=/Eight-Funding|Sim Eight/i").first();
  shots.pipeline_fulfillment.hasEight = await eightRow.count().then((n) => n > 0).catch(() => false);
}

shots.ccp8_first = await shotPage(`/app/client-control-panel.html?id=${IDS.eight}`, "ccp8-first", 3000);
shots.ccp8_wait = await shotPage(`/app/client-control-panel.html?id=${IDS.eight}`, "ccp8-wait", 8000);
shots.lenders8 = await shotPage(`/app/lenders.html?client_id=${IDS.eight}`, "lenders8", 4000);
shots.docs8 = await shotPage(`/app/documents.html?client_id=${IDS.eight}`, "docs8", 3500);
shots.finance8 = await shotPage(`/app/finance-os.html?client_id=${IDS.eight}`, "finance8", 3500);

shots.ccp9_first = await shotPage(`/app/client-control-panel.html?id=${IDS.nine}`, "ccp9-first", 3000);
shots.ccp9_wait = await shotPage(`/app/client-control-panel.html?id=${IDS.nine}`, "ccp9-wait", 8000);
shots.specialist9 = await shotPage(`/app/inquiry-remover.html?client_id=${IDS.nine}`, "specialist9", 4000);

const repairToggle = page.locator("button, [role='tab'], label, a").filter({ hasText: /^Repair$/i }).first();
if (await repairToggle.count()) {
  await repairToggle.click();
  await page.waitForTimeout(3500);
  shots.specialist9_repair = {
    url: page.url(),
    title: await page.title(),
    body: clip(await page.locator("body").innerText().catch(() => "")),
    buttons: await page.locator("button, a.btn, [role='button'], [data-act]").evaluateAll((els) =>
      els.map((el) => ({
        text: (el.innerText || el.getAttribute("data-act") || "").replace(/\s+/g, " ").trim().slice(0, 80),
        disabled: !!el.disabled,
        act: el.getAttribute("data-act") || null,
      })).filter((b) => b.text).slice(0, 50)
    ).catch(() => []),
    shot: `${OUT}/specialist9-repair.png`,
  };
  await page.screenshot({ path: shots.specialist9_repair.shot, fullPage: false });
}

shots.docs9 = await shotPage(`/app/documents.html?client_id=${IDS.nine}`, "docs9", 3500);
shots.portal9 = await shotPage(`/app/client-portal.html?id=${IDS.nine}`, "portal9", 4000);
shots.ops_ar = await shotPage(`/app/ops-admin.html`, "ops-ar", 3500);

await browser.close();

const dump = {
  at: new Date().toISOString(),
  no_send: true,
  loginStatus,
  sessionSource,
  afterLogin,
  api,
  shots,
};
writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));

const eightSample = api.fulfillment_clients?.json?.sample || [];
const eightLens = eightSample.find((r) => String(r.id) === IDS.eight || /eight/i.test(`${r.first_name || ""} ${r.last_name || ""} ${r.name || ""}`));
const nineLens = eightSample.find((r) => String(r.id) === IDS.nine || /nine/i.test(`${r.first_name || ""} ${r.last_name || ""} ${r.name || ""}`));

console.log(JSON.stringify({
  loginStatus,
  sessionSource,
  afterUrl: afterLogin.url,
  health: api.health,
  eightLens: eightLens || { missing: true, total: eightSample.length },
  nineLens: nineLens || { missing: true },
  eight_rounds: api.eight_rounds,
  eight_matches: api.eight_matches,
  eight_invoices: api.eight_invoices,
  eight_docs: api.eight_docs,
  eight_dash: { status: api.eight_dash?.status, json: api.eight_dash?.json, keys: api.eight_dash?.rawKeys },
  nine_repair: api.nine_repair,
  nine_docs: api.nine_docs,
  nine_invoices: api.nine_invoices,
  nine_dash: { status: api.nine_dash?.status, json: api.nine_dash?.json, keys: api.nine_dash?.rawKeys },
  shotKeys: Object.keys(shots),
  shotSnips: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, {
    url: v.url,
    title: v.title,
    hasEight: v.hasEight,
    buttons: Array.isArray(v.buttons) ? v.buttons.slice(0, 25) : v.buttons,
    body: String(v.body || "").slice(0, 900),
  }])),
}, null, 2));
