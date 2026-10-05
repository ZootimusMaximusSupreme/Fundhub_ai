// GET / POST /api/marketing/ad-links — leads whose ad has no number yet, and Link.
//
// Route key: "marketing/ad-links" in netlify/functions/api.mjs ROUTES.
// Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 5 ("Unmatched ad
// names and ids show on the Ads tab with Link").
//
//   GET    the unmatched list: each utm_content / Meta ad id that leads or SLO
//          visitors arrived on and that resolved to no ad number
//          (v_client_ad_number, v_visitor_ad_number), most people first.
//   POST   { ad_number, meta_ad_id?, name?, request_id? } — Link. Sets the
//          number, source 'manual', on EVERY ads row in the org with that Meta
//          ad id or that name. Our database only: it never edits the live ad
//          on Meta (a creative change sends a running ad back through review).
//
// requireAuth, then requireRole(ROLE_SETS.MARKETING): requireAuth ignores roles
// (CLAUDE.md §12). `ads` forces partner row-level security, so both halves run
// inside asStaff() (spec §4 trap 3).

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid } from "../../src/http/read-api.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { safeError } from "../../src/http/health.mjs";
import { asStaff } from "../../src/partners/rls.mjs";
import { linkAdNumber, listUnmatched } from "../../src/marketing/ad-numbers.mjs";
import { requestIdFrom, withRequestId } from "../../src/marketing/requests.mjs";

export const ROUTE = "marketing/ad-links";

const REFUSALS = {
  AD_NUMBER_INVALID: "ad_number_invalid",
  META_AD_ID_INVALID: "meta_ad_id_invalid",
  NOTHING_TO_LINK: "nothing_to_link"
};

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;
  const scope = deps.asStaff ?? asStaff;
  const method = req.method || "GET";

  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.MARKETING)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) return res.status(403).json({ ok: false, error: "forbidden" });

  try {
    if (method === "GET") {
      const unmatched = await scope((tx) => listUnmatched(tx, { orgId }));
      return res.status(200).json({ ok: true, count: unmatched.length, unmatched });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await withRequestId(
      database,
      { orgId, requestId: requestIdFrom(req), route: ROUTE },
      async () => {
        try {
          const ads = await scope((tx) => linkAdNumber(tx, {
            orgId,
            adNumber: body.ad_number,
            metaAdId: body.meta_ad_id ?? null,
            name: body.name ?? null
          }));
          if (!ads.length) {
            return {
              status: 404,
              body: {
                ok: false,
                error: "ad_not_found",
                message: "No ad has that Meta id or name yet. The next Meta sync pulls new ads in."
              }
            };
          }
          return { status: 200, body: { ok: true, linked: ads.length, ads } };
        } catch (err) {
          const code = err && REFUSALS[err.code];
          if (code) return { status: 400, body: { ok: false, error: code, message: err.message } };
          throw err;
        }
      }
    );
    return res.status(out.status).json(out.replayed ? { ...out.body, replayed: true } : out.body);
  } catch (err) {
    if (dbDown(res, err)) return;
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
