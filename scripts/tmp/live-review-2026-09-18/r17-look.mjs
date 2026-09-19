// HOLE 17 REVIEWER — independent live look at the inquiry upload door on
// #13 Thirteen-NoBook. Finds the box by its words ("Inquiry documents" +
// "Upload inquiry docs"), never by "first file input".
//
// look1 --send : stage one sim photo and press Send (exactly ONE upload POST).
// look2        : stage one sim photo, confirm "Send 1 file", STOP. No send.
//
// Every non-GET request is aborted except the one sign-in POST and, in look1
// only, exactly one POST /api/documents-upload. Never prints a secret.
//
// Usage: node --env-file=<repo>/.env scripts/tmp/live-review-2026-09-18/r17-look.mjs <look1|look2> [--send]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const TAG = process.argv[2] || "look";
const SEND = process.argv.includes("--send");
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-17/review";
const SIM = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/08/photo-id-2.png";
mkdirSync(OUT, { recursive: true });
if (!existsSync(SIM)) throw new Error("sim photo missing");
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const out = { at: new Date().toISOString(), tag: TAG, send: SEND, sim: SIM.split("/").slice(-2).join("/"), blocked: [], uploads: [] };
let uploadsLeft = SEND ? 1 : 0;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request(); const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  if (m === "POST" && p === "/api/documents-upload" && uploadsLeft > 0) { uploadsLeft -= 1; return route.continue(); }
  out.blocked.push(`${m} ${p}`);
  return route.abort();
});
const page = await ctx.newPage();

// --- sign in through the real form ---
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const lrP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/login" && r.request().method() === "POST");
await page.click("#go");
out.login = { status: (await lrP).status() };
await page.waitForTimeout(2500);
if (out.login.status !== 200) { console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(1); }

async function apiDocs() {
  const r = await ctx.request.get(`${BASE}/api/read/documents?client_id=${ID}`);
  let j = null; try { j = await r.json(); } catch {}
  const list = j?.documents || j?.data?.documents || j?.items || j?.data?.items || (Array.isArray(j?.data) ? j.data : null) || [];
  return { status: r.status(), count: Array.isArray(list) ? list.length : null,
    rows: Array.isArray(list) ? list.map((d) => ({ kind: d.kind, subtype: d.subtype, byte_size: d.byte_size, created_at: d.created_at })) : null };
}
out.apiBefore = await apiDocs();

page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/documents-upload") out.uploads.push({ phase: "request", method: req.method(), at: new Date().toISOString() }); });
page.on("response", async (res) => {
  if (new URL(res.url()).pathname !== "/api/documents-upload") return;
  let body = null;
  try { const j = await res.json(); body = { ok: j.ok, error: j.error, n: (j.documents || []).length, kinds: (j.documents || []).map((d) => `${d.kind}/${d.subtype}`) }; } catch {}
  out.uploads.push({ phase: "response", status: res.status(), body });
});
page.on("requestfailed", (req) => { if (new URL(req.url()).pathname === "/api/documents-upload") out.uploads.push({ phase: "failed", error: req.failure()?.errorText }); });

// --- open #13's portal ---
await page.goto(`${BASE}/app/client-portal.html?id=${ID}`, { waitUntil: "domcontentloaded" });
const btn = page.getByRole("button", { name: /Upload inquiry docs|Send \d+ file|Sent|Try again|Sending/ });
await btn.first().waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(3000);

// The box: innermost element holding both the words "Inquiry documents" and the upload button.
const box = page.locator("section, article, div, form")
  .filter({ has: page.getByText("Inquiry documents", { exact: true }) })
  .filter({ has: page.getByRole("button", { name: "Upload inquiry docs" }) })
  .last();
out.boxFound = await box.isVisible();
await box.evaluate((e) => e.setAttribute("data-r17", "box"));
// From here on, hold the box by the tag just put on it (its button text will change).
const theBox = page.locator('[data-r17="box"]');
const BTN_RE = /Upload inquiry docs|Send \d+ files?|Sent|Try again|Sending/;
const upBtn = theBox.getByRole("button", { name: BTN_RE }).first();
const typeSel = theBox.locator("select");
out.boxOptions = await typeSel.evaluate((s) => Array.from(s.options).map((o) => o.text));
out.buttonAtLoad = (await upBtn.textContent())?.trim();

