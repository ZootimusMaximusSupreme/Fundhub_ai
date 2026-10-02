// Portal 8-tick bar facts. Words stay in public/app/client-portal.html.
//
// Booked is a real booking (row / booking.created / sales stage booked), never
// "they opened the portal". Diagnostic Paid is the diagnostic / assessment pay
// only — diagnostic.paid, a diagnostic payment link, sales.diagnostic_paid, or
// a named assessment product. Any other succeeded payment (deposit, package,
// SLO, success fee) does not light it.

export const EMPTY_STEPPER = Object.freeze({
  kind: "funding",
  booked: false,
  diagnostic_paid: false,
  docs_received: false,
  round_started: false,
  round_submitted: false,
  round_approved: false,
  round_funded: false,
  file_finalized: false,
  letter_round: false,
  ready_to_send: false
});

const FUNDING_ROUND_STARTED = new Set([
  "open", "started", "in_progress", "submitted", "approved", "funded", "closed"
]);
const FUNDING_ROUND_SUBMITTED = new Set(["submitted", "approved", "funded", "closed"]);
const FUNDING_ROUND_APPROVED = new Set(["approved", "funded", "closed"]);
const FUNDING_STAGE_STARTED = new Set([
  "apply_now", "round_submitted", "approved", "action_required", "funded", "closed"
]);
const FUNDING_STAGE_SUBMITTED = new Set([
  "round_submitted", "approved", "action_required", "funded", "closed"
]);
const FUNDING_STAGE_APPROVED = new Set(["approved", "action_required", "funded", "closed"]);
const REPAIR_LETTER = new Set([
  "letters_generated", "ready_to_send", "in_transit", "awaiting_response",
  "response_received", "round_complete", "program_complete"
]);
const REPAIR_READY = new Set([
  "ready_to_send", "in_transit", "awaiting_response",
  "response_received", "round_complete", "program_complete"
]);

export function buildPortalStepper(input = {}) {
  const kind = input.kind === "repair" ? "repair" : "funding";
  return {
    kind,
    booked: !!input.booked,
    diagnostic_paid: !!input.diagnostic_paid,
    docs_received: !!input.docs_received,
    round_started: !!input.round_started,
    round_submitted: !!input.round_submitted,
    round_approved: !!input.round_approved,
    round_funded: !!input.round_funded,
    file_finalized: !!input.file_finalized,
    letter_round: !!input.letter_round,
    ready_to_send: !!input.ready_to_send
  };
}

