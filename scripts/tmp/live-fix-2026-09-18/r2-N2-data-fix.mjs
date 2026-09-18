// N2 DATA FIX — settle the Sim/test pay links whose payment already came in
// but whose "mark the link paid" step died on the duplicate key
// payment_links_commas_session. Owner-approved for Sim/test files only
// (board, "Fix run 2"). Nothing is deleted and nothing is sent.
//
// For each stuck step on an allowed file it does exactly what the FIXED
// handler (src/handlers/payment-links.mjs) does for that payment:
//   markPaid(linkRef = the event's ref,
//            commasSessionId = itemId || commasSessionId || providerRef,
//            paidAmountCents = the event's amount in cents)
// with paidAt = when the payment event was recorded (not "now"), then marks
// the failed step resolved with a note.
//
// It also re-points the three Sim links that were paid FIRST and so kept one
// of our own product ids in commas_session_id (Walk1 deposit, #11 Blueprint,
// #12 Academy) to the Commas payment id of the payment that paid them — the
// value the fixed handler would have written.
//
// Default is a DRY RUN inside a transaction that is rolled back. Pass
// --commit to keep it. Before/after goes to the N2 evidence folder.
// Prints ids, amounts and times only — no names, phones, emails or secrets.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-N2-data-fix.mjs [--commit]
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { markPaid } from "../../../src/payment-links/index.mjs";
import { markResolved } from "../../../src/events/dead-letter.mjs";
import { toCents } from "../../../src/commissions/money.mjs";

const COMMIT = process.argv.includes("--commit");
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N2";
mkdirSync(OUT, { recursive: true });

// The files Chris allowed agents to correct (board, "Fix run 2").
const ALLOWED = {
  "d682c13b-11f3-4bd5-a0c5-232b6a7875c4": "#8",
  "be3dcfd7-faae-4001-b97f-9bc30875bbcd": "#9",
  "22103bca-0ec9-4491-bb75-5d1b6528f116": "#10",
  "029964c5-4d8e-47ed-88c9-53ac13863fd4": "#11",
  "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f": "#12",
  "7ccbeb76-df98-4125-8c14-0d1c9f5e3042": "#13",
  "567c12ce-64de-4043-aa98-d842434bd267": "Combo",
  "ab277630-8309-4c02-b187-f244e7e369e8": "Walk1",
  "6e8d0c8d-d0c1-438c-9c9b-50516c086eb7": "Walk4",
};
const ALLOWED_IDS = Object.keys(ALLOWED);
const NOTE = "N2 fix 2026-09-18: link settled by its own ref with the Commas payment id; the old step stored our product id as the Commas id and hit payment_links_commas_session";

// Paid-first links holding one of our product ids (read on live 2026-09-18).
const HOLDERS = [
  "e3d0822d-6768-448d-bc06-3b5fab0189d2", // Walk1 deposit
  "01fa7982-7785-4c3a-a70d-e275cd383488", // #11 Capital Blueprint
  "a0d8710f-383f-4dc9-a31e-3dd5ede0e702", // #12 Capital Academy
];

const LINK_COLS = `id, client_id, purpose, amount_cents, status, link_ref, commas_session_id,
                   paid_amount_cents, paid_at, updated_at`;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const report = { at: new Date().toISOString(), commit: COMMIT, triggers: null, steps: [], holders: [], errors: [] };

