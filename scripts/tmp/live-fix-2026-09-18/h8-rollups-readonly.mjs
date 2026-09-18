// Hole 8 — run the NEW listRollups() SQL against the live database, inside
// BEGIN READ ONLY, and roll back. Proves the statement parses and counts right
// on real Postgres before anything ships. Prints no secrets.
import { pool } from "../../../src/db.mjs";
import { listRollups } from "../../../src/fulfillment/read-signals.mjs";

const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const org = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [EIGHT])).rows[0].org_id;
  const off = await listRollups(c, { orgId: org, demoOn: false });
  const on = await listRollups(c, { orgId: org, demoOn: true });
  await c.query("ROLLBACK");
  console.log(JSON.stringify({ demoOff: off, demoOn: on }, null, 2));
} finally {
  c.release();
  await pool().end();
}
