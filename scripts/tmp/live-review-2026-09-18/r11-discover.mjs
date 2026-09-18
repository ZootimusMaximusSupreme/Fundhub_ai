// Reviewer hole 11 — LOOK ONLY. Sign in through the real login form, open #12 portal once,
// dump the shape of What You Own and Unlock More. Blocks every non-GET except the sign-in POST.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route("**/*", (route) => {
    const r = route.request(); const m = r.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const path = new URL(r.url()).pathname;
    if (m === "POST" && path === "/api/auth/login") return route.continue();
    blocked.push(`${m} ${path}`); return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "chris@fundhub.ai");
  await page.fill("#pw", pw);
  const lrP = page.waitForResponse((r) => r.url().endsWith("/api/auth/login") && r.request().method() === "POST", { timeout: 30000 });
  await page.click("#go");
  const lr = await lrP;
  console.log("login status", lr.status());
  if (lr.status() !== 200) throw new Error("sign-in failed");
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/app/client-portal.html?id=${TWELVE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  console.log("url", page.url());
  const body = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").slice(0, 3000));
  console.log("BODY\n" + body);
  const own2 = await page.evaluate(() => { const els = Array.from(document.querySelectorAll("*")).filter(e => e.children.length < 3 && /what you own/i.test(e.innerText || "")); return els.slice(0,5).map(e => `<${e.tagName.toLowerCase()}#${e.id}.${e.className}> ${(e.innerText||"").slice(0,60)}`); });
  console.log("OWN-LABELS", JSON.stringify(own2));
  const shape = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll("h1,h2,h3")).map(h => ({ tag: h.tagName, id: h.id, text: h.innerText.trim().slice(0, 60), visible: !!h.offsetParent }));
    const findSec = (re) => { const h = Array.from(document.querySelectorAll("h2,h3")).find(x => re.test(x.innerText)); return h ? (h.closest("section") || h.parentElement) : null; };
    const own = findSec(/what you own/i);
    const unl = findSec(/unlock more/i);
    const walk = (el, d = 0) => {
      if (!el || d > 5) return [];
      const lines = [];
      for (const ch of el.children) {
        const t = (ch.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90);
        lines.push(`${"  ".repeat(d)}<${ch.tagName.toLowerCase()}${ch.id ? "#" + ch.id : ""}${ch.className && typeof ch.className === "string" ? "." + ch.className.trim().replace(/\s+/g, ".") : ""}${ch.getAttribute("data-tile") ? " data-tile=" + ch.getAttribute("data-tile") : ""}${ch.hidden ? " [hidden]" : ""}> ${t}`);
        lines.push(...walk(ch, d + 1));
      }
      return lines;
    };
    return { heads, ownOuter: own ? `<${own.tagName} ${own.getAttribute("aria-labelledby") || ""}>` : null, own: walk(own), unl: walk(unl).slice(0, 120) };
  });
  console.log(JSON.stringify(shape.heads));
  console.log("OWN", shape.ownOuter); console.log(shape.own.join("\n"));
  console.log("UNLOCK"); console.log(shape.unl.join("\n"));
  console.log("blocked", JSON.stringify(blocked));
} finally { await browser.close(); }
