/* Postgres-backed test for the brief's per-offer / per-funnel split (MB6).
 *
 * Every fixture row and every read happen inside ONE transaction that is rolled
 * back at the end, stamped as staff exactly the way src/partners/rls.mjs does
 * (ads, ad_scripts, creative_assets, ad_metrics_daily, bookings and
 * client_ad_attribution carry row-level security). So it runs as the
 * unprivileged fundhub_app role and leaves nothing behind.
 *
 * Skipped without DATABASE_URL, like every *.pg.test.mjs — and a skip is not
 * green. Never point this at the live database. */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { pool, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { buildMorningBrief } from "./morning-brief.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

// 13:00 UTC on 2001-04-12 is 6:00 a.m. Arizona; the morning covers 2001-04-11.
const MORNING = new Date("2001-04-12T13:00:00Z");
const IN_WINDOW = "2001-04-11T18:00:00Z";
const OFFER = "mbtest_offer";
const TAG = "mb_offers_pg";

describe("brief per offer and funnel, against the real schema", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  after(async () => { await close(); });

  test("ads, people, calls, sales and cash split by the ad's script offer and the person's first page", async () => {
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('fundhub.actor', 'staff', true)");
      await client.query("SELECT set_config('fundhub.partner_id', '', true)");
      const tx = { query: (sql, params) => client.query(sql, params) };
      const one = async (sql, params) => (await tx.query(sql, params)).rows[0].id;
      const org = await resolveDefaultOrg(tx);

      const partner = await one(
        `INSERT INTO partners (org_id, name, slug, status, agreement_signed_at)
         VALUES ($1,'MB offers fixture','mb-offers-pg-partner','active',now()) RETURNING id`, [org]);
      const conn = await one(
        `INSERT INTO ad_platform_connections
           (org_id, partner_id, platform, external_ad_account_id, connection_state,
            platform_verification_state, encrypted_access_token)
         VALUES ($1,$2,'meta',$3,'active','approved','v1:x:y:z') RETURNING id`, [org, partner, `acct-${TAG}`]);
      const camp = await one(
        `INSERT INTO campaigns (org_id, partner_id, connection_id, name, offer_type, budget_cents, approval_state)
         VALUES ($1,$2,$3,'MB offers campaign','funding',10000,'draft') RETURNING id`, [org, partner, conn]);
      const adSet = await one(
        `INSERT INTO ad_sets (org_id, partner_id, connection_id, campaign_id, name, budget_cents, approval_state)
         VALUES ($1,$2,$3,$4,'MB offers ad set',10000,'draft') RETURNING id`, [org, partner, conn, camp]);
      const script = await one(
        `INSERT INTO ad_scripts (org_id, partner_id, title, body, offer_key)
         VALUES ($1,$2,'MB offers script','HOOK: test.',$3) RETURNING id`, [org, partner, OFFER]);
      const asset = await one(
        `INSERT INTO creative_assets (org_id, partner_id, kind, format, ai_generated, script_id)
         VALUES ($1,$2,'video','9x16',true,$3) RETURNING id`, [org, partner, script]);
      const ad = (name, assetId, number) => one(
        `INSERT INTO ads (org_id, partner_id, connection_id, campaign_id, ad_set_id, name, approval_state, asset_id, fundhub_ad_number)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8) RETURNING id`, [org, partner, conn, camp, adSet, name, assetId, number]);
      const labelled = await ad("MB offers labelled", asset, "973101");
      const bare = await ad("MB offers bare", null, "973102");
      for (const [adId, cents] of [[labelled, 30000], [bare, 5000]]) {
        await tx.query(
          `INSERT INTO ad_metrics_daily (org_id, partner_id, ad_id, date, spend_cents, impressions, clicks)
           VALUES ($1,$2,$3,'2001-04-11',$4,100,1)`, [org, partner, adId, cents]);
      }

      // People: two from the labelled ad (watch and roadmap), one from the bare ad.
      const person = async (tag, content, page) => {
        const id = await one(
          `INSERT INTO clients (org_id, email, first_name, last_name, created_at)
           VALUES ($1,$2,'MB','Offers',$3) RETURNING id`, [org, `${TAG}.${tag}@example.com`, IN_WINDOW]);
        await tx.query(
          `INSERT INTO client_ad_attribution (client_id, org_id, utm_campaign, utm_content, landing_path)
           VALUES ($1,$2,'premium',$3,$4)`, [id, org, content, page]);
        return id;
      };
      const w = await person("w", "973101", "/watch");
      const r = await person("r", "973101", "/roadmap/");
      const b = await person("b", "973102", null);

      for (const id of [w, r]) {
        await tx.query(`INSERT INTO bookings (org_id, client_id, source, status, created_at) VALUES ($1,$2,'sim','booked',$3)`, [org, id, IN_WINDOW]);
      }
      await tx.query(`INSERT INTO bookings (org_id, client_id, source, status, created_at) VALUES ($1,NULL,'sim','booked',$2)`, [org, IN_WINDOW]);

      const closer = await one(
        `INSERT INTO staff (org_id, name, role, email, status) VALUES ($1,'MB Offers Closer','closer',$2,'active') RETURNING id`,
        [org, `${TAG}.closer@example.com`]);
      await tx.query(`INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, logged_at) VALUES ($1,$2,$3,'deposit',$4)`, [org, w, closer, IN_WINDOW]);
      await tx.query(`INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, logged_at) VALUES ($1,$2,$3,'no_show',$4)`, [org, r, closer, IN_WINDOW]);
      await tx.query(`INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome, logged_at) VALUES ($1,$2,$3,'downsell',$4)`, [org, b, closer, IN_WINDOW]);

      await tx.query(
        `INSERT INTO sales (org_id, client_id, product_id, agreed_price, status, sold_at)
         VALUES ($1,$2,(SELECT id FROM products ORDER BY created_at LIMIT 1),297,'active',$3)`, [org, w, IN_WINDOW]);
      await tx.query(
        `INSERT INTO transactions (org_id, client_id, product_name, amount_paid, status, created_at)
         VALUES ($1,$2,'MB offers deposit',297.00,'succeeded',$3)`, [org, w, IN_WINDOW]);
      await tx.query(
        `INSERT INTO transactions (org_id, client_id, product_name, amount_paid, status, created_at)
         VALUES ($1,NULL,'MB offers walk-in',100.00,'paid',$2)`, [org, IN_WINDOW]);
      // Outside the window: must not count.
      await tx.query(
        `INSERT INTO transactions (org_id, client_id, product_name, amount_paid, status, created_at)
         VALUES ($1,$2,'MB offers later',999.00,'succeeded','2001-04-12T18:00:00Z')`, [org, w]);

      const brief = await buildMorningBrief(tx, {
        orgId: org, now: MORNING, env: { PLAID_ENV: "sandbox" },
        suggest: async () => ({ ok: true, suggestions: [] }),
        staffScope: (fn) => fn(tx)
      });

      const m = brief.marketing;
      assert.equal(m.status, "ok", m.line);
      const offer = m.offers.find((o) => o.key === OFFER);
      assert.ok(offer, "the labelled ad's offer is its own group");
      assert.equal(offer.totals.spend_cents, 30000);
      assert.equal(offer.totals.leads, 2);
      assert.equal(offer.totals.booked, 2);
      assert.equal(offer.totals.showed, 1);
      assert.equal(offer.totals.no_shows, 1);
      assert.equal(offer.totals.sales, 1);
      assert.equal(offer.totals.cash_cents, 29700);
      assert.equal(offer.totals.roas, 0.99);
      const funnels = Object.fromEntries(offer.funnels.map((f) => [f.key, f.totals]));
      assert.equal(funnels.watch.leads, 1);
      assert.equal(funnels.watch.sales, 1);
      assert.equal(funnels.watch.cash_cents, 29700);
      assert.equal(funnels.roadmap.no_shows, 1, "/roadmap/ with a trailing slash is the roadmap funnel");

      // The bare ad has no script label: its spend and its person sit under "No offer label".
      const none = m.offers.find((o) => o.key === "_no_offer_label");
      assert.ok(none.totals.spend_cents >= 5000);
      assert.ok(none.funnels.some((f) => f.key === "_no_landing_page"));

      // Cash with no person on it is shown once under all offers, with its reason.
      const cashNoPerson = m.all_offers.not_split.find((n) => n.key === "cash_no_person");
      assert.ok(cashNoPerson && cashNoPerson.value >= 10000);
      assert.ok(m.all_offers.not_split.find((n) => n.key === "booked_no_person").value >= 1);
      assert.match(cashNoPerson.reason, /no person/);

      // Closer: per offer, per funnel; close rate = deposits ÷ held.
      const c = brief.team.closers.find((x) => x.staff_id === closer);
      assert.equal(c.calls_held, 2);
      assert.equal(c.no_shows, 1);
      assert.equal(c.deposits, 1);
      assert.equal(c.close_rate, 0.5);
      const co = c.offers.find((o) => o.key === OFFER);
      assert.equal(co.totals.deposits, 1);
      assert.deepEqual(co.funnels.map((f) => f.key).sort(), ["roadmap", "watch"]);
      assert.ok(brief.team.all_offers.not_split.length >= 1);

      assert.ok(brief.text_body.startsWith("Good morning, Chris. Thursday, April 12."));
      assert.match(brief.text_body, /\n\nFull report: https:\/\/fundhub\.ai\/app\/morning-brief\.html\?date=2001-04-12$/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
