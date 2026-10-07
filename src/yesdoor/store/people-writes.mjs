// Staff writes that give people a way in (I2; spec §8: POST staff/brokers, POST staff/accounts).
//
//   createBroker   a broker partner: plan, split percent, licence fields, a tracking
//                  code the database mints. Starts `applied`; the partner agreement
//                  (and, for a split partner, a verified licence) makes it `active`.
//   createAccount  a login for a building user (tied to one or more buildings) or
//                  for a broker (tied to one broker), plus the sign-in link email.
//   listBrokers    the broker book (no money), with whether each has a login yet.
//
// Until now `yd_accounts` rows for building users and brokers were only ever
// inserted by hand. Every query filters org_id from the staff session; a building
// or broker from another company is the same 404 as one that does not exist.
//
// NOTHING TRANSMITS. The sign-in link is a queued yd_outbox row (issueMagicLink),
// written in the same transaction as the account, so an account never exists
// without its invitation and the invitation never exists without its account.
// The cleartext link goes in that email only; it is never in a response.

import { YD_AUTH, YD_DEFAULTS } from "../config.mjs";
import { YdError, isUuid } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { actorOf, recordEvent, setActor } from "../events.mjs";
import { issueMagicLink } from "../auth/magic-link.mjs";
import {
  reqString, optString, optBool, optEnum, optNumber, optStateCode, emailOf, optEmail
} from "../validate.mjs";

export const BROKER_PLANS = Object.freeze(["software", "split"]);
export const LICENCE_STATES = Object.freeze(["AZ", "CA", "FL"]);
export const BUILDING_ROLES = Object.freeze(["leasing", "manager"]);
export const MAX_ACCOUNT_BUILDINGS = 50;

/* ── brokers ──────────────────────────────────────────────────────────── */

const BROKER_COLS = `id, name, company, email, licence_state, licence_number, licence_verified_at,
  plan, split_percent::float8 AS split_percent, tracking_code, status, created_at`;

const shapeBroker = (b, hasAccount) => ({
  id: b.id, name: b.name, company: b.company, email: b.email,
  plan: b.plan, splitPercent: b.split_percent,
  licence: { state: b.licence_state, number: b.licence_number, verifiedAt: b.licence_verified_at },
  trackingCode: b.tracking_code, status: b.status, createdAt: b.created_at,
  ...(hasAccount === undefined ? {} : { hasAccount })
});

/**
 * POST staff/brokers. Returns { broker }.
 *   {name, email, company?, plan? (software | split, default split),
 *    splitPercent? (0 to 100, default 25; a software plan takes none),
 *    licenceState? (AZ | CA | FL), licenceNumber?, licenceVerified? (true = staff checked it, stamped now)}
 * A split partner is paid a share, so the licence state and number are required.
 * The tracking code is minted by the database trigger (YD- plus six digits) because the insert leaves it out. The same email
 * twice in one company is a 409.
 */
