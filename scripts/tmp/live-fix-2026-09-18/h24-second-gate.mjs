// Hole 24 — second role checks the journey generator does not see.
//
// For every route the generator says a journey CAN reach, list lines in the
// handler that look like a further role check (a helper such as hasRole or
// canAccessPartnerMarketing, a hand-written allow-set, a role comparison, or a
// second requireRole call). Read-only.
//
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-second-gate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO, reaches } from '../../journeys/extract.mjs';

const J = [
  { name: 'client', type: 'principal', subject: 'client' },
  { name: 'role-inquiry-remover', type: 'role', subject: 'inquiry_specialist' }
];
const RE = /hasRole\(|canAccessPartnerMarketing\(|isOwner\(|isAdmin\(|\.role\s*[!=]==?|role\s*[!=]==?\s*"|\b[A-Z_]*(ALLOWED|_OK|ROLES)\b\.has\(|role_forbidden|requireRole\w*\(|kind\s*!==?\s*"|kind\s*===?\s*"/;

const { endpoints } = extractAll();
for (const e of endpoints) {
  const who = J.filter((j) => reaches(j, e.gate).reachable === true).map((j) => j.name);
  if (!who.length || e.gate.kind === 'open' || e.gate.kind === 'verified-other') continue;
  const src = code(fs.readFileSync(path.join(REPO, e.file), 'utf8'));
  const hits = src.split('\n').map((l, i) => [i + 1, l.trim()]).filter(([, l]) => RE.test(l));
  if (!hits.length) continue;
  console.log(`== ${e.key}  reach=${who.join(',')}  gate=${e.gate.kind}  ${e.file}`);
  for (const [n, l] of hits.slice(0, 8)) console.log(`   ${n}: ${l.slice(0, 170)}`);
}