try {
  await c.query("BEGIN");

  // Anything that would fire on an UPDATE of payment_links besides updated_at?
  report.triggers = (await c.query(
    `SELECT tgname FROM pg_trigger WHERE tgrelid = 'payment_links'::regclass AND NOT tgisinternal`)).rows.map((r) => r.tgname);

  const failed = (await c.query(
    `SELECT id, event_id, client_id, org_id, status, attempts, payload
       FROM failed_events
      WHERE handler_name = 'onPaymentReceivedForLink' AND status = 'pending'
        AND client_id = ANY($1)
      ORDER BY first_seen_at
      FOR UPDATE`, [ALLOWED_IDS])).rows;

  for (const f of failed) {
    const p = f.payload || {};
    const step = { who: ALLOWED[f.client_id], failed_id: f.id, event_id: f.event_id, ref: p.ref || null };
    report.steps.push(step);

    const ev = (await c.query(`SELECT id, name, created_at, client_id FROM events WHERE id = $1`, [f.event_id])).rows[0];
    if (!ev || ev.name !== "payment.received") { step.skip = "event not found or not payment.received"; continue; }
    if (!p.ref) { step.skip = "no ref on the event"; continue; }

    const before = (await c.query(`SELECT ${LINK_COLS} FROM payment_links WHERE link_ref = $1 FOR UPDATE`, [p.ref])).rows[0];
    step.before = before || null;
    if (!before) { step.skip = "no link for that ref"; continue; }
    if (before.client_id !== f.client_id || !ALLOWED[before.client_id]) { step.skip = "link not on an allowed file"; continue; }
    if (!["created", "sent"].includes(before.status)) { step.skip = `link already ${before.status}`; continue; }

    const sessionId = p.itemId || p.commasSessionId || p.providerRef || null;
    const holder = sessionId ? (await c.query(
      `SELECT id FROM payment_links WHERE provider = 'commas' AND commas_session_id = $1 AND id <> $2`,
      [sessionId, before.id])).rows : [];
    if (holder.length) { step.skip = `Commas id ${sessionId} already on link ${holder[0].id}`; continue; }

    const paid = await markPaid(c, {
      linkRef: p.ref,
      commasSessionId: sessionId,
      paidAmountCents: p.amount != null ? toCents(p.amount) : null,
      paidAt: ev.created_at,
    });
    if (!paid) { step.skip = "markPaid changed nothing"; continue; }
    step.after = (await c.query(`SELECT ${LINK_COLS} FROM payment_links WHERE id = $1`, [before.id])).rows[0];
    step.failed_after = await markResolved(c, f.id, { note: NOTE });
  }

  for (const id of HOLDERS) {
    const before = (await c.query(`SELECT ${LINK_COLS}, product_id FROM payment_links WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    const h = { id, who: before ? ALLOWED[before.client_id] : null, before };
    report.holders.push(h);
    if (!before || !ALLOWED[before.client_id]) { h.skip = "not found or not an allowed file"; continue; }
    if (before.commas_session_id !== String(before.product_id)) { h.skip = "no longer holds its product id"; continue; }
    const evs = (await c.query(
      `SELECT id, created_at, payload->>'itemId' AS item_id, payload->>'commasSessionId' AS cs,
              payload->>'providerRef' AS provider_ref
         FROM events
        WHERE name = 'payment.received' AND payload->>'ref' = $1
          AND created_at BETWEEN $2::timestamptz - interval '5 minutes' AND $2::timestamptz + interval '1 minute'
        ORDER BY created_at`, [before.link_ref, before.paid_at])).rows;
    h.paying_events = evs.map((e) => ({ id: e.id, created_at: e.created_at, provider_ref: e.provider_ref, item_id: e.item_id }));
    if (evs.length !== 1) { h.skip = `expected exactly one paying event, found ${evs.length}`; continue; }
    const target = evs[0].item_id || evs[0].cs || evs[0].provider_ref;
    if (!target) { h.skip = "paying event carries no Commas id"; continue; }
    const clash = (await c.query(
      `SELECT id FROM payment_links WHERE provider = 'commas' AND commas_session_id = $1 AND id <> $2`, [target, id])).rows;
    if (clash.length) { h.skip = `Commas id ${target} already on link ${clash[0].id}`; continue; }
    await c.query(`UPDATE payment_links SET commas_session_id = $2 WHERE id = $1`, [id, target]);
    h.after = (await c.query(`SELECT ${LINK_COLS} FROM payment_links WHERE id = $1`, [id])).rows[0];
  }

  if (COMMIT) await c.query("COMMIT");
  else await c.query("ROLLBACK");
} catch (e) {
  report.errors.push(String(e?.message || e));
  await c.query("ROLLBACK").catch(() => {});
} finally {
  await c.end();
}

const file = `${OUT}/data-fix-${COMMIT ? "commit" : "dry-run"}-${report.at.replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
const brief = {
  commit: COMMIT, triggers: report.triggers, errors: report.errors,
  steps: report.steps.map((s) => ({
    who: s.who, ref: s.ref, skip: s.skip,
    before: s.before && `${s.before.purpose} ${s.before.amount_cents} ${s.before.status}`,
    after: s.after && `${s.after.status} paid ${s.after.paid_amount_cents} at ${s.after.paid_at?.toISOString?.() || s.after.paid_at} id ${s.after.commas_session_id}`,
    step_after: s.failed_after?.status,
  })),
  holders: report.holders.map((h) => ({ who: h.who, id: h.id, skip: h.skip,
    before: h.before?.commas_session_id, after: h.after?.commas_session_id })),
  file,
};
console.log(JSON.stringify(brief, null, 2));
