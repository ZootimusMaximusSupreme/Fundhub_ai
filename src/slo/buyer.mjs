// Find-or-create the SLO buyer and the portal account C-00 attributes a pull to.
// Reuses resolveClient. Does not invent a second client door.

import { resolveClient } from "../handlers/client-lifecycle.mjs";
import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { SLO_PRODUCT_CODE, SLO_PURPOSE, SLO_SOURCE } from "./offer.mjs";

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

export async function resolveDiagnosticProductId(db, orgId) {
  if (!orgId) return null;
  const { rows } = await db.query(
    `SELECT id FROM products
      WHERE org_id = $1::uuid AND lower(code) = lower($2)
      LIMIT 1`,
    [orgId, SLO_PRODUCT_CODE]
  );
  return rows[0]?.id || null;
}

export async function stampSloRef(db, clientId, ref) {
  if (!clientId || !ref) return;
  await mergeCustomFields(db, clientId, { slo_ref: ref, slo_source: SLO_SOURCE });
}

export async function recordSloPaymentLink(db, {
  orgId, clientId, productId, ref, checkoutUrl, amountCents, commasSessionId
}) {
  if (!orgId || !clientId || !ref || !checkoutUrl) return null;
  const { rows } = await db.query(
    `INSERT INTO payment_links
       (org_id, client_id, purpose, description, amount_cents, currency,
        link_ref, checkout_url, product_id, commas_session_id, status, sent_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'USD', $6, $7, $8::uuid, $9, 'sent', now())
     RETURNING id`,
    [
      orgId, clientId, SLO_PURPOSE, "SLO diagnostic",
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
