// POST /api/yesdoor/me/tour {tourId, action: "reschedule" | "cancel", startsAt?} — change a tour.
//
// Renter session only; the tour must be the renter's own (anything else is a 404).
// Cancel also cancels the application, which frees a place in the cap of 3 (the
// registration timestamp stays on it as proof). Reschedule needs a new time inside
// the building's tour hours. The building gets a queued notice either way.
//   200 {ok, tourId, status: "cancelled" | "rescheduled", startsAt, endsAt?, applicationStage}
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf, reqEnum, reqUuid, timestampOf } from "../../../src/yesdoor/validate.mjs";
import { changeTour } from "../../../src/yesdoor/store/booking.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["renter"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const body = bodyOf(req);
    const action = reqEnum(body, "action", ["reschedule", "cancel"], "what to do");
    const out = await changeTour(db, {
      orgId: who.orgId, renterId: who.renterId, accountId: who.accountId,
      tourId: reqUuid(body, "tourId", "the tour"),
      action,
      startsAt: action === "reschedule" ? timestampOf(body.startsAt, "The new tour time") : undefined
    });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
