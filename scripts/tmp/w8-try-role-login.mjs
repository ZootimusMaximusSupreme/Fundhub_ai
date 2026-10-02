#!/usr/bin/env node
// Scratch: one live login attempt for role-test emails. Prints ok/status only.
import { loadEnv } from "../load-env.mjs";
loadEnv();

const password = process.env.STAFF_INITIAL_PASSWORD || "";
const emails = ["closer@fundhub.ai", "owner@fundhub.ai", "advisor@fundhub.ai"];
const out = [];
for (const email of emails) {
  const res = await fetch("https://fundhub.ai/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json().catch(() => ({}));
  out.push({
    email,
    status: res.status,
    ok: !!body.ok,
    error: body.error || null,
    role: body.staff?.role || null
  });
}
const demo = await fetch("https://fundhub.ai/api/auth/login");
const demoBody = await demo.json().catch(() => ({}));
console.log(JSON.stringify({
  attempts: out,
  demoEnabled: !!(demoBody.demo && demoBody.demo.enabled)
}, null, 2));
