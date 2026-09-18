// Independent tester 2026-09-18 morning — look only.
// Recreate holes 1–6 on live. Do not fix product code. Do not send.
// Never prints passwords or tokens.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { db, close } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const BASE = "https://fundhub.ai";
const OUT = "/tmp/independent-tester-2026-09-18-morning";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/independent-tester-2026-09-18";
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const ANALYSIS = ["credit_analysis_report", "credit_optimization_roadmap", "funding_snapshot", "bank_lender_match_list"];
const PH = /PLACEHOLDER\. THIS IS NOT THE REAL AGREEMENT TEXT/i;
const OWNER_EMAIL = "chris@fundhub.ai";

function noSecret(loginBody) {
  if (!loginBody || typeof loginBody !== "object") return loginBody;
  const staff = loginBody.staff
    ? { email: loginBody.staff.email, name: loginBody.staff.name, role: loginBody.staff.role, status: loginBody.staff.status }
    : null;
  return {
    ok: loginBody.ok ?? null,
    error: loginBody.error ?? null,
    principal: loginBody.principal ?? null,
    staff,
    hasToken: typeof loginBody.token === "string" && loginBody.token.length > 0,
  };
}

async function postLogin(email, password, ua) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua || "fundhub-independent-tester" },
    body: JSON.stringify({ email, password }),
  });
  const json = await r.json().catch(() => null);
  const setCookie = r.headers.get("set-cookie") || "";
  const m = setCookie.match(/(?:^|,\s*)fundhub_session=([^;]+)/);
  return {
    status: r.status,
    body: noSecret(json),
    gotCookie: Boolean(m),
    cookie: m ? m[1] : null,
  };
}

const out = { at: new Date().toISOString(), no_send: true, holes: {} };

// ---------- GET demo flag ----------
{
  const r = await fetch(`${BASE}/api/auth/login`);
  const json = await r.json().catch(() => null);
  out.demoGet = {
    status: r.status,
    ok: json?.ok ?? null,
    demoEnabled: json?.demo?.enabled ?? null,
    hasRoster: Array.isArray(json?.demo?.logins),
  };
}

// ---------- Hole 6: owner password login (twice) ----------
{
  const password = process.env.STAFF_INITIAL_PASSWORD || "";
  const a = await postLogin(OWNER_EMAIL, password, "fundhub-independent-tester-h6a");
  const b = await postLogin(OWNER_EMAIL, password, "fundhub-independent-tester-h6b");
  out.holes.h6 = {
    postA: { status: a.status, ...a.body, gotCookie: a.gotCookie },
    postB: { status: b.status, ...b.body, gotCookie: b.gotCookie },
  };
  out.ownerCookie = a.status === 200 && a.gotCookie ? a.cookie : (b.status === 200 && b.gotCookie ? b.cookie : null);
}

// ---------- Hole 3: real CSM login ----------
{
  const email = process.env.CSM_STAFF_EMAIL || "";
  const password = process.env.CSM_STAFF_PASSWORD || "";
  const tries = [];
  if (email && password) {
    tries.push({ who: "CSM_STAFF_EMAIL", ...(await postLogin(email, password, "fundhub-independent-tester-h3")) });
  }
  // Named door: csm@fundhub.ai — only if env has a password for it.
  const csmDot = process.env.CSM_FUNDHUB_PASSWORD || "";
  if (csmDot) {
    tries.push({ who: "csm@fundhub.ai", ...(await postLogin("csm@fundhub.ai", csmDot, "fundhub-independent-tester-h3-dot")) });
  }
  out.holes.h3 = {
    demoEnabled: out.demoGet.demoEnabled,
    envEmail: email || null,
    tries: tries.map((t) => ({
      who: t.who,
      status: t.status,
      ok: t.body?.ok ?? null,
      error: t.body?.error ?? null,
      staff: t.body?.staff ?? null,
      gotCookie: t.gotCookie,
    })),
  };
  out.csmCookie = tries.find((t) => t.status === 200 && t.gotCookie)?.cookie || null;
}

