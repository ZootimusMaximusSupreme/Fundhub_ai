// Find-or-create the SLO buyer and the portal account C-00 attributes a pull to.
// Reuses resolveClient. Does not invent a second client door.

import { resolveClient } from "../handlers/client-lifecycle.mjs";
import {
  issuePortalLinkForClient,
  MAGIC_LINK_TEMPLATE_KEY
} from "../auth/magic-link.mjs";
import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { SLO_DEMO_CHECKOUT_URL, SLO_PRODUCT_CODE, SLO_PURPOSE, SLO_SOURCE } from "./offer.mjs";

/** Stable sendTemplated event id — one portal login mail per paid SLO buyer. */
export function sloPortalLoginEventId(clientId) {
  return `slo-portal-login:${clientId}`;
}

/**
 * resolveSloBuyer — the client this checkout is for, and whether THIS checkout
 * created them. → { clientId, created } or null.
 *
 * AN EMAIL IS NOT A LOGIN (2026-09-22 review). Anyone can type anyone's email.
 * So an email that already belongs to a client returns that id with
 * created:false and writes NOTHING to that client — no name, no phone, no CRM
 * backfill (resolveClient would fill blanks on an existing row). What the
 * order may later do to an existing client is decided by src/slo/pull.mjs,
 * never by the checkout.
 *
 * A new email is created through resolveClient, the one client door, with the
 * name, the phone (normalized there to +1XXXXXXXXXX) and source 'slo'.
 */
export async function resolveSloBuyer(db, { orgId, email, name, phone = null }) {
  if (!orgId || !email) return null;
  const existing = await db.query(
    `SELECT id FROM clients WHERE org_id = $1 AND lower(email) = $2 LIMIT 1`,
    [orgId, String(email).trim().toLowerCase()]
  );
  if (existing.rows[0]) return { clientId: existing.rows[0].id, created: false };
  const clientId = await resolveClient(db, {
    orgId,
    payload: { email, name, phone, source: SLO_SOURCE }
  });
  return clientId ? { clientId, created: true } : null;
}

