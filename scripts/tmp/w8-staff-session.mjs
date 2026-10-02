#!/usr/bin/env node
// Scratch: mint a live staff session so the #8 walk can open CRM screens.
// Does not print the token. Writes it to /tmp/w8-session.txt only.
import fs from "node:fs";
import { loadEnv } from "../load-env.mjs";
loadEnv();
import { db, close } from "../../src/db.mjs";
import { createSession } from "../../src/auth/session.mjs";

const r = await db.query(
  `SELECT id, org_id, email, role, status FROM staff
    WHERE lower(email) = 'chris@fundhub.ai' AND status = 'active' LIMIT 1`
);
if (!r.rows[0]) {
  console.log(JSON.stringify({ ok: false, reason: "no_active_owner" }));
  await close();
  process.exit(1);
}
const staff = r.rows[0];
const sess = await createSession(db, {
  staffId: staff.id,
  orgId: staff.org_id,
  userAgent: "w8-walk"
});
fs.writeFileSync("/tmp/w8-session.txt", sess.token, { mode: 0o600 });
console.log(JSON.stringify({
  ok: true,
  email: staff.email,
  role: staff.role,
  expiresAt: sess.expiresAt
}));
await close();
