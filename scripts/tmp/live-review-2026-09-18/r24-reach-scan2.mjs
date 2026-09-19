// Hole 24 REVIEW — second pass. For every route the generator draws as
// reachable by the Specialist, print the `if (...)` condition right before each
// 403, skipping plain org-scope checks. Read-only.
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO, reaches } from '../../journeys/extract.mjs';
const spec = { name: 'role-inquiry-remover', type: 'role', subject: 'inquiry_specialist' };
const { endpoints } = extractAll();
for (const e of endpoints) {
  if (!reaches(spec, e.gate).reachable || !e.file) continue;
  const p = path.join(REPO, e.file);
  if (!fs.existsSync(p)) continue;
  const lines = code(fs.readFileSync(p, 'utf8')).split('\n');
  const out = [];
  lines.forEach((l, i) => {
    if (!/403/.test(l)) return;
    let j = i; while (j >= 0 && j > i - 8 && !/\bif\s*\(/.test(lines[j])) j--;
    const cond = j >= 0 ? lines[j].trim() : '?';
    if (/org_?[iI]d|orgId|isUuid\(org|no_org/.test(cond + l)) return;
    out.push(`${i + 1}: ${cond.slice(0, 140)}  =>  ${l.trim().slice(0, 90)}`);
  });
  if (out.length) { console.log(`== ${e.key}  (${e.file})`); out.forEach((x) => console.log('   ' + x)); }
}
