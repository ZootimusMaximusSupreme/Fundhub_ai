// Review of hole 14 — "Specialist header says every file is waiting on a bureau (Stuck 2)". LOOK ONLY.
// Independent re-try on live by the reviewer (not the fixer).
//
// Two fresh loads, each in a brand-new headless browser with a real password sign-in:
//   open /app/inquiry-remover.html, click the Repair tab, trace the line under the headline
//   and the five tiles from the click until the Stuck tile shows a number, then 3 s more.
// Also a third look: reload of load 2 (extra, same session).
// Captures the repair queue API responses the page itself received, and counts the
// "Stuck" chips in the table rows, so the tiles can be checked against live data.
// Blocks every non-GET except the one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r14-review.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-14/review";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const out = { at: new Date().toISOString(), base: BASE, no_send: true, loads: [], blocked: [] };

const READ = () => {
  const tile = (lab) => {
    const t = Array.from(document.querySelectorAll("#repair-stats .stat-tile")).find((x) => (x.querySelector(".stat-label")?.innerText || "").trim().toUpperCase() === lab);
    if (!t) return null;
    return (t.innerText || "").replace(t.querySelector(".stat-label")?.innerText || "", "").trim();
  };
  const dh = document.querySelector(".deskhead");
  const line = document.getElementById("deskNextNone");
  const lineEl = line && line.getBoundingClientRect().height > 0 ? line : null;
  // any visible element inside the header block that holds "needs you" text
  const nextBox = dh?.querySelector(".dh-next");
  return {
    headLabel: document.getElementById("deskLabel")?.innerText.trim() ?? null,
    headText: dh ? dh.innerText.replace(/\s*\n\s*/g, " | ").trim() : null,
    line: lineEl ? lineEl.innerText.trim() : null,
    nextBoxText: nextBox ? nextBox.innerText.trim() : null,
    tiles: { needMe: tile("NEED ME"), ready: tile("READY TO SEND"), waiting: tile("WAITING ON BUREAU"), stuck: tile("STUCK"), trialEnding: tile("TRIAL ENDING") },
    stuckChips: document.querySelectorAll("#repairBody .repair-chip.stuck").length,
    rows: Array.from(document.querySelectorAll("#repairBody tr.repair-row")).map((tr) => Array.from(tr.cells).map((c) => c.innerText.trim().replace(/\s+/g, " ")).join(" / ")),
    paneState: document.getElementById("pane-repair")?.className ?? null,
  };
};

async function newCtx() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route("**/*", (route) => {
    const r = route.request(); const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const p = new URL(r.url()).pathname;
    if (m === "POST" && p === "/api/auth/login") return route.continue();
    out.blocked.push(`${m} ${p}`); return route.abort();
  });
  return { browser, ctx };
}

async function signIn(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", pw);
  const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
  await page.click("#go");
  const status = (await lr).status();
  await page.waitForTimeout(2500);
  return { page, status, landed: new URL(page.url()).pathname };
}

function hookApis(page, bag) {
  page.on("response", async (res) => {
    const u = new URL(res.url());
    if (!u.pathname.startsWith("/api/")) return;
    const entry = { method: res.request().method(), path: u.pathname + u.search, status: res.status(), ms: Date.now() };
    bag.calls.push(entry);
    if (u.pathname === "/api/read/repair-cases" || u.pathname === "/api/repair/exceptions") {
      try { bag.bodies[u.pathname] = await res.json(); } catch (e) { bag.bodies[u.pathname] = { parseError: String(e).slice(0, 80) }; }
    }
  });
}

async function traceUntilSettled(page, t0) {
  const trace = [];
  let last = "";
  let settledAt = null;
  while (Date.now() - t0 < 25000) {
    const s = await page.evaluate(READ).catch((e) => ({ err: String(e).slice(0, 80) }));
    const k = JSON.stringify({ line: s.line, tiles: s.tiles, head: s.headText });
    if (k !== last) { last = k; trace.push({ ms: Date.now() - t0, line: s.line, head: s.headText, tiles: s.tiles }); }
    if (settledAt === null && s.tiles && s.tiles.stuck && /^\d+$/.test(s.tiles.stuck)) settledAt = Date.now() - t0;
    if (settledAt !== null && Date.now() - t0 > settledAt + 3000) break;
    await page.waitForTimeout(50);
  }
  return { trace, stuckNumberAtMs: settledAt };
}

