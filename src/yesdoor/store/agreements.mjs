// Agreements: draft, send, sign (sandbox e-sign), void (spec §2, §7, §8).
//
//   POST staff/agreement        createAgreement / sendAgreement / voidAgreement
//   POST webhooks/esign         completeSigningByLink
//
// A building (or its company) gets renters only once a `building_fee` agreement is
// signed. Sending moves the party to `agreement_sent`; signing moves it to
// `signed` (a company's signature signs every building of that company that was
// still being onboarded). Voiding a signed agreement pauses whatever it opened.
//
// NOTHING TRANSMITS. "Send" makes a signing link (HMAC, YD_LINK_SECRET, no
// network) and queues one yd_outbox row with the link; the sandbox dispatcher
// marks it sent. The staff member also gets the link back to hand over.
// The signer is not signed in and never will be: the HMAC link is the credential,
// so every bad link (forged, expired, unknown id) answers the same 404.

import { YdError } from "../http.mjs";
import { withTransaction } from "../tx.mjs";
import { actorOf, queueOutbox, recordEvent, setActor } from "../events.mjs";
import { createSigningLink, completeSigning, SANDBOX } from "../providers/esign-sandbox.mjs";
import { baseUrl } from "../auth/magic-link.mjs";
import { normalizeIp } from "../../auth/session.mjs";
import { optEnum, optEmail, reqUuid, optUuid, optString } from "../validate.mjs";
import { readFeeTerms } from "./supply-writes.mjs";

const PARTY_KINDS = ["company", "building", "broker"];
const AGREEMENT_COLS = `id, party_kind, party_id, kind, status, terms, sent_at, signed_at, signer_name`;

const shapeAgreement = (a) => ({
  id: a.id, partyKind: a.party_kind, partyId: a.party_id, kind: a.kind, status: a.status,
  terms: a.terms, sentAt: a.sent_at, signedAt: a.signed_at, signerName: a.signer_name
});

const kindFor = (partyKind) => (partyKind === "broker" ? "broker_partner" : "building_fee");

function mintLink(agreementId, env) {
  try {
    return createSigningLink({ agreementId, baseUrl: baseUrl(env) });
  } catch (e) {
    // YD_LINK_SECRET missing or too short: fail closed, and say what to fix.
    throw new YdError(503, "signing_not_configured", "Signing links are not set up yet (YD_LINK_SECRET is missing).");
  }
}

/** The party row an agreement is about, for terms and for who gets the email. */
async function loadParty(tx, orgId, partyKind, partyId, { lock = false } = {}) {
  const table = { company: "yd_companies", building: "yd_buildings", broker: "yd_brokers" }[partyKind];
  const r = await tx.query(`SELECT * FROM ${table} WHERE id = $1 AND org_id = $2 ${lock ? "FOR UPDATE" : ""}`, [partyId, orgId]);
  if (!r.rows[0]) throw new YdError(404, "party_not_found", `We could not find that ${partyKind}.`);
  return r.rows[0];
}

/** The fee terms or partner terms frozen into the agreement when it is drafted. */
function snapshotTerms(partyKind, party, body) {
  if (partyKind === "building") {
    return {
      fee_kind: party.fee_kind,
      fee_percent: party.fee_percent === null ? null : Number(party.fee_percent),
      fee_flat_cents: party.fee_flat_cents === null ? null : Number(party.fee_flat_cents),
      refund_days: party.refund_days,
      payment_terms_days: party.payment_terms_days
    };
  }
  if (partyKind === "broker") {
    return { plan: party.plan, split_percent: Number(party.split_percent) };
  }
  // A company has no fee columns: its agreement must state them.
  return readFeeTerms(body.terms && typeof body.terms === "object" ? body.terms : {}, { requireAll: true });
}

function recipientFor(partyKind, party, body) {
  if (partyKind === "building") return party.leasing_email;
  if (partyKind === "broker") return party.email;
  return optEmail(body, "toEmail", "The email address") ?? null;
}

