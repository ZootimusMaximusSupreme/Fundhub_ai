// POST /api/yesdoor/staff/broker-payout {brokerId, payoutRef, ledgerIds?} — pay a broker.
//
// Staff: ops and collections (the owner always). Marks the broker's PAYABLE shares
// paid (all of them, or the listed rows), recording the payout reference. A share is
// payable only once the building's fee is safe (the database refuses it earlier), and
// the broker must be an active partner. Repeating the same reference after the shares
// are paid answers 200 {alreadyPaid: true} with nothing new.
//   200 {ok, paid, totalCents, rows: [{id, amountCents}], alreadyPaid}
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { payBroker } from "../../../src/yesdoor/store/money.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.money, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await payBroker(db, who, bodyOf(req));
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
