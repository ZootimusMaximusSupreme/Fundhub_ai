// The document-reader retry sweeper — the clock that comes back for a document
// the reader could not read yet.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. MEASURED 2026-09-16 ON THE LIVE WALK.
//
// Eight client documents were uploaded and read by nobody. Every single call to
// the reader came back:
//
//     openai 429: {"error":{"message":"You have no credits remaining …"}}
//
// The AI account was dry. That is a billing state, not a verdict on anybody's
// driving licence — but src/handlers/doc-check.mjs treated it exactly like "the
// model looked and said nothing": it raised one task for a person and returned
// done. The Inngest run went green. Nothing anywhere held a note saying "come
// back to this file". So when the account was topped up, nothing happened:
// no upload, no docs.received, no reader, no read.
//
// That froze credit repair, not just document checking. Dispute letters cannot
// be staged until a client's ID has been read, because the letters quote the
// name and address a DOCUMENT proved — never the ones a closer typed, and never
// anything lifted off the credit report (docs/DELIVERABLES-AND-REPAIR-TRUTH.md).
// So a dry wallet on Tuesday stopped every client's letters indefinitely.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT IT DOES, AND THE THREE THINGS IT REFUSES TO DO.
//
// doc-check now puts a temporary reader failure on the dead-letter queue
// (db/migrations/039_failed_events.sql) as a pending row with a next_attempt_at.
// This sweeper claims the due ones and runs the same reader again on the same
// document. Read succeeds — the row is resolved and the client's record moves on
// its own. Read fails again — the row is rescheduled further out. Out of
// attempts — the row is exhausted and a person is asked to look.
//
//   1. IT NEVER INVENTS A READING. It re-runs the reader; it does not supply a
//      name, an address or a date of birth of its own, and a document that is
//      still unread leaves the identity packet exactly as it was. A letter in
//      the wrong name is far worse than a letter that is late.
//
//   2. IT ONLY EVER TOUCHES ITS OWN HANDLER'S ROWS. failed_events has never had
//      a worker: every pending row in it, from every handler, has sat unretried
//      since 2026-08. Draining all of them for the first time would replay money
//      handlers and messaging handlers that have not run in weeks, which is a
//      completely different and much larger decision than fixing the document
//      reader. So due() is called with handler = "doc-check" and this sweeper
//      cannot pick up anything else. Turning on the general case is somebody
//      else's deliberate line.
//
//   3. IT NEVER THROWS. A pass that dies must not take the schedule with it —
//      the next pass is the recovery, and every row it did not finish is still
//      pending and still due.
//
// BACKOFF comes from dead-letter: 1m, 5m, 15m, 1h, 6h, then 24h per attempt.
// doc-check asks for twelve attempts rather than the default seven, which
// reaches roughly nine days. A wallet topped up any time that week heals by
// itself; one still empty after nine days is a business problem and gets a
// person's name on it instead of another silent retry.

import { inngest } from "./client.mjs";
import { db } from "../db.mjs";
import { due, markResolved, reschedule } from "../events/dead-letter.mjs";
import {
  onDocsReceivedDocCheck,
  raiseUncheckedDocumentTask,
  RETRY_HANDLER,
  WAITING_TASK_TITLE_PREFIX,
  WORKFLOW_ID
} from "../handlers/doc-check.mjs";

/* Every twenty minutes. The first retry dead-letter schedules is one minute
   out, so the cadence — not the backoff — is what sets the floor on how fast a
   funded account starts reading again: twenty minutes, worst case. That is well
   inside "nobody had to do anything", and slow enough that a dry account is not
   hammered with a read attempt every tick. */
export const SWEEP_CRON = "*/20 * * * *";

export const SOURCE_WORKFLOW = "doc-check-retry-sweeper";

/* One pass claims at most this many documents. An unbounded drain holds the
   function open for as long as the backlog is long; a backlog too big for one
   pass is worked through in the next one. */
export const DEFAULT_LIMIT = 25;

/* Which companies have a document waiting to be read again. failed_events is
   queried per org by design (it is an org-scoped table under row-level
   security), so the set of orgs comes first and each one is swept in turn. */
export async function orgsWithDueReads(database, { now = new Date() } = {}) {
  const r = await database.query(
    `SELECT DISTINCT org_id
       FROM failed_events
      WHERE status = 'pending'
        AND handler_name = $1
        AND next_attempt_at IS NOT NULL
        AND next_attempt_at <= $2`,
    [RETRY_HANDLER, now]
  );
  return (r.rows || []).map((row) => row.org_id).filter(Boolean);
}

/* Did the reader actually produce a verdict this time?
 *
 * accept, request_more and hold are ALL success here. This sweeper's job is
 * "was the document read", not "was the client approved" — a request_more is the
 * reader working exactly as intended, and retrying it would re-text the client. */
export function readerAnswered(result) {
  return Boolean(result && result.done === true && result.json);
}

/* retryOne — one queued document, one read. Never throws.
 *
 * Returns { id, outcome } where outcome is:
 *   resolved     — the reader answered; the row is closed
 *   rescheduled  — still no answer; the row waits longer
 *   exhausted    — out of attempts; a person has been asked to look */
