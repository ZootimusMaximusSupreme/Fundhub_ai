import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SWEEP_CRON,
  SOURCE_WORKFLOW,
  closeAnsweredWaits,
  orgsWithDueReads,
  readerAnswered,
  retryOne,
  sweep
} from "./doc-check-retry-sweeper.mjs";
import { WAITING_TASK_TITLE_PREFIX } from "../handlers/doc-check.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

/* A fake failed_events table, close enough to answer the four queries this
   sweeper and dead-letter make of it. Everything it is asked is recorded, so a
   test can assert on WHICH rows were claimed as well as what happened to them. */
function fakeQueue(rows, tasks = []) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const seen = { dueArgs: [], resolved: [], rescheduled: [], waitCloses: [] };
  const db = {
    async query(sql, params = []) {
      // closeAnsweredWaits: an open doc-check task with the waiting title whose
      // body names a document the reader has now answered for.
      if (/UPDATE tasks t/.test(sql) && /FROM failed_events f/.test(sql)) {
        seen.waitCloses.push({ sql, params });
        const prefix = String(params[2]).replace(/%$/, "");
        const answered = [...store.values()].filter((r) =>
          r.handler_name === params[0] && r.status === "resolved" && r.payload?.document_id);
        const closed = [];
        for (const t of tasks) {
          if (t.done || t.source_workflow !== params[1] || !t.title.startsWith(prefix)) continue;
          const hit = answered.some((r) => r.org_id === t.org_id && r.client_id === t.client_id
            && t.body.includes(`Document: ${r.payload.document_id}`));
          if (hit) { t.done = true; closed.push({ id: t.id }); }
        }
        return { rows: closed };
      }
      if (/SELECT DISTINCT org_id/.test(sql)) {
        const orgs = [...new Set([...store.values()]
          .filter((r) => r.status === "pending" && r.handler_name === params[0])
          .map((r) => r.org_id))];
        return { rows: orgs.map((org_id) => ({ org_id })) };
      }
      if (/FROM failed_events/.test(sql) && /status = 'pending'/.test(sql) && /SELECT id, event_id/.test(sql)) {
        seen.dueArgs.push({ orgId: params[0], limit: params[2], handler: params[3] });
        const out = [...store.values()].filter((r) =>
          r.org_id === params[0] && r.status === "pending"
          && (params[3] == null || r.handler_name === params[3]));
        return { rows: out };
      }
      if (/SET status = 'resolved'/.test(sql)) {
        const r = store.get(params[0]);
        if (r) { r.status = "resolved"; seen.resolved.push({ id: params[0], note: params[3] }); }
        return { rows: r ? [{ id: r.id, status: "resolved" }] : [] };
      }
      if (/SELECT attempts, max_attempts/.test(sql)) {
        const r = store.get(params[0]);
        return { rows: r ? [{ attempts: r.attempts, max_attempts: r.max_attempts }] : [] };
      }
      if (/UPDATE failed_events/.test(sql) && /SET attempts = \$2/.test(sql)) {
        const r = store.get(params[0]);
        if (r) { r.attempts = params[1]; r.status = params[2]; }
        seen.rescheduled.push({ id: params[0], attempts: params[1], status: params[2], error: params[5] });
        return { rows: [{ id: params[0], attempts: params[1], status: params[2], next_attempt_at: params[3] }] };
      }
      return { rows: [] };
    }
  };
  return { db, store, seen };
}

function queuedRow(over = {}) {
  return {
    id: "fe-1",
    org_id: ORG,
    event_id: "evt-doc-1",
    event_name: "docs.received",
    event_version: 1,
    client_id: CLIENT,
    payload: { kind: "client_upload", subtype: "id_document", document_id: "doc-429" },
    handler_name: "doc-check",
    status: "pending",
    attempts: 1,
    max_attempts: 12,
    ...over
  };
}

test("the sweeper is on a clock, and the clock is named", () => {
  assert.match(SWEEP_CRON, /^\*\/\d+ \* \* \* \*$/);
  assert.equal(SOURCE_WORKFLOW, "doc-check-retry-sweeper");
});

test("any verdict counts as read — request_more is the reader working, not failing", () => {
  assert.equal(readerAnswered({ done: true, json: { outcome: "accept" } }), true);
  assert.equal(readerAnswered({ done: true, json: { outcome: "request_more" } }), true);
  assert.equal(readerAnswered({ done: true, json: { outcome: "hold" } }), true);
  assert.equal(readerAnswered({ done: true, json: null }), false);
  assert.equal(readerAnswered({ done: false, reason: "doc_check_retired" }), false);
  assert.equal(readerAnswered(null), false);
});

