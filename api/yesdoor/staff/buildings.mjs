// GET|POST /api/yesdoor/staff/buildings — the building book.
//
// GET  [?status&companyId&limit] (ops, sales, collections; the owner always): each
//      building with its fee terms, latest rules (and whether they went stale),
//      whether it may be matched today (signed agreement), listings and open
//      applications. No credit fields.
// POST (ops, sales; the owner always):
//      onboard   {name, address, city, state, leasingEmail, companyId?, zip?, lat?, lng?,
//                 unitsCount?, software?, connection?, tourHours?, appFeeCents?, appFeeWaived?,
//                 secondChance?, allowsRenterIncentive?, feeKind?, feePercent?, feeFlatCents?,
//                 refundDays?, paymentTermsDays?, status? (target | pitched)}
//                 -> 201 {ok, building}. An application fee left out stays UNKNOWN (null), never 0.
//      status    {buildingId, status, reason?}: pause, resume (needs a signed agreement),
//                 churn, or move target <-> pitched. `signed` and `agreement_sent` come only
//                 from the agreement flow.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, qs, optUuidParam, limitParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { listBuildings } from "../../../src/yesdoor/store/staff.mjs";
import { createBuilding, setBuildingStatus } from "../../../src/yesdoor/store/supply-writes.mjs";

const STATUSES = ["target", "pitched", "agreement_sent", "signed", "live", "paused", "churned"];

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, req.method === "POST" ? YD_ROLES.supply : YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    if (req.method === "POST") {
      const body = bodyOf(req);
      if (body.buildingId !== undefined && body.name === undefined) {
        const out = await setBuildingStatus(db, who, body);
        return res.status(200).json({ ok: true, ...out });
      }
      const { building } = await createBuilding(db, who, body);
      return res.status(201).json({ ok: true, building });
    }
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
