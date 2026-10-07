// GET /api/yesdoor/auth/verify?t=<token> — trade a sign-in link for a session.
// POST /api/yesdoor/auth/verify {token}  — the same, with the token in the body.
//
// GET is the contract (spec §8). POST is accepted too and is what the login PAGE
// should use: a mail scanner that follows every URL in a message can spend a
// single-use token by GET, so the emailed link points at the page, which POSTs.
//
// A link works once. EVERY failure (forged, expired, spent, account suspended
// since) answers the same 401 invalid_link. The session token comes back once, in
// the body; the browser keeps it (Authorization: Bearer) or the page sets the
// yesdoor_session cookie.
import { db } from "../../../src/db.mjs";
import { allowMethods, clientIp, qs } from "../../../src/yesdoor/http.mjs";
import { verifyMagicLink } from "../../../src/yesdoor/auth/magic-link.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  const token = req.method === "POST" ? (req.body && req.body.token) : qs(req, "t");
  const out = await verifyMagicLink(db, token, {
    ip: clientIp(req), userAgent: req.headers?.["user-agent"] || null
  });

  if (!out.ok) return res.status(out.status || 401).json({ ok: false, error: out.error });
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({
    ok: true,
    token: out.token,
    expiresAt: out.expiresAt,
    principal: {
      kind: out.principal.kind,
      email: out.principal.email,
      renterId: out.principal.renterId,
      brokerId: out.principal.brokerId,
      buildingIds: out.principal.buildingIds
    }
  });
}
