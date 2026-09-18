// Hole 24 — handlers with more than one role gate (a wider set on one method
// can hide behind a narrower first match). Read-only.
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-multi-gate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO } from '../../journeys/extract.mjs';

const { endpoints } = extractAll();
for (const e of endpoints) {
  const src = code(fs.readFileSync(path.join(REPO, e.file), 'utf8'));
  const calls = [...new Set([...src.matchAll(/requireRole\w*\(\s*res\s*,\s*[^,]+,\s*([\w.]+)/g)].map((x) => x[1]))];
  const sets = [...new Set([...src.matchAll(/ROLE_SETS\.(\w+)/g)].map((x) => x[1]))];
  if (calls.length > 1 || sets.length > 1) {
    console.log(`${e.key.padEnd(34)} calls=${calls.join('/')}  ROLE_SETS=${sets.join('/')}  generator=${e.gate.note}`);
  }
}
