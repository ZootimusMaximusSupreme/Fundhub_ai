// Review of hole 7 — "#9 says 'No step applies' while ID is unread and jobs are still open". LOOK ONLY.
// Independent re-try on live by the reviewer (not the fixer).
//
// Two fresh loads, each in a brand-new headless browser with a real password sign-in:
//   A) /app/client-control-panel.html?id=<#9> — trace "Do this next" from page load until the name
//      shows plus 4 s, record the line, the line under it, the Active blockers, and the API it read.
//   B) /app/pipeline.html → click Fulfillment (view switch only) → the Sim Nine-Repair row: its
//      next-step button text, the line under the name, its blockers, and the API it read.
// Blocks every non-GET except the one sign-in POST. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r7-review.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-7/review";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const NO_STEP = /no step applies/i;
const out = { at: new Date().toISOString(), base: BASE, client: ID, no_send: true, loads: [], blocked: [] };

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
  const landed = new URL(page.url()).pathname;
  await page.close();
  return { status, landed };
}

function hookApis(page, bag, wanted) {
  page.on("response", async (res) => {
    const u = new URL(res.url());
    if (!u.pathname.startsWith("/api/")) return;
    bag.calls.push(`${res.request().method()} ${u.pathname}${u.search} -> ${res.status()}`);
    if (wanted(u)) { try { bag.bodies.push({ path: u.pathname + u.search, body: await res.json() }); } catch (e) { bag.bodies.push({ path: u.pathname + u.search, parseError: String(e).slice(0, 80) }); } }
  });
}

// ---------- marking (red numbered boxes + legend), then a clipped full-page shot ----------
async function markAndShoot(page, items, file) {
  const clip = await page.evaluate((items) => {
    const layer = document.createElement("div");
    layer.id = "__r7marks";
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647";
    const legend = []; let top = Infinity, bottom = 0, right = 0;
    for (const it of items) {
      const el = document.querySelector(it.sel);
      if (!el || el.getBoundingClientRect().height === 0) { legend.push(`${it.n} = ${it.label} — not on the page`); continue; }
      const r = el.getBoundingClientRect();
      const x = r.left + scrollX, y = r.top + scrollY;
      const b = document.createElement("div");
      b.style.cssText = `position:absolute;left:${x - 5}px;top:${y - 4}px;width:${r.width + 10}px;height:${r.height + 8}px;border:3px solid #e00;border-radius:4px;box-sizing:border-box`;
      const tag = document.createElement("div");
      tag.textContent = it.n;
      tag.style.cssText = `position:absolute;left:${Math.max(0, x - 30)}px;top:${y - 10}px;background:#e00;color:#fff;font:700 14px/22px sans-serif;width:22px;text-align:center;border-radius:11px`;
      layer.append(b, tag);
      legend.push(`${it.n} = ${it.label}: "${(el.innerText || "").trim().replace(/\s*\n\s*/g, " / ")}"`);
      top = Math.min(top, y - 14); bottom = Math.max(bottom, y + r.height + 10); right = Math.max(right, x + r.width);
    }
    const lg = document.createElement("div");
    const lgTop = bottom + 12;
    lg.style.cssText = `position:absolute;left:240px;top:${lgTop}px;width:900px;box-sizing:border-box;background:#fff;color:#111;border:2px solid #e00;font:15px/22px sans-serif;padding:8px 12px`;
    lg.innerHTML = legend.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
    layer.append(lg);
    document.body.append(layer);
    const lgR = lg.getBoundingClientRect();
    bottom = Math.max(bottom, lgR.bottom + scrollY + 10);
    return { x: 0, y: Math.max(0, top - 60), width: document.documentElement.clientWidth, height: Math.min(4000, bottom - Math.max(0, top - 60) + 20), legend };
  }, items);
  await page.screenshot({ path: file, fullPage: true, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });
  await page.evaluate(() => document.getElementById("__r7marks")?.remove()).catch(() => {});
  return { file, legend: clip.legend };
}

