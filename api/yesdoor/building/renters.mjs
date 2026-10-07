// GET /api/yesdoor/building/renters[?buildingId] — a building's renters.
//
// Building-user session only. Each renter shows approved / likely / no, income
// verified, risk tier and max rent. NEVER the raw credit report and no credit
// field at all (owner-set, spec §16). Only buildings linked to the account are
// readable; a buildingId outside them is a 403.
// GET only for now: building/update (POST) arrives in B4.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, optUuidParam, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { scopeBuildings, listBuildingsFor, listBuildingRenters } from "../../../src/yesdoor/store/buildings.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const buildingIds = scopeBuildings(who, optUuidParam(req, "buildingId"));
    const buildings = await listBuildingsFor(db, { orgId: who.orgId, buildingIds });
    const renters = await listBuildingRenters(db, { orgId: who.orgId, buildingIds, limit: limitParam(req) });
    return res.status(200).json({ ok: true, buildings, renters });
  } catch (e) {
    return sendError(res, e);
  }
}
