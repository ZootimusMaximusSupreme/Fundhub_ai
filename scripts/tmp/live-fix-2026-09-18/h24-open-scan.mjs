// Hole 24 — for every route the journey generator reads as needing no sign-in
// ("anyone" or a signature/signed link), print the lines that show how the
// handler checks a caller, so a wrong label is visible. Read-only.
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-open-scan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO } from '../../journeys/extract.mjs';

const { endpoints } = extractAll();
for (const e of endpoints) {
  if (e.gate.kind !== 'open' && e.gate.kind !== 'verified-other') continue;
  const src = code(fs.readFileSync(path.join(REPO, e.file), 'utf8'));
  const hits = src.split('\n').map((l, i) => [i + 1, l.trim()])
    .filter(([, l]) => /verify|signature|hmac|timingSafe|token|secret|\b401\b|\b403\b|session|require[A-Z]|adapter|provider/i.test(l));
  console.log(`== ${e.key}  ${e.gate.kind}${e.gate.verifiedBy ? ' (' + e.gate.verifiedBy + ')' : ''}  ${e.file}`);
  for (const [n, l] of hits.slice(0, 10)) console.log(`   ${n}: ${l.slice(0, 160)}`);
}
