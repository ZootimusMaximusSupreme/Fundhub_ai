// Hole N16 — Staff Messaging shows emails as raw HTML; side panel says
// "Last activity: never ago". LOOK ONLY.
// Signs in as the owner through the real login page, opens #13's email thread
// three ways (the pipeline-style deep link twice, by clicking it in the All
// tab, and by ?conversation_id=), and reads what the thread, the list and the
// side panel say. Blocks every non-GET request except the one sign-in POST.
// Never prints a password, token, cookie, email address or phone number.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N16-verify.mjs [tag] [local-page]
// With [local-page], every load of /app/messaging.html is answered with that
// local file instead — a pre-ship look at the fix against live data and APIs.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const THIRTEEN = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const EMAIL_CONV = "64f0942c-52aa-42c2-b3bd-14f81541546c"; // #13's email thread (read-only lookup)
const TAG = process.argv[2] || "verify";
const LOCAL_PAGE = process.argv[3] || "";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N16";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, local_page: !!LOCAL_PAGE, no_send: true, loads: [], blocked: [] };
const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");

const mask = (s) => String(s || "")
  .replace(/[A-Za-z0-9._%+*-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
  .replace(/\+?\d[\d\s().-]{8,}\d/g, "<phone>");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  const path = new URL(req.url()).pathname;
  if (LOCAL_PAGE && m === "GET" && path === "/app/messaging.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_PAGE, "utf8") });
  }
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (m === "POST" && path === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${path}`);
  return route.abort();
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", password);
const loginResp = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
const lr = await loginResp;
out.login = { status: lr.status() };
await page.waitForTimeout(2000);
if (lr.status() !== 200) { console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1); }

async function readScreen(pg) {
  const s = await pg.evaluate(() => {
    const HTML_RE = /<\s*(html|body|table|p|div|br|meta|head|!doctype)\b/i;
    const thread = document.getElementById("thread");
    const bubbles = Array.from(thread.querySelectorAll(".bubble"));
    const ctx = document.getElementById("ctxRows");
    const list = document.getElementById("convoList");
    return {
      thSub: document.getElementById("thSub").textContent,
      bubbles: bubbles.length,
      bubble_texts_head: bubbles.map((b) => b.innerText.replace(/\s+/g, " ").slice(0, 200)),
      bubble_lines: bubbles.map((b) => b.innerText.split("\n").length),
      raw_tags_in_thread_text: HTML_RE.test(thread.innerText),
      scripts_in_thread: thread.querySelectorAll("script,iframe,object,embed,style,img").length,
      ctx_rows: Array.from(ctx.querySelectorAll(".ctx-row")).map((r) => r.innerText.replace(/\s+/g, " ").trim()),
      raw_tags_in_list_text: HTML_RE.test(list.innerText),
      list_prev_13: Array.from(list.querySelectorAll(".convo")).filter((c) => /Thirteen/.test(c.innerText)).map((c) => (c.querySelector(".cv-prev") || {}).innerText),
    };
  });
  s.bubble_texts_head = s.bubble_texts_head.map(mask);
  s.ctx_rows = s.ctx_rows.map(mask);
  s.list_prev_13 = s.list_prev_13.map((t) => mask(String(t || "").slice(0, 120)));
  return s;
}

// CLAUDE.md §8: every proof shot is marked — numbered red boxes on the exact
// element and a legend on the image. Drawn into the page just before the shot,
// from each element's real position, so a box can never point at empty space.
async function markAndShoot(pg, shot, marks) {
  await pg.evaluate((marks) => {
    const legend = [];
    marks.forEach((m, i) => {
      const els = Array.from(document.querySelectorAll(m.sel)).filter((e) => {
        const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      });
      const el = m.last ? els[els.length - 1] : els[0];
      if (!el) { legend.push(`${i + 1}. (not on screen) ${m.label}`); return; }
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:${r.left - 3}px;top:${Math.max(r.top - 3, 0)}px;width:${r.width + 6}px;height:${Math.min(r.height + 6, innerHeight - Math.max(r.top, 0))}px;border:3px solid #ff2828;z-index:99998;pointer-events:none;`;
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = `position:fixed;left:${Math.max(r.left - 16, 0)}px;top:${Math.max(r.top - 16, 0)}px;background:#ff2828;color:#fff;font:700 16px Arial;padding:2px 7px;border-radius:12px;z-index:99999;`;
      document.body.append(box, tag);
      legend.push(`${i + 1}. ${m.label}`);
    });
    const lg = document.createElement("div");
    lg.style.cssText = "position:fixed;left:240px;bottom:34px;max-width:880px;background:rgba(0,0,0,.85);color:#fff;font:600 15px Arial;padding:10px 14px;border:2px solid #ff2828;z-index:99999;white-space:pre-line;";
    lg.textContent = legend.join("\n");
    document.body.append(lg);
  }, marks);
  await pg.screenshot({ path: shot });
}
const MARKS = [
  { sel: "#thread .bubble", last: true, label: "The email in the thread: raw HTML tags, or readable words?" },
  { sel: "#ctxRows .ctx-row", label: "Side panel 'Last activity': a real time, or 'never ago'?" },
];

