// The repo outbox (spec M0 step 2).
//
// Two halves:
//
//   enqueueRepoWrite(client, row)   Called by a save, with the SAME client that
//                                   holds the save's transaction, so the outbox
//                                   row commits or rolls back with the database
//                                   change. It never calls GitHub.
//
//   drainOutbox({ pool, env })      Called by the worker (M0 step 4, not built
//                                   yet) at most once a minute. It takes one
//                                   advisory lock so only one drain runs at a
//                                   time, claims the waiting rows and makes ONE
//                                   commit for all of them:
//                                     1. GET the ref
//                                     2. POST a tree (base_tree + contents inline)
//                                     3. POST the commit, trailer "Outbox: <ids>"
//                                     4. PATCH the ref with force:false
//
// No transaction is held across a GitHub call (§4 trap 3): the claim, the
// release and the "committed" mark are each their own short statement.
//
// WHEN SOMETHING GOES WRONG
//   not a fast forward (409, or 422 "not a fast forward")
//                         re-read the ref, re-apply the edits to the newest
//                         files, try again, up to 3 times in one drain. If it
//                         is still contended the rows wait for the next drain.
//   any other 422 / 4xx   stop. The reason is stored in `error` on the rows and
//                         shows on the health card (outboxHealth). Rows with an
//                         error are skipped until retryBlocked() clears them.
//   network / 5xx / 429   transient. The claim is released and the next drain
//                         tries again; after MAX_TRANSIENT_ATTEMPTS the rows get
//                         an error instead of retrying forever.
//   crash after the push  before committing, the last 20 commits on the branch
//                         are read. Any row id already inside an `Outbox:`
//                         trailer is marked done and not committed again.
//
// The worker hookup (wake the worker after enqueue, call drainOutbox once a
// minute) is PENDING on M0 step 4. Until then nothing calls drainOutbox.

import { randomUUID } from "node:crypto";
import { assertAllowedPath, PathRefused } from "./allow-list.mjs";
import { applyEdit, validateEdit, EditError } from "./edits.mjs";
import {
  repoConfig, getRef, getCommit, recentCommits, createTree, createCommit, updateRef
} from "./github.mjs";
import { readRepoFile } from "./read.mjs";
import { parseRegistry } from "../ads/registry.mjs";

export const DRAIN_LOCK_KEY = 4060002;
export const MAX_ROWS_PER_DRAIN = 50;
export const MAX_FAST_FORWARD_TRIES = 3;
export const MAX_TRANSIENT_ATTEMPTS = 10;
export const RECENT_COMMITS_CHECKED = 20;
export const REGISTRY_PATH = "marketing/ads/registry.json";

// ── writing a row ───────────────────────────────────────────────────────────

/**
 * Write one outbox row inside the caller's transaction.
 *
 * @param client  anything with query(sql, params): the caller's transaction client.
 * @param row     { orgId, opId, path, mode: 'replace'|'edit', content?, edit? }
 * @returns       { id, duplicate }. The same (orgId, opId) twice writes nothing the second time.
 * @throws        PathRefused when the path is outside the allow-list; EditError for a bad edit.
 */
export async function enqueueRepoWrite(client, { orgId, opId, path, mode, content, edit }) {
  if (!orgId) throw new Error("enqueueRepoWrite: orgId is required");
  if (!opId || typeof opId !== "string") throw new Error("enqueueRepoWrite: opId is required");
  const clean = assertAllowedPath(path);
  if (mode === "replace") {
    if (typeof content !== "string") throw new Error("enqueueRepoWrite: replace needs content (a string)");
  } else if (mode === "edit") {
    validateEdit(edit);
  } else {
    throw new Error(`enqueueRepoWrite: mode must be 'replace' or 'edit' (got ${JSON.stringify(mode)})`);
  }
  const ins = await client.query(
    `INSERT INTO repo_outbox (org_id, op_id, path, mode, content, edit)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id, op_id) DO NOTHING
     RETURNING id`,
    [orgId, opId, clean, mode, mode === "replace" ? content : null, mode === "edit" ? JSON.stringify(edit) : null]
  );
  if (ins.rows[0]) return { id: ins.rows[0].id, duplicate: false };
  const existing = await client.query(`SELECT id FROM repo_outbox WHERE org_id=$1 AND op_id=$2`, [orgId, opId]);
  return { id: existing.rows[0]?.id ?? null, duplicate: true };
}

