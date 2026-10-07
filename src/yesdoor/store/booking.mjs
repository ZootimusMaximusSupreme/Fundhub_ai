// Booking a tour, and changing one (spec §3, §5b, §8: POST public/book, POST me/tour).
//
// Booking is ONE transaction:
//   1. the placement is born at `booked` (the open-application cap of 3 is checked
//      here for a clear answer and again by the database trigger, race-safe);
//   2. the tour is written;
//   3. the building is registered through its connector (pushGuestCard): one
//      yd_outbox row, timestamped by the database clock, and the placement moves
//      to `registered` with registration_sent_at and registration_outbox_id set
//      together. That timestamp is the proof of who sent the renter first, so a
//      booking that cannot register (no leasing email) does not happen at all.
//
// The renter, never the browser, decides nothing here: the renter is read off a
// session token, the building must be signed (or a flagged sample), and the
// renter must already have a match at it that is not "no".
//
// NOTHING TRANSMITS: registration and confirmations are queued yd_outbox rows.

import { YD_BOOKING, YD_DEFAULTS } from "../config.mjs";
import { YdError } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { queueOutbox, recordEvent, setActor } from "../events.mjs";
import { getConnector } from "../providers/building-connectors/index.mjs";
import { registrationEmail } from "../providers/building-connectors/common.mjs";
import { OPEN_STAGES } from "../stages.mjs";
import { hoursSummary, tourFits } from "../tour-hours.mjs";
import { addDays } from "../util.mjs";
import { timestampOf } from "../validate.mjs";

const OPEN_LIST = OPEN_STAGES.map((s) => `'${s}'`).join(", ");

const timeZoneFor = (state) => YD_BOOKING.stateTimeZones[state] || YD_BOOKING.defaultTimeZone;

/** The tour time must be in the window and, if the building gave hours, inside them. */
export function checkTourTime({ startsAt, building, now = new Date() }) {
  const start = startsAt instanceof Date ? startsAt : timestampOf(startsAt, "The tour time");
  const earliest = new Date(now.getTime() + YD_BOOKING.minLeadMinutes * 60_000);
  if (start < earliest) {
    throw new YdError(400, "tour_too_soon", `Pick a tour time at least ${YD_BOOKING.minLeadMinutes} minutes from now.`);
  }
  if (start > addDays(now, YD_BOOKING.maxDaysAhead)) {
    throw new YdError(400, "tour_too_far", `Pick a tour time within the next ${YD_BOOKING.maxDaysAhead} days.`);
  }
  const fit = tourFits({
    startsAt: start, minutes: YD_BOOKING.tourMinutes, hours: building.tour_hours, timeZone: timeZoneFor(building.state)
  });
  if (!fit.ok) {
    const when = hoursSummary(building.tour_hours);
    throw new YdError(400, "outside_tour_hours",
      fit.reason === "bad_hours"
        ? "This building's tour hours are not set up right yet. Please choose another building."
        : `That time is outside this building's tour hours${when ? ` (${when}, local time)` : ""}.`);
  }
  return start;
}

const REGISTRATION_REFUSALS = {
  no_leasing_email: "This building has no leasing email on file, so we cannot register you with it yet.",
  no_registration_time: "We could not time-stamp your registration. Please try again.",
  missing_renter_or_building: "We could not register you with this building."
};

/**
 * POST public/book. `renter` is { renterId, accountId } from the session.
 * Returns { applicationId, tourId, startsAt, endsAt, buildingName, address,
 *           registrationQueued, registrationAt, openApplications }.
 */
