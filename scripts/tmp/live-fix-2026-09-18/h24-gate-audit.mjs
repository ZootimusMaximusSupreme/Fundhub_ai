// Hole 24 — does the journey generator read each handler's gate right?
//
// For every route, prints what scripts/journeys/extract.mjs decided, next to
// every gate-shaped call actually present in the handler (comments stripped
// the same way the generator strips them). Flags combinations where the
// generator's reading could be wrong. Read-only; prints, writes nothing.
//
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-gate-audit.mjs [--all]
import fs from 'node:fs';
import path from 'node:path';
import { extractAll, code, REPO, reaches } from '../../journeys/extract.mjs';

const TOKENS = [
  'readHandler', 'partnerReadHandler', 'requireDashboardAccess', 'requirePrincipal',
  'requireAuth', 'requireRole', 'hasRole', 'SUPER_ROLES', 'requireActiveShift',
  'requireSessionOrg', 'requireClientInOrg', 'verifyAccountSession', 'authenticate',
  'attachStaff', 'bearerToken', 'timingSafeEqual', 'createHmac', 'verifyDocumentUrl',
  'DASHBOARD_SECRET', 'ROLE_SETS\\.\\w+', 'principal\\.kind', 'kind\\s*===?\\s*"\\w+"',
  'staff\\.role', '\\.role\\s*===?\\s*"\\w+"', 'rawBody', 'signature'
];

const { endpoints } = extractAll();
const all = process.argv.includes('--all');
const journeys = [
  { name: 'client', type: 'principal', subject: 'client' },
  { name: 'role-inquiry-remover', type: 'role', subject: 'inquiry_specialist' }
];

for (const e of endpoints) {
  const src = e.file && fs.existsSync(path.join(REPO, e.file)) ? code(fs.readFileSync(path.join(REPO, e.file), 'utf8')) : '';
  const found = [];
  for (const t of TOKENS) {
    const hits = [...new Set([...src.matchAll(new RegExp(t, 'g'))].map((m) => m[0]))];
    if (hits.length) found.push(...hits);
  }
  const g = e.gate;
  const flags = [];
  const has = (re) => re.test(src);
  if (g.kind === 'open' && has(/requireRole|hasRole|verifyAccountSession|authenticate\(|requireSessionOrg|requireClientInOrg|principal\.kind|timingSafeEqual|createHmac/)) flags.push('OPEN-but-gate-shaped-call');
  if (g.kind === 'verified-other' && g.verifiedBy === 'provider signature' && !has(/timingSafeEqual|createHmac|verify\w*\(/)) flags.push('SIGNATURE-but-no-verify-call-in-handler');
  if ((g.kind === 'principal' || g.kind === 'wrapper') && !g.roles && has(/requireRole|hasRole|ROLE_SETS\.\w+|staff\.role|\.role\s*===?/)) flags.push('ANY-STAFF-but-role-check-present');
  if (g.anyStaff && has(/requireRole|hasRole|ROLE_SETS\.\w+|\.role\s*===?/)) flags.push('ANY-STAFF-but-role-check-present');
  if (g.kind === 'explicit-roles' && has(/ROLE_SETS\.\w+|hasRole/)) flags.push('EXPLICIT-but-also-ROLE_SETS');
  if (g.kind === 'role-set' && /requireAuth \+ requireRole/.test(g.note || '') && has(/requirePrincipal/)) flags.push('ROLE-SET-but-requirePrincipal-too');
  if (has(/requireRole\s*\(\s*\.\.\./)) flags.push('SPREAD-requireRole');
  const verdicts = journeys.map((j) => `${j.name === 'client' ? 'client' : 'spec'}=${reaches(j, g).reachable}`).join(' ');
  if (all || flags.length) {
    console.log(`${e.key.padEnd(34)} ${verdicts.padEnd(22)} kind=${g.kind} roles=${g.roles ? g.roles.length : '-'} principals=${g.principals ? g.principals.join('/') : '-'}`);
    console.log(`   file=${e.file}  flags=${flags.join(',') || '-'}`);
    console.log(`   tokens: ${found.join(' | ')}`);
  }
}
