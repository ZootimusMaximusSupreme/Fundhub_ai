// Generate #9 letters from the credit-repair brain. MAILS NOTHING.
import { writeFileSync } from "node:fs";
import { db, close } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/db.mjs";
import { analyzeAndGenerate } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/repair/analyze.mjs";
import { storeFromEnv } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/documents/store.mjs";

const NINE = "be3dcfd7-faae-4001-b97f-9bc30875bbcd";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-18-letter-brain/generate.json";

const client = await db.query(
  `SELECT id, org_id, first_name, last_name FROM clients WHERE id = $1`,
  [NINE]
);
const row = client.rows[0];
if (!row) {
  console.log(JSON.stringify({ ok: false, reason: "client_not_found" }));
  await close();
  process.exit(1);
}

const store = storeFromEnv();
const result = await analyzeAndGenerate(db, {
  orgId: row.org_id,
  clientId: NINE,
  round: "R1",
  documentStore: store
});

const out = {
  at: new Date().toISOString(),
  client: `${row.first_name} ${row.last_name}`,
  store: store.name || null,
  ok: result.ok,
  reason: result.reason || null,
  already_generated: result.already_generated || false,
  round: result.round,
  letters_stored: result.letters_stored ?? result.letters?.length,
  letters: (result.letters || []).map((l) => ({
    bureau: l.bureau,
    target: l.target,
    letterId: l.letterId,
    itemCount: l.itemCount,
    bodyChars: (l.body_text || "").length
  })),
  skipped: result.skipped,
  documents: result.documents,
  identity_complete: result.identity_complete,
  verified_identity: result.verified_identity
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await close();
