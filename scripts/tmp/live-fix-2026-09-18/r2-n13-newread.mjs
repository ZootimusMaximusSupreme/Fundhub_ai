// N13 — run THIS BRANCH's readClientProgress against the live rows, inside
// BEGIN READ ONLY, then ROLLBACK. Writes nothing. Proves the new SQL runs on the
// live schema and shows what the page will get once shipped. Prints only
// timeline lines, owned-not-ready names and document titles — no personal fields.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n13-newread.mjs
import { pool } from "../../../src/db.mjs";
import { readClientProgress } from "../../../src/progress/read.mjs";

const FILES = {
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  thirteen: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042"
};

const c = await pool().connect();
const warnings = [];
const origWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); };
try {
  await c.query("BEGIN READ ONLY");
  const out = {};
  for (const [name, id] of Object.entries(FILES)) {
    const org = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [id])).rows[0];
    if (!org) { out[name] = "not found"; continue; }
    const p = await readClientProgress(c, { orgId: org.org_id, clientId: id });
    out[name] = {
      deliverables: p.deliverables.map((d) => d.title),
      ownedNotReady: p.ownedNotReady,
      timeline: p.timeline
    };
  }
  await c.query("ROLLBACK");
  console.log(JSON.stringify({ at: new Date().toISOString(), out, warnings }, null, 2));
} finally {
  console.warn = origWarn;
  c.release();
  await pool().end();
}
