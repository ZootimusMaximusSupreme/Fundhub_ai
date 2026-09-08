// GET /api/read/ad-spine — the label spine, read back.
//
// One place to ask v_ad_label_spine (db/migrations/377_marketing_label_spine.sql)
// the three questions Chris actually asked, and nothing else:
//
//   1. LIST     /api/read/ad-spine
//                 Every ad with the labels it inherited from its creative and
//                 that creative's script. Newest ad first.
//
//   2. GROUP    /api/read/ad-spine?group_by=angle
//                 One row per angle: how many ads carry it, and the friendly
//                 name for it out of ad_labels. Also hook, lane, offer,
//                 script_type.
//
//   3. FILTER   /api/read/ad-spine?angle=denial_angle
//                 Narrow either of the above to one label value. The five filter
//                 names are the same five words as group_by, and they combine.
//
// ─── PAGING ────────────────────────────────────────────────────────────────
//
// ?limit= and ?offset=, through pageParams() and page() in
// src/http/read-api.mjs — the same envelope every other list endpoint returns
// ({ count, limit, offset, hasMore, items }). Default 50, hard cap 200.
//
// NOT AN OPAQUE CURSOR, DELIBERATELY. Nothing in this repository has one — no
// file under api/ or src/http/ contains the word — so inventing a cursor format
// here would be a new pattern with exactly one caller (CLAUDE.md §8: no
// speculative abstraction). The list's ORDER BY carries a tie-break on
// ad_row_id so offset paging is stable, which is the one thing an offset really
// does get wrong.
//
// ─── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
//
// NO SPEND AND NO BOOKINGS. 377's own header (Part 4d, :608-617) names the two
// joins that would attach them — ad_metrics_daily on ad_row_id, and
// client_ad_attribution on fundhub_ad_number — and neither is written here.
// Joining them wrong is worse than not joining them, because a wrong number
// looks exactly like a right one. That is a separate job.
//
// NO INVENTED METRIC. Every field below is a column of the view or a count of
// its rows. Nothing is derived, rated, scored or averaged.
//
// ─── NULL MEANS UNKNOWN (CLAUDE.md §12) ────────────────────────────────────
//
// The view LEFT JOINs throughout, so an ad with no creative still comes back —
// with every label null. That is the answer "nobody has said yet", and it
// reaches the caller as null, never as 0 and never as "". Under group_by the
// same rows land in a group whose `key` is null. They are counted, not dropped:
// "how many ads nobody has labelled" is one of the numbers worth seeing.
//
// ─── AUTH ──────────────────────────────────────────────────────────────────
//
// Same shape as api/read/video-stats.mjs and api/read/ad-books.mjs: requireAuth,
// then requireRole(ROLE_SETS.STAFF). requireRole is a SEPARATE call on purpose —
// requireAuth forwards its options to authenticate(), which reads only `db` and
// `env`, so a `roles` key handed to requireAuth is silently dropped (CLAUDE.md
// §12, src/http/auth-gate.test.mjs).
//
// ─── WHY asStaff() AND NOT A BARE db.query ─────────────────────────────────
//
// v_ad_label_spine carries security_invoker=true (377:620), so it applies the
// CALLER's row-level security rather than its owner's. ads, creative_assets and
// ad_scripts all have FORCEd partner policies, and ad_labels has its own
// staff-or-partner read policy (377:683). A bare db.query is anonymous to all of
// them: it returns ZERO ROWS rather than erroring, which reads on screen as "no
// data yet" instead of as a fault. Same reasoning as video-stats.mjs:16-19.
//
// ─── REDACTION ─────────────────────────────────────────────────────────────
//
// The response goes through page() → redact() in src/http/read-api.mjs, which
// strips any key matching its FORBIDDEN_KEY list (:18). Checked field by field:
// none of the columns returned here match it, so every field named in this
// header really does survive to the caller. Nothing below is silently dropped.

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid, pageParams, page } from "../../src/http/read-api.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { asStaff } from "../../src/partners/rls.mjs";

/* The five labels, and the one place their names are written down.

   `column` is interpolated into SQL, so it is a value from THIS frozen map and
   never a value from the query string — the query string only ever picks a key
   out of it.

   `kind` is the matching ad_labels.kind, whose CHECK list is exactly
   script_type / angle / hook / offer (377:318-319). `lane` has no kind and no
   dictionary row, because lane is a database enum (ad_lane, 286:62) and not a
   free-text label. So a lane group's `name` is always null. Stated here rather
   than left to be discovered: it is not a missing row, there is nowhere to put
   one. */
export const LABELS = Object.freeze({
  angle:       Object.freeze({ column: "v.angle_key",   kind: "angle" }),
  hook:        Object.freeze({ column: "v.hook_key",    kind: "hook" }),
  lane:        Object.freeze({ column: "v.lane::text",  kind: null }),
  offer:       Object.freeze({ column: "v.offer_key",   kind: "offer" }),
  script_type: Object.freeze({ column: "v.script_type", kind: "script_type" })
});

export const GROUPS = Object.freeze(Object.keys(LABELS));