// ── health card ─────────────────────────────────────────────────────────────

/** What the health card shows: how many wait, how many are stuck, and why. */
export async function outboxHealth(client) {
  const r = await client.query(
    `SELECT
       count(*) FILTER (WHERE committed_at IS NULL AND error IS NULL)::int AS waiting,
       count(*) FILTER (WHERE committed_at IS NULL AND error IS NOT NULL)::int AS blocked,
       min(created_at) FILTER (WHERE committed_at IS NULL AND error IS NULL) AS oldest_waiting_at,
       max(committed_at) AS last_committed_at
     FROM repo_outbox`
  );
  const e = await client.query(
    `SELECT path, error, created_at FROM repo_outbox
      WHERE committed_at IS NULL AND error IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`
  );
  return { ...r.rows[0], last_error: e.rows[0] || null };
}

/** Put stuck rows back in the line after the cause is fixed. */
export async function retryBlocked(client, { ids } = {}) {
  const r = await client.query(
    `UPDATE repo_outbox SET error=NULL, attempts=0, claimed_at=NULL, claim_id=NULL
      WHERE committed_at IS NULL AND error IS NOT NULL AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
      RETURNING id`,
    [ids && ids.length ? ids : null]
  );
  return r.rowCount;
}

// ── trailers ────────────────────────────────────────────────────────────────

/** Row ids named in `Outbox:` trailers of a commit message. */
export function outboxIdsInMessage(message) {
  const ids = [];
  for (const line of String(message || "").split(/\r?\n/)) {
    const m = /^Outbox:\s*(.+)$/i.exec(line.trim());
    if (m) ids.push(...m[1].split(/[\s,]+/).filter(Boolean));
  }
  return ids;
}

export function commitMessage(paths, ids) {
  const head = paths.length === 1 ? `app: save ${paths[0]}` : `app: save ${paths.length} files`;
  return `${head}\n\n${paths.map((p) => `- ${p}`).join("\n")}\n\nOutbox: ${ids.join(", ")}\n[skip ci]`;
}

// ── checks before a file is committed ───────────────────────────────────────

/** Throws when the text is not fit to commit at `path`. */
export function checkFile(path, text) {
  if (path.endsWith(".json")) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new EditError(`${path} would not be valid JSON: ${e.message}`); }
    if (path === REGISTRY_PATH) {
      try { parseRegistry(doc); } catch (e) { throw new EditError(`${path} fails the registry check: ${e.message}`); }
    }
  }
}

// ── the drain ───────────────────────────────────────────────────────────────

const byAge = (a, b) =>
  new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id));

/** Transient: worth another drain later. Everything else stops and shows on the health card. */
const isTransient = (r) => r.blocked || r.rateLimited || r.status === 0 || r.status === 429 || r.status >= 500;

/**
 * One drain. Returns { status, committed, commit?, errored?, message? } where status is
 * 'not_configured' | 'busy' | 'empty' | 'committed' | 'already_committed' | 'contended' |
 * 'retry_later' | 'stopped'.
 *
 * @param pool  a pg Pool (needs connect()). The lock lives on one dedicated connection.
 */
