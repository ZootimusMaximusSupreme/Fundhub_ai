// READ ONLY. What deck state sent #11's 18:05Z pay link + contract.
import { pool, close } from "../../../src/db.mjs";
const ELEVEN = "029964c5-4d8e-47ed-88c9-53ac13863fd4";
const c = await pool().connect();
async function opt(sql, params) { await c.query("SAVEPOINT sp"); try { const r = await c.query(sql, params); await c.query("RELEASE SAVEPOINT sp"); return r.rows; } catch (e) { await c.query("ROLLBACK TO SAVEPOINT sp"); return [{ err: e.message }]; } }
try {
  await c.query("BEGIN READ ONLY");
  const cols = await opt(`SELECT column_name FROM information_schema.columns WHERE table_name='payment_links' ORDER BY ordinal_position`, []);
  console.log("payment_links cols:", cols.map(r => r.column_name || r.err).join(","));
  const pl = await opt(`SELECT * FROM payment_links WHERE client_id=$1 AND created_at BETWEEN '2026-09-17 18:04:00+00' AND '2026-09-17 18:06:00+00'`, [ELEVEN]);
  for (const r of pl) { const o = { ...r }; for (const k of Object.keys(o)) if (/url|token|secret|checkout/i.test(k)) o[k] = o[k] ? "[set]" : null; console.log("PL", JSON.stringify(o)); }
  const ev = await opt(`SELECT name, created_at, payload FROM events WHERE client_id=$1 AND created_at BETWEEN '2026-09-17 18:04:30+00' AND '2026-09-17 18:05:30+00' ORDER BY created_at`, [ELEVEN]);
  for (const r of ev) { const p = { ...(r.payload || {}) }; for (const k of Object.keys(p)) if (/url|token|link|secret/i.test(k)) p[k] = "[x]"; console.log("EV", r.name || r.err, r.created_at?.toISOString?.(), JSON.stringify(p).slice(0, 400)); }
  await c.query("COMMIT");
} catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
finally { c.release(); await close(); }