async function queueSigningEmail(tx, { orgId, agreement, party, partyKind, to, link }) {
  return queueOutbox(tx, {
    orgId, channel: "email", to, templateKey: "yd-agreement-sign",
    context: {
      agreement: {
        kind: agreement.kind, party_kind: partyKind, party_name: party.name,
        url: link.url, expires_at: link.expiresAtIso
      }
    },
    relatedKind: "agreement", relatedId: agreement.id
  });
}

/** Move the party (and a company's buildings) to `agreement_sent` where they were still target or pitched. */
async function markSent(tx, orgId, agreement) {
  if (agreement.kind !== "building_fee") return;
  if (agreement.party_kind === "building") {
    await tx.query(
      `UPDATE yd_buildings SET status = 'agreement_sent'
        WHERE id = $1 AND org_id = $2 AND status IN ('target', 'pitched')`, [agreement.party_id, orgId]);
  } else {
    await tx.query(
      `UPDATE yd_companies SET status = 'agreement_sent'
        WHERE id = $1 AND org_id = $2 AND status IN ('target', 'pitched')`, [agreement.party_id, orgId]);
    await tx.query(
      `UPDATE yd_buildings SET status = 'agreement_sent'
        WHERE company_id = $1 AND org_id = $2 AND status IN ('target', 'pitched') AND NOT is_sample`,
      [agreement.party_id, orgId]);
  }
}

/** The signature lands: the building (or every building of the company still onboarding) is signed. */
async function markSigned(tx, orgId, agreement) {
  if (agreement.kind === "broker_partner") {
    // A partner is active once signed, and (for a split partner) once the licence is verified.
    await tx.query(
      `UPDATE yd_brokers SET status = 'active'
        WHERE id = $1 AND org_id = $2 AND status = 'applied'
          AND (plan = 'software' OR licence_verified_at IS NOT NULL)`, [agreement.party_id, orgId]);
    return;
  }
  if (agreement.party_kind === "building") {
    await tx.query(
      `UPDATE yd_buildings SET status = 'signed'
        WHERE id = $1 AND org_id = $2 AND status IN ('target', 'pitched', 'agreement_sent')`, [agreement.party_id, orgId]);
  } else {
    await tx.query(
      `UPDATE yd_companies SET status = 'signed'
        WHERE id = $1 AND org_id = $2 AND status IN ('target', 'pitched', 'agreement_sent')`, [agreement.party_id, orgId]);
    await tx.query(
      `UPDATE yd_buildings SET status = 'signed'
        WHERE company_id = $1 AND org_id = $2 AND status IN ('target', 'pitched', 'agreement_sent') AND NOT is_sample`,
      [agreement.party_id, orgId]);
  }
}

/** A voided signature takes away what it opened: signed or live buildings with no other signed agreement are paused. */
async function markVoided(tx, orgId, agreement) {
  if (agreement.kind !== "building_fee") return [];
  const where = agreement.party_kind === "building" ? "b.id = $2" : "b.company_id = $2";
  const r = await tx.query(
    `UPDATE yd_buildings b SET status = 'paused'
      WHERE b.org_id = $1 AND ${where} AND b.status IN ('signed', 'live') AND NOT b.is_sample
        AND NOT public.yd_building_is_matchable(b.id)
      RETURNING b.id`, [orgId, agreement.party_id]);
  return r.rows.map((x) => x.id);
}

/* ── staff: draft / send / void ───────────────────────────────────────── */

/**
 * POST staff/agreement.
 *   { agreementId, action: "send" | "void" }                     act on an existing one
 *   { partyKind, partyId, action?: "draft" | "send", terms?, toEmail? }   make a new one
 * Returns { agreement, signing, created }. `signing` is the link to hand over
 * (null for a draft or a void).
 */
