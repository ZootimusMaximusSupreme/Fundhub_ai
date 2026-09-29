// SLO pull form → identity + businesses + consent + diagnostic.paid.
// COMPLIANCE REVIEW REQUIRED — credit-pull type/reuse.
//
// The page POSTs once. Consent wording is the server soft-pull-v1 text, never
// the body. The order is the payment_links row this ref names, on the client
// this client_id names (findSloOrder). A naked client_id is not enough. Email
// is never used to find them.
//
// FIELD CHECKS live in ./fields.mjs (identity, address) and ./businesses.mjs.
// A refusal names the field: { error, errors: [{ field, code, message }] },
// so the page can put each message under its own box. `error` is the first
// code, kept so a caller that reads one code still gets one.
//
// A P.O. box is a WARNING. It is returned in `warnings` and never blocks.
//
// ADDRESS CHECK (owner-set 2026-09-22: stop fake addresses). Before anything
// is written, the home address (and the previous one, if given) is looked up
// with the existing geocoder (src/climate/connectors.mjs verifyStreetAddress,
// through ./address-check.mjs). No match → refused ONCE with
// error 'address_unverified' and a warning on 'address' / 'prev_address'. The
// buyer can fix it, or press Pay again: the widget then sends
// address_confirmed:true and the address is taken as typed. A geocoder that is
// down or slow never blocks.
//
// BUSINESSES. The first is free, each extra is $15 (owner-set 2026-09-22).
// The checkout charges for the count the buyer picked there and records it on
// the order row (payment_links.business_count). A buyer who adds MORE
// businesses here than they paid for is not charged on this form — nothing
// here can charge a card. The difference is recorded on the client as
// slo_business_owed_cents. `businesses` is optional here: a pull body with no
// businesses key leaves the stored rows alone.
//
// AN EMAIL IS NOT A LOGIN (2026-09-22 review). The checkout finds the buyer by
// email, so an order can sit on a client who existed before it. An order is
// REFUSED with 'existing_account' — before anything is written — when its
// client already has a stored identity this order did not write, or has paid
// us before, UNLESS this order itself is paid (a live order the Commas webhook
// marked paid). A client the checkout just created has neither, so the buyer's
// own order goes through in demo and live, and so do its retries: the order
// records the identity write that was its own (payment_links.
// identity_stored_at). slo_ref is stamped here, after that gate, not at
// checkout.
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
//   LIVE ORDER, NOT PAID (with or without defer_pull — 2026-09-22 review):
//     identity and consent are stored and the pull is NOT started. The Commas
//     webhook turns the payment into diagnostic.paid (src/adapters/commas.mjs,
//     purpose 'diagnostic'), and C-00 starts the pull then — its consent gate
//     finds the consent stored here. Answers next:'pay'. Only the webhook
//     makes an order paid; nothing in the body can.
//
//   LIVE ORDER, PAID (payment_links.status = 'paid'): the pull starts now —
//     diagnostic.paid is emitted here, because that payment's own C-00 run
//     found no consent and stopped, or its pull failed and this is a retry.
//
// ATTEMPTS (2026-09-22 review). Every pull this order starts carries an
// attempt number n: the demo event id is slo-demo:<ref>:<n> and the live
// event key is slo-pull:<ref>:<n>. n = 1 + this order's pulls that ended
// failed or cancelled (src/slo/status.mjs nextSloPullAttempt), counted on the
// server. So "Check my details" after a failed pull starts a new pull, and a
// double click inside one attempt is still one pull.

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
import { ensureSloAccount, markSloOrderIdentity, sloClientPriorFile, stampSloRef } from "./buyer.mjs";
import { SLO_SOURCE, isSloDemoPay } from "./offer.mjs";
import { SLO_DEMO_EVENT_PREFIX, loadOrderPullRequests, nextSloPullAttempt } from "./status.mjs";
import { checkSloAddresses } from "./address-check.mjs";
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
import { syncSloClickfunnelsContact } from "./cf-contact.mjs";

const KIND = "soft_pull_consent";

export const EXISTING_ACCOUNT_MESSAGE =
  "This email already has a file with us. Email support@fundhub.ai and we will pick it up.";
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
    /* Kept for the record only. Since the 2026-09-22 review an unpaid live
       order is deferred whether or not the body asks. */
    deferPull: isChecked(body.defer_pull ?? body.deferPull),
    addressConfirmed: isChecked(body.address_confirmed ?? body.addressConfirmed),
    warnings
  };
}

/**
 * findSloOrder — the order row this ref names, on the client this id names.
 * Resolved by the order row (payment_links.link_ref, globally unique) only —
 * never by anything stamped on the client, so no client field can make a ref
 * match. Both halves must agree or the answer is null.
 */
export async function findSloOrder(db, { clientId, ref }) {
  const id = asUuid(clientId);
  const r = String(ref == null ? "" : ref).trim();
  if (!db || !id || !r) return null;
  const { rows } = await db.query(
    `SELECT c.id, c.org_id, c.email, c.phone, c.first_name, c.last_name,
            pl.id             AS order_id,
            pl.link_ref       AS order_ref,
            pl.is_demo        AS order_is_demo,
            pl.status         AS order_status,
            pl.created_at     AS order_created_at,
            pl.business_count AS order_business_count
       FROM payment_links pl
       JOIN clients c ON c.id = pl.client_id AND c.org_id = pl.org_id
      WHERE pl.link_ref = $2 AND pl.client_id = $1::uuid
      LIMIT 1`,
    [id, r]
  );
  return rows[0] || null;
}

