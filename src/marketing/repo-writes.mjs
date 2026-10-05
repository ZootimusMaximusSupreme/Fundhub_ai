// enqueueRepoWrite — the ONE call site for "commit this file to the repo through
// the outbox" (spec §6 step 2). Saving an offer card commits marketing/offers/<tag>.md.
//
// This is the real hookup of the outbox (src/repo/outbox.mjs, M0 step 2) to the
// marketing handlers. Every marketing/* handler imports it from this file and takes
// it as `deps.enqueueRepoWrite` in tests.
//
//   enqueueRepoWrite(tx, { orgId, staffId, path, content, message })
//     tx      the open transaction, so the outbox row commits or rolls back with the save
//     path    repo-relative path, e.g. "marketing/offers/slo.md"; the allow-list
//             (src/repo/allow-list.mjs) refuses anything outside the marketing folders
//     content the whole file (mode 'replace': the machine owns it)
//     staffId, message  kept in the signature; the outbox writes its own commit
//             message and author ("Fundhub app", `app:` ... `[skip ci]`)
//   -> { queued: true, id, duplicate, path }   (the caller then calls wakeAfterCommit)
//
// THE WAKE. This function does NOT wake the worker: it runs inside the caller's
// transaction, and a worker woken before the commit could look for a row that is
// not there yet. The handler calls wakeAfterCommit() once the transaction has
// committed. A failed wake never fails the save, and the clock still wakes the
// worker when rows wait.

import { randomUUID } from "node:crypto";
import { enqueueRepoWrite as enqueueOutbox } from "../repo/outbox.mjs";
import { wakeWorker } from "./wake.mjs";

/** Call this AFTER the save's transaction has committed. Never throws. */
export async function wakeAfterCommit(wake = wakeWorker) {
  try {
    const r = await wake();
    if (r && r.error) console.error(`[marketing] could not wake the worker: ${r.error}`);
  } catch (err) {
    console.error(`[marketing] could not wake the worker: ${String((err && err.message) || err)}`);
  }
}

// eslint-disable-next-line no-unused-vars
export async function enqueueRepoWrite(tx, { orgId, staffId, path, content, message }) {
  // A fresh op id per save: the outbox drops a repeated (org, op id), and two
  // different saves of the same file must both land. Retries of one request are
  // already stopped by marketing_requests.
  const row = await enqueueOutbox(tx, { orgId, opId: `save:${randomUUID()}`, path, mode: "replace", content });
  return { queued: true, id: row.id, duplicate: row.duplicate, path };
}

export default enqueueRepoWrite;
