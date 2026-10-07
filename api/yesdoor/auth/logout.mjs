// POST /api/yesdoor/auth/logout — sign out: revoke THIS browser's Yesdoor session.
//
// Renters, building users and brokers (the yd_sessions door). The session named by
// the request (Authorization: Bearer, x-session-token, or the yesdoor_session
// cookie) is revoked on the spot: the token stops working on the next request, not
// when it would have expired in 30 days. Other sessions of the same account (a
// phone, a second laptop) are left alone: this is "sign me out here".
//
// Always 200 {ok: true, revoked}: signing out twice, signing out with a token that
// already expired, and signing out with nothing at all are all fine and answer the
// same way, so a screen can call it without caring which. It reads and writes
// nothing but the one yd_sessions row.
//
// STAFF ARE UNTOUCHED. Staff sign in through the Fundhub staff login (requireAuth)
// and their token lives in `sessions`, not `yd_sessions`: a staff token sent here
// matches no row, so it is never revoked from this door and keeps working.
import { db } from "../../../src/db.mjs";
import { allowMethods } from "../../../src/yesdoor/http.mjs";
import { YD_AUTH } from "../../../src/yesdoor/config.mjs";
import { revokeAccountSession, sessionTokenFromRequest } from "../../../src/yesdoor/auth/session.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  const token = sessionTokenFromRequest(req);
  const revoked = token ? await revokeAccountSession(db, token) : false;

  // Forget the cookie too, for a browser that was given one.
  res.setHeader("set-cookie", `${YD_AUTH.sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ ok: true, revoked });
}
