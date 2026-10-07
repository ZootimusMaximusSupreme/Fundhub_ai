// GET /api/yesdoor/public/agreement?id=<agreementId>&exp=<unix>&sig=<hex> — what a signing
// link is about, for the page at /yesdoor/agreement.html.
//
// No login. The signed link IS the credential (HMAC over the agreement id and an expiry,
// YD_LINK_SECRET), the same one POST webhooks/esign checks. A bad, expired or forged link, an
// unknown agreement, another company's agreement and an agreement still in draft all answer
// the same 404, so this door cannot be used to find out which agreements exist. Reading changes
// nothing.
//   200 {ok, agreement: {id, kind, partyKind, partyName, status (sent | signed | void), signedAt,
//        expiresAt, sandbox, terms}}
// `terms` is the fee terms (building_fee) or the partner plan (broker_partner) frozen into the
// agreement when it was drafted; null when the agreement was voided. Terms only: no signer, no
// address, no email.
import { db } from "../../../src/db.mjs";
import { allowMethods, qs, sendError } from "../../../src/yesdoor/http.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { readAgreementForSigning } from "../../../src/yesdoor/store/agreements.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const params = new URLSearchParams();
    for (const key of ["id", "exp", "sig"]) {
      const v = qs(req, key);
      if (v !== null) params.set(key, v);
    }
    const orgId = await resolveYdOrgId(db);
    const agreement = await readAgreementForSigning(db, { orgId, url: `/yesdoor/agreement.html?${params}` });
    res.setHeader("cache-control", "no-store");
    if (!agreement) return res.status(404).json({ ok: false, error: "not_found" });
    return res.status(200).json({ ok: true, agreement });
  } catch (e) {
    return sendError(res, e);
  }
}
