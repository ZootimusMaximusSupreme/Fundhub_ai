// GET /api/yesdoor/broker/renters — a broker's renters: name and stage only.
//
// Broker session only. Plus whether each tour was kept. NEVER a result, a risk
// tier or any credit field (owner-set: brokers see stage only).
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, limitParam, sendError } from "../../../src/yesdoor/http.mjs";
import { listBrokerRenters } from "../../../src/yesdoor/store/brokers.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["broker"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const renters = await listBrokerRenters(db, { orgId: who.orgId, brokerId: who.brokerId, limit: limitParam(req) });
    return res.status(200).json({ ok: true, renters });
  } catch (e) {
    return sendError(res, e);
  }
}
