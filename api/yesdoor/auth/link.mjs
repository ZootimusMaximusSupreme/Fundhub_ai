// POST /api/yesdoor/auth/link {email} — ask for a sign-in link.
//
// Renters, building users and brokers (not staff: staff use the staff login).
// Open by design, like every sign-in route. THE ANSWER IS THE SAME for an address
// we know and one we do not; `outcome` goes to the log, never to the body. The
// email is a queued yd_outbox row; nothing is sent from here.
import { db, dbTarget } from "../../../src/db.mjs";
import { allowMethods, clientIp } from "../../../src/yesdoor/http.mjs";
import { YD_AUTH } from "../../../src/yesdoor/config.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { requestMagicLink } from "../../../src/yesdoor/auth/magic-link.mjs";

const UNIFORM_MESSAGE =
  "If that email address has a Yesdoor account, a sign-in link is on its way. " +
  `The link expires in ${YD_AUTH.linkTtlMinutes} minutes.`;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  const { email } = req.body || {};
  let out;
  try {
    const orgId = await resolveYdOrgId(db);
    out = await requestMagicLink(db, {
      email, orgId, ip: clientIp(req), userAgent: req.headers?.["user-agent"] || null
    });
  } catch (err) {
    // Log the real cause server-side; the adapter answers a generic 500.
    console.error(`yesdoor/auth/link: request failed (${err && err.code ? err.code : "error"}) — connected to ${dbTarget()}`);
    throw err;
  }

  if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error });
  if (out.limited) {
    res.setHeader("Retry-After", String((out.retryAfterMinutes || YD_AUTH.linkLimits.windowMinutes) * 60));
    return res.status(429).json({
      ok: false, error: "too_many_requests",
      message: "Too many sign-in link requests. Try again in a few minutes."
    });
  }
  return res.status(200).json({ ok: true, message: UNIFORM_MESSAGE });
}
