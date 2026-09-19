// HOLE 12 — one-row data fix on the live database. #8 ONLY.
// Sets clients.custom_fields.employee_next_action from "Collect Documents" to
// "Remove Inquiries" for d682c13b, and nothing else. Guarded three ways, all
// inside one transaction:
//   1. the row must still say exactly "Collect Documents";
//   2. #8 must still have an inquiry-removal case in an active state (the
//      reason the control panel says Remove Inquiries);
//   3. exactly one row may change, or it rolls back.
// No delete. No other key in custom_fields is touched (jsonb || merge, the
// same shape src/workflows/custom-fields.mjs uses). Before/after written to
// the evidence folder. Never prints the connection string.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h12-data-fix.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { pool, close } from "../../../src/db.mjs";

const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const FROM = "Collect Documents";
const TO = "Remove Inquiries";
const ACTIVE = ["Queued", "Scheduled", "In Progress", "Escalated", "Blocked"];
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-12";
mkdirSync(SHOTS, { recursive: true });

const read = async (c) => (await c.query(
  `SELECT custom_fields->>'employee_next_action' AS employee_next_action, updated_at,
          (SELECT count(*)::int FROM jsonb_object_keys(custom_fields)) AS key_count
     FROM clients WHERE id = $1`, [EIGHT])).rows[0];

const out = { at: new Date().toISOString(), client_id: EIGHT };
const c = await pool().connect();
try {
  await c.query("BEGIN");
  await c.query(`SELECT 1 FROM clients WHERE id = $1 FOR UPDATE`, [EIGHT]);
  out.before = await read(c);
  out.active_cases = (await c.query(
    `SELECT case_id, case_status FROM inquiry_removal_cases
      WHERE client_id = $1 AND case_status::text = ANY($2::text[])`, [EIGHT, ACTIVE])).rows;

  if (out.before?.employee_next_action !== FROM) {
    out.result = `skipped: row says ${JSON.stringify(out.before?.employee_next_action)}, not ${JSON.stringify(FROM)}`;
    await c.query("ROLLBACK");
  } else if (!out.active_cases.length) {
    out.result = "skipped: no active inquiry-removal case, so Remove Inquiries would be wrong";
    await c.query("ROLLBACK");
  } else {
    const u = await c.query(
      `UPDATE clients SET custom_fields = custom_fields || $2::jsonb
        WHERE id = $1 AND custom_fields->>'employee_next_action' = $3`,
      [EIGHT, JSON.stringify({ employee_next_action: TO }), FROM]);
    if (u.rowCount !== 1) {
      out.result = `rolled back: ${u.rowCount} rows would change`;
      await c.query("ROLLBACK");
    } else {
      out.after_in_tx = await read(c);
      if (out.after_in_tx.key_count !== out.before.key_count) {
        out.result = "rolled back: key count changed";
        await c.query("ROLLBACK");
      } else {
        await c.query("COMMIT");
        out.result = "committed";
      }
    }
  }
  await c.query("BEGIN READ ONLY");
  out.after = await read(c);
  await c.query("COMMIT");
} catch (e) {
  out.error = e.message;
  try { await c.query("ROLLBACK"); } catch {}
} finally { c.release(); await close(); }

writeFileSync(`${SHOTS}/h12-data-fix.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
