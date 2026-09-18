// Hole 22 reviewer — the Download button saves the file (it does not open in a tab). Open the exact bytes
// live served during review pass 2 (saved in the scratchpad) in a browser and box the client name.
// Network is blocked except GET, so a saved report cannot write anything anywhere.
import { chromium } from "playwright";
import { readdirSync } from "node:fs";
const RAW = "/private/tmp/claude-501/-Users-chrisstanbridge-Developer-fundhub-platform/29675f55-19d2-4df6-b763-23603c0bbb05/scratchpad/r22-files";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/review";
const NAME = "Sim Combo-20260918";
const names = { "134321d8": "credit-optimization-roadmap", "42a5ee06": "bank-and-lender-match-list", "8938d440": "funding-snapshot", "64dafc70": "credit-analysis-report" };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route("**/*", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
const out = [];
for (const f of readdirSync(RAW).filter((x) => x.startsWith("pass2-") && x.endsWith(".html"))) {
  const key = f.slice(6, 14);
  const page = await ctx.newPage();
  await page.goto(`file://${RAW}/${f}`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const ok = await page.evaluate((name) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let el = null;
    while (w.nextNode()) { if (w.currentNode.nodeValue.includes(name)) { el = w.currentNode.parentElement; break; } }
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.style.outline = "3px solid #e00"; el.style.outlineOffset = "3px";
    const r = el.getBoundingClientRect();
    const tag = document.createElement("div"); tag.textContent = "1";
    Object.assign(tag.style, { position: "absolute", left: `${Math.max(0, r.left + scrollX - 30)}px`, top: `${r.top + scrollY - 2}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
    document.body.appendChild(tag);
    const lg = document.createElement("div");
    lg.textContent = `1 — File saved by the live Download button (review pass 2): the report names ${name}`;
    Object.assign(lg.style, { position: "fixed", left: "16px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "760px" });
    document.body.appendChild(lg);
    return true;
  }, NAME);
  const shot = `${SHOTS}/pass2-file-${names[key] || key}.png`;
  if (ok) await page.screenshot({ path: shot });
  out.push({ f, ok, shot: ok ? shot.split("/").pop() : null });
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
