// Hole 8 — read only. Every funding round in #8's org, with the client's tier and demo flags.
// BEGIN READ ONLY. Prints no secrets.
import { pool } from "../../../src/db.mjs";

const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const org = (await c.query(`SELECT org_id FROM clients WHERE id = $1`, [EIGHT])).rows[0].org_id;
  const rows = (await c.query(
    `SELECT fr.id, left(c.id::text, 8) AS client, c.first_name, c.last_name, c.outcome_tier, c.is_demo AS client_demo,
            c.funded, c.funded_amount, fr.round_number, fr.status, fr.product, fr.is_demo AS round_demo,
            fr.approved_amount, fr.funded_amount AS round_funded, fr.updated_at,
            (SELECT count(*) FROM applications a WHERE a.funding_round_id = fr.id)::int AS apps
       FROM funding_rounds fr JOIN clients c ON c.id = fr.client_id
      WHERE fr.org_id = $1 ORDER BY c.last_name, fr.round_number`, [org])).rows;
  const demoOn = (await c.query(`SELECT to_jsonb(o) AS o FROM orgs o WHERE id = $1`, [org])).rows[0]?.o;
  const trig = (await c.query(
    `SELECT tgname, tgrelid::regclass::text AS tbl FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('funding_rounds','clients','applications') ORDER BY 2,1`)).rows;
  await c.query("ROLLBACK");
  console.log(JSON.stringify({ rows, orgDemoKeys: demoOn ? Object.keys(demoOn).filter((k) => /demo/i.test(k)).map((k) => [k, demoOn[k]]) : null, triggers: trig }, null, 2));
} finally {
  c.release();
  await pool().end();
}
