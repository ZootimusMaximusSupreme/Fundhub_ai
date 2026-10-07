// building-connectors/manual.mjs — the building types everything in the portal.
// Listings come from the portal's own yd_listings rows, so there is nothing to
// fetch: listListings hands back the rows it is given, cleaned.

import { portalLeaseStatus, registrationEmail } from "./common.mjs";

export const PROVIDER = "manual";
export const SANDBOX = true;

export async function listListings({ listings = [] } = {}) {
  const errors = [];
  const out = [];
  listings.forEach((l, i) => {
    if (!l?.unit_label || !Number.isInteger(l.rent_cents) || l.rent_cents <= 0) {
      errors.push({ row: i + 1, message: "a listing needs a unit label and a rent" });
      return;
    }
    out.push({ ...l, source: "manual" });
  });
  return { listings: out, errors };
}

export async function pushGuestCard(ctx = {}) {
  return registrationEmail(ctx);
}

export async function getLeaseStatus() {
  return portalLeaseStatus();
}