export async function readPortalStepper(db, { orgId, clientId, repairPath } = {}) {
  if (!db?.query || !orgId || !clientId) return { ...EMPTY_STEPPER };

  try {
    const r = await db.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM bookings
            WHERE org_id = $1 AND client_id = $2
              AND lower(coalesce(status, '')) IN ('booked','rescheduled','completed','confirmed')
         ) AS booked_row,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'booking.created'
         ) AS booked_event,
         EXISTS (
           SELECT 1 FROM cards c
           JOIN pipelines p ON p.id = c.pipeline_id
           JOIN pipeline_stages ps ON ps.id = c.stage_id
           WHERE c.org_id = $1 AND c.client_id = $2
             AND p.key = 'sales' AND ps.key = 'booked'
         ) AS sales_booked,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'diagnostic.paid'
         ) AS diagnostic_event,
         EXISTS (
           SELECT 1 FROM cards c
           JOIN pipelines p ON p.id = c.pipeline_id
           JOIN pipeline_stages ps ON ps.id = c.stage_id
           WHERE c.org_id = $1 AND c.client_id = $2
             AND p.key = 'sales' AND ps.key = 'diagnostic_paid'
         ) AS sales_diagnostic,
         EXISTS (
           SELECT 1 FROM payment_links
            WHERE org_id = $1 AND client_id = $2
              AND lower(purpose) = 'diagnostic'
              AND (status = 'paid' OR paid_at IS NOT NULL)
         ) AS diagnostic_link,
         EXISTS (
           SELECT 1 FROM transactions
            WHERE org_id = $1 AND client_id = $2
              AND status = 'succeeded'
              AND is_demo IS NOT TRUE
              AND (
                lower(coalesce(product_name, '')) LIKE '%business financial assessment%'
                OR lower(coalesce(product_name, '')) LIKE '%consulting services assessment%'
                OR lower(coalesce(product_name, '')) LIKE '%diagnostic%'
              )
         ) AS diagnostic_named_tx,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2
              AND name IN ('docs.received', 'repair.docs.complete')
         ) AS docs_event,
         EXISTS (
           SELECT 1 FROM documents
            WHERE org_id = $1 AND client_id = $2 AND kind = 'client_upload'
         ) AS docs_upload,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'round.started'
         ) AS round_started_event,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'round.submitted'
         ) AS round_submitted_event,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'round.approved'
         ) AS round_approved_event,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'round.funded'
         ) AS round_funded_event,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2 AND name = 'round.closeout'
         ) AS round_closeout_event,
         (
           SELECT fr.status FROM funding_rounds fr
            WHERE fr.org_id = $1 AND fr.client_id = $2
              AND coalesce(fr.is_demo, false) IS NOT TRUE
            ORDER BY fr.round_number DESC
            LIMIT 1
         ) AS funding_round_status,
         (
           SELECT fr.funded_amount FROM funding_rounds fr
            WHERE fr.org_id = $1 AND fr.client_id = $2
              AND coalesce(fr.is_demo, false) IS NOT TRUE
            ORDER BY fr.round_number DESC
            LIMIT 1
         ) AS funding_funded_amount,
         (
           SELECT ps.key FROM cards c
           JOIN pipelines p ON p.id = c.pipeline_id
           JOIN pipeline_stages ps ON ps.id = c.stage_id
           WHERE c.org_id = $1 AND c.client_id = $2 AND p.key = 'funding_card_stacking'
           LIMIT 1
         ) AS funding_stage,
         (
           SELECT ps.key FROM cards c
           JOIN pipelines p ON p.id = c.pipeline_id
           JOIN pipeline_stages ps ON ps.id = c.stage_id
           WHERE c.org_id = $1 AND c.client_id = $2 AND p.key = 'optimization'
           LIMIT 1
         ) AS repair_stage,
         EXISTS (
           SELECT 1 FROM v_client_entitlements e
            WHERE e.org_id = $1 AND e.client_id = $2
              AND e.entitlement_code = 'funding-snapshot'
              AND e.active
         ) AS funding_entitlement,
         EXISTS (
           SELECT 1 FROM dispute_cases
            WHERE org_id = $1 AND client_id = $2
              AND status NOT IN ('closed', 'cancelled')
         ) AS dispute_open,
         EXISTS (
           SELECT 1 FROM events
            WHERE org_id = $1 AND client_id = $2
              AND name IN ('repair.letters.ready', 'repair.round.complete')
         ) AS repair_letter_event`,
      [orgId, clientId]
    );

    const row = r.rows[0] || {};
    const roundStatus = String(row.funding_round_status || "").toLowerCase();
    const fundingStage = String(row.funding_stage || "").toLowerCase();
    const repairStage = String(row.repair_stage || "").toLowerCase();
    const fundedAmt = Number(row.funding_funded_amount);
    const hasFundingWork = !!(
      row.funding_entitlement
      || row.funding_round_status
      || row.funding_stage
    );

    const kind = hasFundingWork ? "funding" : (repairPath ? "repair" : "funding");

    return buildPortalStepper({
      kind,
      booked: !!(row.booked_row || row.booked_event || row.sales_booked),
      diagnostic_paid: !!(
        row.diagnostic_event
        || row.sales_diagnostic
        || row.diagnostic_link
        || row.diagnostic_named_tx
      ),
      docs_received: !!(row.docs_event || row.docs_upload),
      round_started: !!(
        row.round_started_event
        || FUNDING_ROUND_STARTED.has(roundStatus)
        || FUNDING_STAGE_STARTED.has(fundingStage)
      ),
      round_submitted: !!(
        row.round_submitted_event
        || FUNDING_ROUND_SUBMITTED.has(roundStatus)
        || FUNDING_STAGE_SUBMITTED.has(fundingStage)
      ),
      round_approved: !!(
        row.round_approved_event
        || FUNDING_ROUND_APPROVED.has(roundStatus)
        || FUNDING_STAGE_APPROVED.has(fundingStage)
      ),
      round_funded: !!(
        row.round_funded_event
        || roundStatus === "funded"
        || fundingStage === "funded"
        || (Number.isFinite(fundedAmt) && fundedAmt > 0)
      ),
      file_finalized: kind === "repair"
        ? repairStage === "program_complete"
        : !!(
          row.round_closeout_event
          || fundingStage === "closed"
          || roundStatus === "closed"
        ),
      letter_round: !!(
        row.dispute_open
        || row.repair_letter_event
        || REPAIR_LETTER.has(repairStage)
      ),
      ready_to_send: !!(
        row.repair_letter_event
        || REPAIR_READY.has(repairStage)
      )
    });
  } catch (err) {
    console.warn("[portal-summary] stepper read failed:", err && err.message);
    return { ...EMPTY_STEPPER };
  }
}
