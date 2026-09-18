// Hole 12 VERIFY / PROVE. LOOK ONLY. Nothing is written anywhere.
//  1. Live database, BEGIN READ ONLY: #8's stored next action in BOTH places it
//     can live — clients.custom_fields->>'employee_next_action' (what the
//     control panel paints) and client_custom_fields.employee_next_action (what
//     the AI agent context reads) — plus the open inquiries and the inquiry
//     events that should have moved it.
//  2. Owner password login, GET /api/dashboard/client?id=<#8> and the
//     Fulfillment list — what the screen is handed.
//  3. Headless chromium, every non-GET request aborted. Control panel twice:
//     the big "Do this next" line and the quiet "Saved on the record:" line
//     under Details. Screenshots get red numbered boxes + a legend (§8).
// Never prints the password, the cookie, or the connection string.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h12-verify.mjs
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const TAG = process.env.TAG || "before";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12";
mkdirSync(SHOTS, { recursive: true });

// ── 1. Database, read only ────────────────────────────────────────────────
const db = {};
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  db.client = (await c.query(
    `SELECT id, first_name, last_name, outcome_tier, updated_at,
            custom_fields->>'employee_next_action' AS stored_next_action,
            custom_fields->>'round_hold_reason'    AS round_hold_reason,
            custom_fields->>'ready_for_next_round' AS ready_for_next_round
       FROM clients WHERE id = $1`, [EIGHT])).rows[0] || null;
  db.cf_table = (await c.query(
    `SELECT employee_next_action, updated_at FROM client_custom_fields WHERE client_id = $1`, [EIGHT])).rows[0] || null;
  const inqCols = (await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'inquiries' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
  db.inquiry_columns = inqCols;
  if (inqCols.length) {
    db.inquiries = (await c.query(
      `SELECT * FROM inquiries WHERE client_id = $1 ORDER BY created_at`, [EIGHT])).rows
      .map((r) => ({ id: r.id, creditor: r.creditor_name ?? r.creditor ?? null, bureau: r.bureau ?? null, status: r.status ?? null, source: r.source ?? null, created_at: r.created_at }));
  }
  const evCols = (await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('events','workflow_runs','client_events','audit_log') ORDER BY 1`)).rows.map((r) => r.table_name);
  db.event_tables = evCols;
  await c.query("COMMIT");
} catch (e) {
  db.error = e.message;
  try { await c.query("ROLLBACK"); } catch {}
} finally { c.release(); await close(); }
console.log("DATABASE", JSON.stringify(db, null, 2));

// ── 2. Live API ───────────────────────────────────────────────────────────
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h12-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const token = m[1];
const H = { cookie: `fundhub_session=${token}` };

const api = await fetch(`${BASE}/api/dashboard/client?id=${EIGHT}`, { headers: H });
const d = await api.json();
const list = await fetch(`${BASE}/api/dashboard/clients?limit=200&fulfillment=1`, { headers: H });
const lj = await list.json();
const row = (lj?.clients || []).find((x) => x.id === EIGHT) || null;
const out = {
  at: new Date().toISOString(),
  tag: TAG,
  db,
  detail: {
    status: api.status,
    next_action: d?.next_action ?? null,
    next_action_degraded: d?.next_action_degraded ?? null,
    stored_in_payload: d?.client?.custom_fields?.employee_next_action ?? null,
    active_blockers: (d?.active_blockers || []).map((b) => `${b.source} | ${b.label}`),
  },
  list: {
    status: list.status,
    found: Boolean(row),
    next_action: row?.next_action ?? null,
  },
};
console.log("API", JSON.stringify({ detail: out.detail, list: out.list }, null, 2));

// ── 3. The screen ─────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const blocked = [];
await context.route("**/*", (route) => {
  const q = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) { blocked.push(`${q.method()} ${q.url()}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();

async function mark(marks, title) {
  await page.evaluate(({ marks, title }) => {
    document.querySelectorAll(".h12-mark").forEach((n) => n.remove());
    const legend = document.createElement("div");
    legend.className = "h12-mark";
    legend.style.cssText = "position:fixed;right:12px;top:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:620px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b>${title}</b>`;
    marks.forEach((mk, i) => {
      const el = document.querySelector(mk.sel);
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${mk.caption}`;
      legend.appendChild(line);
      if (!el || el.hidden) return;
      const b = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "h12-mark";
      box.style.cssText = `position:absolute;left:${b.left + window.scrollX - 4}px;top:${b.top + window.scrollY - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid #ff2828;z-index:2147483646;pointer-events:none`;
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = "position:absolute;left:-3px;top:-26px;background:#ff2828;color:#fff;font:bold 15px Helvetica,sans-serif;padding:2px 8px";
      box.appendChild(tag);
      document.body.appendChild(box);
    });
    document.body.appendChild(legend);
  }, { marks, title });
}

const looks = [];
for (let i = 1; i <= 2; i++) {
  await page.goto(`${BASE}/app/client-control-panel.html?id=${EIGHT}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /Eight/.test(document.getElementById("ccp-name")?.textContent || ""), null, { timeout: 45000 });
  await page.waitForFunction(() => {
    const t = (document.getElementById("ccp-next-action")?.textContent || "").trim();
    return t && t !== "—" && !/Pick a client/i.test(t);
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const look = await page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const t = (id) => (el(id)?.textContent || "").trim();
    return {
      name: t("ccp-name"),
      nextStep: t("ccp-next-action"),
      why: t("ccp-cp-why"),
      savedLine: t("ccp-saved"),
      savedLineShown: !!(el("ccp-saved") && !el("ccp-saved").hidden),
      inquiries: t("ccp-next-inquiries"),
    };
  });
  looks.push(look);
  console.log(`control panel look ${i}`, JSON.stringify(look, null, 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  await mark([
    { sel: "#ccp-next-action", caption: `Do this next: "${look.nextStep}"` },
    { sel: "#ccp-saved", caption: look.savedLineShown ? `Quiet line under Details: "${look.savedLine}"` : "Quiet saved line under Details: not shown (hidden)" },
  ], `Hole 12 (${TAG}) — #8 Eight-Funding, control panel look ${i}`);
  await page.screenshot({ path: `${SHOTS}/h12-${TAG}-ccp-look${i}.png`, fullPage: true });

  // Second shot: open the Details block (collapsed by default — the toggle
  // only shows/hides, it writes nothing), scroll it into view and box the
  // saved line. When the line is hidden, box the block it sat in.
  const tog = page.locator('button.tog[aria-controls="details-body"]');
  if ((await tog.getAttribute("aria-expanded")) !== "true") await tog.click();
  await page.evaluate(() => {
    document.querySelectorAll(".h12-mark").forEach((n) => n.remove());
    const s = document.getElementById("ccp-saved");
    (s && !s.hidden ? s : s?.parentElement)?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(500);
  await page.evaluate(({ look, title }) => {
    const s = document.getElementById("ccp-saved");
    const target = s && !s.hidden ? s : s?.parentElement;
    const legend = document.createElement("div");
    legend.className = "h12-mark";
    legend.style.cssText = "position:fixed;right:12px;top:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:620px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b>${title}</b>`;
    const line = document.createElement("div");
    line.textContent = look.savedLineShown
      ? `1. Details block, quiet saved line: "${look.savedLine}"`
      : `1. Details block: no "Saved on the record" line (hidden — saved value matches "${look.nextStep}")`;
    legend.appendChild(line);
    document.body.appendChild(legend);
    if (!target) return;
    const b = target.getBoundingClientRect();
    const box = document.createElement("div");
    box.className = "h12-mark";
    box.style.cssText = `position:fixed;left:${b.left - 4}px;top:${b.top - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid #ff2828;z-index:2147483646;pointer-events:none`;
    const tag = document.createElement("div");
    tag.textContent = "1";
    tag.style.cssText = "position:absolute;left:-3px;top:-26px;background:#ff2828;color:#fff;font:bold 15px Helvetica,sans-serif;padding:2px 8px";
    box.appendChild(tag);
    document.body.appendChild(box);
  }, { look, title: `Hole 12 (${TAG}) — #8 Details block, look ${i}` });
  await page.screenshot({ path: `${SHOTS}/h12-${TAG}-details-look${i}.png`, fullPage: false });
}

out.looks = looks;
out.blockedWrites = blocked;
writeFileSync(`${SHOTS}/h12-${TAG}.json`, JSON.stringify(out, null, 2));
console.log("blocked writes:", blocked.length, blocked.slice(0, 5));
await browser.close();
