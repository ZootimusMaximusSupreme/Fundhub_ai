// POST /api/waypoint-tick — a client ticks (or unticks) ONE step on their own
// checklist.
//
//   body { waypoint_id: <uuid>, done: true | false }
//
// Owner-set 2026-09-17: clients check things off one at a time so the list does
// not overwhelm them. This is the control behind that checkbox.
//
// WHICH STEPS. Only the ones src/waypoints/verify.mjs leaves "open until a
// person says otherwise": owner_kind 'client' and verify_kind NULL. The rule
// lives in src/waypoints/self-attest.mjs (tickRefusal) and is enforced HERE,
// server-side. A paydown step (closed only by a credit re-pull) and the
// no-new-credit rule (never closed by anything) are refused with a reason even
// when somebody sends this request by hand. Hiding the checkbox is not the
// guard; this is.
//
// CLIENT ONLY, PINNED TO SELF. The client and org come off the SESSION. There
// is no client_id parameter at all, so there is nothing to spoof. The step is
// looked up by id AND org AND client, so another client's step answers 404
// not_found — the same answer a step that does not exist gets. Telling a caller
// a record exists but is not theirs confirms their guess (src/partners/scope.mjs,
// assertCanReadRow).
//
// A handler file is not a route (CLAUDE.md §12): the ROUTES line is in
// netlify/functions/api.mjs, key "waypoint-tick" — flat, no slash, for the same
// reason "paid-services" is flat.

import { db } from "../src/db.mjs";
import { requirePrincipal } from "../src/http/middleware/requirePrincipal.mjs";
import { isUuid } from "../src/http/read-api.mjs";
import { safeError } from "../src/http/health.mjs";
import { isDbDown, dbDown } from "../src/http/db-down.mjs";
import { setClientTick, closedBy, REFUSAL_MESSAGES } from "../src/waypoints/self-attest.mjs";

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;

  const method = (req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  /* LITERAL requirePrincipal(req, res, ["client"]) — see api/paid-services.mjs
     for why the journey extractor needs this call spelled out. */
  const principal = await requirePrincipal(req, res, ["client"], { db: database });
  if (!principal) return;

  const clientId = principal.clientId || null;
  const orgId = principal.orgId || null;
  if (!clientId || !orgId) {
    return res.status(403).json({
      ok: false,
      error: "forbidden",
      message: "Your login is not attached to a client file."
    });
  }

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const waypointId = body.waypoint_id ?? body.waypointId ?? null;
  if (!waypointId || !isUuid(waypointId)) {
    return res.status(400).json({ ok: false, error: "invalid_waypoint_id" });
  }
  if (typeof body.done !== "boolean") {
    return res.status(400).json({
      ok: false,
      error: "done_required",
      message: "Say whether the step is done: true or false."
    });
  }

  try {
    const out = await setClientTick(database, { orgId, clientId, waypointId, done: body.done });

    if (!out.ok && out.reason === "not_found") {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    if (!out.ok) {
      return res.status(409).json({
        ok: false,
        error: "not_tickable",
        reason: out.reason,
        message: REFUSAL_MESSAGES[out.reason] || "This step cannot be ticked here."
      });
    }

    const row = out.row;
    return res.status(200).json({
      ok: true,
      changed: out.changed === true,
      waypoint: {
        id: row.id,
        state: row.state,
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        closedBy: closedBy(row)
      }
    });
  } catch (err) {
    if (isDbDown(err)) return dbDown(res, err);
    return res.status(500).json({ ok: false, error: "internal_error", detail: safeError(err) });
  }
}