test("credit arrives, the document is read, and nobody had to touch anything", async () => {
  const { db, store, seen } = fakeQueue([queuedRow()]);
  const read = [];
  const out = await sweep(db, {
    runImpl: async (_db, event) => {
      read.push(event);
      return { done: true, json: { outcome: "accept" }, routed: true };
    }
  });
  assert.equal(out.ok, true);
  assert.equal(out.attempted, 1);
  assert.equal(out.resolved, 1);
  assert.equal(out.rescheduled, 0);
  assert.equal(store.get("fe-1").status, "resolved");

  // The reader is handed the ORIGINAL upload, marked as a retry.
  assert.equal(read[0].payload.document_id, "doc-429");
  assert.equal(read[0].clientId, CLIENT);
  assert.equal(read[0].isRetry, true);
  assert.match(seen.resolved[0].note, /accept/);
});

test("still no credit: the row waits longer instead of being thrown away", async () => {
  const { db, store, seen } = fakeQueue([queuedRow()]);
  const out = await sweep(db, {
    runImpl: async () => ({
      done: true, json: null, routed: false,
      route: { reason: "reader_unavailable_queued", failure: "no_credit" }
    })
  });
  assert.equal(out.resolved, 0);
  assert.equal(out.rescheduled, 1);
  assert.equal(store.get("fe-1").status, "pending", "it stays claimable by a later pass");
  assert.equal(store.get("fe-1").attempts, 2);
  assert.match(seen.rescheduled[0].error, /no_credit/);
});

test("it only ever claims its own handler's rows", async () => {
  /* failed_events holds 28 pending rows from money and survey handlers that
     have never been retried by anything (measured on production, 2026-09-17).
     Replaying those is a separate and far larger decision. */
  const { db, seen } = fakeQueue([
    queuedRow(),
    queuedRow({ id: "fe-2", handler_name: "onDepositPaidMoney", payload: { amount: 250000 } })
  ]);
  const read = [];
  const out = await sweep(db, {
    runImpl: async (_db, event) => { read.push(event); return { done: true, json: { outcome: "accept" } }; }
  });
  assert.equal(out.attempted, 1, "the money handler's row must not be picked up");
  assert.equal(seen.dueArgs[0].handler, "doc-check");
  assert.equal(read.length, 1);
  assert.equal(read[0].payload.document_id, "doc-429");
});

test("out of attempts: it stops and puts a person's name on it", async () => {
  const { db, store } = fakeQueue([queuedRow({ attempts: 11, max_attempts: 12 })]);
  const tasks = [];
  const out = await sweep(db, {
    runImpl: async () => ({ done: true, json: null, route: { failure: "no_credit" } }),
    taskImpl: async (_db, spec) => { tasks.push(spec); return { created: true }; }
  });
  assert.equal(out.exhausted, 1);
  assert.equal(store.get("fe-1").status, "exhausted");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].documentId, "doc-429");
  assert.equal(tasks[0].docType, "id_document");
  assert.match(tasks[0].why, /check it by hand/i);
});

test("a reader that throws is a reschedule, never a lost document", async () => {
  const { db, store } = fakeQueue([queuedRow()]);
  const out = await sweep(db, {
    runImpl: async () => { throw new Error("storage unavailable"); }
  });
  assert.equal(out.ok, true, "one bad document must not take the pass down");
  assert.equal(out.rescheduled, 1);
  assert.equal(store.get("fe-1").status, "pending");
});

test("a pass that cannot read the queue at all returns the error rather than throwing", async () => {
  const db = { async query() { throw new Error("connection terminated"); } };
  const out = await sweep(db);
  assert.equal(out.ok, false);
  assert.equal(out.attempted, 0);
  assert.match(out.error, /connection terminated/);
});

test("nothing due is a quiet pass, not an error", async () => {
  const { db } = fakeQueue([queuedRow({ status: "resolved" })]);
  const out = await sweep(db, { runImpl: async () => { throw new Error("must not run"); } });
  assert.equal(out.ok, true);
  assert.equal(out.orgs, 0);
  assert.equal(out.attempted, 0);
});

test("orgsWithDueReads asks only for this handler's pending rows", async () => {
  const asked = [];
  const db = { async query(sql, params) { asked.push({ sql, params }); return { rows: [{ org_id: ORG }] }; } };
  const orgs = await orgsWithDueReads(db, { now: new Date("2026-09-17T20:00:00Z") });
  assert.deepEqual(orgs, [ORG]);
  assert.equal(asked[0].params[0], "doc-check");
  assert.match(asked[0].sql, /status = 'pending'/);
});

