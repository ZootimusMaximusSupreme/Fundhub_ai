// Capital Blueprint — Next Funding Sequence (staff-set ready date → closer task).

import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { createTask } from "../lib/create-task.mjs";
import { isCapitalBlueprintBuyer } from "./coach-exception.mjs";

export const NEXT_SEQUENCE_READY_DATE_KEY = "blueprint_next_sequence_ready_date";

export const SOURCE_WORKFLOW = "blueprint-next-funding-sequence";
export const SWEEP_CRON = "30 6 * * *"; // daily, after finance-os-pull sweeper

/** Parse YYYY-MM-DD; invalid → null. */
export function parseReadyDate(value) {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/** Staff sets the date the file is ready for the next sequence of rounds. */
export async function setNextFundingSequenceReadyDate(db, {
  orgId,
  clientId,
  readyDate
} = {}) {
  if (!orgId || !clientId) return { ok: false, error: "missing_ids" };
  const parsed = parseReadyDate(readyDate);
  if (!parsed) return { ok: false, error: "invalid_ready_date" };
  const blueprint = await isCapitalBlueprintBuyer(db, { orgId, clientId });
  if (!blueprint) return { ok: false, error: "not_blueprint_buyer" };
  await mergeCustomFields(db, clientId, { [NEXT_SEQUENCE_READY_DATE_KEY]: parsed });
  return { ok: true, readyDate: parsed };
}

/** Clients whose ready date is today or earlier (UTC calendar day). */
export async function dueForNextSequenceAlert(db, { today = new Date() } = {}) {
  const day = today.toISOString().slice(0, 10);
  const r = await db.query(
    `SELECT c.id AS client_id, c.org_id,
            c.custom_fields->>$2 AS ready_date
       FROM clients c
      WHERE c.custom_fields->>$2 IS NOT NULL
        AND btrim(c.custom_fields->>$2) <> ''
        AND (c.custom_fields->>$2)::date <= $1::date`,
    [day, NEXT_SEQUENCE_READY_DATE_KEY]
  );
  return r.rows;
}

export async function createNextSequenceCloserTask(db, {
  orgId,
  clientId,
  readyDate,
  now = new Date()
} = {}) {
  if (!orgId || !clientId || !readyDate) {
    return { created: false, reason: "missing_args" };
  }
  const blueprint = await isCapitalBlueprintBuyer(db, { orgId, clientId });
  if (!blueprint) return { created: false, reason: "not_blueprint_buyer" };

  const eventId = `blueprint-next-sequence:${clientId}:${readyDate}`;
  return createTask(db, {
    orgId,
    clientId,
    title: "Next Funding Sequence — file ready, close the next round",
    sourceWorkflow: SOURCE_WORKFLOW,
    assigneeRole: "closer",
    eventId,
    body: { readyDate, alertedAt: now.toISOString() }
  });
}

/** One pass: alert closers for every due Blueprint client. Never throws whole pass. */
export async function sweep(db, { now = new Date() } = {}) {
  const tally = { checked: 0, created: 0, skipped: [], errored: [] };
  const rows = await dueForNextSequenceAlert(db, { today: now });
  tally.checked = rows.length;

  for (const row of rows) {
    try {
      const out = await createNextSequenceCloserTask(db, {
        orgId: row.org_id,
        clientId: row.client_id,
        readyDate: row.ready_date,
        now
      });
      if (out.created) tally.created += 1;
      else tally.skipped.push({ clientId: row.client_id, reason: out.reason || "not_created" });
    } catch (e) {
      tally.errored.push({ clientId: row.client_id, error: e?.message || String(e) });
    }
  }
  return tally;
}
