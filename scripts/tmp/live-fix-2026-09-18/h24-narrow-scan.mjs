// Hole 24 — every routed handler line that narrows staff by role through a
// shape the journey generator does not read: hasRole(...), a helper such as
// canAccessPartnerMarketing(...), or `!SET.has(<caller's role>)`. Read-only.
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-narrow-scan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO } from '../../journeys/extract.mjs';

const { endpoints } = extractAll();
for (const e of endpoints) {
  const src = code(fs.readFileSync(path.join(REPO, e.file), 'utf8'));
  const hits = src.split('\n').map((l, i) => [i + 1, l.trim()]).filter(([, l]) =>
    /hasRole\(|canAccessPartnerMarketing\(|isOwner\(|!\s*\w+\.has\([^)]*(\.role\b|\brole\b)/.test(l));
  if (!hits.length) continue;
  console.log(`== ${e.key}  gate=${e.gate.kind}  roles=${e.gate.roles ? e.gate.roles.join('/') : '-'}  ${e.file}`);
  for (const [n, l] of hits) console.log(`   ${n}: ${l.slice(0, 170)}`);
}
