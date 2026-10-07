// POST /api/yesdoor/staff/refund {applicationId, reason} — reverse a paid fee.
//
// Staff: ops and collections (the owner always). The renter left inside the
// building's refund window (60 days by default after the fee was paid): the paid
// fee is reversed by a NEW negative row (the original stays), the placement moves
// to `refunded`, and the broker's unpaid share is voided. After the window the
// fee is `safe` and this answers 409 refund_window_closed.
//   200 {ok, applicationId, stage: "refunded", feeId, refundFeeId, alreadyRefunded}
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { refundPlacement } from "../../../src/yesdoor/store/money.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.money, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await refundPlacement(db, who, bodyOf(req));
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
