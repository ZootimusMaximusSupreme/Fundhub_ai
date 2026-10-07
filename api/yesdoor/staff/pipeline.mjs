// GET /api/yesdoor/staff/pipeline[?stage&limit] — counts and lists by stage.
//
// Staff (ops, sales, collections; the owner always). Renter stages and
// application stages, zero-filled, plus the newest rows (optionally one stage).
// No credit fields: this is the desk view every staff role may open.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, qs, limitParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { getPipeline, RENTER_STAGES, APPLICATION_STAGES } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const stage = qs(req, "stage");
    if (stage && !RENTER_STAGES.includes(stage) && !APPLICATION_STAGES.includes(stage)) {
      throw new YdError(400, "invalid_parameter", "unknown stage");
    }
    const out = await getPipeline(db, { orgId: who.orgId, stage, limit: limitParam(req) });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
