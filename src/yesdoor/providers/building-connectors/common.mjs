// src/yesdoor/providers/building-connectors/common.mjs — pieces every connector shares.
// Pure: no network, no database.
//
// Connector interface (spec §7), every method async so a real adapter can drop in:
//   listListings(ctx)   -> { listings, errors }
//   pushGuestCard(ctx)  -> { ok, ... }      registers the renter with the building
//   getLeaseStatus(ctx) -> { known, ... }
//
// Registration email = pushGuestCard for manual | csv | feed. It never carries
// credit fields: the building gets a name, contact, unit and tour time, with
// Yesdoor as the source and the timestamp that proves who sent the renter first.

export const SOURCE_NAME = "Yesdoor";

/** "1,550" | "$1,550.50" | "1550" -> integer cents, or null when it is not a clean dollar amount. */
export function dollarsToCents(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  }
  const text = String(value ?? "").replace(/[$,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

/** Real calendar date check for y-m-d parts. */
export function isoFromParts(year, month, day) {
  const y = Number(year); const mo = Number(month); const d = Number(day);
  if (![y, mo, d].every(Number.isInteger) || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * The registration email as a yd_outbox row spec. B4 inserts it with
 * related_kind 'application'. Fields are limited to what a building needs to
 * log the guest card.
 */
export function registrationEmail({ renter, building, listing = null, tourStartsAt = null, registrationSentAt }) {
  if (!building?.leasing_email) return { ok: false, reason: "no_leasing_email" };
  if (!registrationSentAt) return { ok: false, reason: "no_registration_time" };
  const registeredAt = new Date(registrationSentAt).toISOString();
  return {
    ok: true,
    mode: "email",
    registeredAt,
    outbox: {
      channel: "email",
      to_address: building.leasing_email,
      template_key: "building_registration",
      context: {
        source: SOURCE_NAME,
        registered_at: registeredAt,
        renter: {
          first_name: renter?.first_name ?? null,
          last_name: renter?.last_name ?? null,
          email: renter?.email ?? null,
          phone: renter?.phone ?? null
        },
        building: { id: building.id ?? null, name: building.name ?? null },
        unit: listing
          ? { unit_label: listing.unit_label ?? null, rent_cents: listing.rent_cents ?? null }
          : null,
        tour_starts_at: tourStartsAt ? new Date(tourStartsAt).toISOString() : null
      }
    }
  };
}

/** Lease status for connectors with no status feed: the building reports it in the portal. */
export function portalLeaseStatus() {
  return { known: false, reason: "This building reports lease status in the Yesdoor portal." };
}
