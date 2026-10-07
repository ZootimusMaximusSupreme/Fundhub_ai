// GET|POST /api/yesdoor/staff/companies — the property companies.
//
// GET  (ops, sales, collections; the owner always): the list, with building counts.
//      No credit fields.
// POST (ops, sales; the owner always) {name, tier?, hqState?, software?, status?}:
//      add a company as `target` or `pitched`. It becomes `agreement_sent` and
//      `signed` only through POST staff/agreement. 201 {ok, company}; the same
//      name twice is a 409.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { listCompanies } from "../../../src/yesdoor/store/staff.mjs";
import { createCompany } from "../../../src/yesdoor/store/supply-writes.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, req.method === "POST" ? YD_ROLES.supply : YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    if (req.method === "POST") {
      const { company } = await createCompany(db, who, bodyOf(req));
      return res.status(201).json({ ok: true, company });
    }
    const companies = await listCompanies(db, { orgId: who.orgId, limit: limitParam(req) });
    return res.status(200).json({ ok: true, companies });
  } catch (e) {
    return sendError(res, e);
  }
}
