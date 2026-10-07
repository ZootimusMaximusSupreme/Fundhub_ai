// The renter behind a public booking call.
//
// POST public/book has no login screen in front of it (the funnel is name + email
// -> pre-screen -> book), so the renter proves who they are with `renterToken` in
// the body. A renterToken IS a renter session token (a yd_sessions token for a
// `renter` account, the same thing GET me takes as a Bearer token): the lead and
// pre-screen steps hand one back, and so does the emailed login link. The same
// token in the Authorization header or the yesdoor_session cookie works too.
//
// It must belong to THIS deployment's company (YD_ORG_SLUG), a renter account,
// and be live: anything else is the same 401, so the door says nothing about why.

import { verifyAccountSession, sessionTokenFromRequest } from "./session.mjs";
import { resolveYdOrgId } from "../store/org.mjs";

/** -> { orgId, renterId, accountId } or null. */
export async function resolveRenterToken(db, req, body = {}, env = process.env) {
  const token = (typeof body.renterToken === "string" && body.renterToken.trim()) || sessionTokenFromRequest(req);
  if (!token) return null;
  const verified = await verifyAccountSession(db, token);
  if (!verified || verified.principal.kind !== "renter" || !verified.principal.renterId) return null;
  const orgId = await resolveYdOrgId(db, env);
  if (verified.principal.orgId !== orgId) return null;
  return { orgId, renterId: verified.principal.renterId, accountId: verified.principal.accountId };
}
