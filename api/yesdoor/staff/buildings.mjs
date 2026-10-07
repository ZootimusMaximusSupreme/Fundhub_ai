// GET /api/yesdoor/staff/buildings[?status&companyId&limit] — the building book.
//
// Staff (ops, sales, collections; the owner always). Each building with its fee
// terms, latest rules (and whether they went stale), whether it may be matched
// today (signed agreement), listings and open applications. No credit fields.
// GET only for now: onboarding a building (POST) arrives in B4.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, qs, optUuidParam, limitParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { listBuildings } from "../../../src/yesdoor/store/staff.mjs";

const STATUSES = ["target", "pitched", "agreement_sent", "signed", "live", "paused", "churned"];

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const status = qs(req, "status");
    if (status && !STATUSES.includes(status)) throw new YdError(400, "invalid_parameter", "unknown status");
    const buildings = await listBuildings(db, {
      orgId: who.orgId, status, companyId: optUuidParam(req, "companyId"), limit: limitParam(req)
    });
    return res.status(200).json({ ok: true, buildings });
  } catch (e) {
    return sendError(res, e);
  }
}
