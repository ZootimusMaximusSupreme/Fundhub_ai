// GET /api/read/systems-check?date=YYYY-MM-DD — the stored morning scorecard
//
// One row per morning (America/Phoenix date) from pulse_scorecards
// (db/migrations/430), written by the daily pulse (Recon AG-07,
// src/pulse/daily-pulse.mjs). No date = the newest morning. Shape: the board
// contract — { date, ran_at, checks: [{ id, group, status, proof,
// customer_sees, since, day_count, fix }] } plus the three counts.
//
// Read-only. Owner and admin only (ROLE_SETS.OPS). Scoped to the caller's
// company (org_id = the session's org). The rows carry no client data.
import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { readHandler, ROLE_SETS } from "../../src/http/read-api.mjs";

/* The org comes from the session. A session with no org binds NULL and reads
   nothing — fails closed, same as api/read/failed-events.mjs. */
const orgOf = (staff) => (staff && staff.org_id) || null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const run = readHandler({
  roles: ROLE_SETS.OPS,
  single: true,
  fetch: (db, { query, staff }) => {
    const raw = query && query.date != null ? String(query.date).trim() : "";
    if (raw && !DATE_RE.test(raw)) {
      const err = new Error("date must be YYYY-MM-DD");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return db.query(
      `SELECT to_char(scorecard_date, 'YYYY-MM-DD') AS date, ran_at, checks,
              green_count, red_count, not_checked_count
         FROM pulse_scorecards
        WHERE org_id = $1::uuid
          AND ($2::date IS NULL OR scorecard_date = $2::date)
        ORDER BY scorecard_date DESC
        LIMIT 1`,
      [orgOf(staff), raw || null]
    ).then((r) => r.rows);
  }
});

export default (req, res) => run(req, res, { db, requireAuth });
