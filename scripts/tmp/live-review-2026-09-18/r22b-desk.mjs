// Hole 22 ROUND 2 REVIEWER (address half). Look only, on live.
// Signs in through the real password form; every non-GET is aborted except the one sign-in POST.
// Opens the Repair desk twice on fresh loads, records Combo's row and the queue API's address flag.
// Never prints passwords, cookies, tokens, street, ZIP, SSN, DOB, phone or email.
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const PICKS = { e42c11e8: "real-bureau pull client", be3dcfd7: "Sim Nine-Repair" };
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/review2";
mkdirSync(SHOTS, { recursive: true });

// Address strings for a leak check only (booleans reported, values never printed).
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect(); await db.query("BEGIN READ ONLY");
const a0 = (await db.query(`select addresses->0 a from pii_identity where client_id=$1`, [COMBO])).rows[0]?.a || {};
await db.query("ROLLBACK"); await db.end();
const secrets = [a0.addressLine1, a0.postalCode].filter(Boolean).map(String);

const out = { started: new Date().toISOString(), passes: [], blocked: [], allowedPosts: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let loginPosts = 0;
await ctx.route("**/*", (route) => {
  const r = route.request();
  const u = new URL(r.url());
  if (r.method() === "GET" || r.method() === "HEAD" || r.method() === "OPTIONS") return route.continue();
  if (r.method() === "POST" && u.origin === BASE && u.pathname === "/api/auth/login" && loginPosts === 0) {
    loginPosts++; out.allowedPosts.push(`${r.method()} ${u.pathname}`); return route.continue();
  }
  out.blocked.push(`${r.method()} ${u.origin === BASE ? u.pathname : u.host}`);
  return route.abort();
});

// ---- sign in with the password form ----
const lp = await ctx.newPage();
await lp.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await lp.fill("#email", "chris@fundhub.ai");
await lp.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
const [loginResp] = await Promise.all([
  lp.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 30000 }),
  lp.click("#go"),
]);
out.login = { status: loginResp.status() };
let loginOk = false;
try { const j = await loginResp.json(); loginOk = j && (j.ok === true || !!j.role || !!j.staff); out.login.ok = j?.ok; out.login.role = j?.role || j?.staff?.role || null; } catch { out.login.parse = "not json"; }
await lp.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 }).catch(() => {});
await lp.waitForLoadState("domcontentloaded").catch(() => {});
out.login.landed = new URL(lp.url()).pathname;
const sp = await ctx.newPage();
await sp.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const sess = await sp.evaluate(async () => { const r = await fetch("/api/auth/session", { headers: { accept: "application/json" }, cache: "no-store" }); let j = null; try { j = await r.json(); } catch {} return { http: r.status, ok: j?.ok, role: j?.role || j?.session?.role || j?.staff?.role || null, authed: !!(j && (j.staff || j.session || j.role || j.user)) }; });
out.session = sess;
await sp.close();
await lp.close();
if (!(loginResp.status() === 200 && sess.http === 200 && sess.authed)) {
  out.stop = "sign-in failed — stopping";
  writeFileSync(`${SHOTS}/desk.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close(); process.exit(0);
}

for (const pass of [1, 2]) {
  const p = await ctx.newPage();
  const rec = { pass, at: new Date().toISOString() };
  const qResps = [];
  p.on("response", (r) => { if (r.url().includes("/api/read/repair-cases")) qResps.push(r); });
  await p.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  rec.url = new URL(p.url()).pathname;
  rec.repair_tab_visible = await p.locator("#tab-repair").isVisible().catch(() => false);
  rec.repair_queue_fetched_before_click = qResps.length;
  await p.click("#tab-repair");
  for (let i = 0; i < 60 && !qResps.length; i++) await p.waitForTimeout(500);
  if (!qResps.length) { rec.error = "no /api/read/repair-cases response"; await p.screenshot({ path: `${SHOTS}/debug-pass${pass}.png` }); out.passes.push(rec); console.log(JSON.stringify(out, null, 2)); process.exit(1); }
  const qResp = qResps[qResps.length - 1];
  await qResp.finished().catch(() => {});
  const q = await qResp.json();
  rec.queue = { http: qResp.status(), ok: q.ok, files: (q.files || []).length, need_me: q.need_me, ready: q.ready, waiting: q.waiting, stalled: q.stalled, trial_ending: q.trial_ending };
  const f = (q.files || []).find((x) => x.client_id === COMBO);
  rec.combo_api = f ? { name: f.name, program: f.program, round: f.round, rounds_cap: f.rounds_cap, stage_key: f.stage_key, stage_label: f.stage_label, address_ok: f.address_ok, company_address_ok: f.company_address_ok, no_furnisher_address: f.no_furnisher_address, letters_ready: f.letters_ready, letters_sent: f.letters_sent, need_me: f.need_me, keys: Object.keys(f) } : "NOT IN QUEUE";
  rec.picks_api = Object.fromEntries(Object.entries(PICKS).map(([pre, label]) => {
    const g = (q.files || []).find((x) => String(x.client_id).startsWith(pre));
    return [pre, g ? { label, name_is_sim: /^Sim /.test(g.name || ""), address_ok: g.address_ok, stage_key: g.stage_key } : { label, on_repair_desk: false }];
  }));
  rec.address_false_count = (q.files || []).filter((x) => x.address_ok === false).length;
  const row = p.locator(`tr[data-repair-row="${COMBO}"]`);
  await row.waitFor({ state: "visible", timeout: 20000 });
  await p.waitForTimeout(800);
  rec.combo_row_cells = await row.locator("td").allInnerTexts();
  rec.combo_row_text = (await row.innerText()).replace(/\s+/g, " ").trim();
  rec.row_says_no_address = /no address on file/i.test(rec.combo_row_text);
  rec.ready_tile = (await p.locator("#repairReady").innerText()).trim();
  rec.page_no_address_mentions = await p.evaluate(() => (document.body.innerText.match(/no address on file/gi) || []).length);
  const bodyText = await p.evaluate(() => document.body.innerText);
  rec.page_shows_combo_street_or_zip = secrets.length ? secrets.some((s) => bodyText.includes(s)) : "no address to check";
  // ---- mark up: red numbered boxes + legend ----
  await p.evaluate(({ combo }) => {
    const mk = (el, n) => {
      const r = el.getBoundingClientRect();
      const b = document.createElement("div");
      b.className = "rv-mark";
      Object.assign(b.style, { position: "absolute", left: (r.left + window.scrollX - 4) + "px", top: (r.top + window.scrollY - 4) + "px", width: (r.width + 8) + "px", height: (r.height + 8) + "px", border: "3px solid #e00", borderRadius: "4px", zIndex: 99999, pointerEvents: "none" });
      const t = document.createElement("div");
      t.textContent = String(n);
      Object.assign(t.style, { position: "absolute", left: "-14px", top: "-14px", background: "#e00", color: "#fff", font: "bold 14px/24px sans-serif", width: "24px", height: "24px", borderRadius: "12px", textAlign: "center" });
      b.appendChild(t); document.body.appendChild(b);
    };
    const row = document.querySelector(`tr[data-repair-row="${combo}"]`);
    row.scrollIntoView({ block: "center" });
    mk(row, 1);
    const tile = document.querySelector("#repairReady")?.closest(".stat-tile");
    if (tile) mk(tile, 2);
    const leg = document.createElement("div");
    leg.className = "rv-mark";
    leg.innerHTML = "<b>1</b> Combo's Repair row — no red “no address on file” &nbsp;·&nbsp; <b>2</b> Ready to send tile";
    Object.assign(leg.style, { position: "fixed", left: "16px", bottom: "16px", background: "#fff", color: "#111", border: "3px solid #e00", padding: "8px 12px", font: "14px sans-serif", zIndex: 100000 });
    document.body.appendChild(leg);
  }, { combo: COMBO });
  await p.waitForTimeout(300);
  rec.shot = `${SHOTS}/repair-pass${pass}.png`;
  await p.screenshot({ path: rec.shot, fullPage: false });
  out.passes.push(rec);
  await p.close();
}
out.finished = new Date().toISOString();
await browser.close();
writeFileSync(`${SHOTS}/desk.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
