// Hole 24 — for every route the journey generator reads as "any employee"
// (no role limit), print every line in the handler that mentions a role or a
// 403, so a hidden role check the generator missed is visible. Read-only.
//
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-role-scan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO } from '../../journeys/extract.mjs';

const { endpoints } = extractAll();
for (const e of endpoints) {
  const g = e.gate;
  const loose = g.anyStaff || ((g.kind === 'principal' || g.kind === 'wrapper') && !(g.roles && g.roles.length));
  if (!loose) continue;
  const src = code(fs.readFileSync(path.join(REPO, e.file), 'utf8'));
  const lines = src.split('\n').map((l, i) => [i + 1, l])
    .filter(([, l]) => /\brole\b|\.role|403|forbidden|ROLES|isOwner|isAdmin|hasRole|requireRole/i.test(l));
  console.log(`== ${e.key}  (${g.kind}; ${(g.principals || []).join('/')})  ${e.file}`);
  for (const [n, l] of lines.slice(0, 10)) console.log(`   ${n}: ${l.trim().slice(0, 160)}`);
}
