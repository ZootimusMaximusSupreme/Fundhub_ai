// Review of hole 13 — LOOK ONLY. Lists every link and button on the staff
// screens for #11 so we can find a real staff path into the client portal.
// Blocks every non-GET request except the one sign-in POST. Never prints a secret.
import { chromium } from "playwright";

const BASE = "https://fundhub.ai";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const r = route.request();
  const m = r.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  const p = new URL(r.url()).pathname;
  if (m === "POST" && p === "/api/auth/login") return route.continue();
  blocked.push(`${m} ${p}`);
  return route.abort();
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await page.fill("#email", "chris@fundhub.ai");
await page.fill("#pw", pw);
const lr = page.waitForResponse((r) => r.url().includes("/api/auth/login") && r.request().method() === "POST");
await page.click("#go");
console.log("login", (await lr).status());
await page.waitForTimeout(3000);

const scrub = (s) => String(s || "").replaceAll(ELEVEN, "<eleven>");
for (const path of [`/app/client-control-panel.html?id=${ELEVEN}`, `/app/pipeline.html`]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const els = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll("a, button, [role=button], [onclick], [data-href]")) {
      const r = a.getBoundingClientRect();
      const txt = (a.innerText || a.getAttribute("aria-label") || a.title || "").replace(/\s+/g, " ").trim().slice(0, 60);
      out.push({ tag: a.tagName, txt, href: a.getAttribute("href") || a.getAttribute("data-href") || "", on: (a.getAttribute("onclick") || "").slice(0, 80), vis: r.width > 0 && r.height > 0 });
    }
    return out;
  });
  console.log(`\n=== ${scrub(path)} (${els.length} clickables)`);
  const seen = new Set();
  for (const e of els) {
    const key = `${e.tag}|${e.txt}|${e.href}|${e.on}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (/sidebar|^$/.test(e.txt) && !e.href) continue;
    console.log(`${e.vis ? "V" : "-"} ${e.tag} "${e.txt}" ${scrub(e.href)} ${scrub(e.on)}`);
  }
}
console.log("blocked:", blocked);
await browser.close();
