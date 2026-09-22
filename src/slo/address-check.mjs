// Does the address the $297 buyer typed exist? (owner-set 2026-09-22: stop
// fake addresses.)
//
// Used by src/slo/pull.mjs before anything is written. Each address is looked
// up with the existing geocoder, verifyStreetAddress in
// src/climate/connectors.mjs (Google when a server key is set, else the free
// US Census geocoder). This file adds no outbound call of its own.
//
// A WARNING, NOT A WALL. No match → one warning on the street box:
//   { field: 'address' | 'prev_address', code: 'address_unverified', message }
// The buyer can fix the address, or press Pay again: the widget then sends
// address_confirmed:true and the address is taken as typed.
//
// NEVER BLOCKS ON OUR SIDE. A geocoder that is down, refuses, throws, or is
// slower than CAP_MS counts as "could not check" → no warning.
//
// MILITARY MAIL (state AA, AE, AP) is not looked up. No street geocoder knows
// PSC / Unit / CMR boxes, so a lookup would only ever warn.

import { verifyStreetAddress } from "../climate/connectors.mjs";

export const ADDRESS_UNVERIFIED = "address_unverified";
export const ADDRESS_UNVERIFIED_MESSAGE =
  "We couldn't find that address. Check the street and ZIP, or tap Pay again to use it as typed.";

/* Whole budget for the check, both addresses at once. The pull form must
   answer quickly; a slow geocoder is treated as down. */
export const CAP_MS = 5000;

const MILITARY = new Set(["AA", "AE", "AP"]);

/** One line the geocoder reads. The apartment is left off on purpose. */
export function addressQuery(a) {
  return [a?.addressLine1, a?.city, [a?.state, a?.postalCode].filter(Boolean).join(" ")]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function withCap(promise, ms) {
  let timer;
  const cap = new Promise((resolve) => {
    timer = setTimeout(() => resolve("unavailable"), ms);
  });
  return Promise.race([promise, cap]).finally(() => clearTimeout(timer));
}

/**
 * checkSloAddresses — [] when every address was found (or could not be
 * checked), else one warning per address that was not found.
 *
 * @param {Array<{residency?:string, addressLine1:string, city:string, state:string, postalCode:string}>} addresses
 *        pii_identity-shaped addresses; residency 'previous' names prev_address.
 */
export async function checkSloAddresses(addresses = [], { verify = verifyStreetAddress, capMs = CAP_MS } = {}) {
  const list = Array.isArray(addresses) ? addresses.filter(Boolean) : [];
  const answers = await Promise.all(list.map(async (a) => {
    if (MILITARY.has(String(a.state || "").toUpperCase())) return "skipped";
    try {
      return await withCap(Promise.resolve(verify(addressQuery(a))), capMs);
    } catch {
      return "unavailable";
    }
  }));
  const warnings = [];
  answers.forEach((answer, i) => {
    if (answer !== "no_match") return;
    const field = list[i].residency === "previous" ? "prev_address" : "address";
    warnings.push({ field, code: ADDRESS_UNVERIFIED, message: ADDRESS_UNVERIFIED_MESSAGE });
  });
  return warnings;
}
