import pg from "pg";
import { asStaff } from "../../src/partners/rls.mjs";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const r = await asStaff(async (tx) => {
  const q = async (sql) => (await tx.query(sql)).rows;
  return {
    attribution: await q(`SELECT to_char(captured_at,'YYYY-MM-DD') d, lane::text, ad_id, variant,
                                 utm_source, utm_campaign, utm_content, landing_path
                            FROM client_ad_attribution ORDER BY captured_at DESC LIMIT 10`),
    attribution_since_ads: await q(`SELECT count(*)::int n FROM client_ad_attribution WHERE captured_at >= '2026-09-26'`),
    clients_30d: await q(`SELECT count(*)::int n FROM clients WHERE created_at > now() - interval '30 days'`),
    clients_since_ads: await q(`SELECT count(*)::int n FROM clients WHERE created_at >= '2026-09-26'`),
    funnel_latest: await q(`SELECT max(stat_date)::text last_stat, max(captured_at)::text last_capture FROM funnel_page_stats`),
  };
});
console.log(JSON.stringify(r, null, 2));
await db.end();
