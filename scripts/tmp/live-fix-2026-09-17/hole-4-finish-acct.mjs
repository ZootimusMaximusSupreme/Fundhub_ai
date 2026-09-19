// Hole 4 FINISH — read only (plain SELECTs): does client #11 have a client account row?
import { db } from "../../../src/db.mjs";
const ID = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const a = await db.query(`SELECT id, kind, status FROM accounts WHERE client_id = $1`, [ID]);
const t = await db.query(`SELECT tgname, tgrelid::regclass::text AS tbl FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('account_sessions','sessions')`);
console.log(JSON.stringify({ accounts: a.rows.map(r => ({ kind: r.kind, status: r.status, id: r.id.slice(0,8) })), triggers: t.rows }, null, 2));
process.exit(0);
