// POST /api/yesdoor/staff/accounts — give a person a login.
//
// Ops only (the owner always). Until now building-user and broker logins could only be
// inserted by hand.
//   building user  {kind: "building_user", email, buildingIds: [id, ...], role? (leasing | manager)}
//   broker         {kind: "broker", brokerId, email? (defaults to the broker's own address)}
// Creates the login and queues its sign-in link email (yd_outbox, nothing transmits) in
// one transaction. 201 {ok, account: {id, kind, email, status, brokerId, buildings}, signIn: {queued,
// expiresMinutes}}. The link itself is in the email only, never in this answer.
//   404  a building or broker that is not in this company (same answer as one that does not exist)
//   409  that email already has a login in this company, or that broker already has one
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, clientIp, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { createAccount } from "../../../src/yesdoor/store/people-writes.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.accounts, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await createAccount(db, who, bodyOf(req), { ip: clientIp(req), userAgent: req.headers?.["user-agent"] || null });
    return res.status(201).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
