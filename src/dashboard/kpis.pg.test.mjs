/* Postgres-backed test for the KPI ad spend read under the app's own login (K5).
 *
 * ad_metrics_daily carries partner row-level security (046). On the app's
 * database role with no actor stamped it reads EMPTY — spend $0, so cost per
 * funded showed $0 — which is why computeKpis reads spend inside a staff scope,
 * the way src/ops/brief-offers.mjs reads the ad tables.
 *
 * One transaction, rolled back at the end, on the unprivileged fundhub_app role
 * (src/testing/rls-pool.mjs). The fixture is written stamped as staff, then the
 * stamp is cleared, so computeKpis sees what the plain app login sees; the
 * staffScope handed in stamps staff on that same transaction for its one read.
 *
 * Skipped without DATABASE_URL, like every *.pg.test.mjs — and a skip is not
 * green. Never point this at the live database. */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { close } from "../db.mjs";
import { rlsPool, closeRlsPool } from "../testing/rls-pool.mjs";
import { computeKpis } from "./kpis.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const TAG = "k5-kpis-pg";

describe("KPI ad spend under the app's own login, against the real schema", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  after(async () => { await closeRlsPool(); await close(); });

  test("cost per funded uses the real ad spend, not the $0 the plain app login reads", async (t) => {
    const client = await rlsPool().connect();
    try {
      await client.query("BEGIN");
      const who = (await client.query(
        `SELECT current_user AS name, (rolsuper OR rolbypassrls) AS bypass
           FROM pg_roles WHERE rolname = current_user`
      )).rows[0];
      if (who.bypass) {
        t.diagnostic(`${who.name} skips row-level security, so this test proves NOTHING. ` +
                     "Set APP_DATABASE_URL to the fundhub_app role and run again.");
        return;
      }

      const stamp = (actor) => client.query("SELECT set_config('fundhub.actor', $1, true)", [actor]);
      await client.query("SELECT set_config('fundhub.partner_id', '', true)");
      await stamp("staff");
      const tx = { query: (sql, params) => client.query(sql, params) };
      const one = async (sql, params) => (await tx.query(sql, params)).rows[0].id;

      const org = await one(`INSERT INTO orgs (slug, name) VALUES ($1,'K5 KPI fixture') RETURNING id`, [TAG]);
      await tx.query(
        `INSERT INTO ad_platform_category_map (org_id, platform, offer_type, special_ad_category)
         VALUES ($1,'meta','funding','CREDIT')`, [org]);
      const partner = await one(
        `INSERT INTO partners (org_id, name, slug, status, agreement_signed_at)
         VALUES ($1,'K5 KPI partner',$2,'active',now()) RETURNING id`, [org, TAG]);
      const conn = await one(
        `INSERT INTO ad_platform_connections
           (org_id, partner_id, platform, external_ad_account_id, connection_state,
            platform_verification_state, encrypted_access_token)
         VALUES ($1,$2,'meta',$3,'active','approved','v1:x:y:z') RETURNING id`, [org, partner, `acct-${TAG}`]);
      const camp = await one(
        `INSERT INTO campaigns (org_id, partner_id, connection_id, name, offer_type, budget_cents, approval_state)
         VALUES ($1,$2,$3,'K5 KPI campaign','funding',10000,'draft') RETURNING id`, [org, partner, conn]);
      const adSet = await one(
        `INSERT INTO ad_sets (org_id, partner_id, connection_id, campaign_id, name, budget_cents, approval_state)
         VALUES ($1,$2,$3,$4,'K5 KPI ad set',10000,'draft') RETURNING id`, [org, partner, conn, camp]);
      const ad = await one(
        `INSERT INTO ads (org_id, partner_id, connection_id, campaign_id, ad_set_id, name, approval_state, status)
         VALUES ($1,$2,$3,$4,$5,'K5 KPI ad','draft','ACTIVE') RETURNING id`, [org, partner, conn, camp, adSet]);
      // Three days at $100 a day, inside the 7-day window.
      for (const back of [1, 2, 3]) {
        await tx.query(
          `INSERT INTO ad_metrics_daily (org_id, partner_id, ad_id, date, spend_cents, impressions, clicks)
           VALUES ($1,$2,$3,CURRENT_DATE - $4::int,10000,1000,2)`, [org, partner, ad, back]);
      }
      const person = await one(
        `INSERT INTO clients (org_id, email, first_name, last_name)
         VALUES ($1,$2,'K5','Funded') RETURNING id`, [org, `${TAG}@example.com`]);
      await tx.query(
        `INSERT INTO funding_rounds (org_id, client_id, round_number, status, funded_amount)
         VALUES ($1,$2,1,'funded',50000)`, [org, person]);

      // The plain app login: stamp cleared, the ad rows are hidden.
      await stamp("");
      const hidden = await tx.query(`SELECT count(*)::int AS n FROM ad_metrics_daily WHERE org_id = $1`, [org]);
      assert.equal(hidden.rows[0].n, 0,
        "the plain app login saw ad rows — row-level security is not applying, so this test proves nothing");

      // The staff scope, on this same transaction, for exactly the reads handed to it.
      let scoped = 0;
      const staffScope = async (fn) => {
        scoped += 1;
        await stamp("staff");
        try { return await fn(tx); } finally { await stamp(""); }
      };
      const kpis = await computeKpis(tx, { orgId: org, period: "7d", staffScope });

      assert.equal(kpis.funded_count, 1);
      assert.equal(kpis.cost_per_funded_cents, 30000,
        "3 days at $100 over 1 funded client is $300 per funded, not $0");
      assert.equal(scoped, 1, "the ad spend read runs inside the staff scope");
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });
});
