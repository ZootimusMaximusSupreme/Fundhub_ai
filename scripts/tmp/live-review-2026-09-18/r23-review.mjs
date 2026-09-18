// Hole 23 reviewer — LOOK ONLY. Password sign-in on the real login page, then open #13's
// control panel twice on fresh pages, plus one control file whose credit report is a real
// (production) pull. Records the Scores tile, the permission blocker and the System Facts
// lines (after clicking the System Facts header, which only toggles the panel).
// Blocks every non-GET request except the one sign-in POST. Clicks nothing else.
// Draws red numbered boxes with a one-line legend each. Never prints a password, token or cookie.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const THIRTEEN = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const CONTROL = "e42c11e8-ec33-40b7-ac5a-99f733d18a3f"; // only file on live with production (non-simulated) credit reports
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-23/review";
mkdirSync(SHOTS, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) { console.log("STAFF_INITIAL_PASSWORD not set"); process.exit(1); }
const RUN = process.argv[2] || "run";
const out = { at: new Date().toISOString(), blocked: [], loads: [] };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 2200 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method(); const u = new URL(r.url());
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && u.hostname.endsWith("fundhub.ai") && u.pathname === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${u.host}${u.pathname}`); return route.abort();
});

// Sign in through the form (password button, never "Email me a link").
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.locator('input[type="email"], #email').first().fill("chris@fundhub.ai");
await page.locator('input[type="password"]').first().fill(pw);
const respP = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST", { timeout: 20000 });
const btns = page.locator("button");
for (let i = 0; i < await btns.count(); i++) {
  const t = (await btns.nth(i).innerText()).trim();
  if (/email me/i.test(t)) continue;
  if (/sign in|log in/i.test(t) && await btns.nth(i).isVisible()) { out.loginClicked = t; await btns.nth(i).click(); break; }
}
const lr = await respP.catch(() => null);
out.login = { status: lr ? lr.status() : null };
if (!lr || lr.status() !== 200) {
  writeFileSync(`${SHOTS}/r23-review-${RUN}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1);
}
await page.waitForTimeout(2000);
await page.close();

async function snapshot(pg) {
  return pg.evaluate(() => {
    const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
    const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== "hidden";
    const t = (sel) => { const e = document.querySelector(sel); return e ? { text: clean(e.innerText || e.textContent), visible: vis(e) } : null; };
    const scoresNum = document.querySelector("#ccp-scores");
    const tile = scoresNum ? scoresNum.closest(".rf-tile") : null;
    const lastPull = document.querySelector("#ccp-last-pull");
    const factsScores = document.querySelector("#ccp-facts-scores");
    const body = document.body.innerText;
    // every visible line that carries a score number or talks about a pull / bureau / permission
    const lines = body.split(/\n+/).map(clean).filter(Boolean);
    const interesting = lines.filter((l) => /\b(7\d\d|8\d\d|6\d\d)\b.*\b(EX|EQ|TU)\b|\b(EX|EQ|TU)\b.*\b\d{3}\b|pull|bureau|permission|consent|sample|simulat|credit report|fico/i.test(l));
    return {
      header: clean((document.querySelector("body").innerText.match(/Sim Thirteen-NoBook|Colin Schmidt/) || [""])[0]),
      scoresTile: tile ? { text: clean(tile.innerText), visible: vis(tile) } : null,
      scoresNum: t("#ccp-scores"),
      scoresSample: t("#ccp-scores-sample"),
      blockers: t("#ccp-cp-blockers"),
      lastPullRow: lastPull ? { text: clean(lastPull.closest(".fact-row")?.innerText), visible: vis(lastPull) } : null,
      factsScoresRow: factsScores ? { text: clean(factsScores.closest(".fact-row")?.innerText), visible: vis(factsScores) } : null,
      factsList: (() => { const e = document.querySelector(".facts-list"); return e ? { text: clean(e.innerText), visible: vis(e) } : null; })(),
      sampleWordsOnPage: lines.filter((l) => /sample|simulat|not a real/i.test(l)),
      interestingLines: interesting.slice(0, 60),
    };
  });
}

async function mark(pg, marks, legendLines) {
  // marks: [{sel, n}] — boxes drawn with position:fixed from the element's current rect
  return pg.evaluate(({ marks, legendLines }) => {
    const drawn = [];
    for (const m of marks) {
      const e = document.querySelector(m.sel);
      if (!e) { drawn.push({ n: m.n, sel: m.sel, drawn: false }); continue; }
      const r = e.getBoundingClientRect();
      const inView = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      const box = document.createElement("div");
      box.className = "r23-mark";
      box.style.cssText = `position:fixed;left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px;border:4px solid #e00;z-index:2147483646;pointer-events:none;box-sizing:border-box`;
      const n = document.createElement("div");
      n.className = "r23-mark";
      n.textContent = String(m.n);
      n.style.cssText = `position:fixed;left:${Math.max(0, r.left - 26)}px;top:${Math.max(0, r.top - 18)}px;width:28px;height:28px;border-radius:14px;background:#e00;color:#fff;font:bold 17px/28px sans-serif;text-align:center;z-index:2147483647;pointer-events:none`;
      document.body.append(box, n);
      drawn.push({ n: m.n, sel: m.sel, drawn: true, inView, top: Math.round(r.top), bottom: Math.round(r.bottom) });
    }
    const lg = document.createElement("div");
    lg.className = "r23-mark";
    lg.style.cssText = "position:fixed;left:0;right:0;bottom:0;padding:10px 16px;background:#fff;color:#000;border-top:4px solid #e00;font:bold 15px/1.5 sans-serif;z-index:2147483647;white-space:pre";
    lg.textContent = legendLines.join("\n");
    document.body.append(lg);
    return drawn;
  }, { marks, legendLines });
}
const unmark = (pg) => pg.evaluate(() => document.querySelectorAll(".r23-mark").forEach((e) => e.remove()));

