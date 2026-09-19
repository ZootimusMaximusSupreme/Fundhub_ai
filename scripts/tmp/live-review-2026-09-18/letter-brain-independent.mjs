// Independent tester — named-fix regression gate for credit-repair letter brain.
// Did NOT write commit 073c68e9. GET-only after login. No Send. No PostGrid.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-18-letter-brain-independent";
mkdirSync(OUT, { recursive: true });

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function sha8(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function noSecretLogin(json) {
  return {
    ok: json?.ok ?? null,
    error: json?.error ?? null,
    role: json?.staff?.role || json?.principal?.role || null,
    email: json?.staff?.email || null,
    hasToken: typeof json?.token === "string" && json.token.length > 0
  };
}

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-independent-tester-letter-brain" },
  body: JSON.stringify({
    email: "chris@fundhub.ai",
    password: process.env.STAFF_INITIAL_PASSWORD || ""
  })
});
const loginJson = await loginRes.json().catch(() => ({}));
const setCookie = loginRes.headers.get("set-cookie") || "";
const m = setCookie.match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) {
  writeFileSync(`${OUT}/result.json`, JSON.stringify({
    verdict: "BLOCKED",
    loginStatus: loginRes.status,
    login: noSecretLogin(loginJson)
  }, null, 2));
  console.log(JSON.stringify({ verdict: "BLOCKED", loginStatus: loginRes.status, login: noSecretLogin(loginJson) }));
  process.exit(1);
}
const H = {
  cookie: `fundhub_session=${m[1]}`,
  accept: "application/json",
  Authorization: `Bearer ${loginJson.token || ""}`
};

async function downloadDoc(id) {
  const metaRes = await fetch(`${BASE}/api/documents-download?id=${id}`, { headers: H });
  const meta = await metaRes.json().catch(() => ({}));
  const doc = meta.document || {};
  const path = typeof doc.download === "string" ? doc.download : (doc.download?.url || null);
  const out = {
    id,
    metaHttp: metaRes.status,
    title: doc.title || null,
    mime: doc.mime_type || null,
    downloadPath: path ? (String(path).startsWith("http") ? "absolute" : "relative") : null,
    http: null,
    bytes: 0,
    html: false,
    hasPre: false,
    sha8: null,
    textLen: 0,
    textHead: null
  };
  if (!path) return out;
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const g = await fetch(url, { headers: H });
  const buf = Buffer.from(await g.arrayBuffer());
  const text = buf.toString("utf8");
  const stripped = stripHtml(text);
  out.http = g.status;
  out.bytes = buf.length;
  out.html = /<html|<!doctype html/i.test(text);
  out.hasPre = /<pre>/i.test(text);
  out.sha8 = sha8(buf);
  out.textLen = stripped.length;
  out.textHead = stripped.slice(0, 180);
  out.stripped = stripped;
  return out;
}

