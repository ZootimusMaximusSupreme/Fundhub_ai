// HOLE 17 side look — the 2026-09-18 audit script put its sim photo on the
// first file input on the page, which is the owner's own profile-photo picker,
// not the inquiry door. GET only: saves the owner's current profile photo so a
// person can see whether it is now the sim ID picture. Never prints a secret.
// Usage: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/h17-avatar-look.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://fundhub.ai";
const SHOTS = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-17";
mkdirSync(SHOTS, { recursive: true });
const r = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: process.env.STAFF_INITIAL_PASSWORD || "" }),
});
const m = (r.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("login", r.status); process.exit(1); }
const a = await fetch(`${BASE}/api/staff/avatar`, { headers: { cookie: `fundhub_session=${m[1]}` } });
const type = a.headers.get("content-type") || "";
const buf = Buffer.from(await a.arrayBuffer());
console.log(JSON.stringify({ status: a.status, type, bytes: buf.length }));
if (a.ok && type.startsWith("image/")) writeFileSync(`${SHOTS}/owner-avatar-now.${type.includes("png") ? "png" : "jpg"}`, buf);
