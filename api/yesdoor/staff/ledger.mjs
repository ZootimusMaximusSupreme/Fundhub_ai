// GET /api/yesdoor/staff/ledger[?limit] — fees, invoices and broker money.
//
// Staff: ops and collections (the owner always). Sales is refused: this is money.
// Integer cents throughout. No credit fields.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { getLedger } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.money, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const out = await getLedger(db, { orgId: who.orgId, limit: limitParam(req) });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
