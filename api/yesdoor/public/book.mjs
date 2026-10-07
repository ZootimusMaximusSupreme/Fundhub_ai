// POST /api/yesdoor/public/book {renterToken, buildingId, listingId, startsAt} — book a tour.
//
// No login screen: the renter proves who they are with `renterToken`, a renter
// session token (or the same token as a Bearer header). In ONE transaction:
// the application is created, the tour is written, and the building is registered
// with a timestamped email (the referral proof), which moves the application to
// `registered`. A renter holds at most 3 open applications and one per building.
// The building must be signed (or a flagged sample), the renter must already have
// a match there that is not "no", and the time must be inside the building's tour
// hours. Nothing transmits: the registration and confirmation are queued messages.
//   201 {ok, applicationId, tourId, startsAt, endsAt, buildingName, address,
//        registrationQueued, registrationAt, openApplications}
//   401 no valid renter token   404 unknown building or unit   409 cap, duplicate, not a match
import { db } from "../../../src/db.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf, reqUuid, timestampOf } from "../../../src/yesdoor/validate.mjs";
import { resolveRenterToken } from "../../../src/yesdoor/auth/renter-token.mjs";
import { bookTour } from "../../../src/yesdoor/store/booking.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const body = bodyOf(req);
    let renter;
    try {
      renter = await resolveRenterToken(db, req, body);
    } catch {
      return res.status(503).json({ ok: false, error: "auth_unavailable" });
    }
    if (!renter) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Please start from the first step so we know who is booking." });
    }
    const out = await bookTour(db, {
      ...renter,
      buildingId: reqUuid(body, "buildingId", "the building"),
      listingId: reqUuid(body, "listingId", "the apartment"),
      startsAt: timestampOf(body.startsAt, "The tour time")
    });
    return res.status(201).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
