// Live prove only. GET + one login POST. No product writes. No secrets printed.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const THIRTEEN = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const OUT = new URL(".", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/\r/g, "");
}

function letterFacts(html) {
  const text = stripHtml(html);
  const blankBetweenNameEmail = /Sim Eight-Funding\s*\n\s*\n\s*\S+@/.test(text)
    || /Sim Eight-Funding<br>\s*<br>\s*[^<]*@/i.test(String(html || ""));
  const streetHit = String(html || "").match(/Sim Eight-Funding<br>\s*([^<]+)<br>/i);
  const streetLine = streetHit ? streetHit[1].trim() : null;
  const looksStreet = !!(streetLine && /\d/.test(streetLine) && !streetLine.includes("@"));
  return {
    len: String(html || "").length,
    blankBetweenNameEmail,
    streetLine,
    looksStreet,
    head: text.replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

function nobookFacts(messages) {
  const rows = (messages || []).filter((m) => String(m.template_key || "") === "EMAIL-NOBOOK-01");
  return rows.map((m) => {
    const body = String(m.body || m.rendered_body || m.preview || m.text || "");
    return {
      id: String(m.id || "").slice(0, 8),
      status: m.status,
      hasUnsubWord: /unsubscrib/i.test(body),
      hasToken: /\{\{\s*unsubscribe\s*\}\}/i.test(body),
      hasUnsubHtml: /unsubscribe\.html/i.test(body),
      bodyLen: body.length,
      tail: body.replace(/\s+/g, " ").trim().slice(-180),
    };
  });
}

function feeFacts(invoices, rounds, apps) {
  const inv = (invoices || []).map((i) => ({
    id: String(i.id || i.invoice_id || "").slice(0, 8),
    status: i.status,
    amount_due: i.amount_due,
    amount_paid: i.amount_paid ?? i.paid,
    balance_due: i.balance_due,
    voided_at: i.voided_at || null,
    notes: String(i.notes || "").slice(0, 80),
  }));
  const has2500open = inv.some((i) => String(i.amount_due) === "2500.00" && !["void", "voided", "cancelled"].includes(String(i.status)));
  const has2500void = inv.some((i) => String(i.amount_due) === "2500.00" && ["void", "voided"].includes(String(i.status)));
  const has1000 = inv.some((i) => String(i.amount_due) === "1000.00");
  return {
    invoices: inv,
    rounds: (rounds || []).map((r) => ({
      n: r.round_number, status: r.status, approved: r.approved_amount, funded: r.funded_amount,
    })),
    apps: (apps || []).map((a) => ({
      lender: a.lender_name || a.bank, status: a.status, approved: a.approved_amount,
    })),
    has2500open,
    has2500void,
    has1000,
  };
}

function n17Facts(ceoText, pulse) {
  const lines = String(ceoText || "").split("\n").map((l) => l.trim()).filter((l) => /funded file/i.test(l));
  const nums = lines.map((l) => [...l.matchAll(/(\d+)\s+funded files?/gi)].map((m) => Number(m[1]))).flat();
  const unique = [...new Set(nums)];
  const p = pulse?.data || pulse || {};
  return {
    lines,
    nums,
    unique,
    agree: unique.length <= 1,
    pulseHeroFunded: p.hero?.deposit_to_funded_n?.funded ?? p.funnel?.funded ?? null,
    pulseKpi: p.kpis?.funded_files ?? p.funded_files ?? null,
  };
}

function sampleFacts(text) {
  const t = String(text || "");
  return {
    sample: /sample/i.test(t) && /not a real/i.test(t),
    sampleAny: /sample scores|sample report|not a real (credit )?pull/i.test(t),
    scores771: /771/.test(t) && /778/.test(t) && /766/.test(t),
    thirteen: /Thirteen/i.test(t),
    pulled: /pulled/i.test(t),
    snippet: t.replace(/\s+/g, " ").trim().slice(0, 420),
  };
}

async function twiceGet(get, path) {
  const a = await get(path);
  const b = await get(path);
  return [a, b];
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-follow-prove" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password }),
});
const m = (login.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) {
  console.log(JSON.stringify({ login: login.status, ok: false }));
  process.exit(1);
}
const cookie = `fundhub_session=${m[1]}`;
const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie, "user-agent": "fundhub-follow-prove" } });
  let j = null;
  try { j = await r.json(); } catch { j = { text: await r.text().then((t) => t.slice(0, 200)).catch(() => "") }; }
  return { status: r.status, json: j };
};

const api = { at: new Date().toISOString(), login: login.status };

const health = await twiceGet(get, "/api/health");
api.health = health.map((h) => ({ status: h.status, ok: h.json?.ok, pending: h.json?.pending_migrations ?? h.json?.pending ?? null }));

