// Reviewer hole 11 — LOOK ONLY. Sign in through the real login form, open #12 portal once,
// dump the shape of What You Own and Unlock More. Blocks every non-GET except the sign-in POST.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");
const blocked = [];
const browser = await chromium.launch({ headless: true });
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
const form = await page.evaluate(() => Array.from(document.querySelectorAll("input,button")).map(e => ({ tag: e.tagName, id: e.id, type: e.type, name: e.name, text: (e.innerText || "").trim().slice(0, 40) })));
console.log("login form:", JSON.stringify(form));
