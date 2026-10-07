// POST /api/yesdoor/public/lead — the first step of the funnel: a name and an email.
//
// No login. Body:
//   { firstName?, lastName?, email,
//     source?: { kind?: "ad"|"organic"|"direct"|"referral", adId?, brokerCode? } }
// Creates the renter, or finds the one that already has this email. FIRST TOUCH is
// written once, when the renter is created (an ad id, or an active broker's
// tracking code), and never changed: a second visit through another ad or broker
// credits nobody new. Existing names are only filled in where empty.
//
// The answer is the same whether the email was new or known ({ ok: true, status:
// "received" }), so the door cannot be used to find out who is a renter. POST only.
// The company is the deployment's own (YD_ORG_SLUG), never a parameter. Nothing is
// sent and no credit is touched here.
import { db } from "../../../src/db.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { findOrCreateLead } from "../../../src/yesdoor/store/leads.mjs";
import { withTransaction } from "../../../src/yesdoor/tx.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const orgId = await resolveYdOrgId(db);
    const b = req.body && typeof req.body === "object" ? req.body : {};
    await withTransaction(db, (tx) => findOrCreateLead(tx, {
      orgId, email: b.email, firstName: b.firstName, lastName: b.lastName, source: b.source
    }));
    return res.status(200).json({ ok: true, status: "received" });
  } catch (e) {
    return sendError(res, e);
  }
}
