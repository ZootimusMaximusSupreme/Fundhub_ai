// GET|POST /api/yesdoor/building/rules — a building's rental rules.
//
// Building-user session only.
// GET  [?buildingId]: every version, newest first, with whether the current one has
//      gone stale (not confirmed within the stale window, which pauses matches).
//      These are the building's OWN rules, not any renter's data.
// POST {buildingId?, rules: {minScore, incomeMultiple, maxEvictions?, evictionLookbackYears?,
//       criminalPolicy?, acceptsSecondChance?}, notes?}: save a NEW version, confirmed now.
//       Rules are never edited. {buildingId?, confirmCurrent: true} re-confirms the
//       latest version unchanged. 201 {ok, buildingId, rules} (200 for a confirm).
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, optUuidParam, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { scopeBuildings, listBuildingRules } from "../../../src/yesdoor/store/buildings.mjs";
import { postRules } from "../../../src/yesdoor/store/building-writes.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    if (req.method === "POST") {
      const out = await postRules(db, who, bodyOf(req));
      const { created, ...rest } = out;
      return res.status(created ? 201 : 200).json({ ok: true, ...rest });
    }
    const buildingIds = scopeBuildings(who, optUuidParam(req, "buildingId"));
    const buildings = await listBuildingRules(db, { orgId: who.orgId, buildingIds });
    return res.status(200).json({ ok: true, buildings });
  } catch (e) {
    return sendError(res, e);
  }
}
