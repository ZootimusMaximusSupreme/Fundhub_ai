// Prove twice on live: #9 has the same letters for client download and bureau send.
import { writeFileSync } from "node:fs";
import pg from "pg";

const BASE = "https://fundhub.ai";
const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-18-letter-brain";

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" })
});
const login = await loginRes.json();
const m = (loginRes.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
const H = {
  cookie: `fundhub_session=${m[1]}`,
  accept: "application/json",
  Authorization: `Bearer ${login.token}`
};

async function look(pass) {
  const repair = await fetch(`${BASE}/api/read/repair-cases?client_id=${NINE}`, { headers: H }).then((r) => r.json());
  const docs = await fetch(`${BASE}/api/read/documents?client_id=${NINE}`, { headers: H }).then((r) => r.json());
  const items = docs.items || docs.documents || [];
  const generated = items.filter((d) => d.subtype === "metro2_dispute_letter_pack" || /Dispute Letter Pack/i.test(d.title || ""));
  const letters = repair.letters || [];
  const downloads = [];
  for (const d of generated.slice(0, 3)) {
    const meta = await fetch(`${BASE}/api/documents-download?id=${d.id}`, { headers: H }).then((r) => r.json().catch(() => ({})));
    const doc = meta.document || {};
    const path = typeof doc.download === "string" ? doc.download : (doc.download?.url || null);
    let fetched = { id: d.id, title: d.title, http: null, bytes: 0, html: false };
    if (path) {
      const url = path.startsWith("http") ? path : `${BASE}${path}`;
      const g = await fetch(url, { headers: H });
      const buf = Buffer.from(await g.arrayBuffer());
      const text = buf.toString("utf8");
      fetched = {
        id: d.id,
        title: d.title,
        http: g.status,
        bytes: buf.length,
        html: /<html|<!doctype html/i.test(text),
        hasPre: /<pre>/i.test(text),
        sha8: (await import("node:crypto")).createHash("sha256").update(buf).digest("hex").slice(0, 8)
      };
    }
    downloads.push(fetched);
  }
  return {
    pass,
    at: new Date().toISOString(),
    can_send: repair.can_send,
    file: repair.file && {
      name: repair.file.name,
      stage_key: repair.file.stage_key,
      stage_label: repair.file.stage_label,
      letters_ready: repair.file.letters_ready,
      letters_sent: repair.file.letters_sent,
      can_send: repair.file.can_send,
      program: repair.file.program
    },
    letterCount: letters.length,
    letters: letters.map((l) => ({
      id: l.id, bureau: l.bureau, round: l.round, status: l.status,
      target: l.target, can_send: l.can_send, htmlChars: (l.html || "").length
    })),
    itemCount: (repair.items || []).length,
    generatedDocs: generated.map((d) => ({ id: d.id, title: d.title, kind: d.kind, subtype: d.subtype, mime: d.mime_type })),
    downloads
  };
}

const pass1 = await look(1);
await new Promise((r) => setTimeout(r, 800));
const pass2 = await look(2);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 15000 });
await c.connect();
await c.query("BEGIN READ ONLY");
const same = await c.query(
  `SELECT dl.bureau, length(dl.body_text) AS letter_chars, d.byte_size AS doc_bytes, d.title
     FROM dispute_letters dl
     JOIN documents d ON d.client_id = dl.client_id
      AND d.subtype = 'metro2_dispute_letter_pack'
      AND d.metadata->>'letterId' = dl.id::text
    WHERE dl.client_id = $1
    ORDER BY dl.bureau`,
  [NINE]
).catch((e) => ({ rows: [], error: e.message.slice(0, 200) }));
await c.query("ROLLBACK");
await c.end();

const out = { pass1, pass2, sameBrain: same.rows || same };
writeFileSync(`${OUT}/prove-twice.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  p1: { can_send: pass1.can_send, letters: pass1.letterCount, docs: pass1.generatedDocs.length, downloads: pass1.downloads },
  p2: { can_send: pass2.can_send, letters: pass2.letterCount, docs: pass2.generatedDocs.length, downloads: pass2.downloads },
  sameBrain: out.sameBrain
}, null, 2));
