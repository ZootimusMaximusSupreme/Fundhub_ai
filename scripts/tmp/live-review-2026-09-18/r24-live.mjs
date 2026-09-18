// Hole 24 REVIEW — live, no sign-in, nothing written. Checks that the live site
// behaves the way the corrected journey rows say:
//   "signed link" : contracts/sign, public/unsubscribe  -> a bad signature is refused
//   "anyone"      : public/optimize, public/funnel-checkout, public/survey-submit
//                   -> answers with no sign-in and no signature
// GET only, except one POST with an EMPTY body to survey-submit, which the code
// rejects at validation (name_email_required) before anything is written.
// Prints status + error code only. Usage: node scripts/tmp/live-review-2026-09-18/r24-live.mjs
const BASE = 'https://fundhub.ai';
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const CASES = [
  ['GET', '/api/health'],
  ['GET', `/api/contracts/sign?id=${U1}&exp=9999999999&sig=00`],
  ['GET', `/api/contracts/sign?id=${U1}`],
  ['GET', `/api/public/unsubscribe?org=${U1}&client=${U2}&channel=email&exp=9999999999&sig=00`],
  ['GET', `/api/public/unsubscribe`],
  ['GET', '/api/public/optimize'],
  ['GET', '/api/public/funnel-checkout'],
  ['GET', '/api/public/survey-submit'],
  ['POST', '/api/public/survey-submit', '{}'],
  ['GET', '/api/read/my-numbers'],
];
for (const [method, p, body] of CASES) {
  const r = await fetch(BASE + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body, redirect: 'manual' });
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch {}
  const summary = j ? (j.error ? `error=${j.error}` : `ok=${j.ok} keys=${Object.keys(j).slice(0, 6).join(',')}`) : `non-json ${t.length}b`;
  const extra = p === '/api/health' && j ? ` pending=${j.pending ?? j.migrations?.pending ?? '?'} commit=${String(j.commit ?? j.version ?? '').slice(0, 8)}` : '';
  console.log(`${method.padEnd(4)} ${p.replace(/sig=[^&]*/, 'sig=<bad>').padEnd(96)} -> ${r.status} ${summary}${extra}`);
}
