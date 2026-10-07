// Leads (spec §8: POST public/lead). Create or find a renter by email and write
// the FIRST TOUCH once.
//
// First touch is who sent the renter: an ad, a broker's tracking code, or nobody
// we can name. It is written when the renter row is created and never again. The
// database enforces that (trigger yd_renters_first_touch, 434), so this file does
// not even attempt an update of those columns; a second visit through a different
// ad or broker only returns the renter that already exists.
//
// A broker's tracking code (YD-123456) becomes source_kind 'broker' only for an
// ACTIVE broker. A code that matches nothing, or a broker who has not been
// approved, is ignored rather than rejected: the visitor still becomes a lead,
// credited to no one. A stated kind the database does not know becomes 'direct'.

import { YD_PRESCREEN } from "../config.mjs";
import { normalizeEmail } from "../auth/magic-link.mjs";
import { YdError } from "../http.mjs";
import { recordEvent } from "../events.mjs";

export const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A trimmed string of at most `max` characters, or null when empty or not text. */
export function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const t = value.trim().slice(0, max);
  return t === "" ? null : t;
}

/** The email, lower-cased, or a 400. */
export function requireEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !LOOKS_LIKE_EMAIL.test(email)) {
    throw new YdError(400, "email_required", "a valid email address is required");
  }
  return email;
}

const STATED_KINDS = new Set(["ad", "organic", "direct", "referral"]);

/** source { kind, adId, brokerCode } -> the columns to write. Never throws on
 *  bad input: it falls back to 'direct'. */
export async function resolveSource(db, { orgId, source }) {
  const s = source && typeof source === "object" ? source : {};
  const adId = cleanText(s.adId, YD_PRESCREEN.adIdMax);
  const code = cleanText(s.brokerCode, 32);

  if (code) {
    const broker = (await db.query(
      `SELECT id FROM yd_brokers
        WHERE org_id = $1 AND lower(tracking_code) = lower($2) AND status = 'active' LIMIT 1`,
      [orgId, code])).rows[0];
    if (broker) return { kind: "broker", adId, brokerId: broker.id };
  }

  let kind = typeof s.kind === "string" && STATED_KINDS.has(s.kind) ? s.kind : "direct";
  if (kind === "ad" && !adId) kind = "direct";
  return { kind, adId: kind === "ad" ? adId : null, brokerId: null };
}

/**
 * Find the renter for this email, or create it with its first touch.
 *
 * @returns {Promise<{ renter: object, created: boolean }>}
 *   `renter` is the full yd_renters row. Existing names are filled in only where
 *   they are empty: a stranger submitting an existing address cannot rewrite a
 *   renter's name.
 */
export async function findOrCreateLead(db, { orgId, email, firstName = null, lastName = null, source = null }) {
  const mail = requireEmail(email);
  const first = cleanText(firstName, YD_PRESCREEN.nameMax);
  const last = cleanText(lastName, YD_PRESCREEN.nameMax);
  const src = await resolveSource(db, { orgId, source });

  const ins = await db.query(
    `INSERT INTO yd_renters (org_id, email, first_name, last_name, source_kind, source_ad_id, source_broker_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (org_id, email) DO NOTHING
     RETURNING *`,
    [orgId, mail, first, last, src.kind, src.adId, src.brokerId]);

  if (ins.rows[0]) {
    const renter = ins.rows[0];
    await recordEvent(db, {
      orgId, name: "renter.lead_created", entityKind: "renter", entityId: renter.id,
      payload: { source_kind: src.kind, source_ad_id: src.adId, source_broker_id: src.brokerId },
      actorKind: "renter", actorId: renter.id, idempotencyKey: `lead:${renter.id}`
    });
    return { renter, created: true };
  }

  const existing = (await db.query(
    `SELECT * FROM yd_renters WHERE org_id = $1 AND email = $2`, [orgId, mail])).rows[0];
  if (!existing) throw new Error("renter vanished between insert and select"); // cannot happen: nothing deletes

  if ((first && !existing.first_name) || (last && !existing.last_name)) {
    const upd = await db.query(
      `UPDATE yd_renters
          SET first_name = COALESCE(first_name, $3), last_name = COALESCE(last_name, $4)
        WHERE id = $1 AND org_id = $2 RETURNING *`,
      [existing.id, orgId, first, last]);
    return { renter: upd.rows[0], created: false };
  }
  return { renter: existing, created: false };
}
