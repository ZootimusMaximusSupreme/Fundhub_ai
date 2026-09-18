// HOLE 16 REVIEWER — independent live retry of the "reader out of credit, no chase"
// hole on #9 Nine-Repair. Finds the ID box by its words ("ID and personal documents"
// + "Upload documents"), never by "first file input".
//
// upload --send : stage sim photo-id-2.png as "Photo ID" and press Send (exactly ONE upload POST).
// look          : no upload; screenshot the portal's ID box and the note above the doors.
//
// Every non-GET request is aborted except the one sign-in POST and, with --send only,
// exactly one POST /api/documents-upload. Never prints a secret.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const BASE = "https://fundhub.ai";
const ID = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const TAG = process.argv[2] || "look";
const SEND = process.argv.includes("--send");
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-16/review";
const SIM = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/sim-documents/09/photo-id-2.png";
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

page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/documents-upload") out.uploads.push({ phase: "request", method: req.method(), at: new Date().toISOString() }); });
page.on("response", async (res) => {
  if (new URL(res.url()).pathname !== "/api/documents-upload") return;
  let body = null;
  try { const j = await res.json(); body = { ok: j.ok, error: j.error, n: (j.documents || []).length, kinds: (j.documents || []).map((d) => `${d.kind}/${d.subtype}`), ids8: (j.documents || []).map((d) => String(d.id || "").slice(0, 8)) }; } catch {}
  out.uploads.push({ phase: "response", status: res.status(), at: new Date().toISOString(), body });
});
page.on("requestfailed", (req) => { if (new URL(req.url()).pathname === "/api/documents-upload") out.uploads.push({ phase: "failed", error: req.failure()?.errorText }); });

// --- open #9's portal ---
await page.goto(`${BASE}/app/client-portal.html?id=${ID}`, { waitUntil: "domcontentloaded" });
const BTN_RE = /Upload documents|Send \d+ files?|Sent|Try again|Sending/;
await page.getByRole("button", { name: /Upload documents/ }).first().waitFor({ state: "visible", timeout: 30000 });
await page.waitForTimeout(4000);

// The box: innermost element holding both "ID and personal documents" and the "Upload documents" button.
const box = page.locator("section, article, div, form")
  .filter({ has: page.getByText("ID and personal documents", { exact: true }) })
  .filter({ has: page.getByRole("button", { name: "Upload documents" }) })
  .last();
out.boxFound = await box.isVisible();
await box.evaluate((e) => e.setAttribute("data-r16", "box"));
const theBox = page.locator('[data-r16="box"]');
const upBtn = theBox.getByRole("button", { name: BTN_RE }).first();
const typeSel = theBox.locator("select");
out.boxOptions = await typeSel.evaluate((s) => Array.from(s.options).map((o) => o.text));
out.buttonAtLoad = (await upBtn.textContent())?.trim();
const note = page.locator("#doc-agent-note");
const noteText = async () => ((await note.isVisible().catch(() => false)) ? ((await note.textContent()) || "").trim() : "(hidden)");
out.noteAtLoad = await noteText();
await note.evaluate((e) => e.setAttribute("data-r16", "note")).catch(() => {});

async function mark(marks, legend, file) {
  await page.evaluate(({ marks, legend }) => {
    document.querySelectorAll(".r16-mark").forEach((e) => e.remove());
    marks.forEach((m, i) => {
      const el = document.querySelector(`[data-r16="${m.key}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const d = document.createElement("div");
      d.className = "r16-mark";
      Object.assign(d.style, { position: "fixed", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
        border: "4px solid #e00", borderRadius: "6px", zIndex: 2147483646, pointerEvents: "none", boxSizing: "border-box" });
      const n = document.createElement("div");
      n.textContent = String(i + 1);
      Object.assign(n.style, { position: "absolute", left: "-16px", top: "-16px", width: "28px", height: "28px", borderRadius: "50%", background: "#e00", color: "#fff",
        font: "bold 16px/28px sans-serif", textAlign: "center" });
      d.appendChild(n); document.body.appendChild(d);
    });
    const lg = document.createElement("div");
    lg.className = "r16-mark";
    Object.assign(lg.style, { position: "fixed", left: "12px", bottom: "12px", maxWidth: "1000px", background: "#fff", color: "#111", border: "3px solid #e00",
      padding: "10px 14px", font: "15px/1.45 sans-serif", zIndex: 2147483647, pointerEvents: "none", whiteSpace: "pre-line" });
    lg.textContent = legend;
    document.body.appendChild(lg);
  }, { marks, legend });
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.evaluate(() => document.querySelectorAll(".r16-mark").forEach((e) => e.remove()));
}
await upBtn.evaluate((e) => e.setAttribute("data-r16", "btn"));
await theBox.scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -160));
await mark([{ key: "box" }, { key: "btn" }, { key: "note" }],
  `Hole 16 review ${TAG} — #9 portal on load\n1 = the "ID and personal documents" box   2 = its button: "${out.buttonAtLoad}"   3 = note above the doors: "${out.noteAtLoad.slice(0, 110)}"`,
  `${TAG}-1-box.png`);

if (SEND) {
  await typeSel.selectOption({ label: "Photo ID" });
  const chooserP = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
  await upBtn.click();
  const chooser = await chooserP;
  out.fileChooserOpened = !!chooser;
  if (chooser) {
    out.chooserInputInsideBox = await chooser.element().evaluate((inp) => !!inp.closest('[data-r16="box"]'));
    await chooser.setFiles(SIM);
  }
  await page.waitForTimeout(1000);
  const sendBtn = theBox.getByRole("button", { name: BTN_RE }).first();
  out.buttonAfterPick = (await sendBtn.textContent())?.trim();
  out.selectedType = await typeSel.evaluate((s) => s.options[s.selectedIndex]?.text);
  await sendBtn.evaluate((e) => e.setAttribute("data-r16", "btn"));
  await mark([{ key: "box" }, { key: "btn" }],
    `Hole 16 review ${TAG} — picked sim photo-id-2.png (blurry ID), type "${out.selectedType}"\n1 = the "ID and personal documents" box   2 = its button after the pick: "${out.buttonAfterPick}"`,
    `${TAG}-2-picked.png`);

  if (/^Send 1 file$/.test(out.buttonAfterPick || "") && out.chooserInputInsideBox) {
    const respP = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/documents-upload", { timeout: 60000 }).catch(() => null);
    out.sendClickedAt = new Date().toISOString();
    await sendBtn.click();
    await respP;
    await page.waitForTimeout(3000);
    out.buttonAfterSend = (await theBox.getByRole("button", { name: BTN_RE }).first().textContent())?.trim();
    await theBox.getByRole("button", { name: BTN_RE }).first().evaluate((e) => e.setAttribute("data-r16", "btn"));
    const resp = out.uploads.find((u) => u.phase === "response");
    await mark([{ key: "box" }, { key: "btn" }],
      `Hole 16 review ${TAG} — after ONE Send\n1 = the "ID and personal documents" box   2 = its button now: "${out.buttonAfterSend}"\nUpload POST /api/documents-upload → HTTP ${resp?.status ?? "none"}, ok=${resp?.body?.ok}, saved ${resp?.body?.n ?? "?"} file(s): ${(resp?.body?.kinds || []).join(", ")}`,
      `${TAG}-3-sent.png`);
  } else {
    out.skippedSend = "button was not 'Send 1 file' or file input not inside the ID box";
  }
}

out.uploadsLeftUnused = uploadsLeft;
await browser.close();
writeFileSync(`${OUT}/${TAG}-summary.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
