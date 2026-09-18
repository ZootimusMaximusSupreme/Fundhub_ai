// Hole 3 skeptic: owner GET /api/read/staff?role=csm, items only. Read only.
import { writeFileSync } from "node:fs";
import { db } from "../../../src/db.mjs";
import { createSession } from "../../../src/auth/session.mjs";
const chris = (await db.query(`SELECT id, org_id FROM staff WHERE lower(email)='chris@fundhub.ai' LIMIT 1`)).rows[0];
const { token } = await createSession(db, { staffId: chris.id, orgId: chris.org_id });
const r = await fetch("https://fundhub.ai/api/read/staff?role=csm", { headers: { cookie: `fundhub_session=${token}` } });
const b = await r.json();
const o = { status: r.status, count: b.count, hiddenCount: b.hiddenCount,
  items: (b.items || []).map((x) => ({ email: x.email, name: x.name, role: x.role, status: x.status, is_demo: x.is_demo, active: x.active })) };
writeFileSync("/tmp/live-fix-2026-09-17/hole-3/skeptic/owner-staff-csm.json", JSON.stringify(o, null, 2));
console.log(JSON.stringify(o, null, 2));
process.exit(0);
