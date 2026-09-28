import pg from "pg";
import { asStaff } from "../../src/partners/rls.mjs";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const r = await asStaff(async (tx) => {
  const q = async (sql) => { try { return (await tx.query(sql)).rows; } catch (e) { return [{ error: String(e.message).slice(0,120) }]; } };
  return {
    attribution_total: await q(`SELECT count(*)::int n FROM client_ad_attribution`),
    attribution_30d:   await q(`SELECT count(*)::int n FROM client_ad_attribution WHERE created_at > now() - interval '30 days'`),
    attribution_recent: await q(`SELECT to_char(created_at,'YYYY-MM-DD') d, lane, ad_id, variant, utm_campaign, utm_content
                                   FROM client_ad_attribution ORDER BY created_at DESC LIMIT 10`),
    clients_30d: await q(`SELECT count(*)::int n FROM clients WHERE created_at > now() - interval '30 days'`),
    clients_since_ads: await q(`SELECT count(*)::int n FROM clients WHERE created_at >= '2026-09-26'`),
    funnel_latest: await q(`SELECT max(stat_date)::text last_stat, max(captured_at)::text last_capture FROM funnel_page_stats`),
  };
});
console.log(JSON.stringify(r, null, 2));
await db.end();