export async function bookTour(db, { orgId, renterId, accountId, buildingId, listingId, startsAt, now = new Date() }) {
  const actor = { kind: "renter", id: accountId };
  try {
    return await withTransaction(db, async (tx) => {
      await setActor(tx, actor);

      // The renter row is locked first: the cap trigger takes the same lock, so two
      // bookings at once cannot both slip under the cap.
      const renter = (await tx.query(
        `SELECT id, email, first_name, last_name, phone, stage, source_kind, source_broker_id
           FROM yd_renters WHERE id = $1 AND org_id = $2 FOR UPDATE`, [renterId, orgId])).rows[0];
      if (!renter) throw new YdError(401, "unauthorized", "Please start from the first step so we know who is booking.");

      const b = (await tx.query(
        `SELECT id, name, address, city, state, zip, leasing_email, connection, tour_hours, status, is_sample,
                public.yd_building_is_matchable(id) AS matchable
           FROM yd_buildings WHERE id = $1 AND org_id = $2`, [buildingId, orgId])).rows[0];
      if (!b) throw new YdError(404, "not_found", "We could not find that apartment.");
      if (!b.matchable || ["paused", "churned"].includes(b.status)) {
        throw new YdError(409, "building_not_open", "This building is not taking new renters right now. Pick another one.");
      }
      const l = (await tx.query(
        `SELECT id, unit_label, rent_cents FROM yd_listings
          WHERE id = $1 AND building_id = $2 AND org_id = $3 AND active`, [listingId, buildingId, orgId])).rows[0];
      if (!l) throw new YdError(404, "not_found", "We could not find that apartment.");

      // Booked only where the pre-screen says they fit (approved or likely), never "no".
      const m = (await tx.query(
        `SELECT id, result FROM yd_matches
          WHERE renter_id = $1 AND building_id = $2 AND org_id = $3
          ORDER BY (listing_id IS NOT DISTINCT FROM $4::uuid) DESC, computed_at DESC, id DESC LIMIT 1`,
        [renterId, buildingId, orgId, listingId])).rows[0];
      if (!m) {
        throw new YdError(409, "no_match_on_file", "Please run the quick pre-screen first, so we can check this building's rules for you.");
      }
      if (m.result === "no") {
        throw new YdError(409, "not_a_match", "This building is not a match for you. Pick one of the approved or likely buildings.");
      }

      const start = checkTourTime({ startsAt, building: b, now });

      const prior = (await tx.query(
        `SELECT stage, denied_at FROM yd_applications
          WHERE renter_id = $1 AND building_id = $2 AND org_id = $3
          ORDER BY created_at DESC`, [renterId, buildingId, orgId])).rows;
      if (prior.some((p) => OPEN_STAGES.includes(p.stage))) {
        throw new YdError(409, "already_booked_here", "You already have a tour booked at this building.");
      }
      const cutoff = addDays(now, -YD_DEFAULTS.mismatchWindowDays);
      if (prior.some((p) => p.stage === "denied" && p.denied_at && new Date(p.denied_at) > cutoff)) {
        throw new YdError(409, "denied_here", "This building recently said no to your application. Pick another one.");
      }
      const open = Number((await tx.query(
        `SELECT count(*)::int AS n FROM yd_applications
          WHERE renter_id = $1 AND org_id = $2 AND stage IN (${OPEN_LIST})`, [renterId, orgId])).rows[0].n);
      if (open >= YD_DEFAULTS.maxOpenApplications) {
        throw new YdError(409, "open_application_cap",
          `You already have ${YD_DEFAULTS.maxOpenApplications} open applications. Cancel or finish one before booking another.`);
      }

      // 1. The placement, at booked. The broker who first-touched the renter rides along.
      const brokerId = renter.source_kind === "broker" ? renter.source_broker_id : null;
      const app = (await tx.query(
        `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id, broker_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [orgId, renterId, buildingId, listingId, m.id, brokerId])).rows[0];

      // 2. Register the building with the connector. The database clock is the proof.
      const registrationSentAt = (await tx.query(`SELECT now() AS t`)).rows[0].t;
      const ctx = {
        renter: { first_name: renter.first_name, last_name: renter.last_name, email: renter.email, phone: renter.phone },
        building: { id: b.id, name: b.name, leasing_email: b.leasing_email },
        listing: { unit_label: l.unit_label, rent_cents: Number(l.rent_cents) },
        tourStartsAt: start,
        registrationSentAt
      };
      const pushed = await getConnector(b.connection).pushGuestCard(ctx);
      if (!pushed.ok) {
        throw new YdError(409, "registration_failed",
          REGISTRATION_REFUSALS[pushed.reason] || "We could not register you with this building. Please try again later.");
      }
      // Email-style connectors hand back the message; API-style ones return a guest card
      // id, and we still keep the timestamped email as the paper trail.
      const message = pushed.mode === "email" ? pushed.outbox : registrationEmail(ctx).outbox;
      if (!message) throw new YdError(409, "registration_failed", "We could not register you with this building.");
      const context = pushed.guestCardId ? { ...message.context, guest_card_id: pushed.guestCardId } : message.context;
      const outboxId = await queueOutbox(tx, {
        orgId, channel: message.channel, to: message.to_address, templateKey: message.template_key,
        context, relatedKind: "application", relatedId: app.id
      });
      await tx.query(
        `UPDATE yd_applications
            SET stage = 'registered', registration_sent_at = $3, registration_outbox_id = $4
          WHERE id = $1 AND org_id = $2`, [app.id, orgId, registrationSentAt, outboxId]);

      // 3. The tour.
      const endsAt = new Date(start.getTime() + YD_BOOKING.tourMinutes * 60_000);
      const tour = (await tx.query(
        `INSERT INTO yd_tours (org_id, application_id, starts_at, ends_at, status)
         VALUES ($1,$2,$3,$4,'booked') RETURNING id`, [orgId, app.id, start, endsAt])).rows[0];

      await tx.query(
        `UPDATE yd_renters SET stage = 'booked' WHERE id = $1 AND org_id = $2 AND stage IN ('lead', 'screened', 'matched')`,
        [renterId, orgId]);
      await recordEvent(tx, {
        orgId, name: "tour.booked", entityKind: "tour", entityId: tour.id,
        payload: { application_id: app.id, building_id: buildingId, listing_id: listingId, starts_at: start.toISOString(), match_result: m.result },
        actor
      });
      if (renter.email) {
        await queueOutbox(tx, {
          orgId, channel: "email", to: renter.email, templateKey: "yd-tour-booked",
          context: {
            building: { name: b.name, address: [b.address, b.city, b.state].filter(Boolean).join(", ") },
            unit: l.unit_label, tour_starts_at: start.toISOString(), tour_ends_at: endsAt.toISOString()
          },
          relatedKind: "tour", relatedId: tour.id
        });
      }

      return {
        applicationId: app.id, tourId: tour.id,
        startsAt: start.toISOString(), endsAt: endsAt.toISOString(),
        buildingName: b.name, address: [b.address, b.city, b.state].filter(Boolean).join(", "),
        registrationQueued: true, registrationAt: new Date(registrationSentAt).toISOString(),
        openApplications: open + 1
      };
    });
  } catch (e) {
    // The database trigger is the real guard; turn its answers into plain ones.
    if (e && e.code === "23514" && /yd_open_application_cap/.test(e.message)) {
      throw new YdError(409, "open_application_cap",
        `You already have ${YD_DEFAULTS.maxOpenApplications} open applications. Cancel or finish one before booking another.`);
    }
    if (e && e.code === "23514" && /yd_building_not_signed/.test(e.message)) {
      throw new YdError(409, "building_not_open", "This building is not taking new renters right now. Pick another one.");
    }
    if (e && e.code === "23505" && /yd_applications_open_pair_uniq/.test(String(e.constraint || e.message))) {
      throw new YdError(409, "already_booked_here", "You already have a tour booked at this building.");
    }
    throw e;
  }
}

/* ── me/tour: reschedule or cancel ────────────────────────────────────── */

/**
 * POST me/tour { tourId, action: "reschedule" | "cancel", startsAt? } for a renter session.
 * The tour must be the renter's own (anything else is a 404, never a 403).
 * Cancel also cancels the placement, which frees a place in the cap of 3; the
 * registration timestamp stays on it as the proof. The building gets a notice.
 */
export async function changeTour(db, { orgId, renterId, accountId, tourId, action, startsAt, now = new Date() }) {
  const actor = { kind: "renter", id: accountId };
  return withTransaction(db, async (tx) => {
    await setActor(tx, actor);
    const row = (await tx.query(
      `SELECT t.id AS tour_id, t.starts_at, t.status AS tour_status,
              a.id AS application_id, a.stage, a.building_id,
              b.name AS building_name, b.state, b.tour_hours, b.leasing_email,
              r.first_name, r.last_name
         FROM yd_tours t
         JOIN yd_applications a ON a.id = t.application_id AND a.org_id = t.org_id
         JOIN yd_buildings b ON b.id = a.building_id AND b.org_id = a.org_id
         JOIN yd_renters r ON r.id = a.renter_id AND r.org_id = a.org_id
        WHERE t.id = $1 AND t.org_id = $2 AND a.renter_id = $3
        FOR UPDATE OF t, a`, [tourId, orgId, renterId])).rows[0];
    if (!row) throw new YdError(404, "not_found", "We could not find that tour.");
    if (!["booked", "rescheduled"].includes(row.tour_status)) {
      throw new YdError(409, "tour_not_active", "That tour is already over or cancelled.");
    }
    const renterName = [row.first_name, row.last_name].filter(Boolean).join(" ");

    if (action === "cancel") {
      if (!["booked", "registered", "toured"].includes(row.stage)) {
        throw new YdError(409, "too_late_to_cancel", "This application is already past the tour. Please contact the building.");
      }
      await tx.query(`UPDATE yd_tours SET status = 'cancelled' WHERE id = $1 AND org_id = $2`, [tourId, orgId]);
      await tx.query(`UPDATE yd_applications SET stage = 'cancelled' WHERE id = $1 AND org_id = $2`, [row.application_id, orgId]);
      const stillOpen = Number((await tx.query(
        `SELECT count(*)::int AS n FROM yd_applications
          WHERE renter_id = $1 AND org_id = $2 AND stage IN (${OPEN_LIST})`, [renterId, orgId])).rows[0].n);
      if (stillOpen === 0) {
        await tx.query(`UPDATE yd_renters SET stage = 'matched' WHERE id = $1 AND org_id = $2 AND stage = 'booked'`, [renterId, orgId]);
      }
      await recordEvent(tx, {
        orgId, name: "tour.cancelled", entityKind: "tour", entityId: tourId,
        payload: { application_id: row.application_id, building_id: row.building_id, was_stage: row.stage }, actor
      });
      if (row.leasing_email) {
        await queueOutbox(tx, {
          orgId, channel: "email", to: row.leasing_email, templateKey: "building_tour_cancelled",
          context: { source: "Yesdoor", renter_name: renterName, tour_starts_at: new Date(row.starts_at).toISOString(), building: { name: row.building_name } },
          relatedKind: "tour", relatedId: tourId
        });
      }
      return { tourId, status: "cancelled", startsAt: new Date(row.starts_at).toISOString(), applicationStage: "cancelled" };
    }

    // reschedule
    if (!["booked", "registered"].includes(row.stage)) {
      throw new YdError(409, "too_late_to_change", "The tour has already happened. Please contact the building.");
    }
    const start = checkTourTime({ startsAt, building: row, now });
    const endsAt = new Date(start.getTime() + YD_BOOKING.tourMinutes * 60_000);
    await tx.query(
      `UPDATE yd_tours SET starts_at = $3, ends_at = $4, status = 'rescheduled' WHERE id = $1 AND org_id = $2`,
      [tourId, orgId, start, endsAt]);
    await recordEvent(tx, {
      orgId, name: "tour.rescheduled", entityKind: "tour", entityId: tourId,
      payload: { application_id: row.application_id, from: new Date(row.starts_at).toISOString(), to: start.toISOString() }, actor
    });
    if (row.leasing_email) {
      await queueOutbox(tx, {
        orgId, channel: "email", to: row.leasing_email, templateKey: "building_tour_rescheduled",
        context: {
          source: "Yesdoor", renter_name: renterName, building: { name: row.building_name },
          old_starts_at: new Date(row.starts_at).toISOString(), tour_starts_at: start.toISOString()
        },
        relatedKind: "tour", relatedId: tourId
      });
    }
    return { tourId, status: "rescheduled", startsAt: start.toISOString(), endsAt: endsAt.toISOString(), applicationStage: row.stage };
  });
}
