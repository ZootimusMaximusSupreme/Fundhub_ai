// POST /api/yesdoor/public/prescreen — consent, a sandbox credit and background
// check, and the matches for the searched city.
//
// No login. Body:
//   { email, firstName?, lastName?,
//     address: { line1?, city?, state?, zip? },
//     search?: { city?, state?, beds?, maxRent? },   // maxRent in WHOLE DOLLARS; city defaults to address.city
//     consent: { text, version, checked: true },     // what the renter was shown; required
//     dob?: "YYYY-MM-DD",                            // only when asked for; never stored
//     source?: { kind?, adId?, brokerCode? } }       // used only if no lead was created first
//
// Answers (always 200 unless noted):
//   { ok, status: "complete", renter, search, results[], backups[], nextStep,
//     renterToken, renterTokenExpiresAt }
//       results[] is per building and carries the renter's own reasons.
//       renterToken is a session for GET me, POST me/income and POST public/book:
//       send it as `Authorization: Bearer <renterToken>`. It is returned once, here.
//   { ok, status: "needs_dob", needsDob: true }   no file found: ask for the date of birth and POST again
//   { ok, status: "no_match", needsDob: false }   no file even with a date of birth
//   { ok, status: "signin_required" }             this email already has results, or belongs to someone who has
//                                                 signed in: a sign-in link was emailed and nothing is shown.
//                                                 (A signed-in renter who is not screened yet may run their own:
//                                                 send their session as Authorization: Bearer.)
//   400 consent_required | email_required | city_required | invalid_dob | invalid_parameter
//   429 too_many_requests                         one source address may start 10 a hour (a screening is a paid pull)
//   503 screening_unavailable                     the provider failed; consent was kept, try again
//
// POST only. Nothing leaves the building: the credit check is a sandbox stub.
import { db } from "../../../src/db.mjs";
import { allowMethods, clientIp, sendError } from "../../../src/yesdoor/http.mjs";
import { sessionTokenFromRequest, verifyAccountSession } from "../../../src/yesdoor/auth/session.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { prescreenResponse, runPrescreen } from "../../../src/yesdoor/store/prescreen.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const orgId = await resolveYdOrgId(db);
    // A signed-in renter who has not been screened yet may run their own pre-screen.
    let sessionRenterId = null;
    const token = sessionTokenFromRequest(req);
    if (token) {
      const who = await verifyAccountSession(db, token).catch(() => null);
      if (who && who.principal.kind === "renter" && who.principal.orgId === orgId) sessionRenterId = who.principal.renterId;
    }
    const out = await runPrescreen(db, {
      orgId, body: req.body, ip: clientIp(req), userAgent: req.headers?.["user-agent"] || null, sessionRenterId
    });
    // Credit reasons and a session token: never cached.
    res.setHeader("cache-control", "no-store");
    const { code, body } = prescreenResponse(out);
    return res.status(code).json(body);
  } catch (e) {
    return sendError(res, e);
  }
}
