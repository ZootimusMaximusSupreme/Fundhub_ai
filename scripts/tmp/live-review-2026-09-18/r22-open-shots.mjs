// Hole 22 reviewer — open each Download on Combo's documents page (live) and screenshot the report
// with the client name boxed. Sign-in POST is the only non-GET allowed; everything else non-GET is aborted.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const NAME = "Sim Combo-20260918";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/review";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const blocked = []; let posts = 0;
await ctx.route("**/*", (route) => {
  const r = route.request(); const u = new URL(r.url());
  if (r.method() === "POST" && u.pathname === "/api/auth/login" && posts++ === 0) return route.continue();
  if (r.method() !== "GET") { blocked.push(`${r.method()} ${u.pathname}`); return route.abort(); }
  return route.continue();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
await Promise.all([page.waitForResponse((r) => r.url().includes("/api/auth/login")), page.click("#go")]);
await page.waitForTimeout(2000);
await page.goto(`${BASE}/app/documents.html?client_id=${COMBO}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("#body [data-dl]").length > 0, null, { timeout: 30_000 });
const ids = await page.$$eval("#body [data-dl]", (bs) => bs.map((b) => [b.getAttribute("data-dl"), b.closest("tr").querySelector("td")?.innerText.split("\n")[0].trim()]));
const res = [];
for (const [id, title] of ids) {
  const popP = ctx.waitForEvent("page", { timeout: 20_000 }).catch(() => null);
  await page.click(`#body [data-dl="${id}"]`);
  const pop = await popP;
  if (!pop) { res.push({ title, opened: false }); continue; }
  await pop.waitForURL((u) => u.protocol === "https:", { timeout: 20_000 }).catch(() => {});
  await pop.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
  await pop.waitForTimeout(1500);
  const info = await pop.evaluate((name) => {
    const found = Boolean(document.body) && document.body.textContent.includes(name);
    if (!found) return { found: false, ctype: document.contentType, path: location.protocol + "//" + location.host + location.pathname, bodyLen: document.body ? document.body.textContent.length : -1, head: document.body ? document.body.textContent.replace(/\s+/g, " ").slice(0, 160) : null };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let el = null;
    while (w.nextNode()) { if (w.currentNode.nodeValue.includes(name)) { el = w.currentNode.parentElement; break; } }
    el.scrollIntoView({ block: "center" });
    el.style.outline = "3px solid #e00"; el.style.outlineOffset = "3px";
    const r = el.getBoundingClientRect();
    const tag = document.createElement("div"); tag.textContent = "1";
    Object.assign(tag.style, { position: "absolute", left: `${Math.max(0, r.left + scrollX - 30)}px`, top: `${r.top + scrollY - 2}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px", zIndex: 2147483647 });
    document.body.appendChild(tag);
    const lg = document.createElement("div");
    lg.textContent = `1 — Opened live from the Download button on Combo's documents page: this report names ${name}`;
    Object.assign(lg.style, { position: "fixed", left: "16px", bottom: "16px", background: "#fff", border: "3px solid #e00", color: "#111", font: "14px sans-serif", padding: "8px 10px", zIndex: 2147483647, maxWidth: "700px" });
    document.body.appendChild(lg);
    return { found: true, ctype: document.contentType, title: document.title };
  }, NAME).catch((e) => ({ err: e.message.slice(0, 100) }));
  let shot = null;
  if (info.found) {
    shot = `${SHOTS}/pass2-opened-${title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, "")}.png`;
    await pop.screenshot({ path: shot });
  }
  res.push({ title, ...info, shot: shot && shot.split("/").pop() });
  await pop.close();
}
console.log(JSON.stringify({ blocked, signInPosts: posts, res }, null, 1));
await browser.close();