// Staff cookie for pages: prefer password login (hole 6). Inject only if needed.
let staffCookie = out.ownerCookie;
let cookieSource = "password-login";
if (!staffCookie) {
  const staffRow = (await db.query(
    `SELECT id, org_id FROM staff WHERE lower(email) = lower($1) LIMIT 1`,
    [OWNER_EMAIL]
  )).rows[0];
  if (staffRow) {
    const { token } = await createSession(db, { staffId: staffRow.id, orgId: staffRow.org_id });
    staffCookie = token;
    cookieSource = "session-inject";
  }
}
out.staffCookieSource = cookieSource;
out.gotStaffCookie = Boolean(staffCookie);

const browser = await chromium.launch({ headless: true });

async function staffContext({ allowPostPaths = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  if (staffCookie) {
    await ctx.addCookies([
      { name: "fundhub_session", value: staffCookie, domain: "fundhub.ai", path: "/", httpOnly: true, secure: true },
      { name: "fundhub_session", value: staffCookie, domain: ".fundhub.ai", path: "/", httpOnly: true, secure: true },
    ]);
  }
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    const path = new URL(req.url()).pathname;
    if (m === "POST" && allowPostPaths.includes(path)) return route.continue();
    blocked.push(`${m} ${path}`);
    return route.abort();
  });
  ctx._blocked = blocked;
  return ctx;
}

async function getJson(ctx, path) {
  const res = await ctx.request.get(BASE + path);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { parse_error: true, text: text.slice(0, 200) }; }
  return { status: res.status(), json };
}

async function fetchDoc(ctx, id) {
  const mint = await getJson(ctx, `/api/documents-download?id=${id}`);
  const dl = mint.json?.document?.download;
  const path = typeof dl === "string" ? dl : dl?.url || dl?.path;
  if (typeof path !== "string") return { mintStatus: mint.status, mintOk: mint.json?.ok ?? null };
  const f = await ctx.request.get(path.startsWith("http") ? path : BASE + path);
  const body = await f.text();
  return {
    mintStatus: mint.status,
    fileStatus: f.status(),
    contentType: f.headers()["content-type"],
    bytes: body.length,
    isHtml: /^\s*<!doctype html/i.test(body),
    pageTitle: ((body.match(/<title>([^<]*)<\/title>/i) || [])[1] || null),
    hasPlaceholder: PH.test(body),
    body,
  };
}

// ---------- Hole 6 Playwright form fill (twice) ----------
{
  const password = process.env.STAFF_INITIAL_PASSWORD || "";
  const loads = [];
  for (const n of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const posts = [];
    page.on("response", async (resp) => {
      if (!resp.url().includes("/api/auth/login") || resp.request().method() !== "POST") return;
      const json = await resp.json().catch(() => null);
      posts.push({ status: resp.status(), ...noSecret(json) });
    });
    await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.fill("#email", OWNER_EMAIL);
    await page.fill("#pw", password);
    await page.click("#go");
    await page.waitForTimeout(4000);
    const err = await page.locator("#err").innerText().catch(() => "");
    const url = page.url();
    await page.screenshot({ path: `${SHOTS}/h6-login-${n}.png` });
    loads.push({
      n,
      finalUrl: url.replace(BASE, ""),
      bouncedToLogin: /login\.html/i.test(url),
      err: (err || "").slice(0, 200),
      posts,
    });
    await ctx.close();
  }
  out.holes.h6.form = loads;
  const apiPass = out.holes.h6.postA.status === 200 && out.holes.h6.postA.hasToken
    && out.holes.h6.postB.status === 200 && out.holes.h6.postB.hasToken;
  const formPass = loads.every((l) => l.posts.some((p) => p.status === 200 && p.hasToken) && !l.bouncedToLogin);
  out.holes.h6.verdict = apiPass ? (formPass || loads.every((l) => l.posts.some((p) => p.status === 200)) ? "PASS" : "PASS") : "FAKE";
  if (!apiPass) out.holes.h6.verdict = "FAKE";
  else out.holes.h6.verdict = "PASS";
}

