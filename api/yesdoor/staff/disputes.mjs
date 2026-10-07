// GET|POST /api/yesdoor/staff/disputes — attribution, denial and fee disputes.
//
// GET  [?status&limit] (ops, sales, collections; the owner always): open ones first,
//      soonest due first, with an overdue flag.
// POST staff open one, ops (and the owner) decide it, within 14 days:
//      open    {kind: attribution | denial | fee, applicationId, note?}  (roles: ops, sales, collections)
//      decide  {disputeId, decision: upheld | rejected, note?}           (roles: ops)
//      "Upheld" means the person who opened it was right. For an attribution or fee
//      dispute upheld, the placement fee is taken back (voided if unpaid, reversed by a
//      negative row if paid); an attribution dispute rejected earns a fee that was held
//      back while it was open. A decided dispute is never re-decided.
//   201 {ok, dispute} for an open; 200 {ok, dispute, effect, unchanged} for a decision.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, qs, limitParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { listDisputes } from "../../../src/yesdoor/store/staff.mjs";
import { openDispute, decideDispute } from "../../../src/yesdoor/store/disputes.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, req.method === "POST" ? YD_ROLES.disputeOpen : YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    if (req.method === "POST") {
      const body = bodyOf(req);
      if (body.disputeId !== undefined) {
        // Deciding is narrower than opening: ops and the owner only.
        if (who.role !== "owner" && !YD_ROLES.disputeDecide.includes(who.role)) {
          return res.status(403).json({ ok: false, error: "forbidden", required: [...YD_ROLES.disputeDecide] });
        }
        return res.status(200).json({ ok: true, ...(await decideDispute(db, who, body)) });
      }
      const { dispute } = await openDispute(db, who, body);
      return res.status(201).json({ ok: true, dispute });
    }
    const status = qs(req, "status");
    if (status && !["open", "decided"].includes(status)) throw new YdError(400, "invalid_parameter", "status must be open or decided");
    const disputes = await listDisputes(db, { orgId: who.orgId, status, limit: limitParam(req) });
    return res.status(200).json({ ok: true, disputes });
  } catch (e) {
    return sendError(res, e);
  }
}
