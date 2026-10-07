// GET /api/yesdoor/staff/renter?id — one renter's full timeline, credit details included.
//
// OPS AND OWNER ONLY (spec §1, §17.6). Sales and collections get a 403. Consents,
// every screening ever kept (score, collections, evictions, criminal flags),
// income checks, matches with their reasons, applications, tours and events.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, uuidParam, sendError } from "../../../src/yesdoor/http.mjs";
import { getRenterTimeline } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.credit, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const timeline = await getRenterTimeline(db, { orgId: who.orgId, renterId: uuidParam(req, "id") });
    if (!timeline) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, ...timeline });
  } catch (e) {
    return sendError(res, e);
  }
}
