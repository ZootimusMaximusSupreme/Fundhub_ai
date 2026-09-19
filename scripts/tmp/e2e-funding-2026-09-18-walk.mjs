import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ROOT = "/Users/chrisstanbridge/Developer/fundhub-platform";
const OUT = "/tmp/full-e2e-2026-09-18-funding";
const BASE = "https://fundhub.ai";
const CID = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
mkdirSync(OUT, { recursive: true });
const token = readFileSync(`${OUT}/session.cookie`, "utf8").trim();

function clip(text, n = 2200) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
const request = context.request;

async function getJson(path) {
  const res = await request.get(BASE + path);
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 240) }; }
  return { status: res.status(), json };
}

async function shot(path, key, waitMs = 3200) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  const body = clip(await page.locator("body").innerText().catch(() => ""));
  const buttons = await page.locator("button, a.btn, [role='button'], [data-fh-apply]").evaluateAll((els) =>
    els.map((el) => ({
      text: (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 80),
      apply: el.getAttribute("data-fh-apply"),
      disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true"),
      lender: el.getAttribute("data-lender-name"),
      lenderId: el.getAttribute("data-lender-id"),
      clientId: el.getAttribute("data-client-id"),
    })).filter((x) => x.text || x.apply).slice(0, 50)
  ).catch(() => []);
  const file = `${OUT}/${key}.png`;
  await page.screenshot({ path: file, fullPage: false });
  return { url: page.url(), title: await page.title(), body, buttons, shot: file };
}

const api = {};
const apiPaths = [
  ["/api/health", "health"],
  ["/api/auth/login", "demo_login_get"],
  [`/api/read/funding-rounds?client_id=${CID}&include_matches=1`, "rounds"],
  [`/api/read/lender-matches?client_id=${CID}`, "matches"],
  [`/api/read/invoices?client_id=${CID}`, "invoices"],
  [`/api/read/transactions?client_id=${CID}`, "tx"],
  [`/api/read/portal-summary?client_id=${CID}`, "portal"],
  [`/api/read/documents?client_id=${CID}`, "docs"],
  [`/api/read/underwrite?client_id=${CID}`, "uwiq"],
  [`/api/dashboard/client?id=${CID}`, "dash"],
  [`/api/read/contracts?client_id=${CID}`, "contracts"],
  [`/api/read/client-progress?client_id=${CID}`, "progress"],
  [`/api/read/inquiries?client_id=${CID}`, "inquiries"],
  [`/api/applications?client_id=${CID}`, "applications"],
  [`/api/payment-links?client_id=${CID}`, "paylinks"],
  [`/api/read/agent-context?client_id=${CID}`, "agent_context"],
  [`/api/dashboard/clients?limit=200&fulfillment=1`, "fulfillment"],
  [`/api/read/search?q=${encodeURIComponent("Eight-Funding")}`, "search8"],
];
for (const [path, key] of apiPaths) {
  api[key] = await getJson(path);
}

const shots = {};
shots.app_home = await shot("/app/", "00-app-home", 2000);
shots.pipeline = await shot("/app/pipeline.html", "pipeline", 3500);

