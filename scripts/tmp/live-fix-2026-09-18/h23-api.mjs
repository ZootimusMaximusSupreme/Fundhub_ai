// Hole 23 VERIFY — API read only. Owner password login, then GET the control
// panel's detail endpoint for #13 and print the keys that carry consent,
// credit scores and blockers. Never prints the password or the cookie.
//   node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h23-api.mjs
const BASE = "https://fundhub.ai";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-h23-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
console.log("login status", r.status, "cookie", Boolean(m));
if (!m) process.exit(1);
const H = { cookie: `fundhub_session=${m[1]}` };
const api = await fetch(`${BASE}/api/dashboard/client?id=${ID}`, { headers: H });
const d = await api.json();
console.log("status", api.status);
console.log("top keys", Object.keys(d));
const pick = (o, re) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => re.test(k)));
console.log("client consent/credit keys", JSON.stringify(pick(d.client, /consent|permission|credit|score|pull|source|sample|demo|report/i), null, 2));
console.log("next_action", JSON.stringify(d.next_action, null, 2));
console.log("active_blockers", JSON.stringify(d.active_blockers, null, 2));
for (const k of Object.keys(d)) {
  if (/consent|permission|credit|score|pull|report|bureau/i.test(k)) console.log(k, JSON.stringify(d[k], null, 2).slice(0, 3000));
}
console.log("crs_results", JSON.stringify(d.crs_results, null, 2).slice(0, 4000));
console.log("tri_merge", JSON.stringify(d.tri_merge, null, 2).slice(0, 3000));
console.log("open_blockers", JSON.stringify(d.open_blockers, null, 2).slice(0, 3000));
console.log("client.stage/status", d.client?.stage, d.client?.status, d.client?.funnel_stage, d.client?.outcome_tier);
