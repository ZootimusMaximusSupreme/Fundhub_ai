// HOLE N22 — one-row data fix on the live database. OWNER ROW ONLY.
//
// The 2026-09-18 audit script uploaded the sim photo ID
// (docs/workflows/sim-documents/08/photo-id-1.png) as the owner's staff
// profile photo. Chris approved removing it (Fix run 2, board). The app has
// no "remove photo" path — /api/staff/avatar takes GET and POST only, and a
// POST replaces the photo rather than clearing it — so this sets the owner's
// staff.avatar_key back to NULL, the same "no photo yet" state every other
// staff row is in (src/auth/session.mjs then reports avatarUrl null and the
// header chip draws its "+" button).
//
// Guarded, all inside one transaction:
//   1. the row is the owner's (id AND email match);
//   2. its avatar_key is set AND its content-addressed path carries the sim
//      file's sha256 — so a photo Chris uploads himself is never cleared;
//   3. the UPDATE matches the exact key read under the row lock, and exactly
//      one row may change, or it rolls back;
//   4. no other column may change (updated_at excepted: the table's own
//      BEFORE UPDATE trigger trg_staff_updated sets it, as it does for the
//      app's upload), or it rolls back.
// Only avatar_key is written. The stored image object itself is not touched.
// Never prints the storage key (a bearer credential under the blob
// provider), the connection string, or any other column's value.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n22-clear-photo.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, close } from "../../../src/db.mjs";

const OWNER_ID = "52bc675a-db0f-4e24-9b53-80f7fd077f72";
const OWNER_EMAIL = "chris@fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N22";
mkdirSync(SHOTS, { recursive: true });

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SIM_SHA = createHash("sha256")
  .update(readFileSync(join(REPO, "docs/workflows/sim-documents/08/photo-id-1.png")))
  .digest("hex");

// Everything on the row except the photo key and the trigger-owned timestamp,
// hashed — so "nothing else changed" is checked without printing any value.
const read = async (c) => (await c.query(
  `SELECT avatar_key IS NOT NULL AS has_photo,
          coalesce(position($2 in avatar_key) > 0, false) AS key_is_sim_photo,
          updated_at,
          md5((to_jsonb(s) - 'avatar_key' - 'updated_at')::text) AS rest_of_row
     FROM staff s WHERE id = $1`, [OWNER_ID, SIM_SHA])).rows[0];

const out = { at: new Date().toISOString(), staff_id: OWNER_ID, sim_sha256: SIM_SHA };
const c = await pool().connect();
try {
  await c.query("BEGIN");
  const locked = (await c.query(
    `SELECT avatar_key, lower(email) = lower($2) AS is_owner_email, role
       FROM staff WHERE id = $1 FOR UPDATE`, [OWNER_ID, OWNER_EMAIL])).rows[0];
  out.before = await read(c);
  out.sim_photo_rows_in_staff = (await c.query(
    `SELECT count(*)::int AS n FROM staff WHERE position($1 in coalesce(avatar_key, '')) > 0`, [SIM_SHA])).rows[0].n;

  if (!locked || !locked.is_owner_email || locked.role !== "owner") {
    out.result = "skipped: row is not the owner's";
    await c.query("ROLLBACK");
  } else if (!locked.avatar_key) {
    out.result = "skipped: no photo on the row (already cleared)";
    await c.query("ROLLBACK");
  } else if (!locked.avatar_key.includes(SIM_SHA)) {
    out.result = "skipped: the photo on the row is not the sim photo ID — leaving it";
    await c.query("ROLLBACK");
  } else {
    const u = await c.query(
      `UPDATE staff SET avatar_key = NULL WHERE id = $1 AND avatar_key = $2`,
      [OWNER_ID, locked.avatar_key]);
    if (u.rowCount !== 1) {
      out.result = `rolled back: ${u.rowCount} rows would change`;
      await c.query("ROLLBACK");
    } else {
      out.after_in_tx = await read(c);
      if (out.after_in_tx.rest_of_row !== out.before.rest_of_row) {
        out.result = "rolled back: another column changed";
        await c.query("ROLLBACK");
      } else if (out.after_in_tx.has_photo) {
        out.result = "rolled back: photo still set";
        await c.query("ROLLBACK");
      } else {
        await c.query("COMMIT");
        out.result = "committed";
      }
    }
  }
  out.after = await read(c);
} catch (err) {
  await c.query("ROLLBACK").catch(() => {});
  out.result = `error: ${err?.message || err}`;
} finally {
  c.release();
  await close();
}

writeFileSync(`${SHOTS}/clear-photo.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
