/* The Client Control Panel's step for ONE client — worked out in ONE place.
 *
 * Hole 12, round 3, 2026-09-18. The control panel paints a step it works out
 * (deriveNextAction). The record also keeps a saved step,
 * clients.custom_fields.employee_next_action, and a dozen jobs each saved their
 * own fixed word there ("Pull CRS", "Collect Documents", …). One deposit fired
 * four of them and the last one won, so the saved step and the screen
 * disagreed on every file that had one — measured live on all six.
 *
 * So the work-out the screen uses lives here, and everything that needs the
 * screen's step asks this file:
 *
 *   * api/dashboard/client.mjs — the control panel's own read. It reads its
 *     rows with readClientStepRows() and works the step out with
 *     workOutClientStep(). Same reads, same call, no copy.
 *   * src/workflows/custom-fields.mjs mergeCustomFields() — when a job saves
 *     employee_next_action, shownStepLabel() replaces the job's fixed word with
 *     the screen's step.
 *   * src/workflows/next-action-catch-up.mjs — every five minutes, for files
 *     whose inputs changed with no save at all (a card move, an inquiry case,
 *     a credit report).
 *
 * READS ONLY. Nothing here writes, sends or emits.
 */

import { clientDetailExtras } from "../http/client-detail.mjs";
import { getActiveCaseForClient } from "../inquiry-ops/cases.mjs";
import { consentStatus } from "../consent/index.mjs";
import { deriveNextAction, sanitizeBlockerLabels } from "./next-action.mjs";
import { gatherDetailSignals } from "./read-signals.mjs";

/* ── the six reads, moved here from api/dashboard/client.mjs ────────────────
   The control panel paints these rows AND works the step out from them, so
   they are read once, by this function, for both. Every statement carries the
   caller's org — the 2026-08-04 P0 on that endpoint was a read with no org. */
export const CLIENT_ROW_SQL =
  `SELECT id, org_id, first_name, last_name, email, phone,
                outcome_tier, funded, funded_amount, days_to_fund,
                channel_source, tags, pipeline_ids,
                dnd_sms, dnd_email, dnd_voice, consent_sms,
                custom_fields, created_at, updated_at
         FROM clients WHERE id = $1 AND org_id = $2`;

export const CLIENT_CRS_SQL =
  `SELECT id, outcome_tier, result, created_at
         FROM crs_results WHERE client_id = $1 AND org_id = $2 ORDER BY created_at DESC`;

export const CLIENT_TASKS_SQL =
  `SELECT id, assignee_role, assignee_staff_id, title, body, due_at, done,
                source_workflow, created_at, is_demo
         FROM tasks WHERE client_id = $1 AND org_id = $2 ORDER BY created_at DESC`;

export const CLIENT_ROUNDS_SQL =
  `SELECT id, round_number, status, product, submitted_amount, approved_amount,
                funded_amount, hold_reason, conditions, created_at, is_demo
         FROM funding_rounds WHERE client_id = $1 AND org_id = $2
         ORDER BY round_number DESC`;

/* A void or written-off bill owes nothing. The view's raw balance_due is still
   amount_due minus what was paid, so a bill voided and reissued at a new fee
   (src/funding/billed-fee-check.mjs) would read as a balance outstanding — the
   same rule the view's own open_balance already applies. */
export const CLIENT_INVOICES_SQL =
  `SELECT invoice_id AS id, status, currency, amount_due, amount_paid,
                CASE WHEN status IN ('void', 'written_off') THEN 0 ELSE balance_due END AS balance_due,
                due_at, paid_at, created_at
         FROM v_invoice_balance WHERE client_id = $1 AND org_id = $2
         ORDER BY created_at DESC`;

export const CLIENT_BUSINESSES_SQL =
  `SELECT name, age_months, entity_data
           FROM businesses
          WHERE client_id = $1 AND org_id = $2
          ORDER BY updated_at DESC
          LIMIT 20`;