async function mark(page) {
  await page.evaluate(() => {
    const tileEl = (lab) => Array.from(document.querySelectorAll("#repair-stats .stat-tile")).find((x) => (x.querySelector(".stat-label")?.innerText || "").trim().toUpperCase() === lab);
    const line = document.getElementById("deskNextNone");
    const items = [
      [line, 1, "Line under the headline"],
      [tileEl("WAITING ON BUREAU"), 2, "Waiting on bureau tile"],
      [tileEl("STUCK"), 3, "Stuck tile"],
    ];
    const layer = document.createElement("div");
    layer.id = "__r14marks";
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647";
    const legend = [];
    for (const [el, n, label] of items) {
      if (!el || el.getBoundingClientRect().height === 0) { legend.push(`${n} = ${label} — not on the page`); continue; }
      const r = el.getBoundingClientRect();
      const x = r.left + scrollX, y = r.top + scrollY;
      const b = document.createElement("div");
      b.style.cssText = `position:absolute;left:${x - 5}px;top:${y - 4}px;width:${r.width + 10}px;height:${r.height + 8}px;border:3px solid #e00;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = n;
      tag.style.cssText = `position:absolute;left:${x - 28}px;top:${y - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
      layer.append(b, tag);
      legend.push(`${n} = ${label}: "${(el.innerText || "").trim().replace(/\s*\n\s*/g, " ")}"`);
    }
    const lg = document.createElement("div");
    lg.style.cssText = "position:absolute;left:540px;top:112px;width:700px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:14px/20px sans-serif;padding:8px 12px";
    lg.innerHTML = legend.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    layer.append(lg);
    document.body.append(layer);
  });
}
const unmark = (page) => page.evaluate(() => document.getElementById("__r14marks")?.remove()).catch(() => {});

async function shots(page, base) {
  const plain = `${SHOTS}/${base}.png`;
  const marked = `${SHOTS}/${base}-marked.png`;
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: plain, clip: { x: 0, y: 0, width: 1440, height: 640 } });
  await mark(page);
  await page.screenshot({ path: marked, clip: { x: 0, y: 0, width: 1440, height: 640 } });
  await unmark(page);
  return { plain, marked };
}

function apiSummary(bodies) {
  const rc = bodies["/api/read/repair-cases"];
  const ex = bodies["/api/repair/exceptions"];
  if (!rc || !Array.isArray(rc.files)) return { repairCases: rc ?? null, exceptions: ex ?? null };
  return {
    counts: { total: rc.total, need_me: rc.need_me, ready: rc.ready, waiting: rc.waiting, stalled: rc.stalled, trial_ending: rc.trial_ending },
    filesLength: rc.files.length,
    perFile: rc.files.map((f) => ({ name: f.name, program: f.program, stage_key: f.stage_key, need_me: f.need_me, can_send: f.can_send, letters_ready: f.letters_ready, letters_sent: f.letters_sent, response_due_at: f.response_due_at, sla_breached: f.sla_breached, program_status: f.program_status, round: f.round, rounds_cap: f.rounds_cap, otherKeys: Object.keys(f).filter((k) => !["card_id", "client_id", "name", "email", "stage_key", "stage_label", "updated_at", "entered_at", "need_me", "round", "bureaus", "letters_ready", "letters_sent", "case_count", "can_send", "program", "rounds_cap", "program_status", "authorization_ok", "address_ok", "response_due_at", "upsell_pending", "has_unconfirmed_parse", "sla_breached", "no_furnisher_address"].includes(k)).map((k) => `${k}=${JSON.stringify(f[k])}`) })),
    derived: {
      filesWithLettersSent: rc.files.filter((f) => (f.letters_sent || 0) > 0).length,
      filesWithResponseDue: rc.files.filter((f) => f.response_due_at).length,
      filesNeedMeTrue: rc.files.filter((f) => f.need_me).length,
      filesCanSend: rc.files.filter((f) => f.can_send).length,
    },
    exceptions: ex ? { ok: ex.ok, stalled: Array.isArray(ex.stalled) ? ex.stalled.length : ex.stalled, lowConfidenceParses: Array.isArray(ex.lowConfidenceParses) ? ex.lowConfidenceParses.length : ex.lowConfidenceParses } : null,
  };
}