export async function drainOutbox({ pool, env = process.env, fetchImpl, maxRows = MAX_ROWS_PER_DRAIN } = {}) {
  const cfg = repoConfig(env, { fetchImpl });
  if (!cfg.configured) return { status: "not_configured", committed: 0 };
  const c = await pool.connect();
  /* A connection that may still hold the lock must never go back to the pool:
     the next borrower would inherit it. release(true) destroys the connection. */
  let destroy = false;
  try {
    const lock = await c.query(`SELECT pg_try_advisory_lock($1) AS ok`, [DRAIN_LOCK_KEY]);
    if (!lock.rows[0].ok) return { status: "busy", committed: 0 };
    try {
      return await drainLocked(c, cfg, maxRows);
    } finally {
      try {
        const un = await c.query(`SELECT pg_advisory_unlock($1) AS ok`, [DRAIN_LOCK_KEY]);
        if (!un.rows[0]?.ok) destroy = true;
      } catch {
        destroy = true;
      }
    }
  } catch (e) {
    destroy = true;
    throw e;
  } finally {
    c.release(destroy);
  }
}

async function markError(c, ids, message) {
  if (!ids.length) return;
  await c.query(
    `UPDATE repo_outbox SET error=$2, claimed_at=NULL, claim_id=NULL WHERE id = ANY($1::uuid[])`,
    [ids, String(message).slice(0, 1000)]
  );
}

/** Give the claim back. A row that has had its fill of tries gets an error instead. */
async function release(c, ids, message, { refund = false } = {}) {
  if (!ids.length) return;
  await c.query(
    `UPDATE repo_outbox
        SET claimed_at=NULL, claim_id=NULL,
            attempts = CASE WHEN $4 THEN GREATEST(attempts-1,0) ELSE attempts END,
            error = CASE WHEN attempts >= $2 THEN $3 ELSE error END
      WHERE id = ANY($1::uuid[])`,
    [ids, MAX_TRANSIENT_ATTEMPTS, `gave up after ${MAX_TRANSIENT_ATTEMPTS} tries: ${String(message).slice(0, 900)}`, refund]
  );
}

async function markCommitted(c, ids, sha) {
  if (!ids.length) return;
  await c.query(
    `UPDATE repo_outbox SET committed_sha=$2, committed_at=now(), error=NULL, claimed_at=NULL
      WHERE id = ANY($1::uuid[])`,
    [ids, sha]
  );
}

