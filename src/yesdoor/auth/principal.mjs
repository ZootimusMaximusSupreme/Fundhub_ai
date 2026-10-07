// Who is asking? The two gates every api/yesdoor handler goes through.
//
//   requireYdStaff(req, res, roles)      staff, through the EXISTING staff login
//                                        (requireAuth + requireRole, the two
//                                        allowlisted imports). `owner` always
//                                        passes; others need one of `roles`.
//   requireYdAccount(req, res, kinds)    renter / building_user / broker, through
//                                        yd_sessions.
//
// Both write the refusal and return null, so a handler is:
//     const who = await requireYdAccount(req, res, ["broker"]);
//     if (!who) return;
//
// 401 means "no valid session" (including a staff token shown to an account door
// and the reverse); 403 means "a valid session of the wrong kind or role". An
// outage of the check itself is a 503, never a 401, so a screen does not tell
// someone their login is bad while the database is down.

import { db as defaultDb } from "../../db.mjs";
import { requireRole } from "../../http/middleware/requireRole.mjs";
import { verifyAccountSession, sessionTokenFromRequest } from "./session.mjs";
import { YD_ROLES } from "../config.mjs";

/** requireYdStaff — a staff principal with an org, or null (refusal written).
 *  A staff session with no org cannot be scoped, so it is refused (fail closed). */
export async function requireYdStaff(req, res, roles = YD_ROLES.staff, { db = defaultDb } = {}) {
  const staff = await requireRole(...roles)(req, res, { db });
  if (!staff) return null;
  if (!staff.org_id) {
    res.status(403).json({ ok: false, error: "no_org" });
    return null;
  }
  return { kind: "staff", staffId: staff.id, orgId: staff.org_id, role: staff.role, email: staff.email, name: staff.name };
}

/** requireYdAccount — an account principal of one of `kinds`, or null. */
export async function requireYdAccount(req, res, kinds, { db = defaultDb } = {}) {
  const allowed = new Set((Array.isArray(kinds) ? kinds : [kinds]).filter(Boolean));
  if (!allowed.size) {
    res.status(403).json({ ok: false, error: "forbidden", message: "this endpoint declares no principal kinds" });
    return null;
  }
  const token = sessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  let verified;
  try {
    verified = await verifyAccountSession(db, token);
  } catch {
    res.status(503).json({ ok: false, error: "auth_unavailable", db: "down" });
    return null;
  }
  if (!verified) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  if (!allowed.has(verified.principal.kind)) {
    res.status(403).json({ ok: false, error: "forbidden", message: `this endpoint serves ${[...allowed].join(", ")}` });
    return null;
  }
  return verified.principal;
}
