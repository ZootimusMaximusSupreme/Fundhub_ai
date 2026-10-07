// POST /api/yesdoor/staff/payment — log money that moved.
//
// Staff: ops and collections (the owner always). Three shapes, picked by the id sent:
//   invoice  {invoiceId | invoiceNumber, method: ach | wire | check | paymode, ref, paidAt?}
//            a building paid an invoice: the invoice is paid, its fee is `paid`, the
//            placement is `paid`, and the broker's share is held until paid + refund days.
//            Repeating the same reference is a harmless 200 {alreadyPaid: true}.
//   fee refund    {feeRefundId, method, ref}   we paid a refund back to a building
//   renter refund {renterRefundId, ref}        we paid a renter their application fee back
// Money is integer cents. Nothing here moves real money: it records that it moved.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { recordPayment, recordFeeRefundPaid, recordRenterRefundPaid } from "../../../src/yesdoor/store/money.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.money, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const body = bodyOf(req);
    const out = body.feeRefundId !== undefined ? await recordFeeRefundPaid(db, who, body)
      : body.renterRefundId !== undefined ? await recordRenterRefundPaid(db, who, body)
        : await recordPayment(db, who, body);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
