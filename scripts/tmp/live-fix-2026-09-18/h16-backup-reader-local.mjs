// HOLE 16 — local proof of the fix, WRITES NOTHING.
//
// Runs the real onDocsReceivedDocCheck from this branch on file #9's own sim
// pictures (docs/workflows/sim-documents/09 — the same files the e2e uploaded),
// with the live DOC-CHECK prompt and #9's live client row read inside
// BEGIN READ ONLY. OpenAI is made to answer exactly what live answered
// (429 "You have no credits remaining"); Anthropic is the real call with the
// key production holds. Saving, routing, sending and queueing are all stubbed
// and only recorded here. Never prints a key, and never prints what was read
// off the ID — only the verdict and which reader gave it.
import pg from "pg";
import { readFileSync } from "node:fs";
import { onDocsReceivedDocCheck } from "../../../src/handlers/doc-check.mjs";

const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const ORG = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const PACK = new URL("../../../docs/workflows/sim-documents/09/", import.meta.url);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const db = { query: (sql, params) => c.query(sql, params) };

const realFetch = globalThis.fetch;
const calls = [];
const fetchImpl = async (url, init) => {
  const host = new URL(url).hostname;
  calls.push(host);
  if (host === "api.openai.com") {
    // Exactly what live got back at 08:52 on 2026-09-18.
    return new Response(JSON.stringify({ error: {
      message: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
      type: "insufficient_quota", param: null, code: "credit_balance_exhausted"
    } }), { status: 429, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
};
// An unmasked stand-in OpenAI key so the FIRST read goes to OpenAI, as on live.
const env = { ...process.env, OPENAI_API_KEY: "sk-h16-local-stand-in-not-a-real-key" };

const results = [];
for (const [file, subtype] of [["photo-id-1.png", "id_document"], ["photo-id-2.png", "id_document"]]) {
  calls.length = 0;
  const runs = [], routed = [], queued = [];
  const res = await onDocsReceivedDocCheck(db, {
    id: `h16-local-${file}`, name: "docs.received", orgId: ORG, clientId: NINE,
    payload: { kind: "client_upload", subtype, document_id: `h16-local-${file}`, original_filename: file }
  }, {
    env, fetchImpl,
    loadBytesImpl: async () => ({ buffer: readFileSync(new URL(file, PACK)), mimeType: "image/png", versionId: null }),
    recordRunImpl: async (_db, row) => { runs.push(row); return row; },
    routeImpl: async (_db, spec) => { routed.push(spec.json?.outcome || null); return { routed: true, outcome: spec.json?.outcome }; },
    queueRetryImpl: async (_db, spec) => { queued.push(spec.reason); return { queued: true }; }
  });
  results.push({
    file,
    vendorCalls: [...calls],
    verdict: res.json?.outcome || null,
    wouldRoute: routed,
    wouldQueue: queued,
    runOutcome: runs[0]?.outcome,
    runDetailStartsWith: String(runs[0]?.detail || "").slice(0, 70),
    hasMessageToClient: Boolean(res.json?.message_to_client)
  });
}
await c.query("ROLLBACK");
await c.end();
console.log(JSON.stringify(results, null, 2));
