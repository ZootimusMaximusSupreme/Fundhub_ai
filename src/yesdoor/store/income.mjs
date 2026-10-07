// Income check (spec §8: POST me/income). A renter's bank link (sandbox Plaid) or
// uploaded statements.
//
// NO SECOND PAID PULL. Income changes the answer, not the credit file: this reads
// the renter's newest finished screening and recomputes the matches from it. It
// never calls the screening provider (a test counts yd_screenings before and after).
//
//   plaid       status verified at once, with a monthly income and a date. The
//               matches are recomputed and returned.
//   statements  status `review`: nothing counts as verified until staff read the
//               deposits. A staff event (income.review_requested) is the task, and
//               the matches do not change, so nothing is recomputed.

import { YD_PRESCREEN } from "../config.mjs";
import * as plaidSandbox from "../providers/plaid-sandbox.mjs";
import { cents, YdError } from "../http.mjs";
import { recordEvent } from "./events.mjs";
import { cleanText } from "./leads.mjs";
import { latestCompleteScreening, renterAnswer, runMatching } from "./matching.mjs";
import { withTransaction } from "./tx.mjs";

export const DEFAULT_INCOME_PROVIDERS = Object.freeze({ plaid: plaidSandbox });

const ALLOWED_STATUSES = new Set(["verified", "review", "failed"]);

const incomeView = (row) => ({
  id: row.id,
  method: row.method,
  status: row.status,
  monthlyIncomeCents: cents(row.monthly_income_cents),
  checkedAt: row.checked_at
});

/** The statement files a request names: names (and sizes) only, clipped. */
function parseFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new YdError(400, "files_required", "name at least one statement file");
  }
  if (files.length > YD_PRESCREEN.incomeFilesMax) {
    throw new YdError(400, "too_many_files", `at most ${YD_PRESCREEN.incomeFilesMax} statement files at a time`);
  }
  return files.map((f) => {
    const name = cleanText(typeof f === "string" ? f : f?.name, 200);
    if (!name) throw new YdError(400, "files_required", "every statement file needs a name");
    const size = Number.isInteger(f?.size) && f.size >= 0 ? f.size : null;
    return { name, size };
  });
}

/**
 * @returns {Promise<{ status: "verified", income: object, answer: object }
 *                 | { status: "review" | "failed", income: object, message: string }>}
 */
export async function recordIncome(db, { orgId, renterId, body, now = new Date(), providers = DEFAULT_INCOME_PROVIDERS }) {
  const b = body && typeof body === "object" ? body : {};
  const method = b.method === "statements" || (!b.method && !b.publicToken && b.files) ? "statements" : "plaid";
  // Validate before anything is written.
  const publicToken = method === "plaid" ? cleanText(b.publicToken, 500) : null;
  if (method === "plaid" && !publicToken) {
    throw new YdError(400, "public_token_required", "the bank link token is required");
  }
  const files = method === "statements" ? parseFiles(b.files) : null;

  return withTransaction(db, async (tx) => {
    const renter = (await tx.query(
      `SELECT * FROM yd_renters WHERE id = $1 AND org_id = $2 FOR UPDATE`, [renterId, orgId])).rows[0];
    if (!renter) throw new YdError(404, "not_found");

    // No file, no answer to change: income is checked against a finished screening.
    if (!await latestCompleteScreening(tx, { orgId, renterId })) {
      throw new YdError(409, "screening_required", "finish the pre-screen before checking income");
    }

    const result = method === "plaid"
      ? await providers.plaid.verifyIncome({ renterId, publicToken, email: renter.email })
      : await providers.plaid.submitStatements({ renterId, files });
    const status = ALLOWED_STATUSES.has(result?.status) ? result.status : "failed";
    const monthly = status === "verified" ? result.monthly_income_cents : null;
    if (status === "verified" && !(Number.isInteger(monthly) && monthly >= 0)) {
      throw new Error("the income provider returned a verified result with no usable income");
    }

    const ins = await tx.query(
      `INSERT INTO yd_income_checks (org_id, renter_id, method, status, monthly_income_cents, sources, checked_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb, CASE WHEN $4 = 'verified' THEN now() ELSE NULL END)
       RETURNING id, method, status, monthly_income_cents, checked_at`,
      [orgId, renterId, method, status, monthly,
       JSON.stringify(method === "statements" ? { files } : (Array.isArray(result.sources) ? result.sources : []))]);
    const income = incomeView(ins.rows[0]);

    await recordEvent(tx, {
      orgId,
      name: status === "verified" ? "income.verified" : status === "review" ? "income.review_requested" : "income.failed",
      entityKind: "income_check", entityId: ins.rows[0].id,
      payload: { renter_id: renterId, method, status },
      actorKind: "renter", actorId: renterId, idempotencyKey: `income:${ins.rows[0].id}`
    });

    if (status !== "verified") {
      return {
        status, income,
        message: status === "review"
          ? "We received your statements. We will check your deposits and update your results."
          : "We could not verify your income. Please try again."
      };
    }
    const run = await runMatching(tx, { orgId, renter, now });
    return { status: "verified", income, answer: renterAnswer(run) };
  });
}
