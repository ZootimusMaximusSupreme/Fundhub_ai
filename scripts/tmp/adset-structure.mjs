import pg from "pg";
import { asStaff } from "../../src/partners/rls.mjs";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const r = await asStaff(async (tx) => ({
  sets: (await tx.query(
    `SELECT s.name AS ad_set, s.status, s.budget_cents, s.learning_until, c.name AS campaign, c.objective,
            (SELECT count(*)::int FROM ads a WHERE a.ad_set_id = s.id) AS ads_in_set
       FROM ad_sets s JOIN campaigns c ON c.id = s.campaign_id ORDER BY c.created_at, s.name`)).rows,
  ads: (await tx.query(
    `SELECT a.name AS ad, a.status, s.name AS ad_set FROM ads a
       LEFT JOIN ad_sets s ON s.id = a.ad_set_id ORDER BY s.name NULLS FIRST, a.name`)).rows,
}));
console.log("AD SETS:"); console.table(r.sets);
console.log("ADS -> AD SET:"); console.table(r.ads);
await db.end();
