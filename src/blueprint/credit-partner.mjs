// Capital Blueprint — free credit partner file (second person on the account).

import { hasValidConsent } from "../consent/index.mjs";
import { seedClientWaypoints } from "../waypoints/seed.mjs";
import { isCapitalBlueprintBuyer } from "./coach-exception.mjs";
import { prequalFromCustomFields } from "../http/portal-prequal.mjs";

/** Sum prequal dollars from primary + partner custom_fields. NULL if both unknown. */
export function combinedPrequalAmount(primaryCf = {}, partnerCf = {}) {
  const a = prequalFromCustomFields(primaryCf);
  const b = prequalFromCustomFields(partnerCf);
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

export async function getCreditPartnerLink(db, { orgId, primaryClientId }) {
  if (!orgId || !primaryClientId) return null;
  const r = await db.query(
    `SELECT id, org_id, primary_client_id, partner_client_id, created_at
       FROM credit_partner_links
      WHERE org_id = $1::uuid
        AND primary_client_id = $2::uuid
        AND removed_at IS NULL
      LIMIT 1`,
    [orgId, primaryClientId]
  );
  return r.rows[0] || null;
}

/**
 * Create partner client row + link. Does not seed checklist until partner has
 * soft_pull_consent — call ensurePartnerChecklistIfConsented after consent capture.
 */
export async function createCreditPartnerFile(db, {
  orgId,
  primaryClientId,
  firstName,
  lastName,
  email,
  phone = null,
  staffId = null
} = {}) {
  if (!orgId || !primaryClientId) {
    return { ok: false, error: "orgId and primaryClientId are required" };
  }
  const blueprint = await isCapitalBlueprintBuyer(db, { orgId, clientId: primaryClientId });
  if (!blueprint) return { ok: false, error: "not_blueprint_buyer" };

  const existing = await getCreditPartnerLink(db, { orgId, primaryClientId });
  if (existing) {
    return { ok: true, linked: true, partnerClientId: existing.partner_client_id, skipped: "already_linked" };
  }

  const owned = await db.query(
    `SELECT 1 FROM clients WHERE id = $1 AND org_id = $2`,
    [primaryClientId, orgId]
  );
  if (!owned.rows[0]) return { ok: false, error: "primary_not_found" };

  const fn = String(firstName || "").trim();
  const ln = String(lastName || "").trim();
  const em = String(email || "").trim().toLowerCase();
  if (!fn || !ln || !em.includes("@")) {
    return { ok: false, error: "partner_name_and_email_required" };
  }

  const ins = await db.query(
    `INSERT INTO clients (org_id, first_name, last_name, email, phone, tags)
     VALUES ($1, $2, $3, $4, $5, $6::text[])
     RETURNING id`,
    [orgId, fn, ln, em, phone, ["blueprint_credit_partner"]]
  );
  const partnerClientId = ins.rows[0].id;

  await db.query(
    `INSERT INTO credit_partner_links
       (org_id, primary_client_id, partner_client_id, created_by_staff_id)
     VALUES ($1, $2, $3, $4)`,
    [orgId, primaryClientId, partnerClientId, staffId]
  );

  return { ok: true, linked: true, partnerClientId, consentRequired: true };
}

/** Seed partner checklist only when partner has their own soft_pull_consent. */
export async function ensurePartnerChecklistIfConsented(db, {
  orgId,
  partnerClientId
} = {}) {
  if (!orgId || !partnerClientId) {
    return { ok: false, seeded: [], error: "missing_ids" };
  }
  const consent = await hasValidConsent(db, {
    orgId,
    clientId: partnerClientId,
    kind: "soft_pull_consent"
  });
  if (!consent) {
    return { ok: true, seeded: [], skipped: "partner_consent_required" };
  }
  return seedClientWaypoints(db, { orgId, clientId: partnerClientId })
    .catch((err) => ({ ok: false, seeded: [], error: String(err?.message || err) }));
}

export async function loadCombinedApproval(db, { orgId, primaryClientId }) {
  const link = await getCreditPartnerLink(db, { orgId, primaryClientId });
  const ids = link
    ? [primaryClientId, link.partner_client_id]
    : [primaryClientId];
  const r = await db.query(
    `SELECT id, first_name, last_name, custom_fields
       FROM clients
      WHERE org_id = $1::uuid AND id = ANY($2::uuid[])`,
    [orgId, ids]
  );
  const byId = new Map(r.rows.map((row) => [row.id, row]));
  const primary = byId.get(primaryClientId);
  if (!primary) return { ok: false, error: "primary_not_found" };

  const primaryCf = primary.custom_fields || {};
  const primaryPrequal = prequalFromCustomFields(primaryCf);

  let partner = null;
  let partnerPrequal = null;
  if (link) {
    partner = byId.get(link.partner_client_id) || null;
    partnerPrequal = partner ? prequalFromCustomFields(partner.custom_fields || {}) : null;
  }

  const combinedPrequal = link && partner
    ? combinedPrequalAmount(primaryCf, partner.custom_fields || {})
    : primaryPrequal;

  return {
    ok: true,
    primaryClientId,
    partnerClientId: link?.partner_client_id ?? null,
    primaryPrequal,
    partnerPrequal,
    combinedPrequal,
    primary: {
      id: primary.id,
      name: `${primary.first_name || ""} ${primary.last_name || ""}`.trim()
    },
    partner: partner ? {
      id: partner.id,
      name: `${partner.first_name || ""} ${partner.last_name || ""}`.trim()
    } : null
  };
}
