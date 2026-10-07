// POST /api/yesdoor/building/update — a building moves a renter's application along.
//
// Building-user session only, and only for applications at the user's own buildings
// (anything else is a 404).
//   stage  {applicationId, stage: toured | no_show | applied | approved | denied |
//           lease_signed | moved_in | refunded, reason?, lease?: {start, end, rentCents}}
//     denied        needs `reason`; runs the "approved, but the building said no" flow
//                   in one transaction (mismatch count, pause at 3 in 90 days, the
//                   application fee owed back when not waived, backups offered, events)
//     lease_signed  needs `lease` (real dates, end after start, rent in whole cents)
//     moved_in      earns the placement fee and issues the invoice in the same step
//     refunded      the renter left inside the refund window: the paid fee is reversed
//   claim  {applicationId, knownProspect: {evidenceAt, evidence}}: "we already knew this
//          renter", within 3 days of the registration and with your own earlier record;
//          opens an attribution dispute for ops
// Stages move only along the arrows; anything else is a 409. Repeating a move that
// already happened answers 200 {unchanged: true}.
//   200 {ok, application, unchanged, mismatch, refundOwed, backupsOffered, fee?, dispute?}
// The application is the same safe shape GET building/renters returns: no credit fields.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { updatePlacement } from "../../../src/yesdoor/store/placements.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await updatePlacement(db, who, bodyOf(req));
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
