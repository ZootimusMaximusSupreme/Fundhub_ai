import { writeFileSync } from "node:fs";
import { gmailConfigFromEnv, createGmailClientFromConfig } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/gmail/index.mjs";
import { db, close } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/db.mjs";
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: pw }),
});
const login = await loginRes.json();
const token = login.token;
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0] || "";
const headers = { Authorization: `Bearer ${token}`, cookie, accept: "application/json" };
function clip(s, n = 240) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, n); }

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

const eightGold = "30d328b3-8832-4d08-9285-32144bcf53fb";
const elevenGold = "ecc91d68-416d-47fb-8852-6a7af25e9d92";
const eightContract = "9ead664c-4e05-436e-94c4-7e13a77dbc65";
const files = {};
for (const [k, id] of Object.entries({ eightGold, elevenGold, eightContract })) {
  const meta = await get(`/api/documents-download?id=${id}`);
  const d = meta.body.document || {};
  const path = typeof d.download === "string" ? d.download : (d.download?.url || d.download?.href || d.download?.path || null);
  let fetched = { noPath: !path, downloadType: typeof d.download, downloadKeys: d.download && typeof d.download === "object" ? Object.keys(d.download) : null, keys: Object.keys(d) };
  if (path) {
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const g = await fetch(url, { headers });
    const buf = Buffer.from(await g.arrayBuffer());
    const text = buf.slice(0, 800).toString("utf8");
    fetched = {
      http: g.status, bytes: buf.length, ctype: g.headers.get("content-type"),
      html: /<html|<!doctype html/i.test(text),
      placeholder: /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT/i.test(text),
      start: clip(text, 200),
      mime: d.mime_type, title: d.title, size: d.byte_size,
    };
  }
  files[k] = fetched;
}

const stored = (await db.query(`
  SELECT id, first_name, last_name, funded, funded_amount, custom_fields
    FROM clients
   WHERE id IN (
     'd682c13b-11f3-4bd5-a0c5-232b6a7875c4',
     'be3dcfd7-faae-4001-b97f-9bc30875bbcd',
     '029964c5-4d8e-47ed-88c9-53ac13863fd4',
     'f01cc0e0-c8f6-4343-93e5-6a33f0d3112f',
     '7ccbeb76-df98-4125-8c14-0d1c9f5e3042',
     '567c12ce-64de-4043-aa98-d842434bd267'
   )
`)).rows.map((r) => ({
  id: r.id,
  name: `${r.first_name} ${r.last_name}`,
  funded: r.funded,
  funded_amount: r.funded_amount,
  employee_next_action: r.custom_fields?.employee_next_action || null,
}));

let entitlements = [];
try {
  entitlements = (await db.query(`
    SELECT * FROM entitlements
     WHERE client_id IN ('029964c5-4d8e-47ed-88c9-53ac13863fd4','f01cc0e0-c8f6-4343-93e5-6a33f0d3112f')
     LIMIT 20
  `)).rows.map((r) => {
    const out = { client_id: r.client_id, keys: Object.keys(r) };
    for (const k of Object.keys(r)) if (["code","name","title","status","active","product_code","key"].includes(k)) out[k] = r[k];
    return out;
  });
} catch (e) {
  entitlements = { error: String(e.message).slice(0, 160) };
}

const eightSum = await get(`/api/read/portal-summary?client_id=d682c13b-11f3-4bd5-a0c5-232b6a7875c4`);
const twelveSum = await get(`/api/read/portal-summary?client_id=f01cc0e0-c8f6-4343-93e5-6a33f0d3112f`);
const elevenSum = await get(`/api/read/portal-summary?client_id=029964c5-4d8e-47ed-88c9-53ac13863fd4`);
const walkSum = await get(`/api/read/portal-summary?client_id=ab277630-8309-4c02-b187-f244e7e369e8`);
const twelveProg = await get(`/api/read/client-progress?client_id=f01cc0e0-c8f6-4343-93e5-6a33f0d3112f`);
const thirteenDash = await get(`/api/dashboard/client?id=7ccbeb76-df98-4125-8c14-0d1c9f5e3042`);

function money(sum) {
  const d = sum.body?.data || sum.body || {};
  return {
    status: sum.status,
    payments: d.payments,
    invoice_due: d.invoice_due,
    owned: d.what_you_own || d.owned || d.entitlements || d.downloads,
    keys: Object.keys(d).slice(0, 30),
  };
}

