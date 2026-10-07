// POST /api/yesdoor/building/listings — add or update one unit.
//
// Building-user session only. {buildingId?, unitLabel, beds (0 = studio), rentCents,
// baths?, sqft?, availableOn? (YYYY-MM-DD), specials?, photos? (https links), active?}.
// The same unit label (any case) updates that unit. 201 {ok, listing, created}
// for a new unit, 200 for an update. Money is integer cents.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { saveListing } from "../../../src/yesdoor/store/building-writes.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await saveListing(db, who, bodyOf(req));
    return res.status(out.created ? 201 : 200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
