// src/yesdoor/match/attribution.mjs — does Yesdoor earn a fee for this lease?
// Spec: docs/specs/yesdoor-mvp-build-spec.md §5b. Pure: no database, no clock.
//
//   feeEligible              no fee when the lease is signed more than
//                            registrationValidDays (90) after the registration,
//                            or when a known-prospect claim was upheld.
//   knownProspectClaimValid  may a building still file a known-prospect claim?
//                            (within knownProspectDays (3) of receiving the
//                            registration, with its own earlier visitor record)

import { YD_DEFAULTS } from "../config.mjs";
import { addDays, DAY_MS, toDate } from "../util.mjs";

/**
 * @param {object} p
 * @param {Date|string|null} p.registrationSentAt  yd_applications.registration_sent_at, the proof of referral
 * @param {Date|string|null} p.leaseSignedAt       when the lease was signed
 * @param {Date|string|null} [p.knownProspectAt]   the building's own visitor-record date from a claim
 *   that ops UPHELD (a yd_disputes row of kind attribution, decided for the building).
 *   Leave null when there is no claim, or the claim was rejected or is still open.
 *   Ops already compared the dates, so any value here means "upheld".
 * @returns {{ eligible: boolean, reason: "ok"|"no_registration"|"no_lease"|"known_prospect"|"expired",
 *             expiresAt: string|null, daysAfterRegistration: number|null }}
 *   An expired registration is eligible again only if the building re-registers
 *   the renter (a new registration_sent_at).
 */
export function feeEligible({ registrationSentAt, leaseSignedAt, knownProspectAt = null, defaults = YD_DEFAULTS } = {}) {
  const registered = toDate(registrationSentAt);
  const signed = toDate(leaseSignedAt);
  const expires = registered ? addDays(registered, defaults.registrationValidDays) : null;
  const result = (eligible, reason) => ({
    eligible,
    reason,
    expiresAt: expires ? expires.toISOString() : null,
    daysAfterRegistration: registered && signed
      ? Math.floor((signed.getTime() - registered.getTime()) / DAY_MS)
      : null
  });

  if (!registered) return result(false, "no_registration");
  if (toDate(knownProspectAt)) return result(false, "known_prospect");
  if (!signed) return result(false, "no_lease");
  if (signed > expires) return result(false, "expired");
  return result(true, "ok");
}

/**
 * Can a building still mark this registration a known prospect?
 * It must claim within knownProspectDays of receiving the registration and give
 * its own visitor-record date, earlier than the registration. A valid claim
 * opens a yd_disputes row (kind attribution); ops decides within disputeDays.
 */
export function knownProspectClaimValid({ registrationSentAt, claimedAt, evidenceAt, defaults = YD_DEFAULTS } = {}) {
  const registered = toDate(registrationSentAt);
  const claimed = toDate(claimedAt);
  const evidence = toDate(evidenceAt);
  if (!registered) return { valid: false, reason: "no_registration" };
  if (!claimed) return { valid: false, reason: "no_claim_date" };
  if (!evidence) return { valid: false, reason: "no_evidence" };
  if (claimed > addDays(registered, defaults.knownProspectDays)) return { valid: false, reason: "too_late" };
  if (evidence >= registered) return { valid: false, reason: "evidence_not_earlier" };
  return { valid: true, reason: "ok" };
}
