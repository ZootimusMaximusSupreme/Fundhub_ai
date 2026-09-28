import pg from "pg";
import { asStaff } from "../../src/partners/rls.mjs";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const r = await asStaff(async (tx) => ({
  ads: (await tx.query(`SELECT a.name, a.external_id, a.status, a.created_at FROM ads a ORDER BY a.created_at`)).rows,
  rows: (await tx.query(
    `SELECT to_char(m.date,'YYYY-MM-DD') d, a.name ad,
            m.spend_cents s, m.impressions i, m.clicks c, m.conversions cv,
            m.video_plays vp, m.video_p25_watched p25, m.video_thruplay_watched tp,
            to_char(m.synced_at,'YYYY-MM-DD HH24:MI') synced
       FROM ad_metrics_daily m JOIN ads a ON a.id=m.ad_id ORDER BY m.date DESC`)).rows,
  bydate: (await tx.query(
    `SELECT to_char(date,'YYYY-MM-DD') d, sum(spend_cents)::int s, sum(impressions)::int i,
            sum(clicks)::int c, sum(conversions)::int cv
       FROM ad_metrics_daily GROUP BY date ORDER BY date`)).rows,
  campaigns: (await tx.query(`SELECT name, status, objective, created_at FROM campaigns ORDER BY created_at`)).rows.slice(0,20),
}));
console.log("ADS:"); console.table(r.ads);
console.log("SPEND BY DAY:"); console.table(r.bydate);
console.log("ROWS:"); console.table(r.rows);
console.log("CAMPAIGNS:"); console.table(r.campaigns);
await db.end();
