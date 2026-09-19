// GET-only live prove. No Send / Apply / checkout POST / portal-link / Claim.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const EMAIL = "chris@fundhub.ai";
const OUT = "/tmp/live-prove-2026-09-17";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
};

mkdirSync(OUT, { recursive: true });

const staffRow = (await db.query(
  `SELECT id, org_id, email, role, name, status FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  [EMAIL]
)).rows[0];
if (!staffRow) {
  console.error("no staff row for", EMAIL);
  process.exit(1);
}
const csmRows = (await db.query(
  `SELECT email, role, name, status, is_demo FROM staff WHERE role = 'csm' ORDER BY email`
)).rows;
const htmlDocsDb = (await db.query(
  `SELECT d.id, d.client_id, d.document_key, d.kind, d.subtype, d.title, d.mime_type, d.byte_size, d.created_at
     FROM documents d
    WHERE d.client_id = ANY($1::uuid[])
      AND (d.mime_type ILIKE '%html%' OR d.kind ILIKE '%html%' OR d.subtype ILIKE '%html%'
           OR d.title ILIKE '%roadmap%' OR d.title ILIKE '%gold%' OR d.title ILIKE '%underwrite%'
           OR d.document_key ILIKE '%roadmap%' OR d.document_key ILIKE '%credit%' OR d.document_key ILIKE '%snapshot%'
           OR d.document_key ILIKE '%lender%')
    ORDER BY d.created_at DESC
    LIMIT 40`,
  [[IDS.eight, IDS.nine, IDS.eleven]]
)).rows;
const invoiceDb = (await db.query(
  `SELECT id, client_id, status, amount_due, currency, created_at
     FROM invoices
    WHERE client_id = $1
    ORDER BY created_at DESC
    LIMIT 12`,
  [IDS.eight]
)).rows.map((r) => ({
  id: r.id,
  client_id: r.client_id,
  status: r.status,
  amount_due: r.amount_due,
  currency: r.currency,
  created_at: r.created_at,
}));

const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const KEEP = [
  "id", "client_id", "title", "name", "status", "stage", "round_number",
  "approved_amount", "funded_amount", "submitted_amount", "amount", "amount_cents",
  "balance_cents", "total_cents", "entitlement_code", "entitlement_name", "kind",
  "active", "filename", "original_name", "doc_type", "subtype", "label", "state",
  "key", "invoice_number", "due_cents", "paid_cents", "amount_due", "amount_paid", "balance_due", "lender_name", "match_count",
  "next_step", "owner_role", "mime_type", "document_key", "byte_size", "email",
  "role", "task_id", "client_name", "currency", "source", "delivery_status",
  "code", "product", "paid", "first_name", "last_name",
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
  const rows = json.rows || json.items || json.queue || json.data;
  if (Array.isArray(rows)) {
    return {
      ok: json.ok,
      status: json.status,
      count: rows.length,
      sample: rows.slice(0, 20).map(pick),
    };
  }
  const out = { ok: json.ok, error: json.error };
  if (json.demo) {
    out.demo = {
      enabled: json.demo.enabled,
      envVar: json.demo.envVar,
      loginCount: Array.isArray(json.demo.logins) ? json.demo.logins.length : 0,
      loginEmails: Array.isArray(json.demo.logins)
        ? json.demo.logins.map((l) => l.email || l.label || l.role).slice(0, 12)
        : [],
    };
  }
  if (json.client) out.client = pick(json.client);
  if (json.next_action) out.next_action = json.next_action;
  if (json.transactions) out.tx_count = json.transactions.length;
  if (json.invoices) out.invoice_count = json.invoices.length;
  if (json.crs_results) out.crs_count = json.crs_results.length;
  if (json.entitlements) out.entitlements = json.entitlements.slice?.(0, 12) || json.entitlements;
  if (json.progress) out.progress = json.progress;
  if (json.summary) out.summary = json.summary;
  if (json.pending != null) out.pending = json.pending;
  if (json.amount_cents != null) out.amount_cents = json.amount_cents;
  if (json.next) out.next = json.next;
  if (json.price != null) out.price = json.price;
  if (json.product) out.product = json.product;
  if (json.report) {
    out.report_keys = Object.keys(json.report);
  }
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

function clip(text, n = 2200) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

function headingsFromHtml(html) {
  const titles = [];
  const h = String(html || "");
  const title = h.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (title) titles.push("title:" + title[1].trim().slice(0, 120));
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = re.exec(h)) && titles.length < 16) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t) titles.push(t.slice(0, 140));
  }
  return { bytes: h.length, headings: titles, looksHtml: /<html[\s>]/i.test(h) || /<!doctype html/i.test(h) };
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
  csmRows,
  body: clip(await page.locator("body").innerText()),
};
await page.screenshot({ path: `${OUT}/00-after-login.png`, fullPage: false });

const request = context.request;
const api = {};
const paths = [
  ["/api/health", "health"],
  ["/api/public/slo-checkout", "slo_checkout"],
  ["/api/auth/login", "demo_login_get"],
  [`/api/read/funding-rounds?client_id=${IDS.eight}&include_matches=1`, "eight_rounds"],
  [`/api/read/lender-matches?client_id=${IDS.eight}`, "eight_matches"],
  [`/api/read/invoices?client_id=${IDS.eight}`, "eight_invoices"],
  [`/api/read/transactions?client_id=${IDS.eight}`, "eight_tx"],
  [`/api/read/portal-summary?client_id=${IDS.eight}`, "eight_portal"],
  [`/api/read/documents?client_id=${IDS.eight}`, "eight_docs"],
  [`/api/read/underwrite?client_id=${IDS.eight}`, "eight_uwiq"],
  [`/api/read/bank-inbox?client_id=${IDS.eight}&limit=20`, "eight_bank"],
  [`/api/dashboard/client?id=${IDS.eight}`, "eight_dash"],
  [`/api/read/repair-cases?client_id=${IDS.nine}`, "nine_repair"],
  [`/api/read/client-progress?client_id=${IDS.nine}`, "nine_progress"],
  [`/api/read/documents?client_id=${IDS.nine}`, "nine_docs"],
  [`/api/read/portal-summary?client_id=${IDS.nine}`, "nine_portal"],
  [`/api/dashboard/client?id=${IDS.nine}`, "nine_dash"],
  [`/api/read/entitlements?client_id=${IDS.eleven}`, "eleven_entitlements"],
  [`/api/read/client-progress?client_id=${IDS.eleven}`, "eleven_progress"],
  [`/api/read/portal-summary?client_id=${IDS.eleven}`, "eleven_portal"],
  [`/api/read/documents?client_id=${IDS.eleven}`, "eleven_docs"],
  [`/api/dashboard/client?id=${IDS.eleven}`, "eleven_dash"],
  ["/api/read/csm-queue", "csm_queue"],
  ["/api/read/finance-os", "finance_os"],
  ["/api/read/staff", "staff"],
  ["/api/read/staff?role=csm", "staff_csm"],
];

for (const [path, key] of paths) {
  api[key] = await getJson(request, path);
}

const htmlDocs = [];
for (const bucket of ["eight_docs", "nine_docs", "eleven_docs"]) {
  const sample = api[bucket]?.json?.sample || [];
  for (const d of sample) {
    const mime = String(d.mime_type || "");
    const title = String(d.title || d.document_key || "");
    if (/html/i.test(mime) || /roadmap|gold|snapshot|lender|credit analysis|underwrite/i.test(title)) {
      htmlDocs.push({ from: bucket, ...d });
    }
  }
}
for (const row of htmlDocsDb) {
  if (!htmlDocs.some((d) => d.id === row.id)) htmlDocs.push({ from: "db", ...row });
}

const goldReads = [];
for (const doc of htmlDocs.slice(0, 8)) {
  const mint = await request.get(`${BASE}/api/documents-download?id=${doc.id}`);
  const mintText = await mint.text();
  let mintJson = null;
  try { mintJson = JSON.parse(mintText); } catch { mintJson = { parse_error: true }; }
  const signedPath = mintJson?.url || mintJson?.href || mintJson?.signed_url || mintJson?.path;
  const result = {
    id: doc.id,
    title: doc.title,
    mime_type: doc.mime_type,
    kind: doc.kind,
    subtype: doc.subtype,
    document_key: doc.document_key,
    mintStatus: mint.status(),
    mintKeys: mintJson && typeof mintJson === "object" ? Object.keys(mintJson) : [],
    mintOk: mintJson?.ok,
    mintError: mintJson?.error,
  };
  if (typeof signedPath === "string" && signedPath.startsWith("/")) {
    const fileRes = await request.get(BASE + signedPath.split("?")[0] + (signedPath.includes("?") ? signedPath.slice(signedPath.indexOf("?")) : ""));
    const ctype = fileRes.headers()["content-type"] || "";
    const body = await fileRes.text();
    result.fileStatus = fileRes.status();
    result.contentType = ctype;
    result.headings = headingsFromHtml(body);
  }
  goldReads.push(result);
}

const pages = [
  [`/slo/`, "slo_home"],
  [`/slo/pay.html`, "slo_pay"],
  [`/slo/pull.html`, "slo_pull"],
  [`/app/client-control-panel.html?id=${IDS.eight}`, "ccp8"],
  [`/app/client-control-panel.html?id=${IDS.nine}`, "ccp9"],
  [`/app/client-control-panel.html?id=${IDS.eleven}`, "ccp11"],
  [`/app/lenders.html?client_id=${IDS.eight}`, "lenders8"],
  [`/app/finance-os.html`, "finance"],
  [`/app/ops-admin.html`, "ops_ar"],
  [`/app/csm-queue.html`, "csm"],
  [`/app/client-portal.html?id=${IDS.eleven}`, "portal11"],
  [`/app/documents.html?client_id=${IDS.eight}`, "docs8"],
  [`/app/inquiry-remover.html?client_id=${IDS.nine}`, "inq9"],
  [`/progress.html?id=${IDS.eleven}`, "progress11"],
];

const shots = {};
for (const [path, key] of pages) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2800);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await page.locator("button, a.btn, [role='button']").evaluateAll((els) =>
    els
      .map((el) => (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 40)
  ).catch(() => []);
  const shot = `${OUT}/${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  shots[key] = { url: page.url(), title: await page.title(), body, buttons, shot };
}

await browser.close();

const dump = {
  at: new Date().toISOString(),
  no_send: true,
  clicks_forbidden_not_used: [
    "Send", "Present send", "Apply", "SLO pay POST", "invoice email",
    "Messaging Send", "Generate-if-it-mails", "send-portal-link", "Enroll",
    "Claim", "clock-in", "Build My Pack", "Continue to payment",
  ],
  afterLogin,
  invoiceDb,
  htmlDocsDb: htmlDocsDb.map((d) => ({
    id: d.id,
    client_id: d.client_id,
    title: d.title,
    mime_type: d.mime_type,
    kind: d.kind,
    subtype: d.subtype,
    document_key: d.document_key,
    byte_size: d.byte_size,
  })),
  goldReads,
  api,
  shots,
};
writeFileSync(`${OUT}/dump.json`, JSON.stringify(dump, null, 2));
console.log("wrote", `${OUT}/dump.json`);
console.log(JSON.stringify({
  loginUrl: afterLogin.url,
  staffRole: afterLogin.staff.role,
  csmRows,
  health: api.health,
  slo: api.slo_checkout,
  demo: api.demo_login_get,
  staff_csm: api.staff_csm,
  eight_rounds: api.eight_rounds,
  eight_matches: api.eight_matches,
  eight_invoices: api.eight_invoices,
  eight_tx: api.eight_tx,
  eight_portal: api.eight_portal,
  eight_docs: api.eight_docs,
  eight_uwiq: { status: api.eight_uwiq?.status, keys: api.eight_uwiq?.rawKeys, json: api.eight_uwiq?.json },
  eight_dash: api.eight_dash,
  nine_repair: api.nine_repair,
  nine_progress: api.nine_progress,
  nine_docs: api.nine_docs,
  nine_dash: api.nine_dash,
  eleven_entitlements: api.eleven_entitlements,
  eleven_progress: api.eleven_progress,
  eleven_portal: api.eleven_portal,
  eleven_docs: api.eleven_docs,
  eleven_dash: api.eleven_dash,
  csm_queue: api.csm_queue,
  finance_os: { status: api.finance_os?.status, keys: api.finance_os?.rawKeys, json: api.finance_os?.json },
  invoiceDbCount: invoiceDb.length,
  goldReads: goldReads.map((g) => ({
    title: g.title,
    mime_type: g.mime_type,
    mintStatus: g.mintStatus,
    mintOk: g.mintOk,
    fileStatus: g.fileStatus,
    contentType: g.contentType,
    headings: g.headings,
  })),
  shotKeys: Object.keys(shots),
  shotSnips: Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, {
    url: v.url,
    title: v.title,
    buttons: v.buttons,
    body: v.body.slice(0, 700),
  }])),
}, null, 2));
