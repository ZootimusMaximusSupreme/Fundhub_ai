// src/yesdoor/tx.mjs — one real database transaction, for the writes that must
// land together or not at all (a denial, a move-in, a payment).
//
// COPIED from src/db/with-transaction.mjs (owner-set: Fundhub logic is copied into
// src/yesdoor, never imported). The trap it avoids: src/db.mjs exports `db` as
// `{ query }` only, with no connect(), so a naive "has connect()?" probe runs the
// callback under AUTOCOMMIT and each statement commits on its own. A half-done
// move-in (fee row written, invoice not) is exactly what this file exists to stop.
//
// The three branches, in order:
//   1. the handle has connect()   a real Pool, or a test double that wants BEGIN
//   2. the handle IS the singleton  reach past it to the pool it wraps
//   3. anything else              a plain fake in a unit test; run inline

import { db as sharedDb, pool } from "../db.mjs";

export async function withTransaction(db, fn) {
  const acquire = typeof db?.connect === "function"
    ? () => db.connect()
    : (db === sharedDb ? () => pool().connect() : null);

  if (!acquire) return fn(db);

  const client = await acquire();
  try {
    await client.query("BEGIN");
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
