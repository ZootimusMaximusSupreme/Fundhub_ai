// r20 — names + shape only of env keys that matter for hole 20. Prints no values.
const want = /INNGEST|TWILIO|GOOGLE|NETLIFY|PULSE|DATABASE_URL|STAFF_INITIAL/i;
for (const k of Object.keys(process.env).filter((k) => want.test(k)).sort()) {
  const v = String(process.env[k] ?? "");
  const stars = (v.match(/\*/g) || []).length;
  console.log(`${k}: len=${v.length} asterisks=${stars}`);
}
