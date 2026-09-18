// HOLE 3 — read only: live triggers on staff.
import { db, close } from "../../../src/db.mjs";
const r = (await db.query(
  `SELECT t.tgname, p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.staff'::regclass AND NOT t.tgisinternal ORDER BY 1`)).rows;
console.log(JSON.stringify(r));
await close();