export async function retryOne(database, row, {
  now = new Date(), runImpl = onDocsReceivedDocCheck, taskImpl = raiseUncheckedDocumentTask
} = {}) {
  const event = {
    id: row.event_id,
    name: row.event_name || "docs.received",
    version: row.event_version || 1,
    orgId: row.org_id,
    clientId: row.client_id,
    payload: row.payload || {},
    // doc-check reads this to record its own agent_runs row rather than
    // colliding with the original run's row on the same event id.
    isRetry: true
  };

  let result = null;
  let threw = null;
  try {
    result = await runImpl(database, event);
  } catch (err) {
    threw = err;
  }

  if (!threw && readerAnswered(result)) {
    await markResolved(database, row.id, {
      note: `read on retry ${row.attempts + 1}: ${result.json.outcome || "answered"}`,
      now
    }).catch(() => null);
    return { id: row.id, outcome: "resolved", verdict: result.json.outcome || null };
  }

  const why = threw
    ? threw
    : { message: `document reader still has no verdict (${result?.route?.failure || result?.reason || "no answer"})` };
  const after = await reschedule(database, row.id, { error: why, now }).catch(() => null);

  if (after && after.status === "exhausted") {
    /* GIVING UP IS SOMETHING SOMEBODY IS TOLD. The task is deduped on the
       original event id, so the one raised when the reader first failed is the
       one that stays — this call is the guarantee that a row which reached this
       point has a person's name on it even if that first task never wrote. */
    await taskImpl(database, {
      orgId: row.org_id,
      clientId: row.client_id,
      documentId: (row.payload && (row.payload.document_id || row.payload.documentId)) || null,
      eventId: row.event_id,
      docType: (row.payload && (row.payload.subtype || row.payload.kind)) || "document",
      why: "the document reader tried repeatedly over several days and never managed to read it. "
        + "Open the file and check it by hand — nothing else is going to"
    }).catch(() => null);
    return { id: row.id, outcome: "exhausted" };
  }

  return { id: row.id, outcome: "rescheduled" };
}

/* closeAnsweredWaits — the reader came back, so stop saying it has not.
 *
 * MEASURED 2026-09-18 on live, file #9 Sim Nine-Repair (hole N4 on
 * docs/workflows/live-prove-2026-09-17-notes.md): this sweeper read all three
 * queued documents at 17:20 UTC — two accepted, one "please retake it" — and
 * resolved their queue rows. The three tasks doc-check raised when it queued
 * them, "Waiting on the document reader — this id document has not been read
 * yet", stayed open. So the Client Control Panel went on telling staff the ID
 * was unread after it had been read, and to anyone looking at the file the
 * retry clock looked as if it had never run.
 *
 * So every pass closes the waiting task of each document whose queue row is
 * resolved. It runs whether or not anything was due, which also heals a task
 * left open by a pass that resolved its row and then died, and the ones left
 * open before this existed.
 *
 * It touches ONLY an open doc-check task whose title is the waiting title and
 * whose body names that exact document. A "check it by hand" task, a hold task
 * and a task for another document are left exactly as they are. It sends
 * nothing and changes nothing a client sees.
 *
 * NEVER THROWS, for the same reason the pass never does. */
export async function closeAnsweredWaits(database) {
  try {
    const r = await database.query(
      `UPDATE tasks t
          SET done = true, updated_at = now()
         FROM failed_events f
        WHERE f.handler_name = $1
          AND f.status = 'resolved'
          AND f.payload->>'document_id' IS NOT NULL
          AND t.org_id = f.org_id
          AND t.client_id = f.client_id
          AND t.source_workflow = $2
          AND t.done = false
          AND t.title LIKE $3
          AND strpos(t.body, 'Document: ' || (f.payload->>'document_id')) > 0
        RETURNING t.id`,
      [RETRY_HANDLER, WORKFLOW_ID, `${WAITING_TASK_TITLE_PREFIX}%`]
    );
    return { closed: (r.rows || []).length };
  } catch (err) {
    return { closed: 0, error: String((err && err.message) || err).slice(0, 300) };
  }
}

/* sweep — one pass over every company. Never throws; the error is returned so a
   caller can log it, exactly as message-dispatch-sweeper does. */
export async function sweep(database, options = {}) {
  const {
    limit = DEFAULT_LIMIT,
    now = new Date(),
    runImpl = onDocsReceivedDocCheck,
    taskImpl = raiseUncheckedDocumentTask
  } = options;
  try {
    const orgs = await orgsWithDueReads(database, { now });
    const results = [];
    for (const orgId of orgs) {
      const rows = await due(database, { orgId, limit, now, handler: RETRY_HANDLER });
      for (const row of rows) {
        results.push(await retryOne(database, { ...row, org_id: orgId }, { now, runImpl, taskImpl }));
      }
    }
    // After the reads, so a document answered in this pass loses its
    // "waiting" task in this same pass.
    const waits = await closeAnsweredWaits(database);
    return {
      ok: true,
      orgs: orgs.length,
      attempted: results.length,
      resolved: results.filter((r) => r.outcome === "resolved").length,
      rescheduled: results.filter((r) => r.outcome === "rescheduled").length,
      exhausted: results.filter((r) => r.outcome === "exhausted").length,
      waitsClosed: waits.closed,
      ...(waits.error ? { waitsError: waits.error } : {}),
      results
    };
  } catch (err) {
    return {
      ok: false,
      orgs: 0,
      attempted: 0,
      resolved: 0,
      rescheduled: 0,
      exhausted: 0,
      waitsClosed: 0,
      results: [],
      error: String((err && err.message) || err).slice(0, 300)
    };
  }
}

/* handle — the shape src/journeys/runner/registry.mjs expects of every
   registered workflow. It is a cron, so no journey will ever reach it and it
   will always appear in the runner's neverFired list; that is the correct
   outcome for a scheduled job, not a coverage hole. */
export async function handle({ db: handleDb, step } = {}) {
  const run = () => sweep(handleDb || db);
  return step && typeof step.run === "function" ? step.run("sweep", run) : run();
}

export const docCheckRetrySweeper = inngest.createFunction(
  { id: "doc-check-retry-sweeper", name: "Document reader retry sweeper" },
  { cron: SWEEP_CRON },
  () => sweep(db)
);

export default sweep;