export async function ensureSloAccount(db, { orgId, clientId, email, name }) {
  if (!orgId || !clientId || !email) return null;
  const existing = await db.query(
    `SELECT id FROM accounts
      WHERE org_id = $1::uuid AND client_id = $2::uuid AND kind = 'client'
      ORDER BY created_at
      LIMIT 1`,
    [orgId, clientId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const ins = await db.query(
    `INSERT INTO accounts (org_id, kind, email, name, status, client_id)
     VALUES ($1::uuid, 'client', $2, $3, 'invited', $4::uuid)
     RETURNING id`,
    [orgId, email, name || null, clientId]
  );
  return ins.rows[0]?.id || null;
}

/** /roadmap checkout refs are `slo_<hex>`. Soft-pull $32 links stay `pl_*`. */
export function isSloCheckoutLinkRef(linkRef) {
  return String(linkRef || "").startsWith("slo_");
}

/**
 * After the $297 clears: open the same portal login checkout already creates
 * for a brand-new buyer, then queue EMAIL-PORTAL-MAGIC-LINK once so they can
 * sign in. Checkout skips the account when the email already belongs to a
 * client (AN EMAIL IS NOT A LOGIN). Payment is the moment that gap closes.
 * Idempotent — same account id, and a second webhook does not queue a second
 * mail (stable sendTemplated event id).
 */
export async function ensureSloPortalForPaidClient(db, { orgId, clientId }, deps = {}) {
  if (!orgId || !clientId) return null;
  const { rows } = await db.query(
    `SELECT email, first_name, last_name
       FROM clients
      WHERE id = $1::uuid AND org_id = $2::uuid
      LIMIT 1`,
    [clientId, orgId]
  );
  const c = rows[0];
  if (!c?.email) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
  const accountId = await ensureSloAccount(db, { orgId, clientId, email: c.email, name });
  if (!accountId) return null;

  /* NON-FATAL. The invited account is the product of this call; a mail-queue
     miss must not undo it. A second payment.received for the same buyer is
     gated by the stable event id below (and by sendTemplated ON CONFLICT). */
  try {
    await queueSloPortalLoginOnce(db, { orgId, clientId }, deps);
  } catch (err) {
    console.warn(
      `[ensureSloPortalForPaidClient] portal login email: ${String(err?.message || err).slice(0, 160)}`
    );
  }
  return accountId;
}

async function queueSloPortalLoginOnce(db, { orgId, clientId }, deps = {}) {
  const eventId = sloPortalLoginEventId(clientId);
  const providerRef = `workflow:${MAGIC_LINK_TEMPLATE_KEY}:${eventId}`;
  const prior = await db.query(
    `SELECT 1 AS ok FROM messages
      WHERE org_id = $1::uuid AND provider_ref = $2
      LIMIT 1`,
    [orgId, providerRef]
  );
  if (prior.rows[0]) return { ok: true, sent: false, reason: "already" };

  const issue = deps.issuePortalLinkForClient || issuePortalLinkForClient;
  return issue(db, { orgId, clientId, eventId });
}

export async function resolveProductIdByCode(db, orgId, code) {
  if (!orgId || !code) return null;
  const { rows } = await db.query(
    `SELECT id FROM products
      WHERE org_id = $1::uuid AND lower(code) = lower($2)
      LIMIT 1`,
    [orgId, code]
  );
  return rows[0]?.id || null;
}

export async function resolveDiagnosticProductId(db, orgId) {
  return resolveProductIdByCode(db, orgId, SLO_PRODUCT_CODE);
}

/* slo_ref / slo_source on the client: what the pack gate
   (clientHasSloPurchase) and the closer screens read. The /roadmap checkout no
   longer stamps it before payment — an order's ref and business count live on
   its own payment_links row (link_ref, business_count). src/slo/pull.mjs stamps
   it once the order is allowed to write to this client. */
export async function stampSloRef(db, clientId, ref) {
  if (!clientId || !ref) return;
  await mergeCustomFields(db, clientId, { slo_ref: ref, slo_source: SLO_SOURCE });
}

export function sloLinkDescription(businessCount) {
  const n = Number.isInteger(businessCount) && businessCount > 1 ? businessCount : 1;
  return n > 1 ? `SLO diagnostic (${n} businesses)` : "SLO diagnostic";
}

/**
 * recordSloDemoLink — the order row for a DEMO checkout (SLO_DEMO_PAY="1").
 *
 * Same table, same purpose, same real amount as a paid order, so the order is
 * recorded exactly as a real one would be — except: is_demo = true, status
 * 'created' (nothing was sent to a card page and nothing was paid), no Commas
 * session, and checkout_url is the not-payable SLO_DEMO_CHECKOUT_URL. Reports
 * that already exclude is_demo rows exclude these.
 */
/* business_count (migration 388): the order's own count, kept on the order
   row so nothing is stamped on the client before payment. Anything but a
   whole number 1+ is stored as NULL (unknown → the free one). */
function orderBusinessCount(n) {
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function recordSloDemoLink(db, {
  orgId, clientId, productId = null, ref, amountCents, purpose = SLO_PURPOSE, description,
  businessCount = null
}) {
  if (!orgId || !clientId || !ref) return null;
  const { rows } = await db.query(
    `INSERT INTO payment_links
       (org_id, client_id, purpose, description, amount_cents, currency,
        link_ref, checkout_url, product_id, status, is_demo, business_count)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'USD', $6, $7, $8::uuid, 'created', true, $9)
     RETURNING id`,
    [
      orgId, clientId, purpose, description || null,
      amountCents, ref, SLO_DEMO_CHECKOUT_URL, productId || null,
      orderBusinessCount(businessCount)
    ]
  );
  return rows[0] || null;
}

export async function recordSloPaymentLink(db, {
  orgId, clientId, productId, ref, checkoutUrl, amountCents, commasSessionId, businessCount,
  isDemo = false
}) {
  if (isDemo) {
    return recordSloDemoLink(db, {
      orgId, clientId, productId, ref, amountCents, businessCount,
      description: `${sloLinkDescription(businessCount)} (demo, not charged)`
    });
  }
  if (!orgId || !clientId || !ref || !checkoutUrl) return null;
  const { rows } = await db.query(
    `INSERT INTO payment_links
       (org_id, client_id, purpose, description, amount_cents, currency,
        link_ref, checkout_url, product_id, commas_session_id, status, sent_at,
        business_count)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'USD', $6, $7, $8::uuid, $9, 'sent', now(), $10)
     RETURNING id`,
    [
      orgId, clientId, SLO_PURPOSE, sloLinkDescription(businessCount),
      amountCents, ref, checkoutUrl, productId || null, commasSessionId || null,
      orderBusinessCount(businessCount)
    ]
  );
  return rows[0] || null;
}

/**
 * sloClientPriorFile — does this client already hold something a stranger
 * must not overwrite? → { identity, paid }.
 *
 *   identity  a pii_identity row (a stored SSN / DOB / address) that THIS
 *             order did not write. The order's own write is the one whose
 *             updated_at it recorded (payment_links.identity_stored_at); a
 *             write by anyone after that counts as somebody else's again.
 *   paid      money already received: a paid, non-demo payment_links row or
 *             a transactions row.
 *
 * Read by src/slo/pull.mjs before an unpaid order writes anything.
 */
export async function sloClientPriorFile(db, { orgId, clientId, orderId = null }) {
  if (!orgId || !clientId) return { identity: false, paid: false };
  const { rows } = await db.query(
    `SELECT EXISTS (
              SELECT 1 FROM pii_identity pi
               WHERE pi.client_id = $1::uuid
                 AND NOT EXISTS (
                   SELECT 1 FROM payment_links own
                    WHERE own.id = $3::uuid AND own.client_id = $1::uuid
                      AND own.identity_stored_at = pi.updated_at
                 )
            ) AS identity,
            (EXISTS (SELECT 1 FROM payment_links
                      WHERE client_id = $1::uuid AND org_id = $2::uuid
                        AND status = 'paid' AND is_demo = false)
             OR EXISTS (SELECT 1 FROM transactions
                         WHERE client_id = $1::uuid AND org_id = $2::uuid)) AS paid`,
    [clientId, orgId, orderId]
  );
  return { identity: rows[0]?.identity === true, paid: rows[0]?.paid === true };
}

/** Record which identity write was this order's own (see sloClientPriorFile).
 *  Read straight off the row in SQL so no precision is lost on the way. */
export async function markSloOrderIdentity(db, { orderId, clientId }) {
  if (!orderId || !clientId) return;
  await db.query(
    `UPDATE payment_links pl
        SET identity_stored_at = pi.updated_at
       FROM pii_identity pi
      WHERE pl.id = $1::uuid AND pl.client_id = $2::uuid AND pi.client_id = $2::uuid`,
    [orderId, clientId]
  );
}

export async function clientHasSloPurchase(db, clientId) {
  if (!clientId) return false;
  const { rows } = await db.query(
    `SELECT custom_fields->>'slo_ref' AS slo_ref
       FROM clients WHERE id = $1::uuid LIMIT 1`,
    [clientId]
  );
  return Boolean(rows[0]?.slo_ref);
}
