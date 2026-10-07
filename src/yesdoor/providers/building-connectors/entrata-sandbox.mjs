// building-connectors/entrata-sandbox.mjs — pretend Entrata connection.
// Fixture responses only. No network, no credentials. A real Entrata adapter
// replaces this later, in src/messaging/providers/ (CLAUDE.md §12).
//
// The property ids and units below are MADE UP samples.

import { createHash } from "node:crypto";

export const PROVIDER = "entrata_sandbox";
export const SANDBOX = true;

export const FIXTURE_PROPERTIES = Object.freeze({
  "sandbox-prop-1": Object.freeze([
    Object.freeze({ external_id: "sandbox-unit-101", unit_label: "101", beds: 1, baths: 1, sqft: 710, rent_cents: 152500, available_on: "2026-11-01", specials: "Sample special: one month free on a 13-month lease", source: "api" }),
    Object.freeze({ external_id: "sandbox-unit-214", unit_label: "214", beds: 2, baths: 2, sqft: 1040, rent_cents: 189500, available_on: "2026-11-15", specials: null, source: "api" }),
    Object.freeze({ external_id: "sandbox-unit-305", unit_label: "305", beds: 0, baths: 1, sqft: 520, rent_cents: 129900, available_on: "2026-10-20", specials: null, source: "api" })
  ]),
  "sandbox-prop-2": Object.freeze([
    Object.freeze({ external_id: "sandbox-unit-B12", unit_label: "B12", beds: 3, baths: 2, sqft: 1380, rent_cents: 239500, available_on: "2026-12-01", specials: null, source: "api" })
  ])
});

export async function listListings({ propertyId } = {}) {
  const rows = Object.hasOwn(FIXTURE_PROPERTIES, propertyId) ? FIXTURE_PROPERTIES[propertyId] : null;
  if (!rows) return { listings: [], errors: [{ message: `The sandbox has no property "${propertyId}".` }] };
  return { listings: rows.map((r) => ({ ...r })), errors: [] };
}

/** Deterministic: the same renter at the same building always gets the same guest card id. */
export async function pushGuestCard({ renter, building, registrationSentAt } = {}) {
  if (!renter?.email || !building?.id) return { ok: false, reason: "missing_renter_or_building" };
  if (!registrationSentAt) return { ok: false, reason: "no_registration_time" };
  const id = createHash("sha256").update(`${renter.email.toLowerCase()}|${building.id}`).digest("hex").slice(0, 12);
  return {
    ok: true,
    mode: "api",
    registeredAt: new Date(registrationSentAt).toISOString(),
    guestCardId: `sandbox-gc-${id}`
  };
}

/**
 * Fixture lease statuses, chosen by the reference prefix so tests and demos can
 * walk every state:
 *   sandbox-denied-*       denied (with a reason)
 *   sandbox-lease-*        lease_signed
 *   sandbox-moved-in-*     moved_in
 *   anything else          applied
 */
export async function getLeaseStatus({ externalRef } = {}) {
  const ref = String(externalRef ?? "");
  if (ref.startsWith("sandbox-denied-")) return { known: true, status: "denied", reason: "Sandbox denial: income not verifiable." };
  if (ref.startsWith("sandbox-lease-")) return { known: true, status: "lease_signed" };
  if (ref.startsWith("sandbox-moved-in-")) return { known: true, status: "moved_in" };
  return { known: true, status: "applied" };
}
