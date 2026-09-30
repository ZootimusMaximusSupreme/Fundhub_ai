// POST /api/blueprint/staff-actions — Capital Blueprint staff controls (no HTML).
//
// Body: { action, client_id, ...fields }
//   create_credit_partner — first_name, last_name, email, phone?
//   set_next_sequence_date — ready_date (YYYY-MM-DD)
//   offer_bank_tracker — offered (boolean, default true)
//   add_bank_todo — bank_key, account_kind (personal|business), notes?
//   list_bank_todos — (no extra fields)

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid } from "../../src/http/read-api.mjs";
import { requireClientInOrg } from "../../src/http/client-scope.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { createCreditPartnerFile } from "../../src/blueprint/credit-partner.mjs";
import { setNextFundingSequenceReadyDate } from "../../src/blueprint/next-funding-sequence.mjs";
import {
  setBankRelationshipOffered,
  addBankRelationshipTodo,
  listBankRelationshipTodos,
  updateBankRelationshipTodoState
} from "../../src/blueprint/bank-relationship.mjs";

const ROLES = ROLE_SETS.STAFF;

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;

  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLES)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const body = req.body || {};
  const action = String(body.action || "").trim();
  if (!isUuid(body.client_id)) {
    return res.status(400).json({ ok: false, error: "client_id must be a uuid" });
  }
  const clientId = String(body.client_id).trim();

  try {
    if (!(await requireClientInOrg(res, database, staff, clientId))) return;

    if (action === "create_credit_partner") {
      const out = await createCreditPartnerFile(database, {
        orgId,
        primaryClientId: clientId,
        firstName: body.first_name ?? body.firstName,
        lastName: body.last_name ?? body.lastName,
        email: body.email,
        phone: body.phone ?? null,
        staffId: staff.staff_id ?? staff.id ?? null
      });
      if (!out.ok) {
        const status = out.error === "not_blueprint_buyer" ? 403 : 400;
        return res.status(status).json({ ok: false, ...out });
      }
      return res.status(200).json({ ok: true, ...out });
    }

    if (action === "set_next_sequence_date") {
      const out = await setNextFundingSequenceReadyDate(database, {
        orgId,
        clientId,
        readyDate: body.ready_date ?? body.readyDate
      });
      if (!out.ok) {
        const status = out.error === "not_blueprint_buyer" ? 403 : 400;
        return res.status(status).json({ ok: false, ...out });
      }
      return res.status(200).json({ ok: true, ...out });
    }

    if (action === "offer_bank_tracker") {
      const offered = body.offered !== false && body.offered !== "false";
      const out = await setBankRelationshipOffered(database, {
        orgId,
        clientId,
        offered
      });
      if (!out.ok) {
        const status = out.error === "not_blueprint_buyer" ? 403 : 400;
        return res.status(status).json({ ok: false, ...out });
      }
      return res.status(200).json({ ok: true, ...out });
    }

    if (action === "add_bank_todo") {
      const out = await addBankRelationshipTodo(database, {
        orgId,
        clientId,
        bankKey: body.bank_key ?? body.bankKey,
        accountKind: body.account_kind ?? body.accountKind ?? "personal",
        notes: body.notes ?? null
      });
      if (!out.ok) {
        const status = out.error === "bank_tracker_not_offered" ? 409 : 400;
        return res.status(status).json({ ok: false, ...out });
      }
      return res.status(200).json({ ok: true, ...out });
    }

    if (action === "list_bank_todos") {
      const todos = await listBankRelationshipTodos(database, { orgId, clientId });
      return res.status(200).json({ ok: true, todos });
    }

    if (action === "update_bank_todo_state") {
      if (!isUuid(body.todo_id ?? body.todoId)) {
        return res.status(400).json({ ok: false, error: "todo_id must be a uuid" });
      }
      const out = await updateBankRelationshipTodoState(database, {
        orgId,
        todoId: String(body.todo_id ?? body.todoId).trim(),
        state: body.state
      });
      if (!out.ok) {
        const status = out.error === "not_found" ? 404 : 400;
        return res.status(status).json({ ok: false, ...out });
      }
      return res.status(200).json({ ok: true, ...out });
    }

    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (err) {
    if (dbDown(res, err)) return;
    throw err;
  }
}
