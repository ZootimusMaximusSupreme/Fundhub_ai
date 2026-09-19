// Hole 5: time GET /api/dashboard/client for #8, #9, #11. GET only.
import { request as pwRequest } from "playwright";
import { writeFileSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";
const BASE = "https://fundhub.ai";
const IDS = { eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4", nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd", eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4" };
const N = Number(process.env.N || 6);
const staff = (await db.query(`SELECT id, org_id FROM staff WHERE lower(email)=lower($1) LIMIT 1`, ["chris@fundhub.ai"])).rows[0];
const { token } = await createSession(db, { staffId: staff.id, orgId: staff.org_id });
const req = await pwRequest.newContext({ extraHTTPHeaders: { cookie: `fundhub_session=${token}` } });
const out = {};
for (let i = 0; i < N; i++) {
  for (const [k, id] of Object.entries(IDS)) {
    const t = Date.now();
    const r = await req.get(`${BASE}/api/dashboard/client?id=${id}`);
    const body = await r.text();
    const ms = Date.now() - t;
    let j = null; try { j = JSON.parse(body); } catch {}
    (out[k] ||= []).push({ ms, status: r.status(), bytes: body.length, name: j?.client?.name || j?.data?.client?.name || null, keys: j ? Object.keys(j).length : 0, timing: r.headers()["server-timing"] || null });
  }
}
for (const [k, v] of Object.entries(out)) console.log(k, v.map((x) => `${x.ms}ms/${x.status}/${x.bytes}b`).join("  "));
writeFileSync("/tmp/live-fix-2026-09-17/hole-5/api-time.json", JSON.stringify(out, null, 2));
await req.dispose(); process.exit(0);
