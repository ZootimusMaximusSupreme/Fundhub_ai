// Hole 24 — what regenerating the journeys changed, route by route: rows that
// moved between "can reach" and "blocked", and rows whose "who" column
// changed. Compares a git revision (default HEAD) with the working tree.
// Read-only. Usage: node scripts/tmp/live-fix-2026-09-18/h24-regen-diff.mjs [rev]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const rev = process.argv[2] || 'HEAD';

function tables(md) {
  const out = new Map();
  let section = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## What they can reach')) section = 'reach';
    else if (line.startsWith('## What they are blocked from')) section = 'blocked';
    else if (line.startsWith('## ')) section = null;
    if (!section) continue;
    const m = line.match(/^\| `([^`]+)` \| ([^|]*) \| (.*) \|$/);
    if (m) out.set(m[1], { section, who: m[3].trim().replace(/<br>/g, ' ') });
  }
  return out;
}

for (const f of readdirSync('docs/journeys').filter((x) => x.endsWith('-actual.md')).sort()) {
  const before = tables(execFileSync('git', ['show', `${rev}:docs/journeys/${f}`], { encoding: 'utf8' }));
  const after = tables(readFileSync(`docs/journeys/${f}`, 'utf8'));
  const lines = [];
  for (const [route, a] of after) {
    const b = before.get(route);
    if (!b) { lines.push(`   NEW      ${route} (${a.section})`); continue; }
    if (b.section !== a.section) lines.push(`   MOVED    ${route}: ${b.section} -> ${a.section}   [${a.who}]`);
    else if (b.who !== a.who) lines.push(`   RELABEL  ${route} (${a.section}): "${b.who}" -> "${a.who}"`);
  }
  for (const route of before.keys()) if (!after.has(route)) lines.push(`   GONE     ${route}`);
  const count = (m, s) => [...m.values()].filter((x) => x.section === s).length;
  console.log(`== ${f}: reach ${count(before, 'reach')} -> ${count(after, 'reach')}, blocked ${count(before, 'blocked')} -> ${count(after, 'blocked')}`);
  for (const l of lines) console.log(l);
}
