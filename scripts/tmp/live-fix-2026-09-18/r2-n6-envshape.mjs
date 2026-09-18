// Hole N6 — local only. Says whether each named key in the laptop .env is set
// and whether it is a Netlify mask. Prints lengths and yes/no only, never a value.
// Usage: node --env-file=<.env> r2-n6-envshape.mjs
for (const k of ["SUPABASE_ACCESS_TOKEN", "DATABASE_URL", "INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY", "STAFF_INITIAL_PASSWORD"]) {
  const v = process.env[k];
  if (v == null) { console.log(k, "absent"); continue; }
  console.log(k, "len", v.length, "masked", /^\*{8,}/.test(v));
}
