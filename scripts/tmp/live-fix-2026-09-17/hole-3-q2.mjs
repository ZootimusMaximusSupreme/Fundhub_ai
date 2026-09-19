// HOLE 3 — read only. Hash FORMAT only (algorithm + params), never salt or digest.
import { db, close } from "../../../src/db.mjs";
const r = (await db.query(
  `SELECT email, role, status, is_demo, (password_hash IS NOT NULL) has_pw,
          split_part(password_hash,'$',2) algo, split_part(password_hash,'$',3) params,
          length(password_hash) len
     FROM staff WHERE lower(email) IN ('chris@fundhub.ai','csm@demo.fundhub.local') OR (status='active' AND NOT is_demo)
     ORDER BY role, email`)).rows;
console.log(JSON.stringify(r, null, 1));
const a = (await db.query(
  `SELECT email, successful, host(ip) ip, created_at FROM auth_attempts
    WHERE created_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 25`)).rows;
console.log(JSON.stringify(a.map(x => ({ ...x, ip: x.ip ? x.ip.replace(/\.\d+$/, ".x") : null })), null, 1));
await close();
