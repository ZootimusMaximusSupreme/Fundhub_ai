// The public pre-screen (spec §8: POST public/prescreen).
//
//   consent  ->  screening (sandbox CRS)  ->  matches  ->  the renter's answer
//
// All in ONE transaction: consent, screening, matches, the renter's new stage and
// profile either all land or none do.
//
// WHO MAY RUN IT. The first pre-screen for an email, and a retry after `needs_dob`.
// Once the renter has a FINISHED screening, or has signed in with an emailed link,
// the public door will not run it again and will not show anything: it answers
// `signin_required` and emails a sign-in link instead. Otherwise anyone who typed
// someone else's address could read that person's credit reasons and take their
// renterToken. (The real protection later is the bureau's own identity match.)
//
// THE renterToken. A complete pre-screen returns a session for the renter's own
// account, minted by the Yesdoor session module (src/yesdoor/auth/session.mjs). It
// is the same token GET me, POST me/income and POST public/book accept (as
// Authorization: Bearer). It is returned once, in the response body, and only
// when this call finished a screening; a no_match answer returns none.
//
// WHAT THE RENTER SEES. Per-building answers WITH reasons (see renterResultView).
// A building user never gets this shape.

import { YD_PRESCREEN } from "../config.mjs";
import { toCents } from "../../commissions/money.mjs";
import { YdError } from "../http.mjs";
import { createAccountSession } from "../auth/session.mjs";
import { requestMagicLink } from "../auth/magic-link.mjs";
import { toDate } from "../util.mjs";
import { recordEvent } from "./events.mjs";
import { cleanText, findOrCreateLead, requireEmail } from "./leads.mjs";
import { latestCompleteScreening, renterAnswer, runMatching } from "./matching.mjs";
import { captureConsents, DEFAULT_PROVIDERS, runScreening } from "./screenings.mjs";
import { withTransaction } from "./tx.mjs";

/* ------------------------------------------------------------ validation */

/** { text, version, checked } -> clean values, or a 400. Nothing is screened without this. */
export function parseConsent(consent) {
  const c = consent && typeof consent === "object" ? consent : {};
  if (c.checked !== true) {
    throw new YdError(400, "consent_required", "the renter must agree to the screening and the repeat checks");
  }
  const text = cleanText(c.text, YD_PRESCREEN.consentTextMax + 1);
  const version = cleanText(c.version, YD_PRESCREEN.consentVersionMax + 1);
  if (!text || text.length > YD_PRESCREEN.consentTextMax) {
    throw new YdError(400, "consent_required", "the consent text that was shown is required");
  }
  if (!version || version.length > YD_PRESCREEN.consentVersionMax) {
    throw new YdError(400, "consent_required", "the consent version that was shown is required");
  }
  return { text, version, method: c.method === "typed" ? "typed" : "checkbox" };
}

/** YYYY-MM-DD, a real date, in the past, at least the minimum age, or a 400. Null when absent. */
export function parseDob(dob, now = new Date()) {
  if (dob === undefined || dob === null || dob === "") return null;
  const bad = () => new YdError(400, "invalid_dob", "date of birth must be a real date, YYYY-MM-DD");
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) throw bad();
  const text = dob.trim();
  const d = toDate(`${text}T00:00:00Z`);
  if (!d || d.toISOString().slice(0, 10) !== text) throw bad();
  if (d.getUTCFullYear() < 1900 || d > now) throw bad();
  const min = new Date(Date.UTC(now.getUTCFullYear() - YD_PRESCREEN.minRenterAgeYears, now.getUTCMonth(), now.getUTCDate()));
  if (d > min) throw new YdError(400, "invalid_dob", `renters must be at least ${YD_PRESCREEN.minRenterAgeYears} years old`);
  return text;
}

const STATE_RE = /^[A-Za-z]{2}$/;