export async function runAgreementAction(db, who, body, { env = process.env } = {}) {
  const existingId = optUuid(body, "agreementId", "the agreement");
  if (existingId) {
    const action = optEnum(body, "action", ["send", "void"], "the action") || "send";
    return action === "void" ? voidAgreement(db, who, existingId) : sendAgreement(db, who, existingId, body, { env });
  }
  const partyKind = optEnum(body, "partyKind", PARTY_KINDS, "the party kind");
  if (!partyKind) throw new YdError(400, "partyKind_required", "Choose who the agreement is with: company, building or broker.");
  const partyId = reqUuid(body, "partyId", "the party");
  const action = optEnum(body, "action", ["draft", "send"], "the action") || "send";
  const kind = kindFor(partyKind);
  if (optString(body, "kind", "the kind") && body.kind !== kind) {
    throw new YdError(400, "invalid_parameter", `An agreement with a ${partyKind} is a ${kind} agreement.`);
  }

  const created = await withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const party = await loadParty(tx, who.orgId, partyKind, partyId, { lock: true });
    if (party.is_sample) throw new YdError(409, "sample_party", "Sample companies and buildings cannot sign agreements.");

    const open = await tx.query(
      `SELECT id, status FROM yd_agreements
        WHERE org_id = $1 AND party_kind = $2 AND party_id = $3 AND kind = $4 AND status IN ('draft', 'sent', 'signed')
        ORDER BY created_at DESC LIMIT 1`, [who.orgId, partyKind, partyId, kind]);
    if (open.rows[0]) {
      const s = open.rows[0].status;
      throw new YdError(409, s === "signed" ? "already_signed" : "agreement_open",
        s === "signed"
          ? "That agreement is already signed."
          : `There is already an unsigned agreement for this ${partyKind} (id ${open.rows[0].id}). Send or void that one.`);
    }
    const terms = snapshotTerms(partyKind, party, body);
    const ins = await tx.query(
      `INSERT INTO yd_agreements (org_id, party_kind, party_id, kind, status, terms)
       VALUES ($1,$2,$3,$4,'draft',$5::jsonb) RETURNING ${AGREEMENT_COLS}`,
      [who.orgId, partyKind, partyId, kind, JSON.stringify(terms)]);
    await recordEvent(tx, {
      orgId: who.orgId, name: "agreement.drafted", entityKind: "agreement", entityId: ins.rows[0].id,
      payload: { party_kind: partyKind, party_id: partyId, kind, terms }, actor: actorOf(who)
    });
    return ins.rows[0];
  });

  if (action === "draft") return { agreement: shapeAgreement(created), signing: null, created: true };
  const sent = await sendAgreement(db, who, created.id, body, { env });
  return { ...sent, created: true };
}

