// GET /api/yesdoor/staff/disputes[?status&limit] — attribution, denial and fee disputes.
//
// Staff (ops, sales, collections; the owner always). Open ones first, soonest due
// first, with an overdue flag (owner or ops decides within 14 days).
// GET only for now: opening and deciding (POST) arrive in B4.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, qs, limitParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { listDisputes } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const status = qs(req, "status");
    if (status && !["open", "decided"].includes(status)) throw new YdError(400, "invalid_parameter", "status must be open or decided");
    const disputes = await listDisputes(db, { orgId: who.orgId, status, limit: limitParam(req) });
    return res.status(200).json({ ok: true, disputes });
  } catch (e) {
    return sendError(res, e);
  }
}
