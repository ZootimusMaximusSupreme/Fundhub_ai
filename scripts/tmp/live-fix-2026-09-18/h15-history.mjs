// HOLE 15 — read-only history of Apply proxy sessions. Masks the account id.
import { pool, close } from "../../../src/db.mjs";
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const byStatus = (await c.query(`SELECT status, coalesce(error_code,'-') AS error_code, count(*)::int AS n, min(started_at) AS first, max(started_at) AS last FROM proxy_sessions GROUP BY 1,2 ORDER BY last DESC`)).rows;
  const shapes = (await c.query(`SELECT started_at, status, coalesce(error_code,'-') AS error_code, proxy_username FROM proxy_sessions WHERE proxy_username IS NOT NULL ORDER BY started_at DESC LIMIT 8`)).rows
    .map(r => ({ at: r.started_at, status: r.status, error_code: r.error_code,
      shape: String(r.proxy_username).replace(/^customer-([^-]+)/, (m, id) => `customer-<id len ${id.length}${/^customer/i.test(id) ? ' STARTS-customer' : ''}${/\s/.test(id) ? ' HAS-SPACE' : ''}>`).replace(/sessid-[A-Za-z0-9]+/, 'sessid-<x>') }));
  await c.query("COMMIT");
  console.log(JSON.stringify({ byStatus, shapes }, null, 1));
} finally { c.release(); await close(); }
