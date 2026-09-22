// Find-or-create the SLO buyer and the portal account C-00 attributes a pull to.
// Reuses resolveClient. Does not invent a second client door.

import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { SLO_DEMO_CHECKOUT_URL, SLO_PRODUCT_CODE, SLO_PURPOSE, SLO_SOURCE } from "./offer.mjs";

export async function resolveSloBuyer(db, { orgId, email, name }) {
  return resolveClient(db, {
    orgId,
    payload: { email, name, source: SLO_SOURCE }
  });
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

/* The businesses paid for ride beside the ref, and are overwritten with it:
   a second checkout is a new order, and the count belongs to the order the
   ref names. The success URL carries only ref + client_id (slo-offer
   intended, ground truth 5), so the count has to be kept here, on the server. */
export async function stampSloRef(db, clientId, ref, { businessesPaid } = {}) {
  if (!clientId || !ref) return;
  const patch = { slo_ref: ref, slo_source: SLO_SOURCE };
  if (Number.isInteger(businessesPaid) && businessesPaid > 0) {
    patch.slo_businesses_paid = businessesPaid;
  }
  await mergeCustomFields(db, clientId, patch);
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
export async function recordSloDemoLink(db, {
  orgId, clientId, productId = null, ref, amountCents, purpose = SLO_PURPOSE, description
}) {
  if (!orgId || !clientId || !ref) return null;
  const { rows } = await db.query(
    `INSERT INTO payment_links
       (org_id, client_id, purpose, description, amount_cents, currency,
        link_ref, checkout_url, product_id, status, is_demo)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'USD', $6, $7, $8::uuid, 'created', true)
     RETURNING id`,
    [
      orgId, clientId, purpose, description || null,
      amountCents, ref, SLO_DEMO_CHECKOUT_URL, productId || null
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
      orgId, clientId, productId, ref, amountCents,
      description: `${sloLinkDescription(businessCount)} (demo, not charged)`
    });
  }
  if (!orgId || !clientId || !ref || !checkoutUrl) return null;
  const { rows } = await db.query(
    `INSERT INTO payment_links
       (org_id, client_id, purpose, description, amount_cents, currency,
        link_ref, checkout_url, product_id, commas_session_id, status, sent_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'USD', $6, $7, $8::uuid, $9, 'sent', now())
     RETURNING id`,
    [
      orgId, clientId, SLO_PURPOSE, sloLinkDescription(businessCount),
      amountCents, ref, checkoutUrl, productId || null, commasSessionId || null
    ]
  );
  return rows[0] || null;
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
