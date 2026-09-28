import { db } from "../../src/db.mjs";
import { asStaff } from "../../src/partners/rls.mjs";
const plain = (await db.query(`SELECT count(*)::int n FROM analytics_connections`)).rows[0].n;
const plainActive = (await db.query(`SELECT count(*)::int n FROM analytics_connections WHERE platform='clickfunnels' AND connection_state='active'`)).rows[0].n;
const staff = await asStaff(async (tx) => (await tx.query(
  `SELECT platform, connection_state, org_id, to_char(last_synced_at,'YYYY-MM-DD HH24:MI') last_sync,
          left(coalesce(last_error,''),200) err FROM analytics_connections`)).rows);
const who = (await db.query(`SELECT current_user, session_user`)).rows[0];
console.log({ role: who, plain_rows_visible: plain, plain_active_clickfunnels: plainActive });
console.log("as staff:", JSON.stringify(staff, null, 2));
process.exit(0);
