// GET /api/ad-videos — the filmed takes, and where each one is stuck.
//
//   ?status=awaiting_approval          one state
//   ?status=editing,rendered           several
//   ?ad_id=43                          every take of one ad (UNPADDED)
//   ?limit= ?offset=
//
// The read endpoint from marketing/ads/video-pipeline-plan.md §2 step (2), and the one
// screen the plan allows itself: the finished videos waiting on Chris. The plan
// calls that screen throwaway on purpose — if the table is right it rebuilds in
// an hour, and a phone notification with two links does the same job.
//
// THIS ENDPOINT DOES NOT APPROVE ANYTHING. Approval is a tap in a phone
// notification (owner decision 5, 2026-09-22) and its door is
// api/public/ad-video-approve.mjs. Adding a write here would put two approval
// paths in the codebase before either had been used once.
//
// ROLE GATE — requireAuth, then a SEPARATE requireRole. requireAuth forwards
// its options to authenticate(), which reads only { db, env }, so a `roles` key
// passed to it is silently dropped and the endpoint ends up open to every
// signed-in role (CLAUDE.md §12; src/http/auth-gate.test.mjs fails on the
// broken shape).
//
// ROLE_SETS.OPS — owner and admin. Narrower than STAFF on purpose: these rows
// carry unreleased ad creative and the links to the raw files, and nobody on
// the sales floor has a reason to open them. Widen it by naming a role, never
// by reaching for STAFF.
//
// RLS — ad_videos is FORCEd (389, Part 5) and a bare db.query() against it
// matches ZERO ROWS rather than erroring. So the read goes through asStaff(),
// exactly as api/read/video-stats.mjs does. A version of this file without it
// would answer 200 with an empty list forever and look like there was simply
// nothing to approve.

import { db } from "../src/db.mjs";
import { requireAuth } from "../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, pageParams, page, isUuid } from "../src/http/read-api.mjs";
import { dbDown } from "../src/http/db-down.mjs";
import { asStaff } from "../src/partners/rls.mjs";
import { listByStatus, listByAdId, STATES, AdVideoStoreError } from "../src/ad-videos/store.mjs";
import { AD_ID_RE, folderNumber } from "../src/ad-videos/naming.mjs";
import { STATE_MEANING } from "../src/ad-videos/states.mjs";

/* fetchRows is exported so src/http/ad-videos.pg.test.mjs can run the SQL
   directly, the same reason api/creative/approvals.mjs exports its own. An
   endpoint whose query only ever runs behind an HTTP handler is one whose
   column names go unchecked until somebody opens the screen. */
export async function fetchRows(tx, { orgId, query, limit, offset }) {
  const adId = query.ad_id ?? query.adId;
  if (adId !== undefined && adId !== null && String(adId).trim() !== "") {
    const wanted = String(adId).trim();
    if (!AD_ID_RE.test(wanted)) {
      // A padded number is the mistake this whole feature guards against, so it
      // is refused with the reason rather than quietly trimmed to "43".
      const e = new AdVideoStoreError("bad_ad_id",
        `ad_id must be the unpadded number, 1-9 digits with no leading zeros — ` +
        `"${wanted}" looks like a folder name`);
      throw e;
    }
    return listByAdId(tx, { orgId, adId: wanted });
  }

  const raw = query.status;
  const status = raw === undefined || raw === null || String(raw).trim() === "" || raw === "all"
    ? null
    : String(raw).split(",").map((s) => s.trim()).filter(Boolean);

  return listByStatus(tx, { orgId, status, limit, offset });
}

/* What the row means in words, added on the way out. Chris does not read code
   and "editing" on its own says nothing; "Submagic has it" does. Derived, never
   stored — one list of meanings, in states.mjs, beside the states themselves. */
function withMeaning(row) {
  const m = STATE_MEANING[row.status];
  return {
    ...row,
    // The folder Paul's copy sits in. Padded — and that is the ONLY place a
    // padded number may appear. utm_content stays row.ad_id.
    folder_name: folderNumber(row.ad_id),
    status_means: m ? m.meaning : null,
    status_fired_by: m ? m.firedBy : null
  };
}

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;
  const auth = deps.requireAuth ?? requireAuth;

  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await auth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.OPS)) return;

  // Session org only, never from the query string.
  if (!isUuid(staff.org_id)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const query = req.query || {};
  const { limit, offset } = pageParams(query);

  try {
    const rows = await asStaff((tx) => fetchRows(tx, { orgId: staff.org_id, query, limit, offset }));
    return res.status(200).json({ ok: true, ...page(rows.map(withMeaning), { limit, offset }) });
  } catch (err) {
    // A bad ?status= or ?ad_id= is the CALLER's error. Reporting it as a 500
    // tells the screen "the database is unreachable" when the backend is fine
    // and only the request was wrong — the same reasoning as read-api.mjs.
    if (err instanceof AdVideoStoreError) {
      return res.status(400).json({
        ok: false, error: err.code, message: err.message, states: STATES
      });
    }
    if (dbDown(res, err)) return;
    throw err;
  }
}
