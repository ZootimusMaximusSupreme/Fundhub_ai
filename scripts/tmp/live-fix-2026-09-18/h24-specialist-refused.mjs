// Hole 24 — RUN the nine handlers the old journey drew as reachable by the
// Specialist (inquiry_specialist), with a fake signed-in session, and print
// the status each one answers. Same stub shape as
// src/http/partner-marketing-enable.test.mjs: no real database, no network,
// nothing written anywhere. For contrast each is also called as owner.
//
// Usage: node scripts/tmp/live-fix-2026-09-18/h24-specialist-refused.mjs
import { mock } from 'node:test';

const dbModule = await import('../../../src/db.mjs');

const ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PARTNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const sessionRow = (role) => ({
  rows: [{
    session_id: 's1', expires_at: '2099-01-01T00:00:00Z',
    staff_id: STAFF, id: STAFF, org_id: ORG, role,
    email: 'someone@example.com', name: 'Someone', status: 'active', active_flag: null
  }]
});

function stub(role) {
  return mock.method(dbModule.db, 'query', async (sql) => {
    const s = String(sql?.text ?? sql);
    if (/FROM live JOIN staff/i.test(s)) return sessionRow(role);
    if (/account_sessions|FROM accounts/i.test(s)) return { rows: [] };
    if (/FROM partner_pages/i.test(s)) return { rows: [{ id: PAGE, partner_id: PARTNER }] };
    return { rows: [], rowCount: 0 };
  });
}

function mockRes() {
  return {
    statusCode: null, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    json(o) { this.body = o; return this; },
    send(o) { this.body = o; return this; },
    end() { return this; },
    redirect(c, u) { this.statusCode = typeof c === 'number' ? c : 302; this.body = u || c; return this; }
  };
}

const CASES = [
  ['/api/dashboard/seed', '../../../api/dashboard/seed.mjs', { method: 'POST' }],
  ['/api/call-outcomes', '../../../api/call-outcomes.mjs', { method: 'POST', body: {} }],
  ['/api/social/oauth', '../../../api/social/oauth.mjs', { method: 'GET', query: { action: 'start', channel: 'linkedin' } }],
  ['/api/social/settings', '../../../api/social/settings.mjs', { method: 'GET', query: { partner_id: PARTNER } }],
  ['/api/partner-marketing/enable', '../../../api/partner-marketing/enable.mjs', { method: 'GET', query: { partner_id: PARTNER } }],
  ['/api/partner-marketing/generate-logo', '../../../api/partner-marketing/generate-logo.mjs', { method: 'POST', query: { partner_id: PARTNER }, body: { partner_id: PARTNER } }],
  ['/api/partner-marketing/usage', '../../../api/partner-marketing/usage.mjs', { method: 'GET', query: { partner_id: PARTNER } }],
  ['/api/partner-marketing/copy-history', '../../../api/partner-marketing/copy-history.mjs', { method: 'GET', query: { page_id: PAGE } }],
  ['/api/partner-marketing/generate-copy', '../../../api/partner-marketing/generate-copy.mjs', { method: 'POST', body: { page_id: PAGE, section_id: 'hero' } }]
];

async function call(file, over, role) {
  const { default: handler } = await import(file);
  const q = stub(role);
  const res = mockRes();
  try {
    await handler({ headers: { authorization: 'Bearer test-session-token' }, query: {}, body: {}, ...over }, res, {});
  } catch (err) {
    return `threw ${err.message.slice(0, 60)}`;
  } finally {
    q.mock.restore();
  }
  return `${res.statusCode} ${res.body && res.body.error ? res.body.error : ''}`.trim();
}

for (const [route, file, over] of CASES) {
  const spec = await call(file, over, 'inquiry_specialist');
  const owner = await call(file, over, 'owner');
  console.log(`${route.padEnd(38)} specialist -> ${spec.padEnd(22)} owner -> ${owner}`);
}

/* copy-history and generate-copy open a real database transaction
   (src/partners/rls.mjs withPartnerScope) before their role check, so the stub
   above cannot reach it. Their role check is this helper, called on the page
   before any data is returned — run it directly. */
const { canAccessPartnerMarketing } = await import('../../../src/brand/meter.mjs');
for (const role of ['inquiry_specialist', 'closer', 'owner', 'admin']) {
  const p = { kind: 'staff', role, staff: { role } };
  console.log(`canAccessPartnerMarketing(staff ${role.padEnd(18)}) -> ${canAccessPartnerMarketing(p, PARTNER)}`);
}