// ---------- A) control panel ----------
const READ_CCP = () => {
  const t = (s) => document.querySelector(s)?.innerText.trim() ?? null;
  const cards = Array.from(document.querySelectorAll("#ccp-cp-blockers .blocker-card"));
  return {
    nameShown: document.body.innerText.includes("Sim Nine-Repair"),
    next: t("#ccp-next-action"),
    why: t("#ccp-cp-why"),
    note: t("#ccp-cp-note"),
    blockerCount: t("#ccp-cp-blocker-count"),
    blockers: cards.map((c) => ({ reason: c.querySelector(".blocker-reason")?.innerText.trim(), detail: c.querySelector(".blocker-detail")?.innerText.trim() })),
    noStepAnywhere: /no step applies/i.test(document.body.innerText),
  };
};

async function lookCcp(ctx, n) {
  const page = await ctx.newPage();
  const bag = { calls: [], bodies: [] };
  hookApis(page, bag, (u) => u.pathname === "/api/dashboard/client");
  const t0 = Date.now();
  await page.goto(`${BASE}/app/client-control-panel.html?id=${ID}`, { waitUntil: "commit" });
  const trace = []; let last = ""; let nameAt = null; let noStepAfterName = false;
  while (Date.now() - t0 < 30000) {
    const s = await page.evaluate(READ_CCP).catch(() => null);
    if (s) {
      const k = JSON.stringify({ nm: s.nameShown, next: s.next, why: s.why, b0: s.blockers[0]?.reason, bc: s.blockerCount, ns: s.noStepAnywhere });
      if (k !== last) { last = k; trace.push({ ms: Date.now() - t0, name: s.nameShown, next: s.next, why: s.why, firstBlocker: s.blockers[0]?.reason ?? null, count: s.blockerCount, noStep: s.noStepAnywhere }); }
      if (s.nameShown && nameAt === null) nameAt = Date.now() - t0;
      if (s.nameShown && s.noStepAnywhere) noStepAfterName = true;
      if (nameAt !== null && Date.now() - t0 > nameAt + 4000) break;
    }
    await page.waitForTimeout(50);
  }
  const final = await page.evaluate(READ_CCP);
  // mark: find the first blocker card whose words equal the next-step line
  await page.evaluate((next) => {
    const cards = Array.from(document.querySelectorAll("#ccp-cp-blockers .blocker-card"));
    cards[0]?.setAttribute("data-r7", "b1");
    const m = cards.find((c) => c.querySelector(".blocker-reason")?.innerText.trim() === next);
    m?.setAttribute("data-r7m", "match");
  }, final.next);
  await page.evaluate(() => document.querySelector(".na-step")?.scrollIntoView({ block: "start" }));
  const shot = await markAndShoot(page, [
    { sel: "#ccp-next-action", n: 1, label: "Do this next" },
    { sel: "#ccp-cp-why", n: 2, label: "Line under it" },
    { sel: "[data-r7=b1] .blocker-reason", n: 3, label: "First Active blocker" },
    { sel: "[data-r7m=match] .blocker-reason", n: 4, label: "Blocker with the same words as 1" },
  ], `${SHOTS}/load${n}-control-panel-marked.png`);
  const api = bag.bodies.find((b) => b.path.startsWith("/api/dashboard/client?"))?.body;
  const openTasks = (api?.tasks || []).filter((t) => !t.completed_at);
  const na = api?.next_action ?? null;
  const naTask = na ? openTasks.find((t) => t.title === na.label) : null;
  await page.close();
  return {
    screen: "control-panel", nameAtMs: nameAt, noStepAfterName, trace,
    final: { next: final.next, why: final.why, note: final.note, blockerCount: final.blockerCount, first3: final.blockers.slice(0, 3), all: final.blockers.map((b) => b.reason) },
    api: {
      path: bag.bodies.map((b) => b.path),
      next_action: na, next_action_degraded: api?.next_action_degraded,
      active_blockers: (api?.active_blockers || []).map((b) => `${b.label} [${b.source}]`),
      openTaskCount: openTasks.length,
      nextActionIsOpenTask: naTask ? { id: naTask.id, created_at: naTask.created_at } : null,
      nextActionOnBlockerList: na ? (api?.active_blockers || []).findIndex((b) => b.label === na.label) : -1,
      newestOpenTasks: openTasks.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 4).map((t) => `${t.created_at} ${t.title}`),
    },
    apiCalls: bag.calls,
    shot,
  };
}

