// Hole N12 VERIFY / PROVE. LOOK ONLY. Owner password login, then for #13
// (sample report) and Colin Schmidt (real pull, control):
//  1. GET /api/dashboard/client?id=<id> — what the Client Control Panel paints
//     from the stored credit reports (row stamps only; no names, no PII).
//  2. Headless chromium, every non-GET request aborted. Load the control panel
//     twice, read every figure that comes off a stored credit report: the
//     inquiries list under the next step, the Inquiries count tile, Card Use,
//     Scores, System Facts, income estimates. Nothing is clicked.
//  Screenshots carry red numbered boxes + a legend (CLAUDE.md §8).
// Never prints the password or the cookie.
//   TAG=before node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n12-verify.mjs
//   LOCAL=1 serves this branch's control panel page against the live API.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const FILES = [
  { key: "13", id: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042", name: /Thirteen/ },
  { key: "colin", id: "e42c11e8-ec33-40b7-ac5a-99f733d18a3f", name: /Colin/ },
];
const TAG = process.env.TAG || "before";
const LOCAL = process.env.LOCAL === "1";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N12";
mkdirSync(SHOTS, { recursive: true });

const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n12-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const token = m[1];
const H = { cookie: `fundhub_session=${token}` };

function parse(v) { if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v; }

const out = { at: new Date().toISOString(), tag: TAG, local: LOCAL, files: {} };
for (const f of FILES) {
  const api = await fetch(`${BASE}/api/dashboard/client?id=${f.id}`, { headers: H });
  const d = await api.json();
  out.files[f.key] = {
    api: {
      status: api.status,
      crs_rows: (d?.crs_results || []).map((row) => {
        const res = parse(row.result) || {};
        const norm = (res.normalized && typeof res.normalized === "object") ? res.normalized : res;
        return {
          created_at: row.created_at,
          environment: res.environment ?? null,
          simulated: res.simulated ?? null,
          has_utilization: res.utilization !== undefined,
          inquiries: (Array.isArray(norm.inquiries) ? norm.inquiries.length : 0)
            + (Array.isArray(res.inquiries) && res !== norm ? res.inquiries.length : 0),
        };
      }),
      tri_merge_asOf: d?.tri_merge?.asOf ?? null,
      utilisation: d?.utilisation ?? null,
      income_estimates: d?.income_estimates ?? null,
    },
  };
}
console.log(JSON.stringify(out.files, null, 2));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: Number(process.env.VW || 1440), height: 2200 } });
await context.addCookies([
  { name: "fundhub_session", value: token, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
]);
const LOCAL_HTML = new URL("../../../public/app/client-control-panel.html", import.meta.url);
const blocked = [];
await context.route("**/*", (route) => {
  const q = route.request();
  if (!["GET", "HEAD", "OPTIONS"].includes(q.method())) { blocked.push(`${q.method()} ${new URL(q.url()).pathname}`); return route.abort(); }
  if (LOCAL && new URL(q.url()).pathname === "/app/client-control-panel.html") {
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: readFileSync(LOCAL_HTML, "utf8") });
  }
  return route.continue();
});
const page = await context.newPage();

async function mark(marks, title) {
  await page.evaluate(({ marks, title }) => {
    document.querySelectorAll(".n12-mark").forEach((n) => n.remove());
    const legend = document.createElement("div");
    legend.className = "n12-mark";
    legend.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#fff;border:3px solid #ff2828;padding:10px 14px;font:14px/1.45 -apple-system,Helvetica,sans-serif;color:#111;max-width:1000px;box-shadow:0 2px 10px rgba(0,0,0,.3)";
    legend.innerHTML = `<b></b>`;
    legend.firstChild.textContent = title;
    marks.forEach((mk, i) => {
      const el = document.querySelector(mk.sel);
      const line = document.createElement("div");
      line.textContent = `${i + 1}. ${mk.caption}`;
      legend.appendChild(line);
      if (!el) return;
      const b = el.getBoundingClientRect();
      if (!b.width) return;
      const box = document.createElement("div");
      box.className = "n12-mark";
      box.style.cssText = `position:absolute;left:${b.left + window.scrollX - 4}px;top:${b.top + window.scrollY - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid #ff2828;z-index:2147483646;pointer-events:none`;
      const tag = document.createElement("div");
      tag.textContent = String(i + 1);
      tag.style.cssText = "position:absolute;left:-3px;top:-26px;background:#ff2828;color:#fff;font:bold 15px Helvetica,sans-serif;padding:2px 8px";
      box.appendChild(tag);
      document.body.appendChild(box);
    });
    document.body.appendChild(legend);
  }, { marks, title });
}

