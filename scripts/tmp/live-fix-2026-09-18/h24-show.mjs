// Hole 24 — print a handler with comments stripped (the way the journey
// generator reads it), optionally only a line range. Read-only.
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-show.mjs <file> [from] [to]
import fs from 'node:fs';
import path from 'node:path';
import { code, REPO } from '../../journeys/extract.mjs';

const [file, from = '1', to = '100000'] = process.argv.slice(2);
const lines = code(fs.readFileSync(path.join(REPO, file), 'utf8')).split('\n');
for (let i = Number(from) - 1; i < Math.min(lines.length, Number(to)); i++) {
  if (lines[i].trim()) console.log(`${String(i + 1).padStart(4)}: ${lines[i]}`);
}