const cfg = gmailConfigFromEnv(process.env);
const client = createGmailClientFromConfig(cfg);
const packQ = 'in:anywhere newer_than:1d subject:"Your Fundhub file is complete"';
const listed = await client.listMessages({ q: packQ, maxResults: 10 });
const packMsgs = [];
for (const m of listed.messages || []) {
  const full = await client.getMessage(m.id, { format: "metadata" });
  packMsgs.push({
    id: m.id,
    subject: client.headerValue(full, "Subject"),
    to: client.headerValue(full, "To"),
    date: client.headerValue(full, "Date"),
    labels: full.labelIds || [],
    snippet: clip(full.snippet, 140),
  });
}

// screens leftover
const cookieName = cookie.split("=")[0];
const cookieVal = cookie.split("=").slice(1).join("=");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([{ name: cookieName, value: cookieVal, url: BASE }]);
const page = await ctx.newPage();
async function dump(url, wait = 5000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(wait);
  const text = await page.locator("body").innerText();
  return clip(text, 1800);
}
const screens = {
  eight: await dump("https://fundhub.ai/app/client-control-panel.html?id=d682c13b-11f3-4bd5-a0c5-232b6a7875c4"),
  twelvePortal: await dump("https://fundhub.ai/app/client-portal.html?id=f01cc0e0-c8f6-4343-93e5-6a33f0d3112f"),
  elevenPortal: await dump("https://fundhub.ai/app/client-portal.html?id=029964c5-4d8e-47ed-88c9-53ac13863fd4"),
  eightPortal: await dump("https://fundhub.ai/app/client-portal.html?id=d682c13b-11f3-4bd5-a0c5-232b6a7875c4"),
  twelveProg: await dump("https://fundhub.ai/progress.html?client_id=f01cc0e0-c8f6-4343-93e5-6a33f0d3112f"),
  thirteen: await dump("https://fundhub.ai/app/client-control-panel.html?id=7ccbeb76-df98-4125-8c14-0d1c9f5e3042"),
};
await page.goto("https://fundhub.ai/app/client-portal.html?id=d682c13b-11f3-4bd5-a0c5-232b6a7875c4", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const pay = page.getByRole("button", { name: /payments/i }).or(page.getByText(/^Payments$/));
if (await pay.count()) { await pay.first().click().catch(() => {}); await page.waitForTimeout(1500); }
screens.eightPay = clip(await page.locator("body").innerText(), 1500);
await browser.close();

const out = {
  files, stored,
  entitlements,
  eightMoney: money(eightSum),
  twelveMoney: money(twelveSum),
  elevenMoney: money(elevenSum),
  walkMoney: money(walkSum),
  twelveProg: { status: twelveProg.status, keys: Object.keys(twelveProg.body?.data || twelveProg.body || {}), next: twelveProg.body?.data?.nextStep || twelveProg.body?.nextStep, waypoints: (twelveProg.body?.data?.waypoints || twelveProg.body?.waypoints || []).length },
  thirteenFacts: clip(JSON.stringify(thirteenDash.body?.data?.client || thirteenDash.body?.client || {}).slice(0, 400)),
  packGmail: packMsgs,
  screens,
};
writeFileSync("/tmp/grok-audit-follow.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  files,
  stored,
  entitlements,
  eightMoney: out.eightMoney,
  twelveMoney: out.twelveMoney,
  elevenMoney: out.elevenMoney,
  walkMoney: out.walkMoney,
  twelveProg: out.twelveProg,
  packGmail: packMsgs,
  screenHits: Object.fromEntries(Object.entries(screens).map(([k, t]) => [k, {
    funded: /\$50,000|funded/i.test(t),
    remove: /remove inquiries/i.test(t),
    course: /funding mastery|capital academy|open course/i.test(t),
    nothing: /nothing to download/i.test(t),
    metro: /metro 2|dispute letter/i.test(t),
    ready: /ready/i.test(t),
    due: /due now|2,500/i.test(t),
    sample: /sample scores|not a real credit pull/i.test(t),
    scores: /771|778|766/.test(t),
    checklist: /checklist/i.test(t),
    snip: clip(t, 280),
  }])),
}, null, 2));
await close();