async function look(label, id, nameRe) {
  const pg = await ctx.newPage();
  const api = [];
  pg.on("response", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(`${r.status()} ${r.request().method()} ${u.pathname}`); });
  const t0 = Date.now();
  await pg.goto(`${BASE}/app/client-control-panel.html?id=${id}`, { waitUntil: "domcontentloaded" });
  let nameShown = false, scoresHaveNumbers = false;
  try { await pg.getByText(nameRe).first().waitFor({ timeout: 30000 }); nameShown = true; } catch {}
  try {
    await pg.waitForFunction(() => /\d{3}/.test(document.querySelector("#ccp-scores")?.innerText || ""), null, { timeout: 25000 });
    scoresHaveNumbers = true;
  } catch {}
  await pg.waitForTimeout(3000); // let every box finish filling
  const before = await snapshot(pg);

  // Open System Facts: click its header button (it only toggles the panel).
  const tog = pg.locator("button.tog", { hasText: /system facts/i }).first();
  let factsToggled = false;
  if (await tog.count()) { await tog.scrollIntoViewIfNeeded().catch(() => {}); await tog.click(); factsToggled = true; await pg.waitForTimeout(800); }
  const after = await snapshot(pg);

  // Screenshots. One picture of the Scores tile + blocker, one of System Facts.
  const when = new Date().toISOString().slice(0, 16) + "Z";
  const shots = [];
  const who = /Thirteen/.test(String(nameRe)) ? "#13 Sim Thirteen-NoBook" : "control file (real production pull)";
  // Shot A: blocker (2) and scores tile (1)
  const tileSel = "#ccp-scores";
  await pg.evaluate(() => { const t = document.querySelector("#ccp-scores")?.closest(".rf-tile"); if (t) t.setAttribute("data-r23-tile", "1"); });
  const hasBlocker = await pg.locator("#ccp-cp-blockers .blocker-card").count();
  await pg.locator('[data-r23-tile="1"]').scrollIntoViewIfNeeded().catch(() => {});
  const marksA = [{ sel: '[data-r23-tile="1"]', n: 1 }];
  const legendA = [`1 = Scores tile: "${after.scoresTile?.text || "(not found)"}"`];
  if (hasBlocker) { marksA.push({ sel: "#ccp-cp-blockers", n: 2 }); legendA.push(`2 = Permission blocker: "${after.blockers?.text || ""}"`); }
  else legendA.push(`(no permission blocker card on this file: ${after.blockers ? '"' + after.blockers.text + '"' : "blocker box absent"})`);
  legendA.push(`${who} · ${label} · reviewer look ${when}`);
  const drawnA = await mark(pg, marksA, legendA);
  const shotA = `${SHOTS}/r23-${RUN}-${label}-A-scores-blocker.png`;
  await pg.screenshot({ path: shotA }); shots.push({ path: shotA, drawn: drawnA });
  await unmark(pg);
  // Shot B: System Facts lines
  await pg.evaluate(() => {
    document.querySelector("#ccp-last-pull")?.closest(".fact-row")?.setAttribute("data-r23-lp", "1");
    document.querySelector("#ccp-facts-scores")?.closest(".fact-row")?.setAttribute("data-r23-fs", "1");
  });
  await pg.locator('[data-r23-lp="1"]').scrollIntoViewIfNeeded().catch(() => {});
  const drawnB = await mark(pg, [{ sel: '[data-r23-lp="1"]', n: 3 }, { sel: '[data-r23-fs="1"]', n: 4 }], [
    `3 = System Facts, Last Credit Pull: "${after.lastPullRow?.text || "(not found)"}"`,
    `4 = System Facts, Scores: "${after.factsScoresRow?.text || "(not found)"}"`,
    `${who} · ${label} · System Facts opened by its header (toggle only) · reviewer look ${when}`,
  ]);
  const shotB = `${SHOTS}/r23-${RUN}-${label}-B-system-facts.png`;
  await pg.screenshot({ path: shotB }); shots.push({ path: shotB, drawn: drawnB });
  await unmark(pg);

  out.loads.push({ label, id, ms: Date.now() - t0, nameShown, scoresHaveNumbers, factsToggled, before, after, shots, api: [...new Set(api)] });
  await pg.close();
}

await look("thirteen-load1", THIRTEEN, /Sim Thirteen-NoBook/);
await look("thirteen-load2", THIRTEEN, /Sim Thirteen-NoBook/);
await look("control-realpull", CONTROL, /Colin Schmidt/);

writeFileSync(`${SHOTS}/r23-review-${RUN}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