/** An address object, or a string (taken as the street line), clipped. Null when empty. */
export function parseAddress(address) {
  if (typeof address === "string") {
    const line1 = cleanText(address, 200);
    return line1 ? { line1 } : null;
  }
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const out = {};
  const line1 = cleanText(address.line1 ?? address.street, 200);
  const line2 = cleanText(address.line2, 100);
  const city = cleanText(address.city, 100);
  const zip = cleanText(address.zip, 10);
  const state = typeof address.state === "string" && STATE_RE.test(address.state.trim()) ? address.state.trim().toUpperCase() : null;
  if (line1) out.line1 = line1;
  if (line2) out.line2 = line2;
  if (city) out.city = city;
  if (state) out.state = state;
  if (zip) out.zip = zip;
  return Object.keys(out).length ? out : null;
}

/** What the renter searched for: city (required, from the search or the address),
 *  state, bedrooms, and a maximum rent in WHOLE DOLLARS like GET public/listings. */
export function parseSearch(search, address) {
  const s = search && typeof search === "object" ? search : {};
  const city = cleanText(s.city, 100) || address?.city || null;
  if (!city) throw new YdError(400, "city_required", "tell us which city you are searching in");
  const stateIn = typeof s.state === "string" && STATE_RE.test(s.state.trim()) ? s.state.trim().toUpperCase() : null;

  let beds = null;
  if (s.beds !== undefined && s.beds !== null && s.beds !== "") {
    const n = Number(s.beds);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new YdError(400, "invalid_parameter", "beds must be a whole number from 0 to 10");
    beds = n;
  }
  let maxRentCents = null;
  if (s.maxRent !== undefined && s.maxRent !== null && s.maxRent !== "") {
    const dollars = Number(s.maxRent);
    if (!Number.isFinite(dollars) || dollars <= 0) throw new YdError(400, "invalid_parameter", "maxRent must be a positive number of dollars");
    maxRentCents = toCents(dollars);
  }
  return { city, state: stateIn || address?.state || null, beds, maxRentCents };
}

/* ----------------------------------------------------------------- flow */

const MESSAGES = Object.freeze({
  needsDob: "We could not find your file with what we have. Add your date of birth and try again.",
  noMatch: "We could not find a credit file for you, even with your date of birth.",
  signIn: "You already started with this email. Check your inbox for a sign-in link to see your results.",
  failed: "We could not finish your check just now. Please try again in a few minutes."
});

async function renterAccount(db, { orgId, renterId, email }) {
  return (await db.query(
    `SELECT id, kind, status, last_login_at FROM yd_accounts
      WHERE org_id = $1 AND (renter_id = $2 OR email = $3)
      ORDER BY (renter_id = $2) DESC LIMIT 1`, [orgId, renterId, email])).rows[0] || null;
}

/** Mint the renter's account (once) and a session for it. null when this email is
 *  already some other account's, or the account is suspended. */
async function issueRenterToken(db, { orgId, renter, ip, userAgent }) {
  await db.query(
    `INSERT INTO yd_accounts (org_id, kind, email, renter_id) VALUES ($1,'renter',$2,$3) ON CONFLICT DO NOTHING`,
    [orgId, renter.email, renter.id]);
  const acct = (await db.query(
    `SELECT id, status FROM yd_accounts WHERE org_id = $1 AND renter_id = $2`, [orgId, renter.id])).rows[0];
  if (!acct || acct.status !== "active") return null;
  const s = await createAccountSession(db, { accountId: acct.id, orgId, ip, userAgent });
  return { token: s.token, expiresAt: s.expiresAt };
}

/** The HTTP answer for a pre-screen outcome: { code, body }. Kept here, next to the
 *  outcomes it maps, so it is tested without a request. */
export function prescreenResponse(out) {
  if (out.status === "complete") {
    return {
      code: 200,
      body: { ok: true, status: "complete", ...out.answer, renterToken: out.renterToken, renterTokenExpiresAt: out.renterTokenExpiresAt }
    };
  }
  if (out.status === "failed") {
    return { code: 503, body: { ok: false, error: "screening_unavailable", message: out.message } };
  }
  return {
    code: 200,
    body: { ok: true, status: out.status, ...(out.needsDob !== undefined ? { needsDob: out.needsDob } : {}), message: out.message }
  };
}

