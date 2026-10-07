// GET|POST /api/yesdoor/staff/brokers — the broker partner book.
//
// GET  [?status&limit] (ops, sales, collections; the owner always): each broker with
//      plan, split, licence, tracking code, status and whether they have a login yet.
//      No money, no renters, no credit fields.
// POST (ops, sales; the owner always):
//      {name, email, company?, plan? (software | split, default split), splitPercent? (0-100,
//       default 25), licenceState? (AZ | CA | FL), licenceNumber?, licenceVerified?}
//      -> 201 {ok, broker}. The tracking code is minted by the database. A split partner
//      needs a licence state and number. The same email twice is a 409. The broker starts
//      `applied`; the partner agreement (POST staff/agreement) and a verified licence make
//      it `active`. A login for the broker is a separate step: POST staff/accounts.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, qs, limitParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { createBroker, listBrokers } from "../../../src/yesdoor/store/people-writes.mjs";

const STATUSES = ["applied", "active", "paused"];

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, req.method === "POST" ? YD_ROLES.supply : YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  try {
    if (req.method === "POST") {
      const { broker } = await createBroker(db, who, bodyOf(req));
      return res.status(201).json({ ok: true, broker });
    }
    const status = qs(req, "status");
    if (status && !STATUSES.includes(status)) throw new YdError(400, "invalid_parameter", "unknown status");
    const brokers = await listBrokers(db, { orgId: who.orgId, status, limit: limitParam(req) });
    return res.status(200).json({ ok: true, brokers });
  } catch (e) {
    return sendError(res, e);
  }
}
