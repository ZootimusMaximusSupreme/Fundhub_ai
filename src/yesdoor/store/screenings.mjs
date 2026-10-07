// Consent and screening rows (spec §2). Kept forever, never deleted, never edited.
//
//   captureConsents   the sign-up screen captures `screening` and `recheck` together.
//                     The wording covers repeat checks, so Yesdoor never has to ask
//                     the renter again (owner-set). Every capture is its own pair of
//                     rows: a retry is a fresh, dated, affirmative act.
//   runScreening      one provider call and the rows it makes: a yd_screenings row
//                     written already finished (the database freezes a finished row,
//                     so there is never an update), plus the raw payload.
//
// A screening cannot exist without a consent row for the same renter: the
// consent_id foreign key is NOT NULL and composite on (org, renter), so this is
// held by the database, not by this file remembering.
//
// THE DATE OF BIRTH IS NEVER STORED. It goes to the provider and nowhere else.
// There is no column for it, the raw payload the provider returns holds none, and
// a re-check does not need one (see crs-sandbox rescreen).

import { normalizeIp } from "../../auth/session.mjs";
import * as crsSandbox from "../providers/crs-sandbox.mjs";
import { recordEvent } from "../events.mjs";

export const DEFAULT_PROVIDERS = Object.freeze({ crs: crsSandbox });

const truncate = (s, n) => (s == null ? null : String(s).slice(0, n));

/** Insert the screening + recheck consent rows. Returns both ids. */
export async function captureConsents(db, { orgId, renterId, text, version, method = "checkbox", ip = null, userAgent = null }) {
  const ids = {};
  for (const kind of ["screening", "recheck"]) {
    const r = await db.query(
      `INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [orgId, renterId, kind, text, version, method, normalizeIp(ip), truncate(userAgent, 512)]);
    ids[kind] = r.rows[0].id;
  }
  await recordEvent(db, {
    orgId, name: "consent.captured", entityKind: "renter", entityId: renterId,
    payload: { kinds: ["screening", "recheck"], version, method, screening_consent_id: ids.screening, recheck_consent_id: ids.recheck },
    actorKind: "renter", actorId: renterId
  });
  return { screeningConsentId: ids.screening, recheckConsentId: ids.recheck };
}

/** The newest recheck consent for a renter, or null (no consent: no re-check). */
export async function latestRecheckConsent(db, { orgId, renterId }) {
  const r = await db.query(
    `SELECT id, consent_version, captured_at FROM yd_consents
      WHERE org_id = $1 AND renter_id = $2 AND kind = 'recheck'
      ORDER BY captured_at DESC, id DESC LIMIT 1`, [orgId, renterId]);
  return r.rows[0] || null;
}

const validScore = (n) => Number.isInteger(n) && n >= 300 && n <= 850;

/** A provider answer the database will accept, or a failure. */
function usable(result) {
  if (!result || typeof result !== "object") return false;
  if (result.status === "no_match") return true;
  if (result.status !== "complete") return false;
  return validScore(result.credit_score)
    && Number.isInteger(result.eviction_count) && result.eviction_count >= 0
    && Number.isInteger(result.collections_count) && result.collections_count >= 0
    && Array.isArray(result.criminal_flags);
}

/**
 * Run one screening and store it.
 *
 * @param {object} p
 * @param {object} p.renter    the yd_renters row (name, email, current_address are read)
 * @param {string} p.consentId the consent row this screening runs under
 * @param {"initial"|"recheck"} p.kind
 * @param {string|null} p.dob  YYYY-MM-DD, initial only, passed to the provider and never stored
 * @param {object|null} p.prior the last finished screening (a recheck needs it)
 * @returns {Promise<{ id: string, status: "complete"|"no_match"|"failed", screening: object|null }>}
 *   `screening` is the finished row in matcher shape (null unless complete).
 */
export async function runScreening(db, {
  orgId, renter, consentId, kind = "initial", dob = null, prior = null, providers = DEFAULT_PROVIDERS
}) {
  const crs = providers.crs;
  let result;
  let failure = null;
  try {
    result = kind === "recheck" && typeof crs.rescreen === "function"
      ? await crs.rescreen({ email: renter.email, prior })
      : await crs.screen({
        firstName: renter.first_name, lastName: renter.last_name, email: renter.email,
        address: renter.current_address ?? null, dob: kind === "recheck" ? null : dob
      });
    if (!usable(result)) failure = "the screening provider returned a result that cannot be stored";
  } catch (e) {
    failure = String(e?.message || e).slice(0, 200);
  }

  const status = failure ? "failed" : result.status;
  const row = failure ? null : result;
  const provider = row && (row.provider === "crs" || row.provider === "crs_sandbox") ? row.provider : "crs_sandbox";

  const ins = await db.query(
    `INSERT INTO yd_screenings
       (org_id, renter_id, consent_id, kind, provider, status, credit_score, collections_count,
        eviction_count, eviction_last_at, criminal_flags, raw_ref, result_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12, now())
     RETURNING id, to_char(eviction_last_at, 'YYYY-MM-DD') AS eviction_last_at, result_at`,
    [orgId, renter.id, consentId, kind, provider, status,
     status === "complete" ? row.credit_score : null,
     status === "complete" ? row.collections_count : null,
     status === "complete" ? row.eviction_count : null,
     status === "complete" ? (row.eviction_last_at ?? null) : null,
     JSON.stringify(status === "complete" ? row.criminal_flags : []),
     row ? truncate(row.raw_ref, 200) : null]);
  const id = ins.rows[0].id;

  if (row && row.raw && typeof row.raw === "object") {
    await db.query(
      `INSERT INTO yd_screening_raw (org_id, screening_id, payload) VALUES ($1,$2,$3::jsonb)`,
      [orgId, id, JSON.stringify(row.raw)]);
  } else if (failure) {
    await db.query(
      `INSERT INTO yd_screening_raw (org_id, screening_id, payload) VALUES ($1,$2,$3::jsonb)`,
      [orgId, id, JSON.stringify({ sandbox: provider === "crs_sandbox", status: "failed", error: failure })]);
  }

  await recordEvent(db, {
    orgId, name: `screening.${status}`, entityKind: "screening", entityId: id,
    payload: { renter_id: renter.id, kind, provider, status, ...(failure ? { error: failure } : {}) },
    actorKind: kind === "recheck" ? "system" : "renter", actorId: kind === "recheck" ? null : renter.id,
    idempotencyKey: `screening:${id}:${status}`
  });

  return {
    id, status,
    screening: status === "complete"
      ? {
        id, consent_id: consentId, kind, status, credit_score: row.credit_score,
        collections_count: row.collections_count, eviction_count: row.eviction_count,
        eviction_last_at: ins.rows[0].eviction_last_at, criminal_flags: row.criminal_flags,
        result_at: ins.rows[0].result_at
      }
      : null
  };
}
