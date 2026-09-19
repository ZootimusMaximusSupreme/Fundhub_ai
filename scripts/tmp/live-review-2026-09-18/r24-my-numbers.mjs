// Hole 24 REVIEW — run the real /api/read/my-numbers handler with a fake
// signed-in session for several roles (stubbed database, no network, nothing
// written). The generated Specialist journey draws this door as open.
// Usage: env -u DATABASE_URL node scripts/tmp/live-review-2026-09-18/r24-my-numbers.mjs
import { mock } from 'node:test';
const dbModule = await import('../../../src/db.mjs');
const ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const row = (role) => ({ rows: [{ session_id: 's1', expires_at: '2099-01-01T00:00:00Z', staff_id: STAFF, id: STAFF,
  org_id: ORG, role, email: 'x@example.com', name: 'X', status: 'active', active_flag: null }] });
const mockRes = () => ({ statusCode: null, body: null, headers: {},
  status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; },
  json(o) { this.body = o; return this; }, end() { return this; } });
const { default: handler } = await import('../../../api/read/my-numbers.mjs');
for (const role of ['inquiry_specialist', 'closer', 'owner', 'funding_advisor']) {
  for (const query of [{}, { staff_id: OTHER }]) {
    const q = mock.method(dbModule.db, 'query', async (sql) => {
      const s = String(sql?.text ?? sql);
      if (/FROM live JOIN staff/i.test(s)) return row(role);
      return { rows: [], rowCount: 0 };
    });
    const res = mockRes();
    let out;
    try { await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, query }, res, {}); out = `${res.statusCode} ${res.body?.error || ''} ${res.body?.message || ''}`; }
    catch (e) { out = `threw ${String(e.message).slice(0, 60)}`; }
    finally { q.mock.restore(); }
    console.log(`${role.padEnd(20)} ${query.staff_id ? 'with staff_id' : 'own numbers  '} -> ${out}`);
  }
}
