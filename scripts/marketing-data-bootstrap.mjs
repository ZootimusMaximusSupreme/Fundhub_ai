#!/usr/bin/env node
/**
 * Wire marketing pulls from env into the live DB, then run sync once.
 * Requires: DATABASE_URL, AD_TOKEN_ENC_KEY, ClickFunnels env; Meta optional.
 */
import pg from "pg";
import { asStaff } from "../src/partners/rls.mjs";
import { encryptToken } from "../src/adplatforms/tokens.mjs";
import { listFunnels } from "../src/analytics/clickfunnels.mjs";
import { runClickfunnelsOrgSync } from "../src/analytics/clickfunnels-org-sync.mjs";
import { syncPartnerConnections } from "../api/campaigns/sync.mjs";
import { normalizeMetaAdAccountId } from "../src/adplatforms/meta.mjs";

const FUNDHUB_DIRECT_SLUG = "fundhub-direct";

async function defaultOrgId(db) {
  const row = (await db.query(`SELECT id FROM orgs WHERE is_default LIMIT 1`)).rows[0];
  if (!row) throw new Error("no default org");
  return row.id;
}

async function fundhubDirectPartner(db) {
  const row = (await db.query(
    `SELECT id, org_id FROM partners WHERE slug = $1 LIMIT 1`,
    [FUNDHUB_DIRECT_SLUG]
  )).rows[0];
  if (!row) throw new Error(`partner ${FUNDHUB_DIRECT_SLUG} not found`);
  return row;
}

async function wireClickfunnels(db, orgId) {
  const apiKey = String(process.env.CLICKFUNNELS_API_KEY ?? "").trim();
  const subdomain = String(process.env.CLICKFUNNELS_SUBDOMAIN ?? "").trim().toLowerCase();
  if (!apiKey || !subdomain) {
    return { skipped: true, reason: "CLICKFUNNELS_API_KEY or CLICKFUNNELS_SUBDOMAIN missing" };
  }

  const encrypted = encryptToken(JSON.stringify({ api_key: apiKey, subdomain }), { partnerId: orgId });
  await listFunnels({ encrypted_credentials: encrypted, org_id: orgId });

  const row = await asStaff((tx) => tx.query(
    `INSERT INTO analytics_connections
       (org_id, platform, external_account_id, encrypted_credentials, connection_state, last_error)
     VALUES ($1, 'clickfunnels', $2, $3, 'active', NULL)
     ON CONFLICT (org_id, platform) DO UPDATE SET
       external_account_id   = EXCLUDED.external_account_id,
       encrypted_credentials = EXCLUDED.encrypted_credentials,
       connection_state      = 'active',
       last_error            = NULL,
       updated_at            = now()
     RETURNING id, connection_state`,
    [orgId, subdomain, encrypted]
  ).then((r) => r.rows[0]), { db });

  const sync = await runClickfunnelsOrgSync({ orgId, days: 90, deps: { db } });
  return { skipped: false, connection: row, sync };
}

async function wireMeta(db, partner) {
  const token = String(process.env.META_ACCESS_TOKEN ?? "").trim();
  const adAccount = normalizeMetaAdAccountId(process.env.META_AD_ACCOUNT_ID);
  const businessId = String(process.env.META_BUSINESS_ID ?? "").replace(/\D/g, "");

  if (!token) {
    return { skipped: true, reason: "META_ACCESS_TOKEN missing" };
  }
  if (!adAccount) {
    return { skipped: true, reason: "META_AD_ACCOUNT_ID missing or invalid" };
  }

  const enc = encryptToken(token, { partnerId: partner.id });
  const row = await asStaff(async (tx) => {
    const existing = (await tx.query(
      `SELECT id FROM ad_platform_connections
        WHERE partner_id = $1 AND platform = 'meta' AND external_ad_account_id = $2`,
      [partner.id, adAccount]
    )).rows[0];

    if (existing) {
      return (await tx.query(
        `UPDATE ad_platform_connections SET
           encrypted_access_token = $2,
           external_business_id = COALESCE(NULLIF($3, ''), external_business_id),
           connection_state = 'pending',
           last_error = NULL,
           updated_at = now()
         WHERE id = $1
         RETURNING id, connection_state, external_ad_account_id`,
        [existing.id, enc, businessId || null]
      )).rows[0];
    }

    return (await tx.query(
      `INSERT INTO ad_platform_connections
         (org_id, partner_id, platform, external_business_id, external_ad_account_id,
          encrypted_access_token, scopes, connection_state, platform_verification_state)
       VALUES ($1,$2,'meta',$3,$4,$5,'[\"ads_read\",\"ads_management\"]'::jsonb,'pending','unverified')
       RETURNING id, connection_state, external_ad_account_id`,
      [partner.org_id, partner.id, businessId || "1475597360226485", adAccount, enc]
    )).rows[0];
  }, { db });

  let sync = null;
  try {
    sync = await syncPartnerConnections({ partnerId: partner.id, deps: { db } });
  } catch (err) {
    sync = { error: err.code || err.message };
  }

  return { skipped: false, connection: row, sync };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (!process.env.AD_TOKEN_ENC_KEY) throw new Error("AD_TOKEN_ENC_KEY required");

  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  await db.connect();

  const orgId = await defaultOrgId(db);
  const partner = await fundhubDirectPartner(db);

  const clickfunnels = await wireClickfunnels(db, orgId);
  const meta = await wireMeta(db, partner);

  await db.end();

  console.log(JSON.stringify({
    ok: true,
    orgId,
    partner: { id: partner.id, slug: FUNDHUB_DIRECT_SLUG },
    clickfunnels,
    meta,
    next: "Run npm run marketing:data:health. Set META_ACCESS_TOKEN on Netlify production if Meta sync was skipped.",
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