const dash8 = await twiceGet(get, `/api/dashboard/client?id=${EIGHT}`);
const dash13 = await twiceGet(get, `/api/dashboard/client?id=${THIRTEEN}`);
const inv8 = await twiceGet(get, `/api/read/invoices?client_id=${EIGHT}`);
const apps8 = await twiceGet(get, `/api/applications?client_id=${EIGHT}`);
const pulse = await twiceGet(get, "/api/read/ops-pulse");

function dashSlice(res) {
  const d = res.json?.data || res.json || {};
  const html = d.inquiry_removal_case?.letter_draft_html || d.letter_draft_html || "";
  return {
    status: res.status,
    name: d.client?.full_name || d.client?.name || d.name,
    letter: letterFacts(html),
    nobook: nobookFacts(d.messages),
    invoices: (d.invoices || []).map((i) => ({ id: String(i.id || "").slice(0, 8), status: i.status, amount_due: i.amount_due, balance_due: i.balance_due })),
    sample_flags: {
      credit_is_sample: d.client?.credit_is_sample ?? d.credit_is_sample ?? null,
      crs_simulated: d.crs_results?.[0]?.simulated ?? d.crs_simulated ?? null,
    },
    scores: d.tri_merge || d.scores || null,
  };
}

api.eight = dash8.map(dashSlice);
api.thirteen = dash13.map(dashSlice);
api.inv8 = inv8.map((r) => {
  const items = r.json?.data?.items || r.json?.items || r.json?.data || [];
  return { status: r.status, ...feeFacts(Array.isArray(items) ? items : [], [], []) };
});
api.apps8 = apps8.map((r) => ({
  status: r.status,
  rows: (r.json?.applications || r.json?.data || []).map?.((a) => ({
    lender: a.lender_name || a.bank, status: a.status, approved: a.approved_amount,
  })) || r.json,
}));
api.pulse = pulse.map((r) => {
  const p = r.json?.data || r.json || {};
  const brief = p.ceo_brief || p.brief || p.ceo || "";
  return {
    status: r.status,
    n17: n17Facts(typeof brief === "string" ? brief : JSON.stringify(brief), p),
    keys: Object.keys(p).slice(0, 30),
    briefHead: String(brief).slice(0, 500),
  };
});

writeFileSync(`${OUT}api.json`, JSON.stringify(api, null, 2));

const ui = { at: new Date().toISOString(), blocked: [], pages: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const method = req.method();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
  const path = new URL(req.url()).pathname;
  if (method === "POST" && path === "/api/auth/login") return route.continue();
  ui.blocked.push(`${method} ${path}`);
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
ui.login = lr.status();
await page.waitForTimeout(2000);

async function openTwice(label, url, waitMs = 2500) {
  const rows = [];
  for (let i = 1; i <= 2; i++) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(waitMs);
    const text = await page.locator("body").innerText();
    const facts = sampleFacts(text);
    if (label === "n17") {
      const ceo = await page.locator("#ops-pulse-ceo").textContent().catch(() => "");
      facts.n17 = n17Facts(ceo, null);
      facts.snippet = String(ceo || "").replace(/\s+/g, " ").trim().slice(0, 500);
    }
    if (label === "n7") {
      facts.has2500 = /2,500|2500/.test(text);
      facts.has1000 = /1,000|1000/.test(text);
      facts.voidWord = /void/i.test(text);
      facts.feeLines = text.split("\n").map((l) => l.trim()).filter((l) => /\$|fee|invoice|INV-|void|approved/i.test(l)).slice(0, 25);
    }
    rows.push({ label: `${label}-${i}`, url, ...facts });
  }
  ui.pages.push({ label, rows });
  return rows;
}

await openTwice("h23-portal", `${BASE}/app/client-portal.html?client_id=${THIRTEEN}`);
await openTwice("h23-progress", `${BASE}/progress.html?client_id=${THIRTEEN}`);
await openTwice("h23-pipeline", `${BASE}/app/pipeline.html`);
await openTwice("h23-closer-call", `${BASE}/app/closer-dashboard.html?client_id=${THIRTEEN}`);
await openTwice("h23-panel", `${BASE}/app/client-control-panel.html?id=${THIRTEEN}`);
await openTwice("n7-panel", `${BASE}/app/client-control-panel.html?id=${EIGHT}`);
await openTwice("n17", `${BASE}/app/ops-admin.html`, 4000);

await browser.close();
writeFileSync(`${OUT}ui.json`, JSON.stringify(ui, null, 2));
console.log(JSON.stringify({
  api: `${OUT}api.json`,
  ui: `${OUT}ui.json`,
  login: { api: api.login, ui: ui.login },
  blocked: ui.blocked,
}, null, 2));
