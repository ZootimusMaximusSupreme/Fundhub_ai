// GET /api/yesdoor/staff/companies — the property companies, with building counts.
//
// Staff (ops, sales, collections; the owner always). No credit fields.
// GET only for now: creating a company (POST) arrives in B4.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { listCompanies } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const companies = await listCompanies(db, { orgId: who.orgId, limit: limitParam(req) });
    return res.status(200).json({ ok: true, companies });
  } catch (e) {
    return sendError(res, e);
  }
}
