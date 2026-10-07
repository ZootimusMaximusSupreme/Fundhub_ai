// A real database transaction for the Yesdoor stores.
//
// A COPY of src/db/with-transaction.mjs (spec §0.2: copied in, not shared; only
// src/db.mjs may be imported from outside src/yesdoor). The trap it exists for:
// src/db.mjs exports `db` as `{ query }` and nothing else, so a naive probe for
// `db.connect` runs the callback on AUTOCOMMIT, each statement committing itself.
// A pre-screen writes consent, screening, matches and the renter's new stage
// together; half of that is worse than none.
//
//   1. the handle has connect()  -> a Pool, or a test double that wants BEGIN/COMMIT
//   2. the handle IS the shared singleton -> reach past it to the pool it wraps
//   3. anything else -> a plain fake in a unit test; run inline
//
// Pass `actor` ({ kind, id }) to stamp the transaction with the yd.actor_kind /
// yd.actor_id settings the 435 triggers read, so automatic stage events name who
// moved the application.

import { db as sharedDb, pool } from "../../db.mjs";

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
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export default withTransaction;
