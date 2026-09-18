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
// Read-only. Usage: node scripts/tmp/live-fix-2026-09-18/h24-route-gap.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = '1ae3eef0';
const JOURNEYS = ['client', 'role-inquiry-remover'];

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
  const intended = readFileSync(`docs/journeys/${j}-intended.md`, 'utf8');
  const snap = execFileSync('git', ['show', `${BASE}:docs/journeys/${j}-actual.md`], { encoding: 'utf8' });
  const now = readFileSync(`docs/journeys/${j}-actual.md`, 'utf8');

  const gi = groups(intended);
  const gs = groups(snap);
  const same = gi.length === gs.length && gi.every((x, i) => x === gs[i]);
  console.log(`\n==== ${j}`);
  console.log(`intended group counts == ${BASE} actual snapshot: ${same ? 'YES' : 'NO'}`);

  const I = tables(snap);
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