/**
 * Run the pre-screen.
 *
 * @param {object} p
 * @param {string} p.orgId
 * @param {object} p.body { email, firstName?, lastName?, address, search?, consent, dob?, source? }
 * @returns {Promise<
 *   | { status: "complete", answer: object, renterToken: string|null, renterTokenExpiresAt: string|null }
 *   | { status: "needs_dob" | "no_match" | "signin_required" | "failed", message: string }>}
 */
export async function runPrescreen(db, { orgId, body, ip = null, userAgent = null, now = new Date(), providers = DEFAULT_PROVIDERS }) {
  const b = body && typeof body === "object" ? body : {};
  // Everything is validated before anything is written.
  const email = requireEmail(b.email);
  const consent = parseConsent(b.consent);
  const address = parseAddress(b.address);
  const dob = parseDob(b.dob, now);
  const search = parseSearch(b.search, address);

  const out = await withTransaction(db, async (tx) => {
    const { renter: found } = await findOrCreateLead(tx, {
      orgId, email, firstName: b.firstName, lastName: b.lastName, source: b.source
    });
    // One pre-screen at a time per renter.
    const renter = (await tx.query(
      `SELECT * FROM yd_renters WHERE id = $1 AND org_id = $2 FOR UPDATE`, [found.id, orgId])).rows[0];

    const acct = await renterAccount(tx, { orgId, renterId: renter.id, email });
    const signedIn = acct && (acct.kind !== "renter" || acct.last_login_at);
    if (signedIn || await latestCompleteScreening(tx, { orgId, renterId: renter.id })) {
      return { status: "signin_required", message: MESSAGES.signIn };
    }

    if (address) {
      await tx.query(`UPDATE yd_renters SET current_address = $3::jsonb WHERE id = $1 AND org_id = $2`,
        [renter.id, orgId, JSON.stringify(address)]);
      renter.current_address = address;
    }

    const consents = await captureConsents(tx, {
      orgId, renterId: renter.id, text: consent.text, version: consent.version, method: consent.method, ip, userAgent
    });
    const screened = await runScreening(tx, {
      orgId, renter, consentId: consents.screeningConsentId, kind: "initial", dob, providers
    });

    if (screened.status === "failed") return { status: "failed", message: MESSAGES.failed };
    if (screened.status === "no_match") {
      return dob
        ? { status: "no_match", needsDob: false, message: MESSAGES.noMatch }
        : { status: "needs_dob", needsDob: true, message: MESSAGES.needsDob };
    }

    await recordEvent(tx, {
      orgId, name: "prescreen.completed", entityKind: "renter", entityId: renter.id,
      payload: { screening_id: screened.id, search }, actorKind: "renter", actorId: renter.id,
      idempotencyKey: `prescreen:${screened.id}`
    });
    const fresh = (await tx.query(`SELECT * FROM yd_renters WHERE id = $1 AND org_id = $2`, [renter.id, orgId])).rows[0];
    const run = await runMatching(tx, { orgId, renter: fresh, area: search, now });
    const token = await issueRenterToken(tx, { orgId, renter: run.renter, ip, userAgent });
    return {
      status: "complete",
      answer: renterAnswer(run),
      renterToken: token ? token.token : null,
      renterTokenExpiresAt: token ? token.expiresAt.toISOString() : null
    };
  });

  if (out.status === "signin_required") {
    // After the transaction, so a rate-limited or failed link request cannot undo anything.
    // The reply is the same either way: the caller learns nothing about the address.
    try {
      await requestMagicLink(db, { email, orgId, ip, userAgent });
    } catch (err) {
      console.error(`yesdoor/public/prescreen: sign-in link not queued (${err && err.code ? err.code : "error"})`);
    }
  }
  return out;
}
