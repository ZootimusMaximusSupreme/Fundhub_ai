// GET /api/yesdoor/staff/scoreboard[?from&to] — the weekly numbers.
//
// Staff (ops, sales, collections; the owner always). What the Scale Engine page
// tracks: leads, pulled, registered, leases, moved in, fees in, days to pay,
// refunds, buildings signed/live, partners signed/active. `from` and `to` are
// dates or timestamps and default to the last 7 days. No credit fields.
import { db } from "../../../src/db.mjs";
import { requireYdStaff } from "../../../src/yesdoor/auth/principal.mjs";
import { YD_ROLES } from "../../../src/yesdoor/config.mjs";
import { allowMethods, dateParam, YdError, sendError } from "../../../src/yesdoor/http.mjs";
import { getScoreboard } from "../../../src/yesdoor/store/staff.mjs";

export default async function handler(req, res) {
  const who = await requireYdStaff(req, res, YD_ROLES.staff, { db });
  if (!who) return;
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const from = dateParam(req, "from");
    const to = dateParam(req, "to");
    if (from && to && from >= to) throw new YdError(400, "invalid_parameter", "from must be before to");
    const out = await getScoreboard(db, { orgId: who.orgId, from, to });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