/* buildFilters — turn ?angle=&hook=&lane=&offer=&script_type= into WHERE
   fragments. Exported so a test can read the shape without a database.

   Every comparison is against text: v.lane is the ad_lane enum, and casting the
   COLUMN to text (rather than the parameter to ad_lane) means a nonsense lane
   matches nothing instead of raising a cast error the caller would see as a 500. */
export function buildFilters(query = {}, params = []) {
  const where = [];
  const applied = {};
  for (const name of GROUPS) {
    const raw = query[name];
    if (raw == null || String(raw).trim() === "") continue;
    const value = String(raw).trim();
    params.push(value);
    where.push(`${LABELS[name].column} = $${params.length}`);
    applied[name] = value;
  }
  return { where, applied };
}

/* buildQuery — the whole SQL for one request, as a value.

   Exported and pure for the same reason ad-books.mjs exports foldGroups: the
   part most likely to be wrong is the part hardest to see, and this way it can
   be read and asserted on without a database in front of it.

   Returns { sql, params, filters }. Nothing from the query string is ever
   interpolated — the only interpolated fragments are `column` values out of the
   frozen LABELS map above, chosen by a key the caller may pick but not spell. */
export function buildQuery({ orgId, groupBy = null, limit, offset, query = {} }) {
  const params = [orgId];
  const { where, applied } = buildFilters(query, params);
  const whereSql = ["v.org_id = $1", ...where].join(" AND ");

  // The dictionary's kind is a value from LABELS, never from the caller, but it
  // is still bound as a parameter rather than pasted in — this file should read
  // the same as every other query here, so nobody has to check twice.
  const kind = groupBy ? LABELS[groupBy].kind : null;
  let kindSql = null;
  if (kind) {
    params.push(kind);
    kindSql = `$${params.length}`;
  }

  // page() decides hasMore by asking for one row more than requested, so both
  // queries below select limit + 1.
  params.push(limit + 1, offset);
  const limitSql = `LIMIT $${params.length - 1} OFFSET $${params.length}`;

  if (!groupBy) {
    /* THE JOIN BACK TO ads IS FOR ONE COLUMN: created_at. The view does not
       carry it, and "newest first" needs a clock. It is an inner join on the
       view's own base-table primary key (ads.id = v.ad_row_id), so it cannot add
       a row and cannot drop one — the row count is identical with or without it.
       ad_row_id is the tie-break because two ads written in the same transaction
       share created_at exactly (DEFAULT now() is transaction time), and without
       a tie-break a row could appear on two pages or on neither. */
    return {
      filters: applied,
      params,
      sql: `SELECT v.*, a.created_at
              FROM v_ad_label_spine v
              JOIN ads a ON a.id = v.ad_row_id
             WHERE ${whereSql}
             ORDER BY a.created_at DESC, v.ad_row_id DESC
             ${limitSql}`
    };
  }

  const { column } = LABELS[groupBy];
  /* The friendly name comes from ad_labels, matched on (org, kind, key) — which
     is that table's unique constraint (377:322), so the LEFT JOIN can match at
     most one row and cannot multiply the group. max() is used only so the name
     does not have to be repeated in GROUP BY.

     RETIRED LABELS STILL SUPPLY THEIR NAME. There is deliberately no retired_at
     filter: retiring a label means "stop offering it to a writer", not "forget
     what it was called". An old ad carrying a retired angle should still read as
     a name and not as a bare key.

     lane joins nothing at all, because lane is the ad_lane enum and has no
     ad_labels row to find — see the LABELS comment above. */
  const nameSelect = kind ? `max(l.name) AS label_name` : `NULL::text AS label_name`;
  const nameJoin = kind
    ? `LEFT JOIN ad_labels l
         ON l.org_id = v.org_id AND l.kind = ${kindSql} AND l.key = ${column}`
    : "";

  return {
    filters: applied,
    params,
    sql: `SELECT ${column} AS label_key, count(*)::int AS ads, ${nameSelect}
            FROM v_ad_label_spine v
            ${nameJoin}
           WHERE ${whereSql}
           GROUP BY ${column}
           ORDER BY count(*) DESC, ${column} ASC NULLS LAST
           ${limitSql}`
  };
}

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;

  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.STAFF)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) return res.status(403).json({ ok: false, error: "forbidden" });

  const rawGroupBy = req.query?.group_by;
  const groupBy = rawGroupBy == null || String(rawGroupBy).trim() === ""
    ? null
    : String(rawGroupBy).trim();
  if (groupBy && !GROUPS.includes(groupBy)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_group_by",
      message: `group_by must be one of ${GROUPS.join("|")}`
    });
  }

  const { limit, offset } = pageParams(req.query || {});
  const { sql, params, filters } = buildQuery({
    orgId, groupBy, limit, offset, query: req.query || {}
  });

  try {
    const rows = await asStaff((tx) => tx.query(sql, params).then((r) => r.rows));

    // Groups are reshaped so the caller reads { key, name, ads } and never has
    // to know that label_key/label_name were aliases dodging a SQL keyword.
    const items = groupBy
      ? rows.map((r) => ({ key: r.label_key, name: r.label_name, ads: r.ads }))
      : rows;

    return res.status(200).json({
      ok: true,
      group_by: groupBy,
      filters,
      ...page(items, { limit, offset })
    });
  } catch (e) {
    if (dbDown(res, e)) return;
    throw e;
  }
}
