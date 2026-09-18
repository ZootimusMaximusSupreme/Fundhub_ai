// DRY BUILD, read only. Builds the funding pack in memory for each hole-1 client
// inside a BEGIN READ ONLY transaction. Nothing is saved, nothing is sent.
import { pool, close } from "../../../src/db.mjs";
import { buildLetterPackForClient } from "../../../src/underwrite/letter-pack.mjs";
const IDS = { eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4", nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd", eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4" };
const c = await pool().connect();
const ro = { query: (sql, p) => c.query(sql, p) };
try {
  await c.query("BEGIN READ ONLY");
  for (const [name, id] of Object.entries(IDS)) {
    for (const pack of ["funding", "repair"]) {
      const out = await buildLetterPackForClient(ro, { clientId: id, pack });
      const files = out.files || [];
      console.log(JSON.stringify({
        name, pack, reason: out.reason, engineSkip: out.engineSkip, engineOutcome: out.engineOutcome,
        deliverableEngine: out.deliverableEngine, deliverableSkip: out.deliverableSkip,
        html: files.filter((f) => f.contentType === "text/html").map((f) => `${f.filename}:${f.content.length}`),
        pdfCount: files.filter((f) => f.contentType !== "text/html").length,
      }));
    }
  }
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
