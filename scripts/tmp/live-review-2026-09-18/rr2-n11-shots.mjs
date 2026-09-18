// rr2-n11 reviewer screenshots. Look only.
// - Renders the masked stored/delivered email HTML (before on #13, after on the two
//   review sims) and draws numbered red boxes + legend.
// - Opens the live unsubscribe page from sim A's link (GET only; the button is NOT pressed).
// - Signs in as staff (the one allowed POST) and opens sim A / sim B email threads.
// Every non-GET request is aborted except exactly one POST /api/auth/login.
import { chromium } from "playwright";
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
const S = "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N11/review";
const A = "0a9b415b-e68b-4cd4-9148-7c91f41bdb08", B = "1591fd9d-79c7-483a-879b-982e7508e865";
const MSG_A = "119378a0-d35d-41d4-a55b-4ad227b6f365", MSG_B = "e265df84-7b36-4fd9-b28a-fa6b3348ea35";
const log = (...a) => console.log(...a);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN READ ONLY");
const bodyA = (await c.query(`SELECT rendered_body FROM messages WHERE id=$1`, [MSG_A])).rows[0].rendered_body;
await c.query("ROLLBACK"); await c.end();
const linkA = bodyA.match(/href="(https:\/\/fundhub\.ai\/unsubscribe\.html\?[^"]+)"/)[1].replace(/&amp;/g, "&");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const blocked = []; let loginPosts = 0;
await ctx.route("**/*", (route) => {
  const r = route.request(); const u = new URL(r.url());
  if (r.method() === "POST" && u.hostname === "fundhub.ai" && u.pathname === "/api/auth/login" && loginPosts === 0) { loginPosts++; return route.continue(); }
  if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) { blocked.push(`${r.method()} ${u.hostname}${u.pathname}`); return route.abort(); }
  return route.continue();
});
const page = await ctx.newPage();

