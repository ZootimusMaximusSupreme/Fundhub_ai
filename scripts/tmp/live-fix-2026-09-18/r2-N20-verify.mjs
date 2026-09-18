// N20 — live look (read only). Signs in as staff, opens #13 Thirteen-NoBook's
// portal, and reads: the missing-documents note, which upload boxes show, and
// the type list in the "Inquiry documents" box and the "ID and personal
// documents" box. Every non-GET request is aborted except the one sign-in POST.
// Never prints a secret.
//
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N20-verify.mjs <tag>
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TAG = process.argv[2] || "verify";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N20";
mkdirSync(OUT, { recursive: true });
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), tag: TAG, blocked: [] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  out.blocked.push(`${m} ${p}`);
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const lrP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
await page.click("#go");
out.login = (await lrP).status();
await page.waitForTimeout(2500);
if (out.login !== 200) { console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1); }

const docsR = await ctx.request.get(`${BASE}/api/read/documents?client_id=${ID}`);
let dj = null; try { dj = await docsR.json(); } catch { /* not json */ }
const list = dj?.documents || dj?.data?.documents || dj?.items || (Array.isArray(dj?.data) ? dj.data : []) || [];
out.docs = list.map((d) => `${d.kind}/${d.subtype}`);

await page.goto(`${BASE}/app/client-portal.html?id=${ID}`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Upload inquiry docs/ }).first().waitFor({ state: "attached", timeout: 30000 });
await page.waitForTimeout(6000);

out.page = await page.evaluate(() => {
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const note = document.getElementById("doc-agent-note");
  const doors = Array.from(document.querySelectorAll(".upload-door")).map((d) => ({
    title: d.querySelector(".door-title")?.textContent.trim(),
    kind: d.getAttribute("data-kind"),
    visible: vis(d),
    options: Array.from(d.querySelectorAll("select option")).map((o) => `${o.value || "(blank)"}=${o.textContent.trim()}`)
  }));
  return { note: note && !note.hidden ? note.textContent : null, noteVisible: vis(note), doors, bodyClass: document.body.className };
});

// Annotated screenshot: 1 = the note, 2 = the inquiry box's type list (opened as a listbox size).
await page.evaluate(() => {
  const note = document.getElementById("doc-agent-note");
  const inq = document.querySelector('.upload-door[data-kind="inquiry_doc"]');
  const sel = inq && inq.querySelector("select");
  if (sel) sel.setAttribute("size", String(sel.options.length));
  if (note) note.setAttribute("data-n20", "note");
  if (sel) sel.setAttribute("data-n20", "sel");
  (inq || note)?.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(400);
await page.evaluate(({ tag, note }) => {
  const marks = ["note", "sel"];
  marks.forEach((k, i) => {
    const el = document.querySelector(`[data-n20="${k}"]`);
    if (!el || !el.getClientRects().length) return;
    const r = el.getBoundingClientRect();
    const d = document.createElement("div");
    Object.assign(d.style, { position: "fixed", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
      border: "4px solid #e00", borderRadius: "6px", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
    const n = document.createElement("div"); n.textContent = String(i + 1);
    Object.assign(n.style, { position: "absolute", left: "-16px", top: "-16px", width: "28px", height: "28px", borderRadius: "50%", background: "#e00", color: "#fff", font: "bold 16px/28px sans-serif", textAlign: "center" });
    d.appendChild(n); document.body.appendChild(d);
  });
  const lg = document.createElement("div");
  Object.assign(lg.style, { position: "fixed", left: "12px", bottom: "12px", maxWidth: "900px", background: "#fff", color: "#111", border: "3px solid #e00",
    padding: "10px 14px", font: "15px/1.45 sans-serif", zIndex: 2147483647, pointerEvents: "none", whiteSpace: "pre-line" });
  lg.textContent = `N20 ${tag} — #13 Thirteen-NoBook portal, live ${new Date().toISOString()}\n1 = the note: "${note || "(no note shown)"}"\n2 = the "Inquiry documents" type list (every choice shown)`;
  document.body.appendChild(lg);
}, { tag: TAG, note: out.page.note });
await page.screenshot({ path: `${OUT}/${TAG}-portal.png` });

writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
