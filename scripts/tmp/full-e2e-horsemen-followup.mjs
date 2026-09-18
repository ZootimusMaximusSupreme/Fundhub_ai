// GET-only follow-up: What You Own, CCP funded round, agent-context. No Send.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { db } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/full-e2e-horsemen-2026-09-17";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
};

const staffRow = (await db.query(
  `SELECT id, org_id, email, role FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
  ["chris@fundhub.ai"]
)).rows[0];
const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
  { name: "fundhub_session", value: token, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const page = await context.newPage();
const request = context.request;

async function getJson(path) {
  const res = await request.get(BASE + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, snippet: text.slice(0, 300) }; }
  return { status: res.status(), json };
}

function clip(t, n = 4000) {
  return String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
}

const api = {
  eight_uwiq: await getJson(`/api/read/underwrite?client_id=${IDS.eight}`),
  eight_portal: await getJson(`/api/read/portal-summary?client_id=${IDS.eight}`),
  eleven_portal: await getJson(`/api/read/portal-summary?client_id=${IDS.eleven}`),
  twelve_portal: await getJson(`/api/read/portal-summary?client_id=${IDS.twelve}`),
  nine_portal: await getJson(`/api/read/portal-summary?client_id=${IDS.nine}`),
  eleven_progress: await getJson(`/api/read/client-progress?client_id=${IDS.eleven}`),
  repair_queue: await getJson(`/api/read/repair-cases`),
  agent_context8: await getJson(`/api/read/agent-context?client_id=${IDS.eight}`),
  search8: await getJson(`/api/read/search?q=${encodeURIComponent("Eight-Funding")}`),
};

function slimPortal(j) {
  const s = j?.json || j || {};
  return {
    status: j.status,
    keys: s && typeof s === "object" ? Object.keys(s) : [],
    client: s.client || s.name || s.first_name,
    stage: s.stage || s.summary?.stage || s.status,
    entitlements: s.entitlements || s.owned || s.what_you_own,
    agreements: s.agreements || s.contracts,
    scores: s.scores || s.credit,
    checklist: s.checklist || s.progress,
    prequal: s.prequal || s.funding_estimate || s.approved_amount,
    owned: s.owned,
    deliverables: s.deliverables,
    summary: s.summary,
  };
}

const shots = {};
for (const [key, path, scrollSel] of [
  ["portal11", `/app/client-portal.html?id=${IDS.eleven}`, "body"],
  ["portal8", `/app/client-portal.html?id=${IDS.eight}`, "body"],
  ["portal12", `/app/client-portal.html?id=${IDS.twelve}`, "body"],
  ["ccp8", `/app/client-control-panel.html?id=${IDS.eight}`, "body"],
  ["pipeline_fulfill", `/app/pipeline.html`, "body"],
]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2800);
  if (key.startsWith("portal")) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }
  if (key === "pipeline_fulfill") {
    const ful = page.getByRole("button", { name: /Fulfillment/i }).first();
    if (await ful.count()) {
      await ful.click();
      await page.waitForTimeout(1500);
    }
  }
  const body = clip(await page.locator("body").innerText());
  const shot = `${OUT}/follow-${key}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  shots[key] = { url: page.url(), body, shot, scrollSel };
}

await browser.close();

function pickOwned(text) {
  const t = String(text);
  const i = t.search(/WHAT YOU OWN|Metro 2|Roadmap|NOT READY|DOWNLOAD|Funding Mastery|Nothing to download/i);
  return i >= 0 ? t.slice(Math.max(0, i - 80), i + 900) : t.slice(-900);
}

const out = {
  at: new Date().toISOString(),
  portalSlim: {
    eight: slimPortal(api.eight_portal),
    eleven: slimPortal(api.eleven_portal),
    twelve: slimPortal(api.twelve_portal),
    nine: slimPortal(api.nine_portal),
  },
  eleven_progress_keys: api.eleven_progress.json && typeof api.eleven_progress.json === "object" ? Object.keys(api.eleven_progress.json) : [],
  eleven_progress: api.eleven_progress.json,
  repair_queue_keys: api.repair_queue.json && typeof api.repair_queue.json === "object" ? Object.keys(api.repair_queue.json) : [],
  repair_files: (api.repair_queue.json?.files || []).slice(0, 8),
  repair_need_me: api.repair_queue.json?.need_me,
  agent_context8_keys: api.agent_context8.json && typeof api.agent_context8.json === "object" ? Object.keys(api.agent_context8.json) : [],
  agent_context8_status: api.agent_context8.status,
  agent_said: JSON.stringify(api.agent_context8.json || {}).includes("said:"),
  search8_groups: api.search8.json?.groups,
  uwiq_engine_keys: api.eight_uwiq.json?.engine && typeof api.eight_uwiq.json.engine === "object" ? Object.keys(api.eight_uwiq.json.engine) : [],
  uwiq_tradelineSource: api.eight_uwiq.json?.tradelineSource,
  ownedSnips: {
    portal11: pickOwned(shots.portal11.body),
    portal8: pickOwned(shots.portal8.body),
    portal12: pickOwned(shots.portal12.body),
  },
  ccp8_fund: (() => {
    const t = shots.ccp8.body;
    const i = t.search(/FUNDING ROUND|funded|\$25|Apply/i);
    return i >= 0 ? t.slice(i, i + 1200) : t.slice(-1200);
  })(),
  pipeline_fulfill: shots.pipeline_fulfill.body.slice(0, 1800),
};
writeFileSync(`${OUT}/followup.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