async function drainLocked(c, cfg, maxRows) {
  const claimId = randomUUID();
  const claimed = (await c.query(
    `UPDATE repo_outbox SET claim_id=$1, claimed_at=now(), attempts=attempts+1
      WHERE id IN (
        SELECT id FROM repo_outbox
         WHERE committed_at IS NULL AND error IS NULL
         ORDER BY created_at, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [claimId, maxRows]
  )).rows.sort(byAge);
  if (!claimed.length) return { status: "empty", committed: 0 };

  // Rows that can never be committed are stopped one by one, so they cannot block the rest.
  let pending = [];
  const errored = [];
  for (const row of claimed) {
    try {
      const path = assertAllowedPath(row.path);
      if (row.mode === "edit") validateEdit(row.edit);
      pending.push({ ...row, path });
    } catch (e) {
      errored.push({ id: row.id, error: e.message });
      await markError(c, [row.id], e.message);
    }
  }

  const doneIds = [];
  let lastCommit = null;
  let outcome = null;

  for (let attempt = 1; pending.length && attempt <= MAX_FAST_FORWARD_TRIES; attempt++) {
    const head = await getRef(cfg);
    if (!head.ok) { outcome = await failedStep(c, pending, head, "read the branch"); break; }

    // A crash after the push must not commit the same rows twice.
    const recent = await recentCommits(cfg, RECENT_COMMITS_CHECKED);
    if (!recent.ok) { outcome = await failedStep(c, pending, recent, "read recent commits"); break; }
    const landed = new Map();
    for (const cm of recent.commits) for (const id of outboxIdsInMessage(cm.message)) landed.set(id, cm.sha);
    const already = pending.filter((r) => landed.has(r.id));
    for (const r of already) {
      await markCommitted(c, [r.id], landed.get(r.id));
      doneIds.push(r.id);
    }
    pending = pending.filter((r) => !landed.has(r.id));
    if (!pending.length) break;

    const base = await getCommit(cfg, head.sha);
    if (!base.ok) { outcome = await failedStep(c, pending, base, "read the head commit"); break; }

    // Build each file from the newest copy: replaces overwrite, edits apply on top, in order.
    const state = new Map();      // path -> text | null
    const used = [];              // rows that made it into this commit
    const rowsByPath = new Map();
    let readFailure = null;
    for (const row of pending) {
      if (row.mode === "edit" && !state.has(row.path)) {
        const cur = await readRepoFile(cfg, row.path, head.sha);
        if (!cur.ok) { readFailure = cur; break; }
        state.set(row.path, cur.text);
      }
      try {
        const next = row.mode === "replace" ? row.content : applyEdit(state.get(row.path) ?? null, row.edit);
        state.set(row.path, next);
        used.push(row);
        if (!rowsByPath.has(row.path)) rowsByPath.set(row.path, []);
        rowsByPath.get(row.path).push(row);
      } catch (e) {
        errored.push({ id: row.id, error: e.message });
        await markError(c, [row.id], e.message);
      }
    }
    if (readFailure) { outcome = await failedStep(c, pending, readFailure, "read a file"); break; }

    // A file that would not parse stops its rows; the other files still go.
    const files = [];
    for (const [path, rows] of rowsByPath) {
      try {
        checkFile(path, state.get(path));
        files.push({ path, content: state.get(path) });
      } catch (e) {
        for (const r of rows) used.splice(used.indexOf(r), 1);
        for (const r of rows) errored.push({ id: r.id, error: e.message });
        await markError(c, rows.map((r) => r.id), e.message);
      }
    }
    pending = pending.filter((r) => used.includes(r));
    if (!files.length) { pending = []; break; }

    const tree = await createTree(cfg, base.tree, files);
    if (!tree.ok) { outcome = await failedStep(c, pending, tree, "make the tree"); break; }
    const ids = pending.map((r) => r.id);
    const commit = await createCommit(cfg, { message: commitMessage(files.map((f) => f.path), ids), tree: tree.sha, parent: head.sha });
    if (!commit.ok) { outcome = await failedStep(c, pending, commit, "make the commit"); break; }
    const moved = await updateRef(cfg, commit.sha);
    if (moved.ok) {
      await markCommitted(c, ids, commit.sha);
      doneIds.push(...ids);
      lastCommit = commit.sha;
      pending = [];
      break;
    }
    if (moved.notFastForward) {
      if (attempt === MAX_FAST_FORWARD_TRIES) {
        await release(c, pending.map((r) => r.id), "still not a fast forward after 3 tries");
        outcome = { status: "contended", message: "still not a fast forward after 3 tries" };
      }
      continue; // re-read the ref, re-apply the edits to the newest files
    }
    outcome = await failedStep(c, pending, moved, "move the branch");
    break;
  }

  const base = { committed: doneIds.length, errored };
  if (outcome) return { ...base, ...outcome };
  if (lastCommit) return { ...base, status: "committed", commit: lastCommit };
  if (doneIds.length) return { ...base, status: "already_committed" };
  return { ...base, status: "empty" };
}

/** Classify a failed GitHub step: wait for the next drain, or stop and show it. */
async function failedStep(c, rows, res, what) {
  const ids = rows.map((r) => r.id);
  const message = `could not ${what}: ${res.error || `HTTP ${res.status}`}${res.status ? ` (HTTP ${res.status})` : ""}`;
  if (isTransient(res)) {
    await release(c, ids, message, { refund: Boolean(res.blocked) });
    return { status: "retry_later", message };
  }
  await markError(c, ids, message);
  return { status: "stopped", message };
}