await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2000);
const fulfillClick = await page.locator("button, a, [role='tab'], .chip, .filter").evaluateAll((els) => {
  const hits = [];
  for (const el of els) {
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (/fulfill/i.test(t)) hits.push(t.slice(0, 60));
  }
  return hits.slice(0, 12);
}).catch(() => []);
const lens = page.locator("#lensFulfillment");
if (await lens.count()) {
  await lens.click().catch(() => {});
  await page.waitForTimeout(3500);
} else {
  const fulfillBtn = page.locator("text=/Fulfillment/i").first();
  if (await fulfillBtn.count()) {
    await fulfillBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
}
shots.pipeline_fulfillment = {
  url: page.url(),
  fulfillLabels: fulfillClick,
  body: clip(await page.locator("body").innerText().catch(() => "")),
  hasEight: await page.locator("text=/Eight-Funding/i").count().then((n) => n > 0).catch(() => false),
  shot: `${OUT}/pipeline-fulfillment.png`,
};
await page.screenshot({ path: shots.pipeline_fulfillment.shot, fullPage: false });

shots.ccp8 = await shot(`/app/client-control-panel.html?id=${CID}`, "ccp8", 8000);
shots.lenders8 = await shot(`/app/lenders.html?client_id=${CID}`, "lenders8", 4000);
shots.present8 = await shot(`/app/present.html?contact=${CID}`, "present8", 4000);
shots.docs8 = await shot(`/app/documents.html?client_id=${CID}`, "docs8", 4000);
shots.portal8 = await shot(`/app/client-portal.html?id=${CID}`, "portal8", 5000);
shots.portal8_client_id = await shot(`/app/client-portal.html?client_id=${CID}`, "portal8-client-id", 4000);
shots.ops = await shot("/app/ops-admin.html", "ops-admin", 4000);
shots.finance = await shot("/app/finance-os.html", "finance-os", 4000);

// One Apply click on CCP
const applyResult = { clicked: false };
await page.goto(`${BASE}/app/client-control-panel.html?id=${CID}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(8000);

const applyButtons = await page.locator("[data-fh-apply]").evaluateAll((els) =>
  els.map((el) => ({
    text: (el.innerText || "").replace(/\s+/g, " ").trim(),
    disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled")),
    lender: el.getAttribute("data-lender-name"),
    lenderId: el.getAttribute("data-lender-id"),
    applicationId: el.getAttribute("data-application-id"),
    clientId: el.getAttribute("data-client-id"),
  }))
);
applyResult.buttons = applyButtons;

const liveApply = page.locator("[data-fh-apply]:not([disabled])").filter({ hasNotText: /no online/i });
const applyCount = await liveApply.count().catch(() => 0);
applyResult.liveCount = applyCount;

if (applyCount > 0) {
  const launchWait = page.waitForResponse((r) => r.url().includes("/api/proxy/launch") && r.request().method() === "POST", { timeout: 45_000 }).catch(() => null);
  await liveApply.first().click({ timeout: 10_000 });
  applyResult.clicked = true;
  const resp = await launchWait;
  if (resp) {
    applyResult.http = resp.status();
    try { applyResult.body = await resp.json(); } catch { applyResult.bodyText = (await resp.text()).slice(0, 800); }
  } else {
    applyResult.http = null;
    applyResult.note = "no /api/proxy/launch response seen";
  }
  await page.waitForTimeout(1500);
  applyResult.modal = clip(await page.locator("#fh-proxy-apply-modal").innerText().catch(() => ""));
  applyResult.pageBody = clip(await page.locator("body").innerText().catch(() => ""));
  await page.screenshot({ path: `${OUT}/apply-after.png`, fullPage: false });
  applyResult.shot = `${OUT}/apply-after.png`;

  // End proxy session if one started, so we don't leave a live Oxylabs session.
  const sid = applyResult.body && applyResult.body.session_id;
  if (sid) {
    const endRes = await request.post(`${BASE}/api/proxy/end`, { data: { session_id: sid } });
    applyResult.endHttp = endRes.status();
  }
} else {
  applyResult.note = "no enabled Apply button found";
  await page.screenshot({ path: `${OUT}/apply-none.png`, fullPage: false });
}

writeFileSync(`${OUT}/walk.json`, JSON.stringify({ when: new Date().toISOString(), api, shots, applyResult }, null, 2));
console.log(JSON.stringify({
  ok: true,
  homeUrl: shots.app_home.url,
  ccpName: /Eight-Funding/.test(shots.ccp8.body),
  ccpBodySlice: shots.ccp8.body.slice(0, 500),
  queueHasEight: shots.pipeline_fulfillment.hasEight,
  apply: {
    clicked: applyResult.clicked,
    liveCount: applyResult.liveCount,
    http: applyResult.http,
    ok: applyResult.body && applyResult.body.ok,
    error: applyResult.body && (applyResult.body.error || applyResult.body.message),
    modalSlice: (applyResult.modal || "").slice(0, 400),
    buttons: applyResult.buttons,
  },
  health: api.health.status,
  pending: api.health.json && api.health.json.pending,
  dashFunded: api.dash.json && (api.dash.json.client && { funded: api.dash.json.client.funded, name: api.dash.json.client.first_name }),
  matchesCount: Array.isArray(api.matches.json?.matches) ? api.matches.json.matches.length : Object.keys(api.matches.json || {}),
  agentContextKeys: api.agent_context.json && typeof api.agent_context.json === "object" ? Object.keys(api.agent_context.json) : [],
}, null, 2));
await browser.close();
process.exit(0);
