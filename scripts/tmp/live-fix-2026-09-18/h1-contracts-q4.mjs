// READ ONLY. The deck tier each sim client opens with on the Present screen.
// buildCloserDeck() runs SELECTs only; the whole run sits inside BEGIN READ ONLY,
// so Postgres would refuse any write. Nothing is sent.
// Run: node --env-file=/Users/chrisstanbridge/Developer/fundhub-platform/.env scripts/tmp/live-fix-2026-09-18/h1-contracts-q4.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";
import { buildCloserDeck } from "../../../src/sales/closer-deck.mjs";

const ORG = "fb789b0b-8d8d-4cdc-8a24-ee6b6659e0b6";
const IDS = {
  "8": "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  "9": "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  "11": "029964c5-4d8e-47ed-88c9-53ac13863fd4"
};
const out = {};
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  for (const [n, id] of Object.entries(IDS)) {
    const d = await buildCloserDeck(c, { orgId: ORG, clientId: id });
    out[n] = {
      engine_tier: d?.engine?.tier ?? null,
      engine_available: d?.engine?.available ?? null,
      outcome: d?.engine?.outcome ?? null
    };
  }
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  c.release();
  await close();
}
mkdirSync("/tmp/live-fix-2026-09-18/h1-contracts", { recursive: true });
writeFileSync("/tmp/live-fix-2026-09-18/h1-contracts/q4.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