// ── Loads 1–2: the deep link (?client_id=&channel=email), as the hole-21 reviewer saw it.
for (const n of [1, 2]) {
  const pg = n === 1 ? page : await ctx.newPage();
  await pg.goto(`${BASE}/app/messaging.html?client_id=${THIRTEEN}&channel=email`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(7000);
  const s = await readScreen(pg);
  const shot = `${SHOTS}/${TAG}-deeplink-load${n}.png`;
  await markAndShoot(pg, shot, MARKS);
  out.loads.push({ how: "deep link ?client_id=&channel=email", n, ...s, shot });
}

// ── Load 3: the All tab, click #13's email row.
{
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app/messaging.html`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(5000);
  await pg.click('.ctab[data-filter="all"]');
  await pg.waitForTimeout(4000);
  const rows = pg.locator(".convo", { hasText: "Thirteen" });
  const count = await rows.count();
  let clicked = null;
  for (let i = 0; i < count; i++) {
    const t = await rows.nth(i).innerText();
    if (/EMAIL/.test(t)) { await rows.nth(i).click(); clicked = i; break; }
  }
  await pg.waitForTimeout(4000);
  const s = await readScreen(pg);
  const shot = `${SHOTS}/${TAG}-alltab-click.png`;
  await markAndShoot(pg, shot, [...MARKS, { sel: ".convo.active .cv-prev", label: "The list preview for this email: raw HTML, or its words?" }]);
  out.loads.push({ how: "All tab, click #13 EMAIL row", rows_for_13: count, clicked, ...s, shot });
}

// ── Load 4: ?conversation_id=<#13 email thread>. The default tab is Needs reply,
// which #13's thread is not on, so this is the "row with no time on it" path.
{
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app/messaging.html?conversation_id=${EMAIL_CONV}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(7000);
  const s = await readScreen(pg);
  const shot = `${SHOTS}/${TAG}-conversation-id.png`;
  await markAndShoot(pg, shot, MARKS);
  out.loads.push({ how: "?conversation_id= (#13 email thread)", ...s, shot });
}

for (const l of out.loads) {
  l.bad_last_activity = l.ctx_rows.some((r) => /^Last activity .*\b(never|now|[A-Z][a-z]{2} \d+) ago$/.test(r) || /never ago/.test(r));
}
out.summary = {
  any_raw_html_in_thread: out.loads.some((l) => l.raw_tags_in_thread_text),
  any_raw_html_in_list: out.loads.some((l) => l.raw_tags_in_list_text),
  any_active_markup_in_thread: out.loads.some((l) => l.scripts_in_thread > 0),
  any_bad_last_activity: out.loads.some((l) => l.bad_last_activity),
  last_activity: out.loads.map((l) => (l.ctx_rows.find((r) => /^Last activity/.test(r)) || "")),
};

writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
