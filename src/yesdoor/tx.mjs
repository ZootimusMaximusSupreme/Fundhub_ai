// src/yesdoor/tx.mjs — one real database transaction, for the writes that must
// land together or not at all (a pre-screen, a denial, a move-in, a payment).
// The ONE transaction helper for all of Yesdoor (I1 merged B3b's store/tx.mjs
// into this file; there is no second copy).
//
// COPIED from src/db/with-transaction.mjs (owner-set, spec §0.2: Fundhub logic is
// copied into src/yesdoor, never imported; only src/db.mjs may be imported). The
// trap it avoids: src/db.mjs exports `db` as `{ query }` only, with no connect(),
// so a naive "has connect()?" probe runs the callback under AUTOCOMMIT and each
// statement commits on its own. A half-done move-in (fee row written, invoice
// not) or a half-done pre-screen (consent written, matches not) is exactly what
// this file exists to stop.
//
// The three branches, in order:
//   1. the handle has connect()   a real Pool, or a test double that wants BEGIN
//   2. the handle IS the singleton  reach past it to the pool it wraps
//   3. anything else              a plain fake in a unit test; run inline
//
// Pass `actor` ({ kind, id }) to stamp the transaction with the yd.actor_kind /
// yd.actor_id settings the 435 triggers read, so automatic stage events name who
// moved the application. (setActor() in ./events.mjs does the same mid-transaction.)

import { db as sharedDb, pool } from "../db.mjs";

export async function withTransaction(db, fn, { actor = null } = {}) {
  const acquire = typeof db?.connect === "function"
    ? () => db.connect()
    : (db === sharedDb ? () => pool().connect() : null);

  if (!acquire) return fn(db);

  const client = await acquire();
  try {
    await client.query("BEGIN");
    if (actor && actor.kind) {
      await client.query(
        `SELECT set_config('yd.actor_kind', $1, true), set_config('yd.actor_id', $2, true)`,
        [String(actor.kind), actor.id ? String(actor.id) : ""]
      );
    }
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* the original error is the one to report */ }
    throw e;
  } finally {
    client.release();
  }
}

export default withTransaction;
