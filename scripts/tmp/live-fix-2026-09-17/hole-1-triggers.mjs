// read-only: triggers on documents and document_versions
import { pool, close } from "../../../src/db.mjs";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`SELECT event_object_table t, trigger_name, action_timing, event_manipulation, left(action_statement,120) a
    FROM information_schema.triggers WHERE event_object_table IN ('documents','document_versions') ORDER BY 1,2`);
  console.log(JSON.stringify(r.rows, null, 1));
  await c.query("COMMIT");
} finally { c.release(); await close(); }
