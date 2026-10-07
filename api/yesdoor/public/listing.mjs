// GET /api/yesdoor/public/listing?id — one public listing.
//
// No login. A listing that is inactive, at an unsigned building (and not a
// flagged sample), or in another company answers 404, never a hint that it exists.
import { db } from "../../../src/db.mjs";
import { allowMethods, uuidParam, sendError } from "../../../src/yesdoor/http.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { getListing } from "../../../src/yesdoor/store/listings.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const id = uuidParam(req, "id");
    const orgId = await resolveYdOrgId(db);
    const listing = await getListing(db, { orgId, id });
    if (!listing) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, listing });
  } catch (e) {
    return sendError(res, e);
  }
}
