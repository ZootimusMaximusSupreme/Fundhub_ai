// GET /api/yesdoor/staff/screening?id — one screening with its raw bureau payload.
//
// OPS AND OWNER ONLY (spec §1, §17.6). The raw payload is the one place the whole
// report is readable, and it never leaves through any other endpoint.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, uuidParam, sendError } from "../../../src/yesdoor/http.mjs";
import { getScreeningDetail } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.credit, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const out = await getScreeningDetail(db, { orgId: who.orgId, screeningId: uuidParam(req, "id") });
    if (!out) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
