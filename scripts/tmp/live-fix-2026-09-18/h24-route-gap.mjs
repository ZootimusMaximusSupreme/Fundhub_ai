// Hole 24 — intended vs actual route lists, route by route.
//
// The two `*-intended.md` files carry group COUNTS only, no route names. They
// were generated on 2026-08-02 (commit 1ae3eef0) from the same data as the
// `*-actual.md` files at that commit, and their group counts match that
// snapshot exactly. So the route names behind "intended" are the tables in
// `<journey>-actual.md` at 1ae3eef0. This script:
//   1. checks the intended group counts still equal that snapshot's counts,
//   2. diffs the snapshot's route tables against today's generated actual.
//
//
// Fix run 2 (2026-09-18): once an intended page NAMES its routes (a
// "  - `/api/...`" line under each group bullet), those names are the intended
// list and the snapshot is not used. Then it also checks the page's picture
// counts against today's actual picture, and that each bullet's "(N routes)"
// equals the routes listed under it. Optional first argument: a folder to read
// `<journey>-intended.md` (or `<journey>-intended.proposed.md`) from.
//
// Read-only. Usage: node scripts/tmp/live-fix-2026-09-18/h24-route-gap.mjs [intendedDir]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const BASE = '1ae3eef0';
const JOURNEYS = ['client', 'role-inquiry-remover'];
const DIR = process.argv[2] || 'docs/journeys';

/* Route names listed on an intended page, by section, plus any bullet whose
   stated count differs from the routes listed under it. */
function intendedTables(md) {
  const out = { reach: new Map(), blocked: new Map(), badCounts: [] };
  let section = null;
  let bullet = null;
  const close = () => { if (bullet && bullet.said !== bullet.listed) out.badCounts.push(`${bullet.text}: says ${bullet.said}, lists ${bullet.listed}`); };
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) {
      close(); bullet = null;
      section = line.startsWith('## Should be able to reach') ? 'reach'
        : line.startsWith('## Should stay blocked from') ? 'blocked' : null;
      continue;
    }
    if (!section) continue;
    const b = line.match(/^- \*\*(.+?)\*\* \((\d+) routes?\)/);
    if (b) { close(); bullet = { text: `${section}:${b[1]}`, said: Number(b[2]), listed: 0 }; continue; }
    const r = line.match(/^\s+- `(\/api\/[^`]+)`\s*$/);
    if (r) { out[section].set(r[1], { methods: '', who: '' }); if (bullet) bullet.listed++; }
  }
  close();
  return out;
}

function tables(md) {
  const out = { reach: new Map(), blocked: new Map() };
  let section = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## What they can reach')) section = 'reach';
    else if (line.startsWith('## What they are blocked from')) section = 'blocked';
    else if (line.startsWith('## ')) section = null;
    if (!section) continue;
    const m = line.match(/^\| `([^`]+)` \| ([^|]*) \| (.*) \|$/);
    if (m) out[section].set(m[1], { methods: m[2].trim(), who: m[3].trim() });
  }
  return out;
}

function groups(md) {
  const g = [];
  for (const line of md.split('\n')) {
    const m = line.match(/(CAN|CANT) --> [AB]_\w+\[(.+?) — (\d+) (?:routes?|blocked)\]/);
    if (m) g.push(`${m[1]}:${m[2]}:${m[3]}`);
  }
  return g.sort();
}

for (const j of JOURNEYS) {
  const file = existsSync(`${DIR}/${j}-intended.md`) ? `${DIR}/${j}-intended.md` : `${DIR}/${j}-intended.proposed.md`;
  const intended = readFileSync(file, 'utf8');
  const now = readFileSync(`docs/journeys/${j}-actual.md`, 'utf8');
  const named = intendedTables(intended);
  const usesNames = named.reach.size + named.blocked.size > 0;
  const sameGroups = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  console.log(`\n==== ${j}   (intended: ${file})`);
  let I;
  if (usesNames) {
    console.log('intended route names: read from the intended page itself');
    console.log(`intended picture counts == today's actual picture: ${sameGroups(groups(intended), groups(now)) ? 'YES' : 'NO'}`);
    console.log(`intended bullet counts == routes listed under them: ${named.badCounts.length ? 'NO — ' + named.badCounts.join('; ') : 'YES'}`);
    I = named;
  } else {
    const snap = execFileSync('git', ['show', `${BASE}:docs/journeys/${j}-actual.md`], { encoding: 'utf8' });
    console.log(`intended route names: none on the page — using the ${BASE} actual snapshot`);
    console.log(`intended group counts == ${BASE} actual snapshot: ${sameGroups(groups(intended), groups(snap)) ? 'YES' : 'NO'}`);
    I = tables(snap);
  }
  const A = tables(now);
  const allI = new Set([...I.reach.keys(), ...I.blocked.keys()]);
  const allA = new Set([...A.reach.keys(), ...A.blocked.keys()]);
  console.log(`intended: ${I.reach.size} reach / ${I.blocked.size} blocked / ${allI.size} total`);
  console.log(`actual:   ${A.reach.size} reach / ${A.blocked.size} blocked / ${allA.size} total`);

  const list = (title, rows) => {
    console.log(`\n-- ${title}: ${rows.length}`);
    for (const r of rows) console.log(`   ${r}`);
  };
  const who = (m, r) => `${r}  [${m.get(r).methods}]  ${m.get(r).who.replace(/<br>/g, ' ')}`;

  list('A. was BLOCKED in intended, now REACHABLE in actual (door opened)',
    [...I.blocked.keys()].filter((r) => A.reach.has(r)).map((r) => who(A.reach, r)));
  list('B. was REACHABLE in intended, now BLOCKED in actual (door closed)',
    [...I.reach.keys()].filter((r) => A.blocked.has(r)).map((r) => who(A.blocked, r)));
  list('C. NEW route (not in intended at all), REACHABLE in actual',
    [...A.reach.keys()].filter((r) => !allI.has(r)).map((r) => who(A.reach, r)));
  list('D. NEW route (not in intended at all), BLOCKED in actual',
    [...A.blocked.keys()].filter((r) => !allI.has(r)).map((r) => who(A.blocked, r)));
  list('E. in intended, GONE from actual (route no longer in the routing table)',
    [...allI].filter((r) => !allA.has(r)).map((r) => `${r}  (was ${I.reach.has(r) ? 'reach' : 'blocked'})`));
  const sameReach = [...I.reach.keys()].filter((r) => A.reach.has(r)).length;
  const sameBlocked = [...I.blocked.keys()].filter((r) => A.blocked.has(r)).length;
  console.log(`\nunchanged: ${sameReach} reach, ${sameBlocked} blocked`);
}