/** Businesses the order paid for, off its own row. No count recorded → the
 *  free one. */
export function businessesPaidFor(found) {
  const n = Number(found?.order_business_count);
  return Number.isInteger(n) && n >= SLO_FREE_BUSINESSES ? n : SLO_FREE_BUSINESSES;
}

/**
 * startSloDemoPull — a DEMO order's pull, started now, with no money event.
 *
 * C-00's handle() run in-process, exactly as src/handlers/diagnostic-soft-pull.mjs
 * runs it for a paid pull: resolve the client, stamp CRS Requested, find the
 * portal account, the consent gate + ledger row (requestSoftPull), then the
 * CRS order. The event id makes the ledger idempotency key
 * `diagnostic-paid:slo-demo:<ref>:<attempt>`, so a double click inside one
 * attempt is one request, and a retry after a failure is a new one.
 */
export async function startSloDemoPull(db, { orgId, clientId, ref, attempt = 1, env = process.env }, { run = runC00 } = {}) {
  const n = Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  const event = {
    id: `${SLO_DEMO_EVENT_PREFIX}${ref}:${n}`,
    name: "diagnostic.paid",
    orgId,
    clientId,
    payload: { source: SLO_SOURCE, ref, demo: true, attempt: n }
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
  /* Paid means the Commas webhook marked THIS order's row paid. */
  const paid = !demoOrder && found.order_status === "paid";

  const orgId = found.org_id;
  const clientId = found.id;
  const name = `${parsed.firstName} ${parsed.lastName}`.trim();

  /* AN EMAIL IS NOT A LOGIN — see the header. Before anything is written. */
  if (!paid) {
    const prior = await (deps.priorFile || sloClientPriorFile)(dbh, {
      orgId, clientId, orderId: found.order_id || null
    });
    if (prior.identity || prior.paid) {
      return {
        ok: false,
        error: "existing_account",
        errors: [{ field: "email", code: "existing_account", message: EXISTING_ACCOUNT_MESSAGE }]
      };
    }
  }

  /* ADDRESS CHECK — see the header. Before anything is written. */
  if (!parsed.addressConfirmed) {
    const addresses = Array.isArray(parsed.addresses) && parsed.addresses.length
      ? parsed.addresses
      : [parsed.address];
    const unverified = await (deps.checkAddresses || checkSloAddresses)(addresses);
    if (unverified.length) {
      return {
        ok: false,
        error: "address_unverified",
        warnings: [...unverified, ...(Array.isArray(parsed.warnings) ? parsed.warnings : [])]
      };
    }
  }

  /* The pack gate and the closer screens read slo_ref (./buyer.mjs). */
  await (deps.stampSlo || stampSloRef)(dbh, clientId, parsed.ref);

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
  /* This identity is this order's own — its retries may write it again. */
  await (deps.markIdentity || markSloOrderIdentity)(dbh, { orderId: found.order_id || null, clientId });

  const paidFor = businessesPaidFor(found);
  let submitted = null;
  let owedCents = 0;
  if (Array.isArray(parsed.businesses)) {
    const businesses = parsed.businesses;
    await (deps.replaceBusinesses || replaceSloBusinesses)(dbh, { orgId, clientId, businesses });
    submitted = businesses.length;
    owedCents = sloBusinessOwedCents({ submitted, paid: paidFor });
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
      paid: paidFor,
      owedCents,
      owedDisplay: owedCents > 0 ? formatCents(owedCents) : null
    },
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
  };

  /* Paul reads this person in ClickFunnels. SSN stays in Fundhub. */
  await (deps.syncCf || syncSloClickfunnelsContact)({
    email: found.email,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    phone: found.phone || null,
    address: parsed.address,
    businesses: parsed.businesses
  }, { env });

  /* LIVE and not paid: the payment starts the pull. See the header. */
  if (!demoOrder && !paid) {
    return { ok: true, demo: false, deferred: true, pull_requested: false, next: "pay", ...summary };
  }

  const requests = await (deps.orderPulls || loadOrderPullRequests)(dbh, found);
  const attempt = nextSloPullAttempt(requests);

  if (demoOrder) {
    let started = false;
    try {
      const out = await (deps.startDemoPull || startSloDemoPull)(dbh, {
        orgId, clientId, ref: parsed.ref, attempt, env
      });
      started = Boolean(out?.requestId);
    } catch (err) {
      /* Identity and consent are stored. The widget reads the outcome from
         /api/public/slo-status; the reason stays in the server log. */
      console.error("slo-pull: demo pull did not start —", err?.message || err);
    }
    return { ok: true, demo: true, deferred: false, pull_requested: started, attempt, next: "building", ...summary };
  }

  let a1 = null;
  const owner = await dbh.query(
    `SELECT custom_fields->>'affiliate_tier1_owner' AS a1
       FROM clients WHERE id = $1::uuid LIMIT 1`,
    [clientId]
  );
  a1 = String(owner.rows[0]?.a1 || "").trim() || null;

  await (deps.emit || emit)(
    dbh,
    "diagnostic.paid",
    {
      source: SLO_SOURCE,
      ref: parsed.ref,
      attempt,
      occurredAt: new Date().toISOString(),
      ...(a1 ? { a1 } : {})
    },
    { orgId, clientId, idempotencyKey: `slo-pull:${parsed.ref}:${attempt}` }
  );

  return { ok: true, demo: false, deferred: false, pull_requested: true, attempt, next: "building", ...summary };
}
