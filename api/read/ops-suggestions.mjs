// GET /api/read/ops-suggestions?date=YYYY-MM-DD — the AI ops suggestions for one
// morning. Owner and admin only.
//
// Read only. It returns what src/ops/suggestions.mjs buildSuggestions() stored in
// ops_suggestions (432) for that morning; it never builds or changes one. No date
// means today in Arizona. A date that is not a real YYYY-MM-DD is a 400.
//
// Auth then role, two separate calls (CLAUDE.md §12: requireAuth ignores a roles
// key). readHandler in src/http/read-api.mjs does exactly that: requireAuth, then
// requireRole(ROLE_SETS.OPS), then pagination and redaction.
//
// The org comes from the session and is required. A session with no org binds
// NULL and matches no row — it fails closed (same reasoning as failed-events.mjs).
import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { readHandler, ROLE_SETS } from "../../src/http/read-api.mjs";
import { phoenixToday, validDate, RULES } from "../../src/ops/suggestions.mjs";

const orgOf = (staff) => (staff && staff.org_id) || null;

function briefDate(query) {
  if (query.date == null || query.date === "") return phoenixToday();
  const day = validDate(String(query.date));
  if (!day) {
    const err = new Error("date must be YYYY-MM-DD");
    err.code = "BAD_REQUEST";
    throw err;
  }
  return day;
}

const run = readHandler({
  roles: ROLE_SETS.OPS,
  fetch: async (db, { limit, offset, query, staff }) => {
    const day = briefDate(query);
    const { rows } = await db.query(
      `SELECT id, brief_date::text AS brief_date, rule, subject_key, headline, numbers, dollar_impact_cents,
              write_up, model_used, status, quiet_until::text AS quiet_until, created_at, updated_at
         FROM ops_suggestions
        WHERE org_id = $3::uuid
          AND brief_date = $4::date
        ORDER BY dollar_impact_cents DESC NULLS LAST, created_at
        LIMIT $1 OFFSET $2`,
      [limit + 1, offset, orgOf(staff), day]
    );
    // bigint arrives as a string; cents stay an integer and NULL stays NULL.
    return rows.map((r) => ({
      ...r,
      dollar_impact_cents: r.dollar_impact_cents == null ? null : Number(r.dollar_impact_cents),
      rule_text: RULES[r.rule] || null
    }));
  }
});

export default (req, res) => run(req, res, { db, requireAuth });