// ---------- B) pipeline → Fulfillment ----------
const READ_ROW = () => {
  const row = Array.from(document.querySelectorAll(".fh-lens-row")).find((r) => r.querySelector(".lr-name")?.innerText.trim() === "Sim Nine-Repair");
  if (!row) return { found: false, noStepAnywhere: /no step applies/i.test(document.body.innerText) };
  return {
    found: true,
    name: row.querySelector(".lr-name")?.innerText.trim(),
    why: row.querySelector(".lr-why")?.innerText.trim() ?? null,
    button: row.querySelector("button.fh-chip")?.innerText.trim() ?? null,
    buttons: Array.from(row.querySelectorAll("button")).map((b) => b.innerText.trim()),
    blockers: Array.from(row.querySelectorAll(".lr-blocker")).map((b) => b.innerText.trim()),
    rowNoStep: /no step applies/i.test(row.innerText),
    noStepAnywhere: /no step applies/i.test(document.body.innerText),
    fulfillmentPressed: document.getElementById("lensFulfillment")?.getAttribute("aria-pressed") ?? document.getElementById("lensFulfillment")?.className ?? null,
  };
};

async function lookPipe(ctx, n) {
  const page = await ctx.newPage();
  const bag = { calls: [], bodies: [] };
  hookApis(page, bag, (u) => u.pathname === "/api/dashboard/clients" && u.searchParams.get("fulfillment") === "1");
  await page.goto(`${BASE}/app/pipeline.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#lensFulfillment", { timeout: 20000 });
  await page.waitForTimeout(1500);
  const urlBefore = page.url();
  const t0 = Date.now();
  await page.click("#lensFulfillment");
  const trace = []; let last = ""; let rowAt = null; let noStepSeen = false;
  while (Date.now() - t0 < 30000) {
    const s = await page.evaluate(READ_ROW).catch(() => null);
    if (s) {
      const k = JSON.stringify({ f: s.found, b: s.button, w: s.why, b0: s.blockers?.[0], ns: s.noStepAnywhere });
      if (k !== last) { last = k; trace.push({ ms: Date.now() - t0, found: s.found, button: s.button ?? null, why: s.why ?? null, firstBlocker: s.blockers?.[0] ?? null, rowNoStep: s.rowNoStep ?? null }); }
      if (s.found && s.rowNoStep) noStepSeen = true;
      if (s.found && rowAt === null) rowAt = Date.now() - t0;
      if (rowAt !== null && Date.now() - t0 > rowAt + 4000) break;
    }
    await page.waitForTimeout(50);
  }
  const final = await page.evaluate(READ_ROW);
  await page.evaluate((btn) => {
    const row = Array.from(document.querySelectorAll(".fh-lens-row")).find((r) => r.querySelector(".lr-name")?.innerText.trim() === "Sim Nine-Repair");
    if (!row) return;
    row.setAttribute("data-r7", "row");
    const bl = Array.from(row.querySelectorAll(".lr-blocker"));
    bl[0]?.setAttribute("data-r7", "rb1");
    bl.find((b) => b.innerText.trim() === btn)?.setAttribute("data-r7m", "rmatch");
    row.scrollIntoView({ block: "center" });
  }, final.button);
  await page.waitForTimeout(300);
  const shot = await markAndShoot(page, [
    { sel: "[data-r7=row] button.fh-chip", n: 1, label: "Next-step button on the Sim Nine-Repair row" },
    { sel: "[data-r7=row] .lr-why", n: 2, label: "Line under the name" },
    { sel: "[data-r7=rb1]", n: 3, label: "First blocker on the row" },
    { sel: "[data-r7m=rmatch]", n: 4, label: "Blocker with the same words as 1" },
  ], `${SHOTS}/load${n}-fulfillment-marked.png`);
  const api = bag.bodies.find((b) => b.path.includes("fulfillment=1"))?.body;
  const rowApi = (api?.clients || []).find((c) => c.id === ID) ?? null;
  const urlAfter = page.url();
  await page.close();
  return {
    screen: "pipeline-fulfillment", urlBefore, urlAfter, rowAtMs: rowAt, noStepSeen, trace,
    final,
    api: rowApi ? { next_action: rowApi.next_action, next_action_degraded: rowApi.next_action_degraded, task_count: rowApi.task_count, blockerOrder: (rowApi.active_blockers || []).map((b) => b.label), nextOnBlockerList: (rowApi.active_blockers || []).findIndex((b) => b.label === rowApi.next_action?.label) } : null,
    apiCalls: bag.calls,
    shot,
  };
}

for (const n of [1, 2]) {
  const { browser, ctx } = await newCtx();
  const si = await signIn(ctx);
  const load = { load: n, signIn: si };
  out.loads.push(load);
  if (si.status !== 200) { console.log(`load ${n}: sign-in failed with status ${si.status} — stopping`); await browser.close(); break; }
  load.ccp = await lookCcp(ctx, n);
  load.pipe = await lookPipe(ctx, n);
  await browser.close();
}
writeFileSync(`${SHOTS}/review.json`, JSON.stringify(out, null, 2));

for (const L of out.loads) {
  console.log(`\n######## LOAD ${L.load} — sign-in status ${L.signIn.status}, landed ${L.signIn.landed}`);
  if (!L.ccp) continue;
  const c = L.ccp;
  console.log(`[control panel] name shown at ${c.nameAtMs} ms; "No step applies" seen after name: ${c.noStepAfterName}`);
  for (const t of c.trace) console.log(`   ${t.ms}ms name=${t.name} next=${JSON.stringify(t.next)} why=${JSON.stringify(t.why)} first=${JSON.stringify(t.firstBlocker)} count=${t.count} noStep=${t.noStep}`);
  console.log(`   FINAL Do this next: ${JSON.stringify(c.final.next)}`);
  console.log(`   FINAL under it:     ${JSON.stringify(c.final.why)}  note=${JSON.stringify(c.final.note)}`);
  console.log(`   FINAL blockers (${c.final.blockerCount}) first 3: ${c.final.first3.map((b) => `${b.reason} (${b.detail})`).join(" || ")}`);
  console.log(`   API ${c.api.path.join(", ")}: next_action=${JSON.stringify(c.api.next_action)} degraded=${c.api.next_action_degraded}`);
  console.log(`   API next_action is open task: ${JSON.stringify(c.api.nextActionIsOpenTask)}; index on API blocker list: ${c.api.nextActionOnBlockerList}; open tasks: ${c.api.openTaskCount}`);
  console.log(`   API newest open tasks: ${c.api.newestOpenTasks.join(" || ")}`);
  console.log(`   shot ${c.shot.file}\n   legend: ${c.shot.legend.join(" | ")}`);
  const p = L.pipe;
  console.log(`[fulfillment] url before ${p.urlBefore} after ${p.urlAfter}; row shown at ${p.rowAtMs} ms after the click; "No step applies" on the row: ${p.noStepSeen}`);
  for (const t of p.trace) console.log(`   ${t.ms}ms found=${t.found} button=${JSON.stringify(t.button)} why=${JSON.stringify(t.why)} first=${JSON.stringify(t.firstBlocker)}`);
  console.log(`   FINAL button: ${JSON.stringify(p.final.button)}; all buttons on row: ${JSON.stringify(p.final.buttons)}`);
  console.log(`   FINAL why: ${JSON.stringify(p.final.why)}`);
  console.log(`   FINAL first 3 blockers: ${p.final.blockers.slice(0, 3).join(" || ")} (of ${p.final.blockers.length})`);
  console.log(`   API row: ${JSON.stringify(p.api?.next_action)} degraded=${p.api?.next_action_degraded} task_count=${p.api?.task_count} next on blocker list at index ${p.api?.nextOnBlockerList}`);
  console.log(`   shot ${p.shot.file}\n   legend: ${p.shot.legend.join(" | ")}`);
}
console.log("\nblocked non-GET:", out.blocked);
