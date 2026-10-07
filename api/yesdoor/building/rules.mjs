// GET /api/yesdoor/building/rules[?buildingId] — a building's rental rules.
//
// Building-user session only. Every version, newest first, with whether the
// current one has gone stale (not confirmed within the stale window, which pauses
// matches). These are the building's OWN rules, not any renter's data.
// GET only for now: posting a new version (POST) arrives in B4.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, optUuidParam, sendError } from "../../../src/yesdoor/http.mjs";
import { scopeBuildings, listBuildingRules } from "../../../src/yesdoor/store/buildings.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const buildingIds = scopeBuildings(who, optUuidParam(req, "buildingId"));
    const buildings = await listBuildingRules(db, { orgId: who.orgId, buildingIds });
    return res.status(200).json({ ok: true, buildings });
  } catch (e) {
    return sendError(res, e);
  }
}