export async function createBroker(db, who, body) {
  const name = reqString(body, "name", "the broker's name");
  const email = emailOf(body.email, "The broker's email address");
  const company = optString(body, "company", "the brokerage") ?? null;
  const plan = optEnum(body, "plan", BROKER_PLANS, "the plan") ?? "split";
  const splitSent = optNumber(body, "splitPercent", "the split percent", { min: 0, max: 100 });
  const licenceState = optStateCode(body, "licenceState", "the licence state") ?? null;
  const licenceNumber = optString(body, "licenceNumber", "the licence number", { max: 60 }) ?? null;
  const licenceVerified = optBool(body, "licenceVerified", "licence verified") ?? false;

  if (licenceState !== null && !LICENCE_STATES.includes(licenceState)) {
    throw new YdError(400, "invalid_parameter", `The licence state must be one of: ${LICENCE_STATES.join(", ")}.`);
  }
  if (plan === "software" && splitSent !== undefined && splitSent !== null) {
    throw new YdError(400, "invalid_parameter", "A software-only partner takes no split percent.");
  }
  if (plan === "split" && (!licenceState || !licenceNumber)) {
    throw new YdError(400, "licence_required", "A split partner needs a licence state and licence number.");
  }
  if (licenceVerified && (!licenceState || !licenceNumber)) {
    throw new YdError(400, "licence_required", "Add the licence state and number before marking the licence verified.");
  }
  // A software-only partner is not paid a share, so its split is the default it would
  // move to later; the column is NOT NULL.
  const splitPercent = plan === "software" ? YD_DEFAULTS.brokerSplitPercent : (splitSent ?? YD_DEFAULTS.brokerSplitPercent);

  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const dupe = await tx.query(`SELECT id FROM yd_brokers WHERE org_id = $1 AND email = $2 LIMIT 1`, [who.orgId, email]);
    if (dupe.rows[0]) throw new YdError(409, "broker_exists", "A broker with that email address is already on the list.");
    const r = await tx.query(
      `INSERT INTO yd_brokers (org_id, name, company, email, licence_state, licence_number, licence_verified_at,
                               plan, split_percent)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $7::boolean THEN now() ELSE NULL END, $8,$9)
       RETURNING ${BROKER_COLS}`,
      [who.orgId, name, company, email, licenceState, licenceNumber, licenceVerified, plan, splitPercent]);
    const broker = shapeBroker(r.rows[0], false);
    await recordEvent(tx, {
      orgId: who.orgId, name: "broker.created", entityKind: "broker", entityId: broker.id,
      payload: {
        plan, split_percent: splitPercent, licence_state: licenceState,
        licence_verified: licenceVerified, tracking_code: broker.trackingCode
      },
      actor: actorOf(who)
    });
    return { broker };
  });
}

/** GET staff/brokers. The broker book for the desk: who they are, their plan and
 *  code, and whether they have a login yet. No money and no renters. */
export async function listBrokers(db, { orgId, status = null, limit }) {
  const r = await db.query(
    `SELECT k.id, k.name, k.company, k.email, k.licence_state, k.licence_number, k.licence_verified_at,
            k.plan, k.split_percent::float8 AS split_percent, k.tracking_code, k.status, k.created_at,
            EXISTS (SELECT 1 FROM yd_accounts a WHERE a.broker_id = k.id AND a.org_id = k.org_id) AS has_account
       FROM yd_brokers k
      WHERE k.org_id = $1 AND ($2::text IS NULL OR k.status = $2)
      ORDER BY k.created_at DESC, k.id DESC
      LIMIT $3`, [orgId, status, limit]);
  return r.rows.map((b) => shapeBroker(b, b.has_account));
}

/* ── accounts ─────────────────────────────────────────────────────────── */

function buildingIdsOf(body) {
  const raw = body.buildingIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new YdError(400, "buildingIds_required", "Choose at least one building for this login.");
  }
  if (raw.length > MAX_ACCOUNT_BUILDINGS) {
    throw new YdError(400, "too_many_buildings", `A login can cover at most ${MAX_ACCOUNT_BUILDINGS} buildings.`);
  }
  for (const id of raw) {
    if (!isUuid(id)) throw new YdError(400, "invalid_parameter", "A building id is not valid.");
  }
  return [...new Set(raw.map((x) => x.toLowerCase()))];
}

/**
 * POST staff/accounts. Returns { account, signIn }.
 *   building user  {kind: "building_user", email, buildingIds: [id, ...], role? (leasing | manager)}
 *   broker         {kind: "broker", brokerId, email? (defaults to the broker's own)}
 * Creates the login and queues its sign-in link email in one transaction.
 * An address that already has a login in this company (of any kind) is a 409, and
 * so is a second login for the same broker. A building or broker that is not in
 * this company is a 404.
 */
