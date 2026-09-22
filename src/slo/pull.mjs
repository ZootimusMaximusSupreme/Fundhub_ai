// SLO pull form → identity + businesses + consent + diagnostic.paid.
// COMPLIANCE REVIEW REQUIRED — credit-pull type/reuse.
//
// The page POSTs once. Consent wording is the server soft-pull-v1 text, never
// the body. The person is the client that already holds this ref (slo_ref or
// payment_links.link_ref). A naked client_id is not enough. Email is never
// used to find them.
//
// FIELD CHECKS live in ./fields.mjs (identity, address) and ./businesses.mjs.
// A refusal names the field: { error, errors: [{ field, code, message }] },
// so the page can put each message under its own box. `error` is the first
// code, kept so a caller that reads one code still gets one.
//
// A P.O. box is a WARNING. It is returned in `warnings` and never blocks.
//
// BUSINESSES. The first is free, each extra is $15 (owner-set 2026-09-22).
// The checkout charges for the count the buyer picked there and stamps it
// beside the ref (slo_businesses_paid). A buyer who adds MORE businesses here
// than they paid for is not charged on this form — nothing here can charge a
// card. The difference is recorded on the client as slo_business_owed_cents.
// `businesses` is optional here: the /roadmap widget sends the list with the
// checkout (api/public/slo-checkout.mjs), and a pull body with no businesses
// key leaves the stored rows alone.
//
// WHEN THE PULL STARTS (owner-set 2026-09-22, the /roadmap widget):
//
//   DEMO ORDER (payment_links.is_demo, SLO_DEMO_PAY="1"): nothing was charged,
//     so nothing may book money. The pull starts right here, in this request,
//     through C-00's own handle() — the same consent gate, ledger and CRS order
//     as a paid pull — WITHOUT emitting diagnostic.paid. That event also feeds
//     the money chain (src/handlers/money-chain.mjs onDiagnosticPaidMoney),
//     which would write a sale for a demo order. Real pulls stay off: which CRS
//     host answers is CRS configuration, not this file.
//     A demo order after demo is switched OFF is refused (order_not_paid): a
//     demo ref must never become a free pull on the real till.
//
//   REAL ORDER + defer_pull: true: identity and consent are stored and the
//     pull is NOT started. The Commas webhook turns the payment into
//     diagnostic.paid (src/adapters/commas.mjs, purpose 'diagnostic'), and C-00
//     starts the pull then — its consent gate finds the consent stored here.
//     If the order is already paid when this lands, the pull starts now, as
//     below, because that payment's C-00 run found no consent and stopped.
//
//   REAL ORDER, no defer_pull (the old /roadmap/pull.html, after paying):
//     unchanged — diagnostic.paid is emitted here.

import { emit } from "../events/bus.mjs";
import { captureConsent, ConsentError } from "../consent/index.mjs";
import {
  CURRENT_SOFT_PULL_VERSION,
  SOFT_PULL_DISCLOSURES
} from "../consent/disclosures.mjs";
import { storeIdentity, PiiError } from "../pii/index.mjs";
import { formatCents } from "../config/offers.mjs";
import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { sloBusinessOwedCents, SLO_FREE_BUSINESSES } from "../finance/slo-business-pricing.mjs";
import { asUuid } from "./connections.mjs";
import { ensureSloAccount } from "./buyer.mjs";
import { SLO_SOURCE, isSloDemoPay } from "./offer.mjs";
import { handle as runC00 } from "../workflows/c-00-crs-soft-pull-request.mjs";
import {
  checkAddress,
  checkDob,
  checkFirstName,
  checkLastName,
  checkMiddleName,
  checkSsn,
  checkSuffix,
  isChecked
} from "./fields.mjs";
import { parseSloBusinesses, replaceSloBusinesses } from "./businesses.mjs";

const KIND = "soft_pull_consent";
const cleanStr = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));

