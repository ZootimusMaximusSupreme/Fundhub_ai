// POST /api/yesdoor/staff/agreement — draft, send and void agreements.
//
// Staff: ops and sales (the owner always).
//   new      {partyKind: "company" | "building" | "broker", partyId, action?: "draft" | "send",
//             terms? (a company must state them), toEmail? (a company has no email on file)}
//   existing {agreementId, action: "send" | "void"}   (send again = a fresh link and email)
// Sending queues one email with the signing link (nothing transmits) and returns the
// link too. Signing happens at POST webhooks/esign. 201 for a new agreement, else 200:
//   {ok, agreement: {id, partyKind, partyId, kind, status, terms, sentAt, signedAt, signerName},
//    signing: {url, expiresAt, sandbox} | null}
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { runAgreementAction } from "../../../src/yesdoor/store/agreements.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.supply, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await runAgreementAction(db, who, bodyOf(req));
    const { created, ...rest } = out;
    return res.status(created ? 201 : 200).json({ ok: true, ...rest });
  } catch (e) {
    return sendError(res, e);
  }
}