async function look(pass) {
  const repairRes = await fetch(`${BASE}/api/read/repair-cases?client_id=${NINE}`, { headers: H });
  const repair = await repairRes.json().catch(() => ({}));
  const docsRes = await fetch(`${BASE}/api/read/documents?client_id=${NINE}`, { headers: H });
  const docs = await docsRes.json().catch(() => ({}));
  const portalRes = await fetch(`${BASE}/api/read/portal-summary?client_id=${NINE}`, { headers: H });
  const portal = await portalRes.json().catch(() => ({}));
  const items = docs.items || docs.documents || [];
  const generated = items.filter((d) =>
    d.subtype === "metro2_dispute_letter_pack" || /Dispute Letter Pack/i.test(d.title || "")
  );
  const photos = items.filter((d) =>
    String(d.mime_type || "").startsWith("image/") || d.kind === "bureau_response"
  );
  const letters = repair.letters || [];
  const downloads = [];
  for (const d of generated) {
    downloads.push(await downloadDoc(d.id));
  }

  const sameBrain = letters.map((l) => {
    const body = stripHtml(l.html || l.body_text || "");
    const bureauName = ({ EQ: "Equifax", EX: "Experian", TU: "TransUnion" }[l.bureau] || l.bureau || "");
    const match = downloads.find((d) => {
      const t = `${d.title || ""} ${d.stripped || ""}`;
      return new RegExp(bureauName, "i").test(t) && body.length > 40 && (d.stripped || "").includes(body.slice(40, 140));
    }) || downloads.find((d) => body.length > 80 && (d.stripped || "").includes(body.slice(80, 200)));
    const overlap = match && body.length > 80
      ? (match.stripped || "").includes(body.slice(80, 220))
      : false;
    return {
      letterId: l.id,
      bureau: l.bureau,
      round: l.round,
      status: l.status,
      target: l.target,
      can_send: l.can_send,
      htmlChars: (l.html || "").length,
      bodyHead: body.slice(0, 140),
      clientDocId: match?.id || null,
      clientTitle: match?.title || null,
      clientHttp: match?.http || null,
      overlap
    };
  });

  return {
    pass,
    at: new Date().toISOString(),
    urls: {
      repair: `${BASE}/api/read/repair-cases?client_id=${NINE}`,
      documents: `${BASE}/api/read/documents?client_id=${NINE}`,
      portal: `${BASE}/api/read/portal-summary?client_id=${NINE}`,
      desk: `${BASE}/app/inquiry-remover.html`
    },
    http: {
      repair: repairRes.status,
      documents: docsRes.status,
      portal: portalRes.status
    },
    file: repair.file && {
      name: repair.file.name,
      stage_key: repair.file.stage_key,
      stage_label: repair.file.stage_label,
      letters_ready: repair.file.letters_ready,
      letters_sent: repair.file.letters_sent,
      can_send: repair.file.can_send,
      program: repair.file.program
    },
    can_send: repair.can_send,
    letterCount: letters.length,
    letters: letters.map((l) => ({
      id: l.id,
      bureau: l.bureau,
      round: l.round,
      status: l.status,
      target: l.target,
      can_send: l.can_send,
      htmlChars: (l.html || "").length,
      hasHtml: Boolean(l.html && String(l.html).length > 100)
    })),
    itemCount: (repair.items || []).length,
    docCount: items.length,
    photoOrResponseCount: photos.length,
    generatedDocs: generated.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      subtype: d.subtype,
      mime: d.mime_type
    })),
    downloads: downloads.map(({ stripped, ...rest }) => rest),
    sameBrain,
    portalDocCount: Array.isArray(portal.documents) ? portal.documents.length : null,
    portalLetterish: Array.isArray(portal.documents)
      ? portal.documents.filter((d) => /letter|metro 2|dispute/i.test(`${d.title || ""} ${d.subtype || ""}`)).map((d) => ({
        id: d.id, title: d.title, kind: d.kind, subtype: d.subtype
      }))
      : null
  };
}

const pass1 = await look(1);
await new Promise((r) => setTimeout(r, 900));
const pass2 = await look(2);

let dbSame = { error: null, rows: [] };
try {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 15000 });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const q = await c.query(
    `SELECT dl.id AS letter_id, dl.bureau, dl.round, dl.status, dl.target,
            length(dl.body_text) AS letter_chars,
            d.id AS doc_id, d.title, d.subtype, d.mime_type, d.byte_size,
            d.metadata->>'letterId' AS meta_letter_id
       FROM dispute_letters dl
       LEFT JOIN documents d
         ON d.client_id = dl.client_id
        AND d.subtype = 'metro2_dispute_letter_pack'
        AND d.metadata->>'letterId' = dl.id::text
      WHERE dl.client_id = $1
      ORDER BY dl.bureau`,
    [NINE]
  );
  dbSame.rows = q.rows;
  await c.query("ROLLBACK");
  await c.end();
} catch (e) {
  dbSame.error = String(e.message || e).slice(0, 240);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "fundhub_session", value: m[1], url: BASE }]);
await ctx.route("**/*", (route) => {
  const method = route.request().method();
  const p = new URL(route.request().url()).pathname;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
  if (method === "POST" && p === "/api/auth/login") return route.continue();
  return route.abort();
});
const page = await ctx.newPage();