/** Address as stored on pii_identity.addresses. The current home is always [0]. */
function storedAddress(value, residency) {
  const out = {
    residency,
    addressLine1: value.addressLine1,
    city: value.city,
    state: value.state,
    postalCode: value.postalCode
  };
  if (value.addressLine2) out.addressLine2 = value.addressLine2;
  return out;
}

export function parseSloPullBody(body, { now = new Date() } = {}) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_json" };
  const ref = cleanStr(body.ref, 120);
  if (!ref) {
    return { ok: false, error: "ref_required",
      errors: [{ field: "ref", code: "ref_required", message: "This order was not found. Please start again." }] };
  }
  const clientId = asUuid(body.client_id ?? body.clientId);
  if (!clientId) {
    return { ok: false, error: "client_required",
      errors: [{ field: "client_id", code: "client_required", message: "This order was not found. Please start again." }] };
  }

  const errors = [];
  const warnings = [];
  const take = (check) => {
    if (check.error) { errors.push(check.error); return null; }
    return check.value;
  };

  const firstName = take(checkFirstName(body.first_name ?? body.firstName));
  const middleName = take(checkMiddleName(body.middle_name ?? body.middleName));
  const lastName = take(checkLastName(body.last_name ?? body.lastName));
  const suffix = take(checkSuffix(body.suffix));
  const dob = take(checkDob(body.dob, { now }));
  const ssn = take(checkSsn(body.ssn));

  const home = checkAddress({
    address: body.address ?? body.address_line1 ?? body.addressLine1,
    apt: body.apt ?? body.address_line2 ?? body.addressLine2,
    city: body.city,
    state: body.state,
    zip: body.zip ?? body.postal_code ?? body.postalCode
  });
  errors.push(...home.errors);
  warnings.push(...home.warnings);

  const movedRecently = isChecked(body.moved_recently ?? body.movedRecently);
  let previous = null;
  if (movedRecently) {
    const prev = checkAddress({
      address: body.prev_address,
      apt: body.prev_apt,
      city: body.prev_city,
      state: body.prev_state,
      zip: body.prev_zip
    }, { prefix: "prev_", who: "your previous" });
    errors.push(...prev.errors);
    warnings.push(...prev.warnings);
    previous = prev.value;
  }

  /* Only a body that SENDS businesses replaces the stored list. */
  const businessesGiven = Array.isArray(body.businesses);
  const biz = parseSloBusinesses(body.businesses, { now });
  errors.push(...biz.errors);
  warnings.push(...biz.warnings);

  if (!isChecked(body.consent ?? body.soft_pull_consent)) {
    errors.push({
      field: "consent",
      code: "consent_required",
      message: "Please check the box to authorize the soft pull before we can continue."
    });
  }

  if (errors.length) {
    return { ok: false, error: errors[0].code, errors, warnings };
  }

  const address = storedAddress(home.value, "current");
  const addresses = [address];
  if (previous) addresses.push(storedAddress(previous, "previous"));

  return {
    ok: true,
    ref,
    clientId,
    firstName,
    middleName,
    lastName,
    suffix,
    dob,
    ssn,
    address,
    previousAddress: previous ? addresses[1] : null,
    addresses,
    businesses: businessesGiven ? biz.businesses : null,
    deferPull: isChecked(body.defer_pull ?? body.deferPull),
    warnings
  };
}

export async function findSloOrder(db, { clientId, ref }) {
  const id = asUuid(clientId);
  const r = String(ref == null ? "" : ref).trim();
  if (!db || !id || !r) return null;
  const { rows } = await db.query(
    `SELECT c.id, c.org_id, c.email, c.first_name, c.last_name,
            c.custom_fields->>'slo_ref' AS slo_ref,
            c.custom_fields->>'slo_businesses_paid' AS slo_businesses_paid,
            pl.is_demo    AS order_is_demo,
            pl.status     AS order_status,
            pl.created_at AS order_created_at
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT is_demo, status, created_at
           FROM payment_links
          WHERE client_id = c.id AND org_id = c.org_id AND link_ref = $2
          ORDER BY created_at DESC
          LIMIT 1
       ) pl ON true
      WHERE c.id = $1::uuid
        AND (
          c.custom_fields->>'slo_ref' = $2
          OR EXISTS (
            SELECT 1 FROM payment_links pl2
             WHERE pl2.client_id = c.id AND pl2.link_ref = $2
          )
        )
      LIMIT 1`,
    [id, r]
  );
  return rows[0] || null;
}

