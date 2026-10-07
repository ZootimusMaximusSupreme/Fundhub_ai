// GET /api/yesdoor/broker/link — a broker's tracking code and shareable link.
//
// Broker session only. The link is returned only while the partner is active; a
// partner who has only applied, or is paused, sees their status and no link.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { getBrokerLink } from "../../../src/yesdoor/store/brokers.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["broker"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const link = await getBrokerLink(db, { orgId: who.orgId, brokerId: who.brokerId });
    if (!link) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, ...link });
  } catch (e) {
    return sendError(res, e);
  }
}
