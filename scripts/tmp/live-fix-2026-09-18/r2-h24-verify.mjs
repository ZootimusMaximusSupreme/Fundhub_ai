// Hole 24 fix run 2 — VERIFY. Read-only on live; nothing is written anywhere.
//
//   A. Live, no sign-in: GET every door the two journeys reach without a
//      sign-in ("anyone" / signed link) and that the intended pages do not list.
//      Any answer other than 404 means the door is routed on the live site.
//      GET only, no query string, so a POST-only form answers 405 and saves nothing.
//   B. Live, owner sign-in (POST /api/auth/login, then GET only):
//      GET /api/repair/exceptions — the door is live and the owner gets in.
//      Only counts are printed, never a row.
//   C. Local, stubbed database (same stub as h24-specialist-refused.mjs):
//      run api/repair/exceptions.mjs and api/dashboard/seed.mjs as each role.
//      This is the only way to show which ROLES the code refuses — there is no
//      Specialist or closer sign-in on live an agent may use.
//
// Never prints a password, token, cookie, email or phone.
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-h24-verify.mjs [tag]
import { mock } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const TAG = process.argv[2] || "verify";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-24";
mkdirSync(OUT, { recursive: true });
const out = { at: new Date().toISOString(), tag: TAG, writes: 0, noLogin: {}, owner: {}, stub: {} };

const PUBLIC_DOORS = [
  "climate", "climate/config", "climate/geocode", "hiring/apply",
  "public/affiliate-click", "public/education-enroll", "public/eeo-survey",
  "public/funnel-checkout", "public/optimize", "public/partner-apply",
  "public/partner-page", "public/slo-checkout", "public/survey-submit",
  "public/unsubscribe", "public/vsl-watch", "soft-pull-approve", "trials/eligibility",
  // gated doors, for contrast: must answer 401 with no sign-in
  "repair/exceptions", "read/portal-summary", "waypoint-tick"
];

// ── A. no sign-in
{
  for (const k of PUBLIC_DOORS) {
    const r = await fetch(`${BASE}/api/${k}`, { redirect: "manual" });
    out.noLogin[k] = r.status;
  }
  const h = await fetch(`${BASE}/api/health`);
  let hj = null;
  try { hj = await h.json(); } catch { hj = null; }
  out.health = { status: h.status, keys: hj ? Object.keys(hj) : null, commit: hj && (hj.commit || hj.sha || hj.deploy || null) };
}

// ── B. owner sign-in, GET only
{
  const password = process.env.STAFF_INITIAL_PASSWORD || "";
  if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "chris@fundhub.ai", password })
  });
  out.owner.login = lr.status;
  let token = null;
  try { const j = await lr.json(); token = j.token || null; out.owner.role = (j.staff && j.staff.role) || null; } catch { /* */ }
  const r = await fetch(`${BASE}/api/repair/exceptions`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  out.owner.repairExceptions = {
    status: r.status, ok: j && j.ok,
    stalled: j && Array.isArray(j.stalled) ? j.stalled.length : null,
    lowConfidenceParses: j && Array.isArray(j.lowConfidenceParses) ? j.lowConfidenceParses.length : null
  };
}

// ── C. stubbed database, each role
{
  const dbModule = await import("../../../src/db.mjs");
  const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const stub = (role) => mock.method(dbModule.db, "query", async (sql) => {
    const s = String(sql?.text ?? sql);
    if (/FROM live JOIN staff/i.test(s)) {
      return { rows: [{ session_id: "s1", expires_at: "2099-01-01T00:00:00Z", staff_id: STAFF, id: STAFF, org_id: ORG, role,
        email: "someone@example.com", name: "Someone", status: "active", active_flag: null }] };
    }
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(s)) out.writes++;
    return { rows: [], rowCount: 0 };
  });
  const mockRes = () => ({
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    json(o) { this.body = o; return this; }, send(o) { this.body = o; return this; }, end() { return this; }
  });
  const call = async (file, over, role) => {
    const { default: handler } = await import(file);
    const q = stub(role);
    const res = mockRes();
    try {
      await handler({ headers: { authorization: "Bearer test-session-token" }, query: {}, body: {}, ...over }, res, {});
    } catch (err) {
      return `threw ${String(err.message).slice(0, 60)}`;
    } finally { q.mock.restore(); }
    return `${res.statusCode}${res.body && res.body.error ? " " + res.body.error : ""}`;
  };
  const ROLES = ["owner", "admin", "inquiry_specialist", "closer", "funding_advisor", "sales_manager", "setter", "csm"];
  out.stub.repairExceptionsGET = {};
  for (const role of ROLES) out.stub.repairExceptionsGET[role] = await call("../../../api/repair/exceptions.mjs", { method: "GET" }, role);
  // seed only reached as far as its role check: a refused role never gets past it.
  out.stub.dashboardSeedPOST = { inquiry_specialist: await call("../../../api/dashboard/seed.mjs", { method: "POST" }, "inquiry_specialist") };
}

writeFileSync(`${OUT}/r2-${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
