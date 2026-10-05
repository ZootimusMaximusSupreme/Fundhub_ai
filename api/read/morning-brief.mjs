// GET /api/read/morning-brief[?date=YYYY-MM-DD]
//
// The stored "Good morning, Chris" brief for one Arizona morning: the text
// and the full report behind it (systems, marketing, money, team,
// suggestions, today). One row per morning in morning_briefs
// (db/migrations/431_morning_briefs.sql), written by src/ops/morning-brief.mjs
// as step 2 of the 6:00 a.m. pulse job. MB5's report page reads this.
//
// No date → today in America/Phoenix. A malformed or impossible date → 400.
// No row for that morning → 404.
//
// Owner and admin only (ROLE_SETS.OPS): the brief carries company cash, every
// closer's numbers, and platform health. requireAuth then a real requireRole —
// requireAuth ignores a `roles` key (CLAUDE.md §12).
//
// The org comes from the session and fails closed.
import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid } from "../../src/http/read-api.mjs";
import { readMorningBrief, phoenixDateStamp } from "../../src/ops/morning-brief.mjs";
import { dbDown } from "../../src/http/db-down.mjs";

export function parseBriefDate(raw, now = new Date()) {
  if (raw == null || raw === "") return phoenixDateStamp(now);
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return s;
}

export default async function handler(req, res, deps = {}) {
  const database = deps.db || db;
  const auth = deps.requireAuth || requireAuth;
  const clock = deps.now || (() => new Date());

  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const staff = await auth(req, res, { db: database });
    if (!staff) return;
    if (!requireRole(res, staff, ROLE_SETS.OPS)) return;

    const orgId = staff.org_id;
    if (!isUuid(orgId)) return res.status(403).json({ ok: false, error: "forbidden" });

    const date = parseBriefDate(req.query?.date, clock());
    if (!date) return res.status(400).json({ ok: false, error: "date must be YYYY-MM-DD" });

    const brief = await readMorningBrief(database, { orgId: staff.org_id, date });
    if (!brief) return res.status(404).json({ ok: false, error: "no_brief", date });

    return res.status(200).json({ ok: true, date, brief });
  } catch (e) {
    // A database that did not answer is a 503, not our bug (src/http/db-down.mjs).
    if (dbDown(res, e)) return;
    throw e;
  }
}
