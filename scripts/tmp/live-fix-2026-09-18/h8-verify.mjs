// Hole 8 — look only. Funded numbers vs the two funded $25k rounds on #8.
// No Send, no Apply, no Mark funded. Every non-GET request in the browser is aborted.
// Database reads run inside BEGIN READ ONLY. Never prints passwords, tokens or cookies.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h8-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { pool } from "../../../src/db.mjs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-8";
mkdirSync(SHOTS, { recursive: true });
const TAG = process.argv[2] || "verify";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";

const out = { at: new Date().toISOString(), tag: TAG };

// ---- database, read only ----
{
  const c = await pool().connect();
  try {
    await c.query("BEGIN READ ONLY");
    const cl = await c.query(
      `SELECT id, org_id, first_name, last_name, funded, funded_amount, outcome_tier, is_demo FROM clients WHERE id = $1`, [EIGHT]);
    const rounds = await c.query(
      `SELECT id, round_number, status, product, approved_amount, funded_amount, created_at, updated_at
         FROM funding_rounds WHERE client_id = $1 ORDER BY round_number`, [EIGHT]);
    await c.query("SAVEPOINT a");
    const apps = await c.query(
      `SELECT a.funding_round_id, a.status, a.approved_amount
         FROM applications a JOIN funding_rounds fr ON fr.id = a.funding_round_id
        WHERE fr.client_id = $1 ORDER BY a.funding_round_id`, [EIGHT])
      .catch(async (e) => { await c.query("ROLLBACK TO SAVEPOINT a"); return { rows: [{ error: e.message }] }; });
    const orgId = cl.rows[0]?.org_id;
    const orgRounds = await c.query(
      `SELECT count(*)::int AS rounds,
              count(*) FILTER (WHERE approved_amount IS NOT NULL AND approved_amount > 0)::int AS rounds_with_approved,
              SUM(approved_amount) AS sum_approved,
              count(*) FILTER (WHERE status = 'funded')::int AS funded_rounds,
              SUM(funded_amount) FILTER (WHERE status = 'funded') AS sum_funded
         FROM funding_rounds WHERE org_id = $1`, [orgId]);
    const orgFundedClients = await c.query(
      `SELECT count(*) FILTER (WHERE funded)::int AS clients_funded_true FROM clients WHERE org_id = $1`, [orgId]);
    await c.query("ROLLBACK");
    out.db = { client: cl.rows[0], rounds: rounds.rows, applications: apps.rows, org: { ...orgRounds.rows[0], ...orgFundedClients.rows[0] } };
  } finally {
    c.release();
    await pool().end();
  }
}

// ---- sign in ----
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h8-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookie = m ? m[1] : null;
out.loginStatus = r.status;
out.gotCookie = Boolean(cookie);
if (!cookie) { console.log(JSON.stringify(out, null, 2)); process.exit(1); }
const H = { cookie: `fundhub_session=${cookie}`, accept: "application/json" };

// ---- the APIs the three screens use ----
{
  const a = await fetch(`${BASE}/api/dashboard/client?id=${EIGHT}`, { headers: H });
  const d = await a.json().catch(() => null);
  const c = d?.client || d?.data?.client || {};
  const rounds = d?.funding_rounds || d?.data?.funding_rounds || [];
  out.apiClient = {
    status: a.status,
    funded: c.funded, funded_amount: c.funded_amount,
    rounds: rounds.map((x) => ({ n: x.round_number, status: x.status, approved: x.approved_amount, funded: x.funded_amount })),
  };
}
{
  const a = await fetch(`${BASE}/api/dashboard/clients?limit=200&fulfillment=true`, { headers: H });
  const d = await a.json().catch(() => null);
  const data = d?.data || d || {};
  const eight = (data.clients || []).find((x) => x.id === EIGHT);
  out.apiFulfillment = {
    status: a.status,
    rollups: data.rollups || null,
    eightRow: eight ? { funded: eight.funded, funded_amount: eight.funded_amount, funding_round: eight.funding_round ?? null } : null,
  };
}
for (const period of ["today", "7d", "30d", "qtd"]) {
  const a = await fetch(`${BASE}/api/dashboard/kpis?period=${period}`, { headers: H });
  const d = await a.json().catch(() => null);
  const data = d?.data || {};
  (out.apiKpis ||= {})[period] = { status: a.status, funded: data.display?.funded, funded_amount: data.display?.funded_amount, funded_count: data.funded_count ?? data.kpis?.funded_count };
}

// ---- the three screens, twice ----
const browser = await chromium.launch({ headless: true });
out.passes = [];
for (let i = 1; i <= 2; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "fundhub_session", value: cookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }]);
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const q = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(q.method())) return route.continue();
    blocked.push(`${q.method()} ${new URL(q.url()).pathname}`);
    return route.abort();
  });
  const page = await ctx.newPage();
  const pass = { pass: i };

  // 1. Client control panel
  await page.goto(`${BASE}/app/client-control-panel.html?id=${EIGHT}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => {
    const el = document.getElementById("ccp-facts-funded");
    return el && el.textContent.trim() !== "" && el.textContent.trim() !== "—";
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  pass.ccp = await page.evaluate(() => {
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; };
    return {
      name: txt("ccp-name"), factsFunded: txt("ccp-facts-funded"), factsRound: txt("ccp-facts-round"),
      approvedTile: txt("ccp-approved"), round: txt("ccp-round"),
    };
  });
  const factsEl = await page.$("#ccp-facts-funded");
  if (factsEl) await factsEl.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${SHOTS}/${TAG}-ccp-pass${i}.png`, fullPage: false });

  // 2. Pipeline -> Fulfillment
  await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.click("#lensFulfillment").catch(() => {});
  await page.waitForFunction(() => {
    const el = document.getElementById("ltTotalClients");
    return el && el.textContent.trim() !== "" && el.textContent.trim() !== "—";
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  pass.fulfillment = await page.evaluate((eight) => {
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.replace(/\s+/g, " ").trim() : null; };
    const rows = [...document.querySelectorAll(".fh-lens-row")].filter((r) => r.dataset.clientId === eight).map((r) => r.innerText.replace(/\s+/g, " ").trim());
    return { totalApproved: txt("ltTotalApproved"), totalApprovedNote: txt("ltTotalApprovedNote"), totalClients: txt("ltTotalClients"), eightRow: rows };
  }, EIGHT);
  await page.screenshot({ path: `${SHOTS}/${TAG}-fulfillment-pass${i}.png`, fullPage: false });

  // 3. Ops Admin -> Money
  await page.goto(`${BASE}/app/ops-admin.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-kpi="funded"]');
    return el && el.textContent.trim() !== "—";
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  pass.ops = await page.evaluate(() => {
    const k = (n) => { const el = document.querySelector(`[data-kpi="${n}"]`); return el ? el.textContent.trim() : null; };
    const ceo = document.getElementById("ops-pulse-ceo");
    const lines = ceo ? ceo.textContent.split("\n").filter((l) => /Funded/.test(l)) : [];
    return { fundedTile: k("funded"), cpf: k("cpf"), ceoFundedLines: lines };
  });
  await page.screenshot({ path: `${SHOTS}/${TAG}-ops-pass${i}.png`, fullPage: false });

  pass.blocked = blocked;
  out.passes.push(pass);
  await ctx.close();
}
await browser.close();
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
