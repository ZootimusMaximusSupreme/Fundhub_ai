// Capital Blueprint — bank relationship tracker (closer-offered only).

import { mergeCustomFields } from "../workflows/custom-fields.mjs";
import { isCapitalBlueprintBuyer } from "./coach-exception.mjs";

export const BANK_TRACKER_OFFERED_KEY = "blueprint_bank_tracker_offered";

const ACCOUNT_KINDS = new Set(["personal", "business"]);
const TODO_STATES = new Set(["open", "done", "skipped"]);

/** Closer flags that this client was offered the bank relationship tracker. */
export async function setBankRelationshipOffered(db, {
  orgId,
  clientId,
  offered = true
} = {}) {
  if (!orgId || !clientId) return { ok: false, error: "missing_ids" };
  const blueprint = await isCapitalBlueprintBuyer(db, { orgId, clientId });
  if (!blueprint) return { ok: false, error: "not_blueprint_buyer" };
  await mergeCustomFields(db, clientId, {
    [BANK_TRACKER_OFFERED_KEY]: offered ? "true" : "false"
  });
  return { ok: true, offered: !!offered };
}

export async function isBankRelationshipOffered(db, { clientId }) {
  if (!clientId) return false;
  const r = await db.query(
    `SELECT custom_fields->>$2 AS v FROM clients WHERE id = $1`,
    [clientId, BANK_TRACKER_OFFERED_KEY]
  );
  return String(r.rows[0]?.v || "").toLowerCase() === "true";
}

/** Add a named-bank todo row. Refused when tracker was not offered. */
export async function addBankRelationshipTodo(db, {
  orgId,
  clientId,
  bankKey,
  accountKind = "personal",
  notes = null
} = {}) {
  if (!orgId || !clientId) return { ok: false, error: "missing_ids" };
  const key = String(bankKey || "").trim().toLowerCase();
  const kind = String(accountKind || "").trim().toLowerCase();
  if (!key) return { ok: false, error: "bank_key_required" };
  if (!ACCOUNT_KINDS.has(kind)) return { ok: false, error: "invalid_account_kind" };

  const offered = await isBankRelationshipOffered(db, { clientId });
  if (!offered) return { ok: false, error: "bank_tracker_not_offered" };

  const r = await db.query(
    `INSERT INTO blueprint_bank_relationship_todos
       (org_id, client_id, bank_key, account_kind, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_id, bank_key, account_kind) DO UPDATE
       SET notes = COALESCE(EXCLUDED.notes, blueprint_bank_relationship_todos.notes),
           updated_at = now()
     RETURNING id, bank_key, account_kind, state`,
    [orgId, clientId, key, kind, notes]
  );
  return { ok: true, todo: r.rows[0] };
}

export async function listBankRelationshipTodos(db, { orgId, clientId }) {
  if (!orgId || !clientId) return [];
  const r = await db.query(
    `SELECT id, bank_key, account_kind, state, notes, created_at, updated_at
       FROM blueprint_bank_relationship_todos
      WHERE org_id = $1::uuid AND client_id = $2::uuid
      ORDER BY created_at ASC`,
    [orgId, clientId]
  );
  return r.rows;
}

export async function updateBankRelationshipTodoState(db, {
  orgId,
  todoId,
  state
} = {}) {
  const st = String(state || "").trim().toLowerCase();
  if (!orgId || !todoId || !TODO_STATES.has(st)) {
    return { ok: false, error: "invalid_args" };
  }
  const r = await db.query(
    `UPDATE blueprint_bank_relationship_todos
        SET state = $3
      WHERE id = $1::uuid AND org_id = $2::uuid
      RETURNING id, state`,
    [todoId, orgId, st]
  );
  if (!r.rows[0]) return { ok: false, error: "not_found" };
  return { ok: true, todo: r.rows[0] };
}