async function mark(items, title) {
  return page.evaluate(({ items, title }) => {
    const made = [];
    for (const it of items) {
      let el = null;
      if (it.text1) el = [...document.querySelectorAll(it.tag || "*")].filter((e) => e.textContent.includes(it.text1))[0] || null;
      else if (it.sel) el = document.querySelectorAll(it.sel)[it.idx || 0] || null;
      if (!el) { made.push(`${it.n}: NOT FOUND — ${it.text}`); continue; }
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      Object.assign(box.style, { position: "absolute", left: `${r.left + scrollX - 6}px`, top: `${r.top + scrollY - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, border: "4px solid #e00", zIndex: 2147483646, pointerEvents: "none" });
      const tag = document.createElement("div"); tag.textContent = String(it.n);
      Object.assign(tag.style, { position: "absolute", left: `${Math.max(0, r.left + scrollX - 36)}px`, top: `${r.top + scrollY - 6}px`, background: "#e00", color: "#fff", font: "bold 16px sans-serif", padding: "2px 8px", zIndex: 2147483647 });
      document.body.append(box, tag);
      made.push(`${it.n}: ${it.text}`);
    }
    const lg = document.createElement("div");
    lg.innerHTML = `<b>${title}</b><br>` + made.join("<br>");
    Object.assign(lg.style, { position: "fixed", left: "16px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "640px" });
    document.body.append(lg);
    return made;
  }, { items, title });
}

async function renderEmail(file, shot, title, items) {
  await page.setContent(readFileSync(file, "utf8"), { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(800);
  const made = await mark(items, title);
  await page.screenshot({ path: `${OUT}/${shot}` });
  log(shot, JSON.stringify(made));
}

await renderEmail(`${S}/rr2-n11-before-13.html`, "rr2-01-before-13-nobook01-stored.png",
  "N11 review — BEFORE: #13 EMAIL-NOBOOK-01, stored copy 2026-09-18 14:54 UTC (pre-fix)",
  [{ tag: "p", text1: "fundhub.ai • Funding Intelligence", n: 1, text: "template tagline line: nothing under it — {{unsubscribe}} was blanked" }]);

for (const [k, when] of [["a", "19:58 UTC"], ["b", "20:05 UTC"]]) {
  const delivered = `${S}/rr2-n11-${k}-delivered.html`;
  const f = existsSync(delivered) ? delivered : `${S}/rr2-n11-stored-${k}.html`;
  const src = existsSync(delivered) ? "delivered copy read from the sim Gmail inbox" : "stored copy (messages.rendered_body)";
  await renderEmail(f, `rr2-0${k === "a" ? 2 : 3}-after-sim${k}-welcome.png`,
    `N11 review — AFTER (look ${k === "a" ? 1 : 2}): review sim ${k.toUpperCase()} EMAIL-S00-WELCOME queued ${when}, ${src}`,
    [{ tag: "p", text1: "fundhub.ai • Funding Intelligence", n: 1, text: "template tagline line now carries the client's own signed 'Unsubscribe' link (was blank before the fix)" },
     { sel: 'a[href*="unsubscribe.html"]', idx: 1, n: 2, text: "sender's own footer Unsubscribe pill still there (next path unchanged)" }]);
}

await page.goto(linkA, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);
const unsubText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400);
log("unsubscribe page text:", unsubText);
await mark([{ sel: "h1, h2", n: 1, text: "live page opens from the link in sim A's email" },
            { sel: "button", n: 2, text: "confirm button — NOT pressed; nobody was unsubscribed" }],
  "N11 review — live https://fundhub.ai/unsubscribe.html opened from sim A's email link (GET only)");
await page.screenshot({ path: `${OUT}/rr2-04-live-unsubscribe-page-from-sim-a.png` });

await page.goto("https://fundhub.ai/login.html", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
let loginStatus = null;
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: 30000 }).then((r) => { loginStatus = r.status(); }),
  page.click("#go"),
]);
await page.waitForTimeout(2500);
log("staff login status", loginStatus);
for (const [k, id, mid] of [["a", A, MSG_A], ["b", B, MSG_B]]) {
  await page.goto(`https://fundhub.ai/app/messaging.html?client_id=${id}&channel=email`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll("#thread .msg").length > 0, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const info = await page.evaluate((mid) => {
    const el = document.querySelector(`#thread .msg[data-id="${mid}"]`);
    const t = el ? el.innerText : "";
    return { onScreen: !!el, count: document.querySelectorAll("#thread .msg").length, hasLink: /unsubscribe\.html/.test(t) || !!el?.querySelector('a[href*="unsubscribe.html"]'), hasBraces: t.includes("{{") };
  }, mid);
  log(`staff messaging sim ${k}:`, JSON.stringify(info));
  await page.evaluate(() => {
    const EM = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const v = n.nodeValue; const nv = v.replace(EM, "<email>").replace(/(sig=)[0-9a-f]{6,}/g, "$1<sig…>"); if (nv !== v) n.nodeValue = nv; }
    document.querySelectorAll("input,textarea").forEach((el) => { if (el.value) el.value = el.value.replace(EM, "<email>"); });
  });
  await mark([{ sel: `#thread .msg[data-id="${mid}"]`, n: 1, text: `EMAIL-S00-WELCOME on review sim ${k.toUpperCase()}'s thread — ${info.hasLink ? "stored body holds the unsubscribe.html link" : "NO unsubscribe link in stored body"}${info.hasBraces ? ", has {{ }}" : ", no leftover {{ }}"}` }],
    `N11 review — staff Messaging, review sim ${k.toUpperCase()} email thread (live)`);
  await page.screenshot({ path: `${OUT}/rr2-0${k === "a" ? 5 : 6}-staff-messaging-sim${k}.png` });
}
log("login POSTs", loginPosts, "blocked non-GET", JSON.stringify(blocked));
await browser.close();
