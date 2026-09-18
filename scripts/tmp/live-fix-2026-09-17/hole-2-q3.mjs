// Plain SELECTs only.
import { db, close } from "../../../src/db.mjs";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const q = (s, p) => db.query(s, p).then(r => r.rows).catch(e => [{ err: e.message }]);
const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='crs_results' ORDER BY ordinal_position`);
const crs = await q(`SELECT id, created_at, jsonb_object_keys(result) AS k FROM crs_results WHERE client_id=$1 ORDER BY created_at DESC LIMIT 40`, [ID]);
const ev = await q(`SELECT name, created_at, payload->>'productName' AS pn, payload->>'productCode' AS pc FROM events WHERE client_id=$1 AND created_at > '2026-09-17' ORDER BY created_at LIMIT 40`, [ID]);
console.log(JSON.stringify({ cols: cols.map(r => r.column_name), crs, ev }, null, 2));
await close?.(); process.exit(0);