// Annotate: red numbered boxes + one-line legend, painted on the page only.
async function mark(marks, legend, file) {
  await page.evaluate(({ marks, legend }) => {
    document.querySelectorAll(".r17-mark").forEach((e) => e.remove());
    marks.forEach((m, i) => {
      const el = document.querySelector(`[data-r17="${m.key}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = document.createElement("div");
      d.className = "r17-mark";
      Object.assign(d.style, { position: "fixed", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
        border: "4px solid #e00", borderRadius: "6px", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
      const n = document.createElement("div");
      n.textContent = String(i + 1);
      Object.assign(n.style, { position: "absolute", left: "-16px", top: "-16px", width: "28px", height: "28px", borderRadius: "50%", background: "#e00", color: "#fff",
        font: "bold 16px/28px sans-serif", textAlign: "center" });
      d.appendChild(n); document.body.appendChild(d);
    });
    const lg = document.createElement("div");
    lg.className = "r17-mark";
    Object.assign(lg.style, { position: "fixed", left: "12px", bottom: "12px", maxWidth: "900px", background: "#fff", color: "#111", border: "3px solid #e00",
      padding: "10px 14px", font: "15px/1.45 sans-serif", zIndex: 2147483647, pointerEvents: "none", whiteSpace: "pre-line" });
    lg.textContent = legend;
    document.body.appendChild(lg);
  }, { marks, legend });
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.evaluate(() => document.querySelectorAll(".r17-mark").forEach((e) => e.remove()));
}
await upBtn.evaluate((e) => e.setAttribute("data-r17", "btn"));
await theBox.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -120));
await mark([{ key: "box" }, { key: "btn" }],
  `Hole 17 review ${TAG} — step 1, fresh load of #13 portal\n1 = the "Inquiry documents" upload box\n2 = its button, now "${out.buttonAtLoad}"\n#13 documents (live API) before: ${out.apiBefore.count}`,
  `${TAG}-1-box.png`);

// --- stage one sim photo through the box's own button ---
await typeSel.selectOption({ label: "Photo ID" });
const chooserP = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
await upBtn.click();
const chooser = await chooserP;
out.fileChooserOpened = !!chooser;
if (chooser) {
  out.chooserInputInsideBox = await chooser.element().evaluate((inp) => !!inp.closest('[data-r17="box"]'));
  await chooser.setFiles(SIM);
}
await page.waitForTimeout(1000);
out.boxStillTagged = await theBox.count();
const sendBtn = theBox.getByRole("button", { name: BTN_RE }).first();
out.buttonAfterPick = (await sendBtn.textContent())?.trim();
await sendBtn.evaluate((e) => e.setAttribute("data-r17", "btn"));
await mark([{ key: "box" }, { key: "btn" }],
  `Hole 17 review ${TAG} — step 2, picked sim photo-id-2.png, type "Photo ID"\n1 = the "Inquiry documents" upload box\n2 = its button after the pick: "${out.buttonAfterPick}"`,
  `${TAG}-2-picked.png`);

// --- look1 only: press Send once ---
if (SEND && /^Send 1 file$/.test(out.buttonAfterPick || "")) {
  const respP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/documents-upload", { timeout: 45000 }).catch(() => null);
  await sendBtn.click();
  await respP;
  await page.waitForTimeout(2000);
  out.buttonAfterSend = (await sendBtn.textContent())?.trim();
  await page.waitForTimeout(1500);
  out.apiAfter = await apiDocs();
  await sendBtn.evaluate((e) => e.setAttribute("data-r17", "btn"));
  await mark([{ key: "box" }, { key: "btn" }],
    `Hole 17 review ${TAG} — step 3, pressed Send once\n1 = the "Inquiry documents" upload box\n2 = its button after Send: "${out.buttonAfterSend}"   (POST /api/documents-upload → ${out.uploads.find((u) => u.phase === "response")?.status ?? "no response"})\n#13 documents (live API): before ${out.apiBefore.count} → after ${out.apiAfter.count}`,
    `${TAG}-3-sent.png`);
} else {
  out.apiAfter = await apiDocs();
}

// --- count on a live screen: the documents API itself, opened in the browser ---
const cp = await ctx.newPage();
await cp.goto(`${BASE}/api/read/documents?client_id=${ID}`, { waitUntil: "domcontentloaded" });
await cp.evaluate(({ before, after, tag }) => {
  let j = null; try { j = JSON.parse(document.body.innerText); } catch {}
  const list = j?.documents || j?.data?.documents || j?.items || (Array.isArray(j?.data) ? j.data : []) || [];
  const pre = document.createElement("pre");
  pre.setAttribute("data-r17", "count");
  Object.assign(pre.style, { font: "16px/1.4 monospace", padding: "10px", margin: "20px", display: "inline-block" });
  pre.textContent = `GET /api/read/documents?client_id=7ccbeb76-…  (live, ${new Date().toISOString()})\ndocuments listed: ${list.length}\n` +
    list.map((d, i) => `  ${i + 1}. ${d.kind}/${d.subtype}  ${d.byte_size ?? "?"} bytes  ${d.created_at}`).join("\n");
  document.body.innerHTML = "";
  document.body.appendChild(pre);
  const r = pre.getBoundingClientRect();
  const m = document.createElement("div");
  Object.assign(m.style, { position: "fixed", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, border: "4px solid #e00", borderRadius: "6px", boxSizing: "border-box" });
  const n = document.createElement("div"); n.textContent = "1";
  Object.assign(n.style, { position: "absolute", left: "-16px", top: "-16px", width: "28px", height: "28px", borderRadius: "50%", background: "#e00", color: "#fff", font: "bold 16px/28px sans-serif", textAlign: "center" });
  m.appendChild(n); document.body.appendChild(m);
  const lg = document.createElement("div");
  Object.assign(lg.style, { position: "fixed", left: "12px", bottom: "12px", background: "#fff", border: "3px solid #e00", padding: "10px 14px", font: "15px/1.45 sans-serif", whiteSpace: "pre-line" });
  lg.textContent = `Hole 17 review ${tag} — #13 documents count\n1 = live documents list for #13: before ${before} → now ${list.length}`;
  document.body.appendChild(lg);
}, { before: out.apiBefore.count, after: out.apiAfter.count, tag: TAG });
await cp.setViewportSize({ width: 1200, height: 420 });
await cp.screenshot({ path: `${OUT}/${TAG}-4-count.png` });

writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
