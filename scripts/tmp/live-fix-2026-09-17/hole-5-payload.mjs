// Hole 5: which parts of GET /api/dashboard/client for #9 are big. GET only, prints sizes only.
import { request as pwRequest } from "playwright";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";
const staff = (await db.query(`SELECT id, org_id FROM staff WHERE lower(email)=lower($1) LIMIT 1`, ["chris@fundhub.ai"])).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
const req = await pwRequest.newContext({ extraHTTPHeaders: { cookie: `fundhub_session=${token}` } });
for (const [k, id] of [["nine", "be3dcfd7-faae-4001-b97f-9bc30875bbcd"], ["eight", "d682c13b-11f3-4bd5-a0c5-232b6a7875c4"]]) {
  const r = await req.get(`https://fundhub.ai/api/dashboard/client?id=${id}`);
  const j = await r.json();
  const sizes = Object.entries(j).map(([key, v]) => [key, JSON.stringify(v ?? null).length, Array.isArray(v) ? v.length : ""]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(k, JSON.stringify(sizes));
  if (j.client?.custom_fields) console.log("  custom_fields keys by size", JSON.stringify(Object.entries(j.client.custom_fields).map(([a, b]) => [a, JSON.stringify(b ?? null).length]).sort((a, b) => b[1] - a[1]).slice(0, 5)));
}
await req.dispose(); process.exit(0);
