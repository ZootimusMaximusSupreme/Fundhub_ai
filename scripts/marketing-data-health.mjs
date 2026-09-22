#!/usr/bin/env node
/**
 * Read-only: can we pull Meta + ClickFunnels marketing data right now?
 * Never prints secret values — names and counts only.
 */
import pg from "pg";
import { asStaff } from "../src/partners/rls.mjs";

const env = process.env;

function flag(name) {
  return Boolean(String(env[name] ?? "").trim());
}

async function main() {
  const report = {
    env: {
      CLICKFUNNELS_API_KEY: flag("CLICKFUNNELS_API_KEY"),
      CLICKFUNNELS_SUBDOMAIN: flag("CLICKFUNNELS_SUBDOMAIN"),
      META_ACCESS_TOKEN: flag("META_ACCESS_TOKEN"),
      META_AD_ACCOUNT_ID: flag("META_AD_ACCOUNT_ID"),
      META_BUSINESS_ID: flag("META_BUSINESS_ID"),
      AD_TOKEN_ENC_KEY: flag("AD_TOKEN_ENC_KEY"),
      DATABASE_URL: flag("DATABASE_URL"),
    },
    database: null,
  };

  if (!env.DATABASE_URL) {
    console.log(JSON.stringify({ ...report, blocked: "DATABASE_URL unset" }, null, 2));
    return;
  }

  const db = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await db.connect();

  const database = await asStaff(async (tx) => {
    const analytics = (await tx.query(
      `SELECT platform, connection_state, last_synced_at,
              (last_error IS NOT NULL) AS has_error
         FROM analytics_connections ORDER BY platform`
    )).rows;

    const metaConns = (await tx.query(
      `SELECT p.slug, c.connection_state, c.external_ad_account_id,
              (c.encrypted_access_token IS NOT NULL) AS has_token, c.last_synced_at
         FROM ad_platform_connections c
         JOIN partners p ON p.id = c.partner_id
        WHERE c.platform = 'meta'
        ORDER BY p.slug`
    )).rows;

    const counts = (await tx.query(
      `SELECT
         (SELECT count(*)::int FROM funnel_page_stats) AS funnel_page_stats,
         (SELECT count(*)::int FROM ad_metrics_daily) AS ad_metrics_daily,
         (SELECT count(*)::int FROM ads) AS ads`
    )).rows[0];

    return { analytics_connections: analytics, meta_connections: metaConns, row_counts: counts };
  }, { db });

  report.database = database;
  const analytics = database.analytics_connections;
  const metaConns = database.meta_connections;
  const counts = database.row_counts;

  const blocked = [];
  if (!report.env.CLICKFUNNELS_API_KEY || !report.env.CLICKFUNNELS_SUBDOMAIN) {
    blocked.push("ClickFunnels: set CLICKFUNNELS_API_KEY + CLICKFUNNELS_SUBDOMAIN in .env / Netlify");
  }
  if (!analytics.some((r) => r.platform === "clickfunnels" && r.connection_state === "active")) {
    blocked.push("ClickFunnels: no active analytics_connections row — run npm run marketing:data:bootstrap");
  }
  const metaTokenInDb = metaConns.some((r) => r.has_token);
  if (!metaTokenInDb && !report.env.META_ACCESS_TOKEN) {
    blocked.push("Meta: META_ACCESS_TOKEN missing and no DB token — run marketing:data:bootstrap after adding token");
  } else if (!report.env.META_ACCESS_TOKEN && metaTokenInDb) {
    report.warnings = [
      ...(report.warnings || []),
      "Meta: token exists in DB but META_ACCESS_TOKEN not in this shell — Netlify still needs it for server sweeps",
    ];
  }
  if (counts.ad_metrics_daily === 0 && metaTokenInDb) {
    blocked.push("Meta: ad_metrics_daily empty — run Sync Meta now or wait for 7am sweeper");
  }
  if (counts.funnel_page_stats === 0) {
    blocked.push("ClickFunnels: funnel_page_stats empty — sync never succeeded");
  }

  report.blocked = blocked;
  report.ok = blocked.length === 0;

  await db.end();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