/** The rows the step is worked out from. `client` is null when the file is
 *  not in this org. Throws on a failed read, exactly as the endpoint did. */
export async function readClientStepRows(db, { orgId, clientId }) {
  const args = [clientId, orgId];
  const [clientRes, crsRes, taskRes, roundRes, invRes, bizRes] = await Promise.all([
    db.query(CLIENT_ROW_SQL, args),
    db.query(CLIENT_CRS_SQL, args),
    db.query(CLIENT_TASKS_SQL, args),
    db.query(CLIENT_ROUNDS_SQL, args),
    db.query(CLIENT_INVOICES_SQL, args),
    db.query(CLIENT_BUSINESSES_SQL, args)
  ]);
  return {
    client: clientRes.rows[0] || null,
    crsResults: crsRes.rows,
    tasks: taskRes.rows,
    fundingRounds: roundRes.rows,
    invoices: invRes.rows,
    businesses: bizRes.rows
  };
}

/* Active inquiry-removal case for the control panel status tile.
   Table may be absent before migration — never break the dashboard. */
export async function readActiveInquiryCase(db, { orgId, clientId }) {
  try {
    return await getActiveCaseForClient(db, { orgId, clientId });
  } catch (_) {
    return null;
  }
}

/* Demo rows are shown on the page as they always were, but they never drive a
   derived answer. Only an explicit true counts as demo, so a NULL or a missing
   column leaves a row in — a real row wrongly dropped is worse than a demo row
   wrongly kept, and the demo seed always sets the flag. */
export function realOnly(rows) {
  return Array.isArray(rows) ? rows.filter((r) => !(r && r.is_demo === true)) : [];
}

/**
 * workOutClientStep — the control panel's step, from the rows above.
 * Returns { extras, open_blockers, fulfillment }. `fulfillment` is null when
 * the work-out could not run; the endpoint then leaves its three keys out.
 */