async function oneLook(page, label, how) {
  const bag = { calls: [], bodies: {} };
  hookApis(page, bag);
  if (how === "reload") {
    await page.reload({ waitUntil: "domcontentloaded" });
  } else {
    await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector("#tab-repair", { timeout: 15000 });
  await page.waitForTimeout(2500);
  const beforeClick = await page.evaluate(READ).catch(() => null);
  const t0 = Date.now();
  await page.click("#tab-repair");
  const { trace, stuckNumberAtMs } = await traceUntilSettled(page, t0);
  const final = await page.evaluate(READ);
  const shot = await shots(page, label);
  // second read after the screenshot, to be sure nothing moved
  const finalAgain = await page.evaluate(READ);
  return {
    label, how, url: new URL(page.url()).pathname,
    beforeClick: beforeClick ? { line: beforeClick.line, head: beforeClick.headText } : null,
    stuckNumberAtMs, trace, final, finalAgainSame: JSON.stringify(finalAgain) === JSON.stringify(final),
    api: apiSummary(bag.bodies),
    apiCalls: bag.calls.map((c) => `${c.method} ${c.path} -> ${c.status}`),
    shots: shot,
  };
}

for (const n of [1, 2]) {
  const { browser, ctx } = await newCtx();
  const si = await signIn(ctx);
  out.loads.push({ load: n, signIn: { status: si.status, landed: si.landed } });
  if (si.status !== 200) { console.log(`load ${n}: sign-in failed with status ${si.status} — stopping`); await browser.close(); break; }
  const page = await ctx.newPage();
  out.loads.push({ load: n, ...(await oneLook(page, `load${n}-fresh`, "fresh")) });
  if (n === 2) out.loads.push({ load: "2b", ...(await oneLook(page, "load2b-reload", "reload")) });
  await browser.close();
}

writeFileSync(`${SHOTS}/review.json`, JSON.stringify(out, null, 2));

for (const x of out.loads) {
  if (x.signIn) { console.log(`\n### load ${x.load} sign-in: status ${x.signIn.status}, landed ${x.signIn.landed}`); continue; }
  console.log(`\n=== ${x.label} (${x.how}) url ${x.url}; Stuck tile got a number at ${x.stuckNumberAtMs} ms after the Repair click`);
  console.log(`before Repair click: line=${JSON.stringify(x.beforeClick?.line)} head=${JSON.stringify(x.beforeClick?.head)}`);
  console.log("trace from Repair click:");
  for (const t of x.trace) console.log(`   ${t.ms}ms line=${JSON.stringify(t.line)} tiles=${JSON.stringify(t.tiles)} head=${JSON.stringify(t.head)}`);
  console.log(`FINAL head: ${x.final.headText}`);
  console.log(`FINAL line: ${JSON.stringify(x.final.line)}`);
  console.log(`FINAL tiles: ${JSON.stringify(x.final.tiles)}; Stuck chips in rows: ${x.final.stuckChips}; pane: ${x.final.paneState}; unchanged after shot: ${x.finalAgainSame}`);
  console.log("rows:\n   " + x.final.rows.join("\n   "));
  console.log("API counts: " + JSON.stringify(x.api.counts) + " files=" + x.api.filesLength + " derived=" + JSON.stringify(x.api.derived) + " exceptions=" + JSON.stringify(x.api.exceptions));
  for (const f of x.api.perFile || []) console.log(`   ${f.name} | ${f.program} | ${f.stage_key} | need_me=${f.need_me} can_send=${f.can_send} ready=${f.letters_ready} sent=${f.letters_sent} due=${f.response_due_at} sla=${f.sla_breached} status=${f.program_status} ${f.otherKeys.join(" ")}`);
  console.log("repair API calls: " + x.apiCalls.filter((c) => /repair/.test(c)).join(", "));
  console.log("shots: " + x.shots.marked);
}
console.log("\nblocked non-GET:", out.blocked);
