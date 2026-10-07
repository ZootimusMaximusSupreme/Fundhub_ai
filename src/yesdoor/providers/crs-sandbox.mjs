// src/yesdoor/providers/crs-sandbox.mjs — pretend credit and background check.
// Spec §7. Deterministic, no network, no clock: the same input always gives the
// same output, so tests and demos never drift.
//
//   screen({ firstName, lastName, email, address, dob })
//
// Known sample emails return their fixture file (src/yesdoor/fixtures/renters.mjs).
// A fixture flagged noMatchUntilDob, and any unknown email, returns `no_match`
// until a date of birth is given (the app then asks for it and retries). With a
// date of birth, the fixture returns its file, and an unknown email returns a
// generated mid-tier file (score 620 to 679, 0 to 2 collections, no evictions, no
// criminal flags) derived from a hash of the email and birth date.
//
// The return value is flat, shaped like a yd_screenings row plus `raw` (the
// yd_screening_raw payload). `raw` holds no date of birth or SSN.

import { createHash } from "node:crypto";
import { fixtureByEmail } from "../fixtures/renters.mjs";

export const PROVIDER = "crs_sandbox";
export const SANDBOX = true;

const EMPTY = Object.freeze({
  credit_score: null, collections_count: null, eviction_count: null,
  eviction_last_at: null, criminal_flags: null
});

const hashOf = (text) => createHash("sha256").update(text).digest();

const dobOk = (dob) => typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob.trim())
  && !Number.isNaN(new Date(`${dob.trim()}T00:00:00Z`).getTime());

/** The generated mid-tier file for an unknown renter who gave a date of birth. */
export function generatedFile(email, dob) {
  const h = hashOf(`${String(email).trim().toLowerCase()}|${dob.trim()}`);
  return {
    credit_score: 620 + (h[0] % 60),
    collections_count: h[1] % 3,
    eviction_count: 0,
    eviction_last_at: null,
    criminal_flags: []
  };
}

export async function screen({ firstName = null, lastName = null, email, address = null, dob = null } = {}) {
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("screen needs an email");

  const fixture = fixtureByEmail(cleanEmail);
  const haveDob = dobOk(dob);
  const ref = `crs-sandbox:${hashOf(`${cleanEmail}|${haveDob ? dob.trim() : ""}`).toString("hex").slice(0, 12)}`;

  let file = null;
  if (fixture) {
    file = fixture.noMatchUntilDob && !haveDob ? null : fixture.credit;
  } else if (haveDob) {
    file = generatedFile(cleanEmail, dob);
  }

  if (!file) {
    return {
      provider: PROVIDER, sandbox: true, status: "no_match", ...EMPTY, raw_ref: ref,
      raw: { sandbox: true, status: "no_match", needs: "date_of_birth", subject: { email: cleanEmail } }
    };
  }

  return {
    provider: PROVIDER,
    sandbox: true,
    status: "complete",
    credit_score: file.credit_score,
    collections_count: file.collections_count,
    eviction_count: file.eviction_count,
    eviction_last_at: file.eviction_last_at,
    criminal_flags: file.criminal_flags.map((f) => ({ ...f })),
    raw_ref: ref,
    raw: {
      sandbox: true,
      status: "complete",
      subject: { firstName, lastName, email: cleanEmail, address },
      summary: {
        score: file.credit_score,
        collections: file.collections_count,
        evictions: file.eviction_count,
        lastEvictionOn: file.eviction_last_at,
        criminalRecords: file.criminal_flags.length
      },
      note: fixture ? "Sample renter file." : "Generated sandbox file."
    }
  };
}

/**
 * A re-check under the recheck consent stored at sign-up (spec §6): it never asks
 * the renter for anything. A date of birth is never stored, so a re-check cannot
 * send one; a real bureau would be asked by the reference it already holds. The
 * sandbox has no bureau, so the file does not move: the prior finished screening
 * comes back as a fresh result with a new reference. (A test, or a later real
 * adapter, can return different numbers; the cron only reads the shape.)
 *
 *   rescreen({ email, prior })
 *   prior  the last finished yd_screenings row: { id, status, result_at, credit_score,
 *          collections_count, eviction_count, eviction_last_at, criminal_flags }
 */
export async function rescreen({ email, prior = null } = {}) {
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  if (!cleanEmail) throw new Error("rescreen needs an email");
  const stamp = `${cleanEmail}|${prior?.id ?? ""}|${prior?.result_at ? new Date(prior.result_at).toISOString() : ""}`;
  const ref = `crs-sandbox:recheck:${hashOf(stamp).toString("hex").slice(0, 12)}`;

  if (!prior || prior.status !== "complete") {
    return {
      provider: PROVIDER, sandbox: true, status: "no_match", ...EMPTY, raw_ref: ref,
      raw: { sandbox: true, status: "no_match", needs: "prior_screening", subject: { email: cleanEmail } }
    };
  }
  const flags = Array.isArray(prior.criminal_flags) ? prior.criminal_flags.map((f) => ({ ...f })) : [];
  return {
    provider: PROVIDER,
    sandbox: true,
    status: "complete",
    credit_score: prior.credit_score,
    collections_count: prior.collections_count,
    eviction_count: prior.eviction_count,
    eviction_last_at: prior.eviction_last_at ?? null,
    criminal_flags: flags,
    raw_ref: ref,
    raw: {
      sandbox: true,
      status: "complete",
      subject: { email: cleanEmail },
      summary: {
        score: prior.credit_score,
        collections: prior.collections_count,
        evictions: prior.eviction_count,
        lastEvictionOn: prior.eviction_last_at ?? null,
        criminalRecords: flags.length
      },
      note: "Sandbox re-check: the prior file, unchanged."
    }
  };
}