for (const f of FILES) {
  out.files[f.key].looks = [];
  for (let i = 1; i <= 2; i++) {
    await page.goto(`${BASE}/app/client-control-panel.html?id=${f.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((src) => new RegExp(src).test(document.getElementById("ccp-name")?.textContent || ""), f.name.source, { timeout: 45000 });
    await page.waitForFunction(() => {
      const t = (document.getElementById("ccp-inquiries")?.textContent || "").trim();
      return t && t !== "—";
    }, null, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const look = await page.evaluate(() => {
      const t = (id) => (document.getElementById(id)?.textContent || "").trim().replace(/\s+/g, " ");
      const note = (id) => {
        const el = document.getElementById(id);
        return el ? { hidden: el.hidden, text: t(id) } : "no such element";
      };
      const inq = document.getElementById("ccp-next-inquiries");
      return {
        name: t("ccp-name"),
        inquiriesListHidden: inq ? inq.hidden : null,
        inquiriesListHead: (inq?.querySelector(".na-inq-head")?.textContent || "").trim(),
        inquiriesListRows: inq ? inq.querySelectorAll(".na-inq-row").length : 0,
        inquiriesListSampleLine: (inq?.querySelector(".fact-note")?.textContent || "").trim(),
        inquiriesTile: t("ccp-inquiries"),
        inquiriesTileNote: note("ccp-inquiries-sample"),
        cardUseTile: t("ccp-card-use"),
        cardUseNote: note("ccp-card-use-sample"),
        scoresTile: t("ccp-scores"),
        scoresNote: note("ccp-scores-sample"),
        factsScores: t("ccp-facts-scores"),
        lastPull: t("ccp-last-pull"),
        incomeEx: t("ccp-income-ex"),
        incomeEq: t("ccp-income-eq"),
        inquiryNames: note("ccp-inquiry-names"),
      };
    });
    out.files[f.key].looks.push(look);
    console.log(`${f.key} look ${i}`, JSON.stringify(look, null, 2));
    await page.evaluate(() => window.scrollTo(0, 0));
    const says = (n) => (n && n.hidden === false && n.text ? ` — under it: "${n.text}"` : " — nothing says sample");
    await mark([
      { sel: "#ccp-next-inquiries", caption: `Inquiries list: "${look.inquiriesListHead}" (${look.inquiriesListRows} rows)` + (look.inquiriesListSampleLine ? ` — "${look.inquiriesListSampleLine}"` : " — nothing says sample") },
      { sel: ".rf-tile:has(#ccp-inquiries)", caption: `Inquiries tile: "${look.inquiriesTile}"` + says(look.inquiriesTileNote) },
      { sel: ".rf-tile:has(#ccp-scores)", caption: `Scores tile: "${look.scoresTile}"` + says(look.scoresNote) },
      { sel: ".rf-tile:has(#ccp-card-use)", caption: `Card Use tile: "${look.cardUseTile}"` + says(look.cardUseNote) },
    ], `Hole N12 (${TAG}${LOCAL ? ", this branch's page on live data" : ", live page"}) — ${look.name}, look ${i}`);
    await page.screenshot({ path: `${SHOTS}/n12-${TAG}-${f.key}-look${i}.png`, fullPage: false });
  }
}

out.blockedWrites = blocked;
writeFileSync(`${SHOTS}/n12-${TAG}.json`, JSON.stringify(out, null, 2));
console.log("blocked writes:", blocked.length, blocked.slice(0, 5));
await browser.close();