test("retryOne reports the verdict it got back", async () => {
  const { db } = fakeQueue([queuedRow()]);
  const res = await retryOne(db, queuedRow(), {
    runImpl: async () => ({ done: true, json: { outcome: "request_more" } })
  });
  assert.equal(res.outcome, "resolved");
  assert.equal(res.verdict, "request_more");
});

/* HOLE N4, measured on live 2026-09-18: the sweeper read all three of #9's
   queued documents at 17:20 UTC and resolved their queue rows, but the three
   "Waiting on the document reader — … has not been read yet" tasks stayed open,
   so the control panel went on saying the ID was unread after it had been read. */
function waitingTask(over = {}) {
  return {
    id: "t-wait",
    org_id: ORG,
    client_id: CLIENT,
    source_workflow: "doc-check",
    done: false,
    title: `${WAITING_TASK_TITLE_PREFIX} — this id document has not been read yet`,
    body: "A id document was uploaded and the document reader has no credit left on the AI account, "
      + "so it could not read it. Open the file, confirm it belongs to this client, and confirm it is readable. "
      + "Document: doc-429",
    ...over
  };
}

test("the reader answers, and its 'waiting on the reader' job closes in the same pass", async () => {
  const tasks = [
    waitingTask(),
    // Same document, but a person was asked to check it by hand — not ours to close.
    waitingTask({ id: "t-hand", title: "Check this id document by hand — nobody has read it" }),
    // Another document whose read is still queued — still genuinely waiting.
    waitingTask({ id: "t-other-doc", body: "… Document: doc-still-queued" }),
    // The same document id on another client's file — never touched.
    waitingTask({ id: "t-other-client", client_id: "33333333-3333-4333-8333-333333333333" })
  ];
  const { db } = fakeQueue([
    queuedRow(),
    queuedRow({ id: "fe-2", event_id: "evt-doc-2", payload: { subtype: "id_document", document_id: "doc-still-queued" } })
  ], tasks);
  const out = await sweep(db, {
    runImpl: async (_db, event) => (event.payload.document_id === "doc-429"
      ? { done: true, json: { outcome: "accept" } }
      : { done: true, json: null, route: { failure: "no_credit" } })
  });
  assert.equal(out.resolved, 1);
  assert.equal(out.rescheduled, 1);
  assert.equal(out.waitsClosed, 1);
  const done = Object.fromEntries(tasks.map((t) => [t.id, t.done]));
  assert.deepEqual(done, { "t-wait": true, "t-hand": false, "t-other-doc": false, "t-other-client": false });
});

test("a document read before this existed loses its stale waiting job on the next quiet pass", async () => {
  // Exactly #9 on live: the rows are already resolved, nothing is due.
  const tasks = [waitingTask()];
  const { db } = fakeQueue([queuedRow({ status: "resolved" })], tasks);
  const out = await sweep(db, { runImpl: async () => { throw new Error("must not run"); } });
  assert.equal(out.ok, true);
  assert.equal(out.attempted, 0);
  assert.equal(out.waitsClosed, 1);
  assert.equal(tasks[0].done, true);
});

test("a read still waiting keeps its waiting job open", async () => {
  const tasks = [waitingTask()];
  const { db } = fakeQueue([queuedRow()], tasks);
  const out = await sweep(db, {
    runImpl: async () => ({ done: true, json: null, route: { failure: "no_credit" } })
  });
  assert.equal(out.rescheduled, 1);
  assert.equal(out.waitsClosed, 0);
  assert.equal(tasks[0].done, false, "the reader has not answered, so the wait is real");
});

test("closeAnsweredWaits asks only for open doc-check waiting jobs of answered documents", async () => {
  const asked = [];
  const db = { async query(sql, params) { asked.push({ sql, params }); return { rows: [{ id: "t-1" }] }; } };
  const res = await closeAnsweredWaits(db);
  assert.equal(res.closed, 1);
  assert.deepEqual(asked[0].params, ["doc-check", "doc-check", `${WAITING_TASK_TITLE_PREFIX}%`]);
  assert.match(asked[0].sql, /f\.status = 'resolved'/);
  assert.match(asked[0].sql, /t\.done = false/);
  assert.match(asked[0].sql, /t\.org_id = f\.org_id/);
  assert.match(asked[0].sql, /t\.client_id = f\.client_id/);
  assert.match(asked[0].sql, /'Document: ' \|\| \(f\.payload->>'document_id'\)/);
  assert.doesNotMatch(asked[0].sql, /DELETE/i, "a job is closed, never removed");
});

test("closeAnsweredWaits never throws — a failed close must not take the pass down", async () => {
  const db = { async query() { throw new Error("relation \"tasks\" is locked"); } };
  const res = await closeAnsweredWaits(db);
  assert.equal(res.closed, 0);
  assert.match(res.error, /locked/);
});
