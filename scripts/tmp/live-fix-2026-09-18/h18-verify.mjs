// Hole 18 — Combo's $3,000 funding pay still pending, no round. LOOK ONLY.
// Owner session (password login when the .env value is real, else an injected
// owner session row — the pattern in independent-tester-2026-09-18-morning.mjs).
// Every browser request that is not GET/HEAD/OPTIONS is aborted: no Pay click,
// no send, no new product. Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h18-verify.mjs [tag]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, close } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const LINK = "pl_bd696468da1b9126a2afc9cc";
const TAG = process.argv[2] || "verify";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-18";
mkdirSync(SHOTS, { recursive: true });

const out = { at: new Date().toISOString(), tag: TAG, no_send: true, api: {}, blocked: [] };

// ── Owner cookie.
let cookie = null;
const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (pw && !/\*{8,}/.test(pw)) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "chris@fundhub.ai", password: pw })
  });
  const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
  out.login = { status: r.status, gotCookie: Boolean(m) };
  cookie = m ? m[1] : null;
}
if (!cookie) {
  const staff = (await db.query(
    `SELECT id, org_id FROM staff WHERE lower(email) = 'chris@fundhub.ai' LIMIT 1`
  )).rows[0];
  const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id, userAgent: "h18-verify" });
  cookie = token;
  out.cookieSource = "session-inject";
} else {
  out.cookieSource = "password-login";
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await ctx.addCookies([
  { name: "fundhub_session", value: cookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true }
]);
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  out.blocked.push(`${m} ${new URL(req.url()).pathname}`);
  return route.abort();
});

async function apiGet(path) {
  const r = await ctx.request.get(`${BASE}${path}`);
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return { status: r.status(), json: j };
}

// ── The live APIs.
{
  const l = await apiGet(`/api/payment-links?client_id=${COMBO}`);
  out.api.paymentLinks = {
    status: l.status,
    items: (l.json?.items || []).map((i) => ({
      link_ref: i.link_ref, status: i.status, amount_cents: i.amount_cents,
      paid_amount_cents: i.paid_amount_cents ?? null, purpose: i.purpose, paid_at: i.paid_at ?? null
    }))
  };
  const d = await apiGet(`/api/dashboard/client?id=${COMBO}`);
  const body = d.json || {};
  const rounds = body.fundingRounds || body.funding_rounds || body.client?.funding_rounds || [];
  out.api.client = {
    status: d.status,
    fundingRounds: Array.isArray(rounds) ? rounds.length : null,
    keys: Object.keys(body).slice(0, 40)
  };
}

// ── The live screen: the CRM client record, looked at twice.
for (const n of [1, 2]) {
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app/client-portal.html?id=${COMBO}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(6000);
  const shot = `${SHOTS}/${TAG}-client-${n}.png`;
  await pg.screenshot({ path: shot, fullPage: true });
  const text = await pg.evaluate(() => document.body.innerText);
  out[`screen${n}`] = {
    shot,
    mentions3000: /\$?3,?000/.test(text),
    payLines: text.split("\n").filter((l) => /pay|deposit|round|fund/i.test(l)).slice(0, 25)
  };
  await pg.close();
}

await browser.close();
await close?.();
writeFileSync(`${SHOTS}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