/** Send (or re-send) an agreement: a new link and one queued email. Status draft -> sent; a sent one stays sent. */
export async function sendAgreement(db, who, agreementId, body = {}, { env = process.env } = {}) {
  const link = mintLink(agreementId, env);     // fail closed before anything changes
  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const a = (await tx.query(
      `SELECT ${AGREEMENT_COLS} FROM yd_agreements WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [agreementId, who.orgId])).rows[0];
    if (!a) throw new YdError(404, "not_found", "We could not find that agreement.");
    if (a.status === "signed") throw new YdError(409, "already_signed", "That agreement is already signed.");
    if (a.status === "void") throw new YdError(409, "agreement_void", "That agreement was voided. Draft a new one.");

    const party = await loadParty(tx, who.orgId, a.party_kind, a.party_id);
    const to = recipientFor(a.party_kind, party, body);
    if (!to) {
      throw new YdError(409, "no_recipient",
        a.party_kind === "company"
          ? "Add toEmail: a company has no email address on file."
          : `This ${a.party_kind} has no email address on file.`);
    }

    const firstSend = a.status === "draft";
    if (firstSend) {
      await tx.query(`UPDATE yd_agreements SET status = 'sent', sent_at = now() WHERE id = $1 AND org_id = $2`, [agreementId, who.orgId]);
      await markSent(tx, who.orgId, a);
    }
    const outboxId = await queueSigningEmail(tx, { orgId: who.orgId, agreement: a, party, partyKind: a.party_kind, to, link });
    await recordEvent(tx, {
      orgId: who.orgId, name: firstSend ? "agreement.sent" : "agreement.resent", entityKind: "agreement", entityId: agreementId,
      payload: { party_kind: a.party_kind, party_id: a.party_id, outbox_id: outboxId, link_expires_at: link.expiresAtIso },
      actor: actorOf(who)
    });
    const fresh = (await tx.query(`SELECT ${AGREEMENT_COLS} FROM yd_agreements WHERE id = $1 AND org_id = $2`, [agreementId, who.orgId])).rows[0];
    return {
      agreement: shapeAgreement(fresh),
      signing: { url: link.url, expiresAt: link.expiresAtIso, sandbox: SANDBOX },
      created: false
    };
  });
}

export async function voidAgreement(db, who, agreementId) {
  return withTransaction(db, async (tx) => {
    await setActor(tx, actorOf(who));
    const a = (await tx.query(
      `SELECT ${AGREEMENT_COLS} FROM yd_agreements WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [agreementId, who.orgId])).rows[0];
    if (!a) throw new YdError(404, "not_found", "We could not find that agreement.");
    if (a.status === "void") return { agreement: shapeAgreement(a), signing: null, created: false, paused: [] };
    await tx.query(`UPDATE yd_agreements SET status = 'void' WHERE id = $1 AND org_id = $2`, [agreementId, who.orgId]);
    const paused = a.status === "signed" ? await markVoided(tx, who.orgId, a) : [];
    await recordEvent(tx, {
      orgId: who.orgId, name: "agreement.voided", entityKind: "agreement", entityId: agreementId,
      payload: { was: a.status, paused_buildings: paused }, actor: actorOf(who)
    });
    const fresh = (await tx.query(`SELECT ${AGREEMENT_COLS} FROM yd_agreements WHERE id = $1 AND org_id = $2`, [agreementId, who.orgId])).rows[0];
    return { agreement: shapeAgreement(fresh), signing: null, created: false, paused };
  });
}

/* ── the signing webhook ──────────────────────────────────────────────── */

/**
 * POST webhooks/esign. The link proves who may sign; nothing else is asked.
 * Returns { ok: true, status: "signed", alreadySigned } or { ok: false, status, error }.
 * A bad, expired or forged link and an unknown id are all the same answer.
 */
export async function completeSigningByLink(db, { orgId, url, signerName, signerIp, now = Date.now }) {
  const result = completeSigning({ url, signerName, signerIp: normalizeIp(signerIp), now });
  if (!result.ok) {
    if (result.reason === "missing_signer_name") {
      // The link was genuine, so say what is missing.
      return { ok: false, status: 400, error: "signer_name_required" };
    }
    return { ok: false, status: 404, error: "not_found" };
  }
  return withTransaction(db, async (tx) => {
    const a = (await tx.query(
      `SELECT ${AGREEMENT_COLS} FROM yd_agreements WHERE id = $1 AND org_id = $2 FOR UPDATE`,
      [result.agreementId, orgId])).rows[0];
    if (!a) return { ok: false, status: 404, error: "not_found" };
    if (a.status === "signed") return { ok: true, status: "signed", alreadySigned: true, agreementId: a.id };
    if (a.status === "void") return { ok: false, status: 409, error: "agreement_void" };
    if (a.status !== "sent") return { ok: false, status: 409, error: "not_sent" };

    const actor = { kind: "sandbox", id: null };
    await setActor(tx, actor);
    await tx.query(
      `UPDATE yd_agreements SET status = 'signed', signed_at = $3, signer_name = $4, signer_ip = $5
        WHERE id = $1 AND org_id = $2`,
      [a.id, orgId, result.signed_at, result.signer_name, result.signer_ip]);
    await markSigned(tx, orgId, a);
    await recordEvent(tx, {
      orgId, name: "agreement.signed", entityKind: "agreement", entityId: a.id,
      payload: { party_kind: a.party_kind, party_id: a.party_id, kind: a.kind, signer_name: result.signer_name, provider: "esign_sandbox" },
      actor, idempotencyKey: `agreement-signed:${a.id}`
    });
    return { ok: true, status: "signed", alreadySigned: false, agreementId: a.id };
  });
}

