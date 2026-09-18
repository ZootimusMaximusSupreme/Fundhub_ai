// Hole 24 REVIEW — independent scan. For every route the generator draws as
// REACHABLE by the Specialist (inquiry_specialist), look in the handler (comments
// stripped) for a 403 that sits near a role test the generator may not read.
// Prints each suspect with the lines around the 403. Read-only; writes nothing.
//
// Usage: node scripts/tmp/live-review-2026-09-18/r24-reach-scan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO, reaches } from '../../journeys/extract.mjs';

const spec = { name: 'role-inquiry-remover', type: 'role', subject: 'inquiry_specialist' };
const { endpoints } = extractAll();
let reach = 0;
const suspects = [];
for (const e of endpoints) {
  if (!reaches(spec, e.gate).reachable) continue;
  reach++;
  if (!e.file || !fs.existsSync(path.join(REPO, e.file))) continue;
  const lines = code(fs.readFileSync(path.join(REPO, e.file), 'utf8')).split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    if (!/status\(\s*403\s*\)/.test(l)) return;
    const win = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
    if (/\brole\b|\.role\b|hasRole|requireRole|ROLE_SETS|_ROLES|ALLOWED|\.has\(|includes\(/.test(win)) hits.push(i);
  });
  if (hits.length) suspects.push({ e, lines, hits });
}
console.log(`Specialist reach per generator: ${reach} of ${endpoints.length}`);
console.log(`suspects (403 near a role test): ${suspects.length}\n`);
for (const { e, lines, hits } of suspects) {
  console.log(`== ${e.key}  file=${e.file}  label-roles=${e.gate.roles ? e.gate.roles.join(',') : (e.gate.anyStaff ? 'any staff' : '-')}  kind=${e.gate.kind}`);
  for (const i of hits.slice(0, 3)) {
    console.log(lines.slice(Math.max(0, i - 4), i + 1).map((l) => '   | ' + l.trim().slice(0, 150)).filter((l) => l.trim() !== '|').join('\n'));
    console.log('   --');
  }
}