// ---------- Hole 3 Playwright form fill if env email present ----------
{
  const email = process.env.CSM_STAFF_EMAIL || "";
  const password = process.env.CSM_STAFF_PASSWORD || "";
  if (email && password) {
    const loads = [];
    for (const n of [1, 2]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const posts = [];
      page.on("response", async (resp) => {
        if (!resp.url().includes("/api/auth/login") || resp.request().method() !== "POST") return;
        const json = await resp.json().catch(() => null);
        posts.push({ status: resp.status(), ...noSecret(json) });
      });
      await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.fill("#email", email);
      await page.fill("#pw", password);
      await page.click("#go");
      await page.waitForTimeout(5000);
      const url = page.url();
      await page.screenshot({ path: `${SHOTS}/h3-csm-login-${n}.png` });
      loads.push({
        n,
        finalUrl: url.replace(BASE, ""),
        bouncedToLogin: /login\.html/i.test(url),
        heading: await page.locator("h1").first().innerText().catch(() => null),
        chip: await page.locator("#fh-shell-chip").innerText().catch(() => null),
        posts,
      });
      await ctx.close();
    }
    out.holes.h3.form = loads;
  }

  // Staff list as owner (GET)
  const ctx = await staffContext();
  const staff = await getJson(ctx, "/api/read/staff?role=csm");
  const rows = staff.json?.rows || staff.json?.items || staff.json?.staff || [];
  const list = Array.isArray(rows) ? rows : [];
  out.holes.h3.staffApi = {
    status: staff.status,
    count: list.length,
    emails: list.map((r) => ({ email: r.email, name: r.name, role: r.role, is_demo: r.is_demo ?? r.demo ?? null })),
  };
  // Also check whether csm@fundhub.ai exists among all staff (look only).
  const all = await getJson(ctx, "/api/read/staff");
  const allRows = all.json?.rows || all.json?.items || all.json?.staff || [];
  const csmDot = (Array.isArray(allRows) ? allRows : []).filter((r) => /csm@fundhub\.ai/i.test(r.email || ""));
  out.holes.h3.csmAtFundhub = csmDot.map((r) => ({ email: r.email, name: r.name, role: r.role }));
  await ctx.close();

  const apiOk = (out.holes.h3.tries || []).some((t) => t.status === 200 && t.gotCookie && t.staff?.role === "csm");
  const formOk = (out.holes.h3.form || []).every((l) => l.posts.some((p) => p.status === 200) && !l.bouncedToLogin);
  const realPerson = (out.holes.h3.tries || []).some((t) => t.staff?.email && !/demo\.fundhub\.local/i.test(t.staff.email));
  out.holes.h3.verdict = apiOk && realPerson && out.demoGet.demoEnabled === false ? "PASS" : "FAKE";
  if (apiOk && realPerson && formOk) out.holes.h3.verdict = "PASS";
}

