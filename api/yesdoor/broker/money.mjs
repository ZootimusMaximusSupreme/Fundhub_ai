// GET /api/yesdoor/broker/money — a broker's own money.
//
// Broker session only. Earned, held until the building's fee is safe (60 days
// after it paid), payable, and paid. Integer cents. No credit fields.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { getBrokerMoney } from "../../../src/yesdoor/store/brokers.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["broker"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const money = await getBrokerMoney(db, { orgId: who.orgId, brokerId: who.brokerId, limit: limitParam(req) });
    return res.status(200).json({ ok: true, ...money });
  } catch (e) {
    return sendError(res, e);
  }
}
