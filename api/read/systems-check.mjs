// GET /api/read/systems-check?date=YYYY-MM-DD — the stored morning scorecard
//
// One row per morning (America/Phoenix date) from pulse_scorecards
// (db/migrations/430), written by the daily pulse (Recon AG-07,
// src/pulse/daily-pulse.mjs). No date = the newest morning. Shape: the board
// contract — { date, ran_at, checks: [{ id, group, status, proof,
// customer_sees, since, day_count, fix }] } plus the three counts.
//
// Read-only. Owner and admin only (ROLE_SETS.OPS). The table is platform-wide,
// not per company, and carries no client data.
import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { readHandler, ROLE_SETS } from "../../src/http/read-api.mjs";
import { readScorecard } from "../../src/pulse/scorecard.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const run = readHandler({
  roles: ROLE_SETS.OPS,
  single: true,
  fetch: (db, { query }) => {
    const raw = query && query.date != null ? String(query.date).trim() : "";
    if (raw && !DATE_RE.test(raw)) {
      const err = new Error("date must be YYYY-MM-DD");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return readScorecard(db, raw || null);
  }
});

export default (req, res) => run(req, res, { db, requireAuth });
