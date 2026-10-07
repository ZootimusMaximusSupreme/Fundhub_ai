// POST /api/yesdoor/webhooks/esign — the sandbox e-sign callback: someone opened
// their signing link and signed.
//
// No login. The signed link IS the credential (HMAC over the agreement id and an
// expiry, YD_LINK_SECRET): send either {url} (the whole link) or {id, exp, sig}
// (its three parts), plus {signerName}. Signing turns the agreement `signed` and
// the building (or each building of the company still onboarding) `signed`.
//
// A bad, expired or forged link and an unknown agreement all answer the same 404,
// so this door cannot be used to find out which agreements exist. Signing twice is
// a harmless 200 {alreadySigned: true}.
//   200 {ok, status: "signed", agreementId, alreadySigned}
import { db } from "../../../src/db.mjs";
import { allowMethods, clientIp, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { completeSigningByLink } from "../../../src/yesdoor/store/agreements.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const body = bodyOf(req);
    let url = typeof body.url === "string" ? body.url : null;
    if (!url && body.id && body.exp && body.sig) {
      url = `/yesdoor/agreement.html?${new URLSearchParams({ id: String(body.id), exp: String(body.exp), sig: String(body.sig) })}`;
    }
    const orgId = await resolveYdOrgId(db);
    const out = await completeSigningByLink(db, {
      orgId, url: url || "", signerName: body.signerName, signerIp: clientIp(req)
    });
    if (!out.ok) return res.status(out.status).json({ ok: false, error: out.error });
    return res.status(200).json({ ok: true, status: out.status, agreementId: out.agreementId, alreadySigned: out.alreadySigned });
  } catch (e) {
    return sendError(res, e);
  }
}