export async function workOutClientStep(db, { orgId, clientId, rows, inquiryCase }) {
  const client = rows.client;
  const extras = clientDetailExtras({
    client,
    crsResults: rows.crsResults,
    tasks: rows.tasks,
    fundingRounds: rows.fundingRounds,
    invoices: rows.invoices,
    businesses: rows.businesses
  });

  /* FULFILLMENT — what should someone do about this client next.
     READ ONLY, and DELIBERATELY OPTIONAL. Everything below is wrapped so that
     any failure — a derivation error, a table that is not there yet, a
     consent read that times out — returns this endpoint's response EXACTLY as
     it was before this block existed. The three new keys are ABSENT on
     failure, never blank and never a guess, so today's display survives.

     Nearly every signal is already in hand: the client row carries
     custom_fields, tags and outcome_tier; the tasks, rounds and the active
     inquiry case are already loaded; open_blockers comes from
     clientDetailExtras. Only consent, the demo-filtered credit count, the
     identity packet, the dispute rows and the funding card need reading, and
     gatherDetailSignals() does all five in one parallel round.

     consentStatus() is passed in rather than called there so this endpoint
     uses the SAME function src/finance/soft-pulls.mjs:306-314 gates the pull
     on. The screen and the button cannot disagree.

     GATE A, AT THE SOURCE. The endpoint also returns the RAW open_blockers
     array from clientDetailExtras, and the client control panel paints that
     array directly — in the pre-existing Blockers panel, and again in the new
     control block when no derivation arrives. Both printed the task title as
     written, so a client with no recorded permission had one panel saying
     "Funding intake — pull CRS" while the panel below it said "waiting on
     written permission". Relabelling per panel failed three times.

     So the RELABEL HAPPENS HERE, ONCE, on the array the endpoint emits, and
     the derivation is handed the already-safe array. Every consumer — both
     panels, the pipeline lens, and anything built later — gets the safe label
     without having to know it should ask. sanitizeBlockerLabels() is
     idempotent and never throws; its header carries the rule. */
  let fulfillment = null;
  /* Fail closed. Until the consent read comes back, this client's written
     permission is UNCHECKED, so anything failing below still ships the safe
     label rather than the raw one. */
  let open_blockers = sanitizeBlockerLabels(extras.open_blockers, { consentValid: null });
  try {
    const gathered = await gatherDetailSignals(db, { orgId, clientId, consentStatus });
    /* true / false / null, where null means the consent read failed. Same
       three-state rule the derivation applies to this signal: anything that
       is not the shape consentStatus() returns is "we did not ask", not "no". */
    const consentValid =
      gathered && gathered.consent && typeof gathered.consent.valid === "boolean"
        ? gathered.consent.valid
        : null;
    open_blockers = sanitizeBlockerLabels(extras.open_blockers, { consentValid });
    fulfillment = deriveNextAction({
      ...gathered,
      custom_fields:  client.custom_fields,
      tags:           client.tags,
      outcome_tier:   client.outcome_tier,
      // getActiveCaseForClient already returns ACTIVE cases only.
      inquiry_cases:  inquiryCase ? [inquiryCase] : [],
      /* DEMO ROWS NEVER DRIVE A DERIVED ANSWER.
         The list path already excludes them in SQL (src/fulfillment/read-signals.mjs,
         OPEN_TASKS_SQL and ROUNDS_SQL). These two reads are pre-existing and feed
         the rest of the page, so they are left exactly as they are and the demo
         rows are dropped here instead — an adversary found a real client carrying a
         demo funding round, and the new block printed "Approved $99,999" for it while
         the lens correctly showed nothing. Filtered here, both surfaces agree. */
      tasks:          realOnly(rows.tasks),
      funding_rounds: realOnly(rows.fundingRounds),
      open_blockers
    });
  } catch (err) {
    console.warn("[fulfillment] next action unavailable for client detail:", err && err.message);
    fulfillment = null;
  }

  return { extras, open_blockers, fulfillment };
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * shownStepLabel — the words the control panel's big "next step" line shows
 * for this client right now, or null.
 *
 * null means "do not save anything new": the file is not found, a read
 * failed, the answer came back degraded (the screen then says "Not worked out
 * yet."), or no step applies. The caller keeps what it had — a blank is never
 * saved.
 *
 * `customFieldsPatch`, when given, is laid over the client's saved fields
 * first — the same top-level merge `custom_fields || patch` does — so a job
 * that saves a hold reason and a next step together gets the step that hold
 * produces.
 *
 * Never throws.
 */
export async function shownStepLabel(db, clientId, { customFieldsPatch } = {}) {
  try {
    if (!db || typeof db.query !== "function" || !clientId) return null;
    const orgRes = await db.query(`SELECT org_id FROM clients WHERE id = $1 LIMIT 1`, [clientId]);
    const orgId = orgRes && orgRes.rows && orgRes.rows[0] ? orgRes.rows[0].org_id : null;
    if (!orgId) return null;

    const rows = await readClientStepRows(db, { orgId, clientId });
    if (!rows.client) return null;
    if (isPlainObject(customFieldsPatch)) {
      const saved = isPlainObject(rows.client.custom_fields) ? rows.client.custom_fields : {};
      rows.client = { ...rows.client, custom_fields: { ...saved, ...customFieldsPatch } };
    }

    const inquiryCase = await readActiveInquiryCase(db, { orgId, clientId });
    const { fulfillment } = await workOutClientStep(db, { orgId, clientId, rows, inquiryCase });
    if (!fulfillment || fulfillment.degraded === true || !fulfillment.next_action) return null;
    const label = fulfillment.next_action.label;
    if (typeof label !== "string" || label.trim() === "") return null;
    return label.trim();
  } catch (err) {
    console.warn("[fulfillment] shown step unavailable:", err && err.message);
    return null;
  }
}
