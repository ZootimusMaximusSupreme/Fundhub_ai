// POST /api/yesdoor/me/income — a renter verifies income and the matches are
// recomputed. Renter session only; the renter is read off the session.
//
// Body, one of:
//   { method: "plaid", publicToken }              sandbox bank link; verified at once
//   { method: "statements", files: [{name, size?}] }   metadata only; goes to staff review
//
// Answers:
//   { ok, status: "verified", income: {id, method, status, monthlyIncomeCents, checkedAt},
//     renter, search, results[], backups[], nextStep }   same shape as the pre-screen's answer
//   { ok, status: "review", income, message }    statements: nothing is verified until staff read them
//   409 screening_required                       finish the pre-screen first
//   400 public_token_required | files_required | too_many_files
//
// NO SECOND PAID PULL: income changes the answer, not the credit file. The newest
// finished screening is reused; the screening provider is never called here.
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { recordIncome } from "../../../src/yesdoor/store/income.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["renter"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await recordIncome(db, { orgId: who.orgId, renterId: who.renterId, body: req.body });
    res.setHeader("cache-control", "no-store");
    if (out.status === "verified") {
      return res.status(200).json({ ok: true, status: "verified", income: out.income, ...out.answer });
    }
    return res.status(200).json({ ok: true, status: out.status, income: out.income, message: out.message });
  } catch (e) {
    return sendError(res, e);
  }
}