export async function createAccount(db, who, body, { env = process.env, ip = null, userAgent = null } = {}) {
  const kind = optEnum(body, "kind", ["building_user", "broker"], "the kind of login");
  if (!kind) throw new YdError(400, "kind_required", "Choose the kind of login: building_user or broker.");

  const isBuilding = kind === "building_user";
  const buildingIds = isBuilding ? buildingIdsOf(body) : null;
  const role = isBuilding ? (optEnum(body, "role", BUILDING_ROLES, "the role") ?? "leasing") : null;
  const brokerId = !isBuilding ? body.brokerId : null;
  if (!isBuilding && !isUuid(brokerId)) {
    throw new YdError(400, brokerId === undefined ? "brokerId_required" : "invalid_parameter", "Choose the broker this login is for.");
  }
  if (isBuilding && body.brokerId !== undefined && body.brokerId !== null) {
    throw new YdError(400, "invalid_parameter", "A building login is not tied to a broker.");
  }
  if (!isBuilding && body.buildingIds !== undefined && body.buildingIds !== null) {
    throw new YdError(400, "invalid_parameter", "A broker login is not tied to buildings.");
  }
  const emailSent = optEmail(body, "email", "The email address");

  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    let email = emailSent;
    let broker = null;
    let buildings = [];

    if (isBuilding) {
      if (!email) throw new YdError(400, "invalid_email", "Add the email address this person signs in with.");
      const found = await tx.query(
        `SELECT id, name FROM yd_buildings WHERE org_id = $1 AND id = ANY($2::uuid[]) ORDER BY name, id`,
        [who.orgId, buildingIds]);
      if (found.rows.length !== buildingIds.length) {
        throw new YdError(404, "building_not_found", "We could not find one of those buildings.");
      }
      buildings = found.rows;
    } else {
      const k = await tx.query(`SELECT id, name, email FROM yd_brokers WHERE id = $1 AND org_id = $2`, [brokerId, who.orgId]);
      if (!k.rows[0]) throw new YdError(404, "broker_not_found", "We could not find that broker.");
      broker = k.rows[0];
      email = email || broker.email;
      const has = await tx.query(`SELECT id FROM yd_accounts WHERE broker_id = $1 AND org_id = $2 LIMIT 1`, [brokerId, who.orgId]);
      if (has.rows[0]) throw new YdError(409, "account_exists", "That broker already has a login.");
    }

    const dupe = await tx.query(`SELECT id FROM yd_accounts WHERE org_id = $1 AND email = $2 LIMIT 1`, [who.orgId, email]);
    if (dupe.rows[0]) throw new YdError(409, "account_exists", "That email address already has a Yesdoor login.");

    const acct = (await tx.query(
      `INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,$2,$3,$4)
       RETURNING id, kind, email, status, broker_id, created_at`,
      [who.orgId, kind, email, isBuilding ? null : brokerId])).rows[0];

    for (const b of buildings) {
      await tx.query(
        `INSERT INTO yd_account_buildings (org_id, account_id, building_id, role) VALUES ($1,$2,$3,$4)`,
        [who.orgId, acct.id, b.id, role]);
    }

    // The invitation: one single-use sign-in link, queued as an email, same transaction.
    const link = await issueMagicLink(tx, { orgId: who.orgId, email, accountId: acct.id, ip, userAgent, env });

    await recordEvent(tx, {
      orgId: who.orgId, name: "account.created", entityKind: "account", entityId: acct.id,
      payload: { kind, building_ids: isBuilding ? buildings.map((b) => b.id) : undefined, broker_id: isBuilding ? undefined : brokerId, role: role || undefined },
      actor: actorOf(who)
    });

    return {
      account: {
        id: acct.id, kind: acct.kind, email: acct.email, status: acct.status, createdAt: acct.created_at,
        brokerId: acct.broker_id,
        buildings: buildings.map((b) => ({ id: b.id, name: b.name, role }))
      },
      // The link itself goes in the email only.
      signIn: { queued: link.sent, expiresMinutes: YD_AUTH.linkTtlMinutes }
    };
  });
}

