// Hole 22 round 2 reviewer — every file on the live Repair queue: id prefix, Sim or not, address flag. GET only after the one sign-in POST.
import { chromium } from "playwright";
const BASE = "https://fundhub.ai";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
let posts = 0; const blocked = [];
await ctx.route("**/*", (route) => {
  const r = route.request(); const u = new URL(r.url());
  if (["GET", "HEAD", "OPTIONS"].includes(r.method())) return route.continue();
  if (r.method() === "POST" && u.origin === BASE && u.pathname === "/api/auth/login" && posts === 0) { posts++; return route.continue(); }
  blocked.push(`${r.method()} ${u.pathname}`); return route.abort();
});
const p = await ctx.newPage();
await p.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
await p.fill("#email", "chris@fundhub.ai");
await p.fill("#pw", process.env.STAFF_INITIAL_PASSWORD || "");
await Promise.all([p.waitForURL((u) => !String(u).includes("/login"), { timeout: 30000 }), p.click("#go")]);
await p.waitForLoadState("domcontentloaded");
const res = await p.evaluate(async () => {
  const r = await fetch("/api/read/repair-cases", { headers: { accept: "application/json" }, cache: "no-store" });
  const j = await r.json();
  return { http: r.status, ok: j.ok, ready: j.ready, files: (j.files || []).map((f) => ({ id: String(f.client_id).slice(0, 8), sim: /^Sim /.test(f.name || ""), name: /^Sim /.test(f.name || "") ? f.name : "(not a Sim — name hidden)", address_ok: f.address_ok, stage_key: f.stage_key })) };
});
console.log(JSON.stringify({ at: new Date().toISOString(), posts, blocked, ...res }, null, 2));
await browser.close();
