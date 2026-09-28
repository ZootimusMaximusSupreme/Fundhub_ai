// Read-only pull of Meta ad metrics + ClickFunnels funnel stats from the live DB.
import pg from "pg";
import { asStaff } from "/Users/chrisstanbridge/Developer/fundhub-platform/src/partners/rls.mjs";

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const out = await asStaff(async (tx) => {
  const ads = (await tx.query(
    `SELECT a.id, a.name, a.external_id, a.status, p.slug AS partner
       FROM ads a JOIN partners p ON p.id = a.partner_id
      ORDER BY a.created_at`
  )).rows;

  const daily = (await tx.query(
    `SELECT m.date, a.name AS ad, a.external_id,
            m.spend_cents, m.impressions, m.reach, m.frequency, m.clicks,
            m.ctr, m.conversions, m.cpa_cents,
            m.video_plays, m.video_continuous_2s_watched,
            m.video_p25_watched, m.video_p50_watched, m.video_p75_watched,
            m.video_p95_watched, m.video_p100_watched, m.video_thruplay_watched,
            m.synced_at
       FROM ad_metrics_daily m JOIN ads a ON a.id = m.ad_id
      ORDER BY m.date DESC, a.name`
  )).rows;

  const totals = (await tx.query(
    `SELECT min(date) AS first_day, max(date) AS last_day,
            count(*)::int AS rows,
            sum(spend_cents)::bigint AS spend_cents,
            sum(impressions)::bigint AS impressions,
            sum(clicks)::bigint AS clicks,
            sum(conversions)::bigint AS conversions,
            sum(video_plays)::bigint AS video_plays,
            sum(video_p25_watched)::bigint AS p25,
            sum(video_p50_watched)::bigint AS p50,
            sum(video_p75_watched)::bigint AS p75,
            sum(video_p100_watched)::bigint AS p100,
            sum(video_thruplay_watched)::bigint AS thruplay
       FROM ad_metrics_daily`
  )).rows[0];

  const cf = (await tx.query(
    `SELECT stat_date, funnel_name, page_name, views, conversions, captured_at
       FROM funnel_page_stats ORDER BY stat_date DESC, page_name`
  )).rows;

  return { ads, daily, totals, cf };
});

console.log(JSON.stringify(out, null, 2));
await db.end();
