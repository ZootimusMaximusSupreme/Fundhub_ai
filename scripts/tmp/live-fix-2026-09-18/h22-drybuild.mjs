// Hole 22 — DRY BUILD, read only. Builds Combo's funding pack in memory inside a
// BEGIN READ ONLY transaction, exactly as C-06 would. Nothing is saved, nothing
// is sent. Files land in a scratch folder for a look; addresses are never printed.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h22-drybuild.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
import { buildLetterPackForClient } from "../../../src/underwrite/letter-pack.mjs";

const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const OUT = process.argv[2];
if (!OUT) throw new Error("pass an output folder");
mkdirSync(OUT, { recursive: true });

const c = await pool().connect();
const ro = { query: (sql, p) => c.query(sql, p) };
try {
  await c.query("BEGIN READ ONLY");
  const tier = (await c.query(`SELECT outcome_tier FROM clients WHERE id = $1`, [COMBO])).rows[0]?.outcome_tier;
  const out = await buildLetterPackForClient(ro, { clientId: COMBO, pack: "funding" });
  const files = out.files || [];
  for (const f of files) {
    const body = f.content || f.buffer || f.pdf || f.bytes;
    if (body) writeFileSync(`${OUT}/${f.filename}`, Buffer.from(body));
  }
  console.log(JSON.stringify({
    tier,
    reason: out.reason ?? null,
    engineSkip: out.engineSkip ?? null,
    engineOutcome: out.engineOutcome ?? null,
    deliverableEngine: out.deliverableEngine ?? null,
    deliverableSkip: out.deliverableSkip ?? null,
    letterSkip: out.letterSkip ?? null,
    files: files.map((f) => ({ filename: f.filename, type: f.type ?? null, contentType: f.contentType, bytes: (f.content || f.buffer || f.pdf || f.bytes)?.length ?? 0, engine: f.engine ?? null })),
  }, null, 2));
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
  await close();
}
