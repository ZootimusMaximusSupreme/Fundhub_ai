// GET /api/yesdoor/building/invoices[?buildingId] — a building's invoices.
//
// Building-user session only. Every line carries the proof a leasing office
// expects from a locator (spec §5b): the registration timestamp, renter name,
// unit, move-in date and lease term. Money only; no credit fields.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, optUuidParam, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { scopeBuildings, listBuildingInvoices } from "../../../src/yesdoor/store/buildings.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const buildingIds = scopeBuildings(who, optUuidParam(req, "buildingId"));
    const invoices = await listBuildingInvoices(db, { orgId: who.orgId, buildingIds, limit: limitParam(req) });
    return res.status(200).json({ ok: true, invoices });
  } catch (e) {
    return sendError(res, e);
  }
}
