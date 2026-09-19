// VERIFY only: live look at #9 Nine-Repair letters vs UnderwriteIQ brain.
// GET + READ ONLY. No generate, no send, no mail.
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT_DIR = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-18-letter-brain";
mkdirSync(OUT_DIR, { recursive: true });

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-letter-brain-verify" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const loginJson = await loginRes.json().catch(() => ({}));
const m = (loginRes.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const cookie = m ? m[1] : null;
const token = loginJson.token || null;
const out = {
  at: new Date().toISOString(),
  loginStatus: loginRes.status,
  loginOk: Boolean(loginJson.ok),
  gotCookie: Boolean(cookie),
  role: loginJson.role || loginJson.staff?.role || null,
};
if (!cookie) {
  writeFileSync(`${OUT_DIR}/verify.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
const H = { cookie: `fundhub_session=${cookie}`, accept: "application/json" };
if (token) H.Authorization = `Bearer ${token}`;

async function get(path) {
  const a = await fetch(`${BASE}${path}`, { headers: H });
  const d = await a.json().catch(() => null);
  return { status: a.status, d };
}

function slimDoc(d) {
  return {
    id: d.id,
    title: d.title,
    kind: d.kind || d.doc_kind || d.type,
    subtype: d.subtype,
    mime: d.mime_type || d.mime,
    class: d.class || d.doc_class,
  };
}

const dash = await get(`/api/dashboard/client?id=${NINE}`);
const docs = await get(`/api/read/documents?client_id=${NINE}`);
const docsAlt = docs.status >= 400 ? await get(`/api/documents?client_id=${NINE}`) : docs;
const uw = await get(`/api/underwrite?client_id=${NINE}`);
const uwAlt = uw.status >= 400 ? await get(`/api/read/underwrite?client_id=${NINE}`) : uw;
const repairOne = await get(`/api/read/repair-cases?client_id=${NINE}`);
const repairList = await get(`/api/read/repair-cases`);
const portal = await get(`/api/read/portal-summary?client_id=${NINE}`);
const progress = await get(`/api/read/client-progress?client_id=${NINE}`);
const own = await get(`/api/read/portal-own?client_id=${NINE}`);

function pickDocs(body) {
  const list = body?.documents || body?.docs || body?.files || body?.items || [];
  return Array.isArray(list) ? list : [];
}

const docList = pickDocs(docsAlt.d);
const letterish = docList.filter((d) => {
  const t = `${d.title || ""} ${d.kind || ""} ${d.subtype || ""} ${d.mime_type || ""}`.toLowerCase();
  return /letter|dispute|metro|bureau/.test(t);
});

const nineRow = (repairList.d?.files || repairList.d?.cases || []).find(
  (f) => f.client_id === NINE || f.id === NINE,
) || null;

out.live = {
  dash: {
    status: dash.status,
    name: dash.d?.client ? `${dash.d.client.first_name} ${dash.d.client.last_name}` : dash.d?.name,
    next: dash.d?.fulfillment?.next_action || dash.d?.employee_next_action,
  },
  docs: {
    status: docs.status,
    altStatus: docsAlt.status,
    count: docList.length,
    keys: docsAlt.d ? Object.keys(docsAlt.d).slice(0, 20) : [],
    titles: docList.map((d) => d.title),
    letterish: letterish.map(slimDoc),
    uwiq: docList.filter((d) => /underwrite|roadmap|snapshot|analysis|lender/i.test(`${d.title} ${d.kind} ${d.subtype}`)).map(slimDoc),
  },
  underwrite: {
    status: uw.status,
    altStatus: uwAlt.status,
    keys: uwAlt.d ? Object.keys(uwAlt.d).slice(0, 20) : [],
    engine: uwAlt.d?.engine || null,
    tradelineSource: uwAlt.d?.tradelineSource || null,
    deliverableCount: uwAlt.d?.deliverables?.length || uwAlt.d?.files?.length || null,
  },
  repairOne: {
    status: repairOne.status,
    keys: repairOne.d ? Object.keys(repairOne.d).slice(0, 30) : [],
    files: (repairOne.d?.files || []).map((f) => ({
      client_id: f.client_id,
      name: f.name || f.full_name,
      program: f.program,
      round: f.round,
      letters: f.letters?.length ?? f.letter_count,
      items: f.items?.length ?? f.item_count,
      can_send: f.can_send,
      stage: f.stage || f.status,
    })),
    cases: (repairOne.d?.cases || []).slice(0, 5).map((c) => ({
      id: c.id, bureau: c.bureau, round: c.round, status: c.status,
      letters: c.letters?.length, items: c.items?.length,
    })),
  },
  repairListRow: nineRow && {
    client_id: nineRow.client_id,
    name: nineRow.name || nineRow.full_name,
    program: nineRow.program,
    round: nineRow.round,
    letters: nineRow.letters?.length ?? nineRow.letter_count,
    items: nineRow.items?.length ?? nineRow.item_count,
    can_send: nineRow.can_send,
    stuck: nineRow.stuck || nineRow.bucket,
    status: nineRow.status || nineRow.stage,
  },
  portal: {
    status: portal.status,
    keys: portal.d ? Object.keys(portal.d?.data || portal.d || {}).slice(0, 25) : [],
  },
  progress: {
    status: progress.status,
    deliverables: progress.d?.deliverables,
    nextStep: progress.d?.nextStep,
  },
  own: {
    status: own.status,
    keys: own.d ? Object.keys(own.d).slice(0, 20) : [],
  },
};

// DB read-only: dispute letters + documents for #9
const url = process.env.DATABASE_URL;
out.db = { skipped: !url };
if (url) {
  const client = new pg.Client({ connectionString: url, statement_timeout: 15000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const letters = await client.query(
      `SELECT id, bureau, round, status, target, mailed_at, created_at,
              left(coalesce(body_text, html, ''), 80) AS start
         FROM dispute_letters
        WHERE client_id = $1
           OR case_id IN (SELECT id FROM dispute_cases WHERE client_id = $1)
        ORDER BY created_at DESC
        LIMIT 50`,
      [NINE],
    ).catch((e) => ({ rows: [], error: e.message.slice(0, 200) }));
    const cases = await client.query(
      `SELECT id, bureau, round, status, created_at
         FROM dispute_cases WHERE client_id = $1
        ORDER BY created_at DESC LIMIT 20`,
      [NINE],
    ).catch((e) => ({ rows: [], error: e.message.slice(0, 200) }));
    const items = await client.query(
      `SELECT count(*)::int AS n FROM dispute_items
        WHERE case_id IN (SELECT id FROM dispute_cases WHERE client_id = $1)`,
      [NINE],
    ).catch((e) => ({ rows: [{ n: null, error: e.message.slice(0, 200) }] }));
    const docsDb = await client.query(
      `SELECT id, title, kind, subtype, mime_type, byte_size
         FROM documents WHERE client_id = $1
        ORDER BY created_at DESC LIMIT 40`,
      [NINE],
    ).catch((e) => ({ rows: [], error: e.message.slice(0, 200) }));
    const program = await client.query(
      `SELECT id, status, program_type, current_round, rounds_cap
         FROM repair_programs WHERE client_id = $1 LIMIT 5`,
      [NINE],
    ).catch((e) => ({ rows: [], error: e.message.slice(0, 200) }));
    out.db = {
      dispute_letters: letters.error || {
        count: letters.rows.length,
        rows: letters.rows.map((r) => ({
          id: r.id, bureau: r.bureau, round: r.round, status: r.status,
          target: r.target, mailed: Boolean(r.mailed_at), created_at: r.created_at,
          start: r.start,
        })),
      },
      dispute_cases: cases.error || { count: cases.rows.length, rows: cases.rows },
      dispute_items: items.rows?.[0] || items.error,
      documents: docsDb.error || {
        count: docsDb.rows.length,
        titles: docsDb.rows.map((r) => ({
          title: r.title, kind: r.kind, subtype: r.subtype, mime: r.mime_type, bytes: r.byte_size,
        })),
      },
      program: program.error || program.rows,
    };
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

writeFileSync(`${OUT_DIR}/verify.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  login: out.loginStatus,
  docs: out.live.docs.count,
  letterish: out.live.docs.letterish.length,
  uwiq: out.live.docs.uwiq.length,
  repairFiles: out.live.repairOne.files,
  repairRow: out.live.repairListRow,
  dbLetters: out.db?.dispute_letters?.count ?? out.db,
  dbCases: out.db?.dispute_cases?.count,
  program: out.db?.program,
  docTitles: out.live.docs.titles,
}, null, 2));
