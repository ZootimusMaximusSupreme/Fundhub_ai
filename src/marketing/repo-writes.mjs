// enqueueRepoWrite — the ONE call site for "commit this file to the repo through
// the outbox" (spec §6 step 2). Saving an offer card commits marketing/offers/<tag>.md.
//
// PENDING HOOKUP. The outbox is M0 step 2, built in parallel and not on main when
// this step landed, so this is a stub: it records nothing and returns
// { queued: false, pending: "outbox" }. No outbox table is invented here.
//
// When M0 step 2 merges, replace the body of this function (and nothing else) with
// the real enqueue. Every marketing/* handler imports it from this file and takes
// it as `deps.enqueueRepoWrite` in tests, so swapping it touches no handler.
//
//   enqueueRepoWrite(tx, { orgId, staffId, path, content, message })
//     tx      the open transaction, so a real outbox row can commit with the save
//     path    repo-relative path, e.g. "marketing/offers/slo.md"
//     content the whole file
//     message the commit message
//   -> { queued: boolean, pending?: "outbox", path }

export const REPO_WRITE_PENDING = "outbox";

// eslint-disable-next-line no-unused-vars
export async function enqueueRepoWrite(tx, { orgId, staffId, path, content, message }) {
  return { queued: false, pending: REPO_WRITE_PENDING, path };
}

export default enqueueRepoWrite;
