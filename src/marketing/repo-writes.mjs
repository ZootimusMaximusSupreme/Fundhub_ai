// enqueueRepoWrite — the ONE call site for "commit this file to the repo through
// the outbox" (spec §6 step 2). Saving an offer card commits marketing/offers/<tag>.md.
//
// This is the real hookup of the outbox (src/repo/outbox.mjs, M0 step 2) to the
// marketing handlers. Every marketing/* handler imports it from this file and takes
// it as `deps.enqueueRepoWrite` in tests, so no handler changed when it went real.
//
//   enqueueRepoWrite(tx, { orgId, staffId, path, content, message })
//     tx      the open transaction, so the outbox row commits or rolls back with the save
//     path    repo-relative path, e.g. "marketing/offers/slo.md"; the allow-list
//             (src/repo/allow-list.mjs) refuses anything outside the marketing folders
//     content the whole file (mode 'replace': the machine owns it)
//     staffId, message  kept in the signature; the outbox writes its own commit
//             message and author ("Fundhub app", `app:` ... `[skip ci]`)
//   -> { queued: true, id, duplicate, path }
//
// THE WAKE. After the row is written the worker is woken so the commit does not
// wait for the clock. The wake happens before the caller's transaction commits,
// and it takes a network round trip first, so the worker starts after the commit
// in practice. If it ever starts too soon the row is still there for the next
// drain (the worker drains once a minute while it runs, the clock wakes it every
// 15 minutes while the machine is on). A failed wake never fails the save.

import { randomUUID } from "node:crypto";
import { enqueueRepoWrite as enqueueOutbox } from "../repo/outbox.mjs";
import { wakeWorker } from "./wake.mjs";

// eslint-disable-next-line no-unused-vars
export async function enqueueRepoWrite(tx, { orgId, staffId, path, content, message }, { wake = wakeWorker } = {}) {
  // A fresh op id per save: the outbox drops a repeated (org, op id), and two
  // different saves of the same file must both land. Retries of one request are
  // already stopped by marketing_requests.
  const row = await enqueueOutbox(tx, { orgId, opId: `save:${randomUUID()}`, path, mode: "replace", content });
  try {
    await wake();
  } catch (err) {
    console.error(`[marketing] could not wake the worker: ${String((err && err.message) || err)}`);
  }
  return { queued: true, id: row.id, duplicate: row.duplicate, path };
}

export default enqueueRepoWrite;
