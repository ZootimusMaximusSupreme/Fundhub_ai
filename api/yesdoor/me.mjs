// GET /api/yesdoor/me — a renter's own status, matches, tours and results.
//
// Renter session only (a building user, broker or staff token gets 401/403). The
// renter is read off the session; there is no ?renterId=. No credit numbers: the
// renter sees results (approved / likely / no) and the date of the rules used.
// GET only for now: income and tour changes (POST) arrive in B3/B4.
import { db } from "../../src/db.mjs";
import { requireYdAccount } from "../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../src/yesdoor/http.mjs";
import { getRenterMe } from "../../src/yesdoor/store/renters.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["renter"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const me = await getRenterMe(db, { orgId: who.orgId, renterId: who.renterId });
    if (!me) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, ...me });
  } catch (e) {
    return sendError(res, e);
  }
}
