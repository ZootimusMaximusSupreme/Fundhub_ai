// SLO pull form → identity + consent + diagnostic.paid.
// COMPLIANCE REVIEW REQUIRED — credit-pull type/reuse.
//
// The page POSTs once. Consent wording is the server soft-pull-v1 text, never
// the body. The person is the client that already holds this ref (slo_ref or
// payment_links.link_ref). A naked client_id is not enough. Email is never
// used to find them.

import { emit } from "../events/bus.mjs";
import { captureConsent, ConsentError } from "../consent/index.mjs";
import {
  CURRENT_SOFT_PULL_VERSION,
  SOFT_PULL_DISCLOSURES
} from "../consent/disclosures.mjs";
import { storeIdentity, PiiError } from "../pii/index.mjs";
import { asUuid } from "./connections.mjs";
import { ensureSloAccount } from "./buyer.mjs";
import { SLO_SOURCE } from "./offer.mjs";

const KIND = "soft_pull_consent";
const cleanStr = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));

function digits(v) {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

function parseDob(v) {
  const s = cleanStr(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1900) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dt.getTime() > todayUtc) return null;
  return s;
}

function isChecked(v) {
  return v === true || v === "true" || v === "on" || v === "1" || v === 1;
}

export function parseSloPullBody(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const ref = cleanStr(body.ref, 120);
  if (!ref) return { ok: false, error: "ref_required" };
  const clientId = asUuid(body.client_id ?? body.clientId);
  if (!clientId) return { ok: false, error: "client_required" };
  if (!isChecked(body.consent ?? body.soft_pull_consent)) {
    return { ok: false, error: "consent_required" };
  }
  const firstName = cleanStr(body.first_name ?? body.firstName, 80);
  const lastName = cleanStr(body.last_name ?? body.lastName, 80);
  if (!firstName || !lastName) return { ok: false, error: "name_required" };
  const dob = parseDob(body.dob);
  if (!dob) return { ok: false, error: "dob_required" };
  const ssn = digits(body.ssn);
  if (ssn.length !== 9) return { ok: false, error: "ssn_required" };
  const line1 = cleanStr(body.address ?? body.address_line1 ?? body.addressLine1, 160);
  const city = cleanStr(body.city, 80);
  const state = cleanStr(body.state, 2).toUpperCase();
  const postal = digits(body.zip ?? body.postal_code ?? body.postalCode).slice(0, 10);
  if (!line1 || !city || !/^[A-Z]{2}$/.test(state) || postal.length < 5) {
    return { ok: false, error: "address_required" };
  }
  return {
    ok: true,
    ref,
    clientId,
    firstName,
    lastName,
    dob,
    ssn,
    address: { addressLine1: line1, city, state, postalCode: postal }
  };
}

export async function findSloOrder(db, { clientId, ref }) {
  const id = asUuid(clientId);
  const r = String(ref == null ? "" : ref).trim();
  if (!db || !id || !r) return null;
  const { rows } = await db.query(
    `SELECT c.id, c.org_id, c.email, c.first_name, c.last_name
       FROM clients c
      WHERE c.id = $1::uuid
        AND (
          c.custom_fields->>'slo_ref' = $2
          OR EXISTS (
            SELECT 1 FROM payment_links pl
             WHERE pl.client_id = c.id AND pl.link_ref = $2
          )
        )
      LIMIT 1`,
    [id, r]
  );
  return rows[0] || null;
}

export async function runSloPull(parsed, deps = {}) {
  const dbh = deps.db;
  if (!dbh) return { ok: false, error: "db_missing" };
  const env = deps.env || process.env;
  const disclosure = SOFT_PULL_DISCLOSURES[CURRENT_SOFT_PULL_VERSION];
  if (!disclosure?.text) return { ok: false, error: "disclosure_missing" };

  const found = await (deps.findOrder || findSloOrder)(dbh, {
    clientId: parsed.clientId,
    ref: parsed.ref
  });
  if (!found) return { ok: false, error: "not_found" };

  const orgId = found.org_id;
  const clientId = found.id;
  const name = `${parsed.firstName} ${parsed.lastName}`.trim();

  await dbh.query(
    `UPDATE clients
        SET first_name = $2, last_name = $3
      WHERE id = $1::uuid AND org_id = $4::uuid`,
    [clientId, parsed.firstName, parsed.lastName, orgId]
  );

  const accountId = await (deps.ensureAccount || ensureSloAccount)(dbh, {
    orgId,
    clientId,
    email: found.email,
    name
  });
  if (!accountId) return { ok: false, error: "no_account" };

  try {
    await (deps.storeIdentity || storeIdentity)(dbh, {
      orgId,
      clientId,
      ssn: parsed.ssn,
      dob: parsed.dob,
      addresses: [parsed.address],
      env
    });
  } catch (err) {
    if (err instanceof PiiError) {
      return { ok: false, error: err.status === 503 ? "encryption_unavailable" : "identity_refused" };
    }
    throw err;
  }

  try {
    await (deps.captureConsent || captureConsent)(dbh, {
      orgId,
      clientId,
      kind: KIND,
      consentText: disclosure.text,
      consentVersion: CURRENT_SOFT_PULL_VERSION,
      captureMethod: "checkbox",
      grantedBy: { kind: "client", id: accountId },
      capturedIp: deps.ip || null,
      capturedUserAgent: deps.userAgent || null
    });
  } catch (err) {
    if (err instanceof ConsentError) {
      return { ok: false, error: err.code || "consent_refused" };
    }
    throw err;
  }

  await (deps.emit || emit)(
    dbh,
    "diagnostic.paid",
    {
      source: SLO_SOURCE,
      ref: parsed.ref,
      occurredAt: new Date().toISOString()
    },
    { orgId, clientId, idempotencyKey: `slo-pull:${parsed.ref}` }
  );

  return { ok: true, next: "building" };
}