/** Businesses the order paid for. Only the order this ref names counts;
 *  an order with no stamp paid for the free one. */
export function businessesPaidFor(found, ref) {
  if (!found || found.slo_ref !== ref) return SLO_FREE_BUSINESSES;
  const n = Number(found.slo_businesses_paid);
  return Number.isInteger(n) && n >= SLO_FREE_BUSINESSES ? n : SLO_FREE_BUSINESSES;
}

/**
 * startSloDemoPull — a DEMO order's pull, started now, with no money event.
 *
 * C-00's handle() run in-process, exactly as src/handlers/diagnostic-soft-pull.mjs
 * runs it for a paid pull: resolve the client, stamp CRS Requested, find the
 * portal account, the consent gate + ledger row (requestSoftPull), then the
 * CRS order. The event id makes the ledger idempotency key
 * `diagnostic-paid:slo-demo:<ref>`, so a double click is one request.
 */
export async function startSloDemoPull(db, { orgId, clientId, ref, env = process.env }, { run = runC00 } = {}) {
  const event = {
    id: `slo-demo:${ref}`,
    name: "diagnostic.paid",
    orgId,
    clientId,
    payload: { source: SLO_SOURCE, ref, demo: true }
  };
  return run({ event, db, step: { run: async (_id, fn) => fn() }, env });
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

  /* Before anything is written. See WHEN THE PULL STARTS in the header. */
  const demoOrder = found.order_is_demo === true;
  const demoOn = typeof deps.demo === "boolean" ? deps.demo : isSloDemoPay(env);
  if (demoOrder && !demoOn) return { ok: false, error: "order_not_paid" };

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
      addresses: Array.isArray(parsed.addresses) && parsed.addresses.length
        ? parsed.addresses
        : [parsed.address],
      nameParts: {
        middleName: parsed.middleName || null,
        suffix: parsed.suffix || null
      },
      env
    });
  } catch (err) {
    if (err instanceof PiiError) {
      return { ok: false, error: err.status === 503 ? "encryption_unavailable" : "identity_refused" };
    }
    throw err;
  }

  const paid = businessesPaidFor(found, parsed.ref);
  let submitted = null;
  let owedCents = 0;
  if (Array.isArray(parsed.businesses)) {
    const businesses = parsed.businesses;
    await (deps.replaceBusinesses || replaceSloBusinesses)(dbh, { orgId, clientId, businesses });
    submitted = businesses.length;
    owedCents = sloBusinessOwedCents({ submitted, paid });
    await (deps.mergeFields || mergeCustomFields)(dbh, clientId, {
      slo_businesses_submitted: submitted,
      slo_business_owed_cents: owedCents
    });
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

  const summary = {
    businesses: {
      submitted,
      paid,
      owedCents,
      owedDisplay: owedCents > 0 ? formatCents(owedCents) : null
    },
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
  };

  if (demoOrder) {
    let started = false;
    try {
      const out = await (deps.startDemoPull || startSloDemoPull)(dbh, {
        orgId, clientId, ref: parsed.ref, env
      });
      started = Boolean(out?.requestId);
    } catch (err) {
      /* Identity and consent are stored. The widget reads the outcome from
         /api/public/slo-status; the reason stays in the server log. */
      console.error("slo-pull: demo pull did not start —", err?.message || err);
    }
    return { ok: true, demo: true, deferred: false, pull_requested: started, next: "building", ...summary };
  }

  if (parsed.deferPull && found.order_status !== "paid") {
    return { ok: true, demo: false, deferred: true, pull_requested: false, next: "pay", ...summary };
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

  return { ok: true, demo: false, deferred: false, pull_requested: true, next: "building", ...summary };
}