async function walk(pass) {
  await page.goto(`${BASE}/app/inquiry-remover.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const tab = page.locator("#tab-repair");
  if (await tab.count()) await tab.click();
  await page.waitForTimeout(2200);
  const row = page.locator(`[data-client-id="${NINE}"], tr:has-text("Nine-Repair")`).first();
  const rowCount = await row.count();
  if (rowCount) await row.click();
  await page.waitForTimeout(2800);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${OUT}/desk-pass${pass}.png`, fullPage: false });
  return {
    pass,
    url: page.url(),
    rowCount,
    hasNine: /sim nine-repair/i.test(text),
    readyToSend: /ready to send/i.test(text),
    sendVisible: /send letters/i.test(text),
    equifax: /equifax/i.test(text),
    experian: /experian/i.test(text),
    transunion: /transunion/i.test(text),
    letterHints: (text.match(/experian|equifax|transunion/gi) || []).slice(0, 12),
    snippet: text.slice(0, 500)
  };
}

const desk1 = await walk(1);
const desk2 = await walk(2);
await browser.close();

function passOk(p) {
  const threeLetters = p.letterCount === 3
    && ["EQ", "EX", "TU"].every((b) => p.letters.some((l) => l.bureau === b && l.hasHtml && l.status === "generated"));
  const threeDocs = p.generatedDocs.length >= 3
    && p.downloads.filter((d) => d.http === 200 && d.html && d.bytes > 500).length >= 3;
  const brain = p.sameBrain.length === 3 && p.sameBrain.every((x) => x.overlap && x.clientDocId && x.clientHttp === 200);
  return { threeLetters, threeDocs, brain };
}

const a = passOk(pass1);
const b = passOk(pass2);
const dbLinked = Array.isArray(dbSame.rows)
  && dbSame.rows.length === 3
  && dbSame.rows.every((r) => r.doc_id && r.meta_letter_id === r.letter_id);
const deskOk = desk1.hasNine && desk2.hasNine
  && desk1.equifax && desk1.experian && desk1.transunion
  && desk2.equifax && desk2.experian && desk2.transunion
  && desk1.sendVisible && desk2.sendVisible;

const real = a.threeLetters && a.threeDocs && a.brain
  && b.threeLetters && b.threeDocs && b.brain
  && dbLinked
  && deskOk
  && pass1.file?.letters_sent === 0
  && pass2.file?.letters_sent === 0;

const result = {
  tester: "independent",
  hole: "credit-repair letters from one UnderwriteIQ/repair brain; client copy + bureau send",
  clientId: NINE,
  live: BASE,
  loginStatus: loginRes.status,
  login: noSecretLogin(loginJson),
  pass1,
  pass2,
  dbSame,
  desk1,
  desk2,
  checks: { pass1: a, pass2: b, dbLinked, deskOk, lettersSentPass1: pass1.file?.letters_sent, lettersSentPass2: pass2.file?.letters_sent },
  verdict: real ? "REAL-FIX" : "FAKE",
  sentNothing: true
};

writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  verdict: result.verdict,
  loginStatus: loginRes.status,
  checks: result.checks,
  pass1: {
    letters: pass1.letters,
    generatedDocs: pass1.generatedDocs,
    downloads: pass1.downloads,
    sameBrain: pass1.sameBrain,
    can_send: pass1.can_send,
    file: pass1.file
  },
  pass2: {
    letters: pass2.letters,
    generatedDocs: pass2.generatedDocs,
    downloads: pass2.downloads.map((d) => ({ id: d.id, title: d.title, http: d.http, bytes: d.bytes, sha8: d.sha8 })),
    sameBrain: pass2.sameBrain,
    can_send: pass2.can_send
  },
  dbSame,
  desk1: { ...desk1, snippet: desk1.snippet?.slice(0, 220) },
  desk2: { ...desk2, snippet: desk2.snippet?.slice(0, 220) }
}, null, 2));