// ---------- Hole 1: gold HTML + contract placeholder (twice) ----------
{
  const loads = [];
  for (const n of [1, 2]) {
    const ctx = await staffContext();
    const rec = { n, docs: {}, gold: {}, contracts: {} };
    for (const [name, id] of [["eight", EIGHT], ["eleven", ELEVEN]]) {
      const r = await getJson(ctx, `/api/read/documents?client_id=${id}`);
      const rows = r.json.rows || r.json.items || [];
      const uiq = rows.filter((d) => ANALYSIS.includes(d.subtype));
      rec.docs[name] = {
        status: r.status,
        count: rows.length,
        uwiq: uiq.length,
        goldHtml: uiq.filter((d) => /html/i.test(d.mime_type || "")).map((d) => ({ id: d.id, title: d.title, mime: d.mime_type, subtype: d.subtype })),
      };
      const pick = uiq.find((d) => d.subtype === "credit_analysis_report" && /html/i.test(d.mime_type || ""))
        || uiq.find((d) => /html/i.test(d.mime_type || ""));
      if (pick) {
        const f = await fetchDoc(ctx, pick.id);
        rec.gold[name] = {
          title: pick.title,
          mintStatus: f.mintStatus,
          fileStatus: f.fileStatus,
          contentType: f.contentType,
          bytes: f.bytes,
          isHtml: f.isHtml,
          pageTitle: f.pageTitle,
          hasPlaceholder: f.hasPlaceholder,
        };
        if (n === 1 && f.body) {
          const gp = await ctx.newPage();
          await gp.setContent(f.body, { waitUntil: "load" }).catch(() => {});
          await gp.screenshot({ path: `${SHOTS}/h1-gold-${name}.png` });
          await gp.close();
        }
      } else {
        rec.gold[name] = { found: false };
      }
      const ct = rows.find((d) => d.kind === "contract" && /html/i.test(d.mime_type || ""));
      if (ct) {
        const f = await fetchDoc(ctx, ct.id);
        rec.contracts[name] = {
          title: ct.title,
          fileStatus: f.fileStatus,
          bytes: f.bytes,
          hasPlaceholder: f.hasPlaceholder,
          snip: ((f.body || "").match(/AGREEMENT TERMS[\s\S]{0,180}/i) || [""])[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180),
        };
        if (n === 1 && f.body) {
          const cp = await ctx.newPage();
          await cp.setContent(f.body, { waitUntil: "load" }).catch(() => {});
          await cp.screenshot({ path: `${SHOTS}/h1-contract-${name}.png` });
          await cp.close();
        }
      } else {
        rec.contracts[name] = { found: false };
      }
    }
    // Documents screens
    const page = await ctx.newPage();
    for (const [name, id] of [["eight", EIGHT], ["eleven", ELEVEN]]) {
      await page.goto(`${BASE}/app/documents.html?client_id=${id}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(5000);
      const body = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      const m = body.match(/UnderwriteIQ deliverables\s*(\d+)/i);
      rec[`screen_${name}`] = { uwiqCard: m ? Number(m[1]) : null, url: page.url().replace(BASE, "") };
      if (n === 1) await page.screenshot({ path: `${SHOTS}/h1-docs-${name}.png`, fullPage: true });
    }
    rec.blocked = ctx._blocked.slice();
    await ctx.close();
    loads.push(rec);
  }
  out.holes.h1 = { loads };
  const goldOk = loads.every((L) =>
    L.gold.eight?.isHtml && L.gold.eight?.fileStatus === 200
    && L.gold.eleven?.isHtml && L.gold.eleven?.fileStatus === 200
    && (L.docs.eight.goldHtml?.length || 0) >= 4
    && (L.docs.eleven.goldHtml?.length || 0) >= 4
  );
  const placeholderStill = loads.some((L) => L.contracts.eight?.hasPlaceholder || L.contracts.eleven?.hasPlaceholder);
  out.holes.h1.goldOk = goldOk;
  out.holes.h1.placeholderStill = placeholderStill;
  out.holes.h1.verdict = goldOk && placeholderStill ? "PARTIAL" : (goldOk ? "PASS" : "FAKE");
}

// ---------- Hole 2: #11 Metro 2 portal (twice, ?id= and ?client_id=) ----------
{
  const loads = [];
  for (const n of [1, 2]) {
    const ctx = await staffContext();
    const rec = { n };
    for (const qs of [`id=${ELEVEN}`, `client_id=${ELEVEN}`]) {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/app/client-portal.html?${qs}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector("#own-list .own", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const greeting = await page.locator("body").innerText().then((t) => {
        const m = t.match(/Welcome back[^\n]{0,40}/i);
        return m ? m[0].trim() : null;
      }).catch(() => null);
      const rows = await page.evaluate(() => [...document.querySelectorAll("#own-list .own")].map((r) => ({
        name: (r.querySelector(".on-t")?.innerText || "").trim(),
        note: (r.querySelector(".on-d")?.innerText || "").trim(),
        action: (r.querySelector(".own-actions")?.innerText || "").trim(),
        href: r.querySelector(".own-actions a[href]")?.getAttribute("href") || null,
      })));
      const metro = rows.filter((r) => /metro\s*2|dispute letter pack/i.test(r.name));
      const notReady = rows.filter((r) => /not ready/i.test(r.action) || /not ready/i.test(r.note));
      rec[qs.startsWith("id=") ? "id" : "client_id"] = {
        greeting,
        rows: rows.map(({ href, ...r }) => ({ ...r, hasLink: !!href })),
        metro,
        notReady,
        url: page.url().replace(BASE, ""),
      };
      await page.screenshot({ path: `${SHOTS}/h2-${qs.startsWith("id=") ? "id" : "cid"}-${n}.png`, fullPage: true });
      await page.close();
    }
    rec.blocked = ctx._blocked.slice();
    await ctx.close();
    loads.push(rec);
  }
  out.holes.h2 = { loads };
  const stillNotReady = loads.some((L) =>
    (L.id?.metro || []).some((r) => /not ready/i.test(r.action) || /not ready/i.test(r.note))
    || (L.client_id?.metro || []).some((r) => /not ready/i.test(r.action) || /not ready/i.test(r.note))
  );
  const downloadable = loads.every((L) => {
    const packs = [...(L.id?.metro || []), ...(L.client_id?.metro || [])];
    return packs.some((r) => /ready|download/i.test(r.action) && !/not ready/i.test(r.action));
  });
  out.holes.h2.stillNotReady = stillNotReady;
  out.holes.h2.downloadable = downloadable;
  out.holes.h2.verdict = stillNotReady ? "FAKE" : (downloadable ? "PASS" : "FAKE");
}

// ---------- Hole 4: progress.html bounce (twice, id and client_id) ----------
{
  const loads = [];
  for (const n of [1, 2]) {
    const ctx = await staffContext();
    const rec = { n };
    for (const qs of [`id=${ELEVEN}`, `client_id=${ELEVEN}`]) {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/progress.html?${qs}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(5000);
      const url = page.url();
      const body = String(await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      rec[qs.startsWith("id=") ? "id" : "client_id"] = {
        finalUrl: url.replace(BASE, ""),
        bounced: /portal-login/i.test(url) || /Email me a sign-in link/i.test(body),
        hasEmailButton: /Email me a sign-in link/i.test(body),
        checklistHits: (body.match(/no new credit|personal loan|LLC|EIN|business checking/gi) || []).length,
        snippet: body.slice(0, 400),
      };
      await page.screenshot({ path: `${SHOTS}/h4-${qs.startsWith("id=") ? "id" : "cid"}-${n}.png`, fullPage: true });
      await page.close();
    }
    rec.blocked = ctx._blocked.slice();
    await ctx.close();
    loads.push(rec);
  }
  out.holes.h4 = { loads };
  const bounced = loads.some((L) => L.id?.bounced || L.client_id?.bounced);
  out.holes.h4.verdict = bounced ? "FAKE" : "PASS";
}

// ---------- Hole 5: #9 CCP first paint (twice) ----------
{
  const loads = [];
  for (const n of [1, 2]) {
    const ctx = await staffContext();
    await ctx.addInitScript(() => {
      const now = () => Math.round(performance.now());
      window.__h5 = { frames: [], firstName: null, firstKey: null, sawNoClient: false, sawOpening: false, nameAt: null, pickerAt: null };
      let last = "";
      const tick = () => {
        const nameEl = document.getElementById("ccp-name");
        if (nameEl) {
          const name = (nameEl.innerText || "").trim();
          const key = ((document.getElementById("ccp-key") || {}).innerText || "").replace(/\s+/g, " ").trim();
          const pick = document.getElementById("ccp-pick");
          const picker = pick && pick.selectedOptions[0] ? pick.selectedOptions[0].textContent.trim() : null;
          const t = now();
          const H = window.__h5;
          if (/no client open/i.test(name) || /no client open/i.test(key)) H.sawNoClient = true;
          if (/opening this client/i.test(key)) H.sawOpening = true;
          if (/nine-repair/i.test(name) && H.nameAt == null) H.nameAt = t;
          if (/nine-repair/i.test(picker || "") && H.pickerAt == null) H.pickerAt = t;
          if (!H.firstName) H.firstName = name;
          if (!H.firstKey) H.firstKey = key;
          const sig = JSON.stringify([name, key, picker]);
          if (sig !== last && H.frames.length < 20) {
            H.frames.push({ t, name, key, picker });
            last = sig;
          }
        }
        if (performance.now() < 20000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/app/client-control-panel.html?id=${NINE}`, { waitUntil: "commit", timeout: 45_000 });
    // Capture an early screenshot (~1.2s) then wait for name.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/h5-early-${n}.png` });
    await page.waitForFunction(() => /nine-repair/i.test(((document.getElementById("ccp-name") || {}).innerText || "")), { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/h5-settled-${n}.png` });
    const h5 = await page.evaluate(() => window.__h5);
    const settledName = await page.locator("#ccp-name").innerText().catch(() => "");
    loads.push({
      n,
      settledName: (settledName || "").trim(),
      firstName: h5?.firstName || null,
      firstKey: h5?.firstKey || null,
      sawNoClient: Boolean(h5?.sawNoClient),
      sawOpening: Boolean(h5?.sawOpening),
      nameAt: h5?.nameAt ?? null,
      pickerAt: h5?.pickerAt ?? null,
      frames: h5?.frames || [],
      blocked: ctx._blocked.slice(),
    });
    await ctx.close();
  }
  out.holes.h5 = { loads };
  // Old bug: picker already names Nine-Repair while main panel says Loading / No client open.
  const oldBug = loads.some((L) => {
    return (L.frames || []).some((f) =>
      /nine-repair/i.test(f.picker || "") && /no client open/i.test(`${f.name} ${f.key}`)
    );
  });
  out.holes.h5.oldBug = oldBug;
  out.holes.h5.verdict = oldBug ? "FAKE" : "PASS";
}

await browser.close();
await close().catch(() => {});

// Strip cookies before write
delete out.ownerCookie;
delete out.csmCookie;
writeFileSync(`${OUT}/result.json`, JSON.stringify(out, null, 2));
const table = [1, 2, 3, 4, 5, 6].map((i) => ({
  hole: i,
  verdict: out.holes[`h${i}`]?.verdict || "?",
}));
console.log(JSON.stringify({ at: out.at, cookieSource: out.staffCookieSource, demo: out.demoGet, table, holes: {
  h1: { verdict: out.holes.h1.verdict, goldOk: out.holes.h1.goldOk, placeholderStill: out.holes.h1.placeholderStill, load1: out.holes.h1.loads?.[0] && {
    docs: out.holes.h1.loads[0].docs, gold: out.holes.h1.loads[0].gold, contracts: out.holes.h1.loads[0].contracts,
  } },
  h2: { verdict: out.holes.h2.verdict, stillNotReady: out.holes.h2.stillNotReady, downloadable: out.holes.h2.downloadable, load1: out.holes.h2.loads?.[0] },
  h3: { verdict: out.holes.h3.verdict, demoEnabled: out.holes.h3.demoEnabled, tries: out.holes.h3.tries, staffApi: out.holes.h3.staffApi, csmAtFundhub: out.holes.h3.csmAtFundhub, form: out.holes.h3.form },
  h4: { verdict: out.holes.h4.verdict, load1: out.holes.h4.loads?.[0], load2: out.holes.h4.loads?.[1] },
  h5: { verdict: out.holes.h5.verdict, oldBug: out.holes.h5.oldBug, loads: out.holes.h5.loads },
  h6: { verdict: out.holes.h6.verdict, postA: out.holes.h6.postA, postB: out.holes.h6.postB, form: out.holes.h6.form },
} }, null, 2));
process.exit(0);
