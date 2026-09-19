// Hole 21 REVIEWER (not the fixer). Look only, on live.
// Is #13's no-book text (and email) on #13's thread in the staff Messaging view?
// - Browser: headless chromium, signs in through the real password form. Every request
//   that is not a GET is aborted, except the one sign-in POST. Nothing is sent.
// - Database: BEGIN READ ONLY, no SET — only to learn the message ids to look for.
// - Never prints passwords, tokens, cookies, full phone numbers or full email addresses.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r21-messaging.mjs <tag>
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const T13 = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TAG = process.argv[2] || "pass";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-21/review";
mkdirSync(SHOTS, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG };
const scrub = (s) => String(s ?? "")
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `${m.split("@")[0].slice(0, 6)}***@${m.split("@")[1]}`)
  .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => `…${m.replace(/\D/g, "").slice(-4)}`);

// ---- ids to look for (read only) ----
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let ids;
try {
  await c.query("BEGIN READ ONLY");
  ids = (await c.query(
    `select id, template_key, channel, conversation_id from messages where client_id=$1 order by created_at`, [T13])).rows;
  await c.query("ROLLBACK");
} finally { await c.end(); }
out.dbMessages = ids.map((r) => ({ key: r.template_key, channel: r.channel, hasConversation: Boolean(r.conversation_id) }));

// ---- browser ----
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const blocked = [];
let signInPosts = 0;
await ctx.route("**/*", async (route) => {
  const r = route.request();
  const u = new URL(r.url());
  if (r.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login" && signInPosts === 0) { signInPosts++; return route.continue(); }
  if (r.method() !== "GET") { blocked.push(`${r.method()} ${u.hostname}${u.pathname}`); return route.abort(); }
  return route.continue();
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 30_000 }).then((r) => { out.loginStatus = r.status(); }),
  page.click("#go"),
]);
await page.waitForTimeout(2500);
out.signedIn = (await ctx.cookies(BASE)).some((ck) => ck.name === "fundhub_session");

async function look(channel) {
  await page.goto(`${BASE}/app/messaging.html?client_id=${T13}&channel=${channel}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(() => document.querySelectorAll("#thread .msg").length > 0, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const want = ids.filter((r) => r.channel === channel);
  const res = await page.evaluate((wantIds) => {
    const msgs = [...document.querySelectorAll("#thread .msg")];
    return {
      url: location.pathname + location.search.replace(/client_id=[^&]+/, "client_id=#13"),
      head: document.querySelector(".thread-head")?.innerText.replace(/\s+/g, " ").trim().slice(0, 160) ?? null,
      count: msgs.length,
      found: wantIds.map((w) => {
        const el = document.querySelector(`#thread .msg[data-id="${w.id}"]`);
        return { key: w.key, onScreen: Boolean(el), text: el ? el.innerText.replace(/\s+/g, " ").trim().slice(0, 220) : null };
      }),
      empty: document.getElementById("threadEmpty")?.offsetParent ? document.getElementById("threadEmpty").innerText.trim() : null,
    };
  }, want.map((w) => ({ id: w.id, key: w.template_key })));
  res.head = scrub(res.head);
  res.found = res.found.map((f) => ({ ...f, text: scrub(f.text) }));

  // mark up: red box on each no-book bubble, numbered, with a legend
  const nob = want.filter((w) => /NOBOOK/.test(w.template_key));
  const marks = await page.evaluate((list) => {
    const made = [];
    list.forEach((w, i) => {
      const el = document.querySelector(`#thread .msg[data-id="${w.id}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      Object.assign(box.style, { position: "absolute", left: `${r.left + scrollX - 6}px`, top: `${r.top + scrollY - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, border: "4px solid #e00", zIndex: 2147483646, pointerEvents: "none" });
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      Object.assign(tag.style, { position: "absolute", left: `${r.left + scrollX - 34}px`, top: `${r.top + scrollY - 6}px`, background: "#e00", color: "#fff", font: "bold 16px sans-serif", padding: "2px 8px", zIndex: 2147483647 });
      document.body.append(box, tag);
      made.push(`${i + 1} = ${w.key}`);
    });
    const lg = document.createElement("div");
    lg.innerHTML = `<b>Hole 21 review (${new Date().toISOString().slice(0, 16)}Z)</b><br>` +
      (made.length ? made.map((m) => `${m}: the owed no-book message on #13's thread`).join("<br>") : "No no-book message found on this thread");
    Object.assign(lg.style, { position: "fixed", right: "16px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "520px" });
    lg.dataset.r21 = "1"; document.body.append(lg);
    return made;
  }, nob.map((w) => ({ id: w.id, key: w.template_key })));
  res.marks = marks;
  // mask full phone numbers and email addresses on screen before the picture is taken
  await page.evaluate(() => {
    const EM = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const PH = /\+?\d[\d\s().-]{8,}\d/g;
    const m = (s) => s.replace(EM, (x) => `${x.slice(0, 6)}***@${x.split("@")[1]}`).replace(PH, (x) => `…${x.replace(/\D/g, "").slice(-4)}`);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.parentElement && n.parentElement.closest("[data-r21]")) continue; const v = n.nodeValue; const nv = m(v); if (nv !== v) n.nodeValue = nv; }
    document.querySelectorAll("input,textarea").forEach((el) => {
      if (el.value) el.value = m(el.value);
      if (el.placeholder) el.placeholder = m(el.placeholder);
    });
  });
  const shot = `${SHOTS}/r21-${TAG}-${channel}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  res.shot = shot.replace("/Users/chrisstanbridge/Developer/fundhub-platform/", "");
  return res;
}

out.sms = await look("sms");
out.email = await look("email");
out.blocked = blocked;
out.signInPosts = signInPosts;
await browser.close();
console.log(JSON.stringify(out, null, 2));
