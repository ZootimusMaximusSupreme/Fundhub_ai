// GET / POST /api/marketing/settings — the marketing machine's settings, one row
// per org, created with defaults on first read (spec §6 step 3).
//
// Route key: "marketing/settings" in netlify/functions/api.mjs ROUTES.
//
// requireAuth answers "signed in" and nothing else; the role gate is the
// separate requireRole call (ROLE_SETS.MARKETING = owner, admin; CLAUDE.md §12).
//
// marketing_settings is org-scoped with a permissive policy, not partner-scoped,
// so a plain query reaches it; no asStaff() is needed (and none of the
// partner-RLS tables are touched here).
//
// POST takes a partial patch. Unknown keys are refused. An optional request_id
// (body or x-request-id header) makes a retry return the first answer.

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid } from "../../src/http/read-api.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { safeError } from "../../src/http/health.mjs";
import { readSettings, updateSettings, validateSettingsPatch } from "../../src/marketing/settings.mjs";
import { requestIdFrom, withRequestId } from "../../src/marketing/requests.mjs";

export const ROUTE = "marketing/settings";

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;
  const method = req.method || "GET";

  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.MARKETING)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) return res.status(403).json({ ok: false, error: "forbidden" });

  try {
    if (method === "GET") {
      const settings = await readSettings(database, orgId);
      return res.status(200).json({ ok: true, settings });
    }

    const checked = validateSettingsPatch(req.body);
    if (checked.error) {
      return res.status(400).json({ ok: false, error: checked.error, message: checked.message });
    }
    const out = await withRequestId(
      database,
      { orgId, requestId: requestIdFrom(req), route: ROUTE },
      async () => {
        const settings = await updateSettings(database, orgId, staff.id, checked.patch);
        return { status: 200, body: { ok: true, settings } };
      }
    );
    return res.status(out.status).json(out.replayed ? { ...out.body, replayed: true } : out.body);
  } catch (err) {
    if (dbDown(res, err)) return;
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
