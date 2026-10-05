/* Every lead gets its ad number, its offer tag and its level — against a real
 * Postgres (spec M0 step 5, migrations 411 and 412).
 *
 *   * v_client_ad_number: the three resolver steps, in order; 043 = 43; a name
 *     two ads disagree on resolves to nothing; a bare query (no asStaff) sees
 *     no ads rows, so only step 1 answers there.
 *   * v_visitor_ad_number: one row per email, first touch.
 *   * v_ad_offer_tag / v_client_offer_tag: script offer_key, then ad_offer_tags,
 *     then the Meta campaign, then the landing page; a page two offers share
 *     tags nobody.
 *   * v_client_level: each of the six levels from the tables 412 maps.
 *   * GET/POST marketing/ad-links: the unmatched list and Link.
 *   * The sync, with a fake Meta: link_clicks lands, our number is read off the
 *     ad's link and never overwrites a manual one, landing_url is stored.
 *
 * Runs in a throwaway org (src/marketing/pg-fixture.mjs) so the default org's
 * rows are never touched. SKIPS WITHOUT A DATABASE, LOUDLY — a skipped
 * .pg.test.mjs proves nothing. Never point it at the live database (spec §0.7).
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { db, close } from "../db.mjs";
import { asStaff } from "../partners/rls.mjs";
import { encryptToken } from "../adplatforms/tokens.mjs";
import { makeMarketingOrg, wipeMarketingOrg, mkReq, mkRes } from "../marketing/pg-fixture.mjs";
import { rlsPool, rlsIsReal, closeRlsPool } from "../testing/rls-pool.mjs";
import adLinks from "../../api/marketing/ad-links.mjs";
import adAttribution from "../../api/read/ad-attribution.mjs";
import { syncPartnerConnections } from "../../api/campaigns/sync.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const SLUG = `mm05-adnum-${process.pid}`;
const META_ID_A = "120253626444640264";
const META_ID_B = "120253626444640999";

describe("ad numbers, offer tags and lead levels", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org, tokens, staffIds, partnerId, connId, campA, campB, setA, setB;
  const ads = {};
  const clients = {};

  const client = async (tag, utm = null) => {
    const id = (await db.query(
      `INSERT INTO clients (org_id, email, first_name, last_name) VALUES ($1,$2,'Mm05',$3) RETURNING id`,
      [org, `${SLUG}.${tag}@example.com`, tag]
    )).rows[0].id;
    if (utm) {
      await db.query(
        `INSERT INTO client_ad_attribution (client_id, org_id, utm_campaign, utm_content, utm_term, landing_path)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, org, utm.campaign ?? null, utm.content ?? null, utm.term ?? null, utm.path ?? null]
      );
    }
    clients[tag] = id;
    return id;
  };

  const ad = (tx, key, { name, number = null, external = null, set = setA, camp = campA, landing = null }) =>
    tx.query(
      `INSERT INTO ads (org_id, partner_id, connection_id, campaign_id, ad_set_id, name,
                        fundhub_ad_number, fundhub_ad_number_source, external_id, landing_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [org, partnerId, connId, camp, set, name, number, number ? "manual" : null, external, landing]
    ).then((r) => { ads[key] = r.rows[0].id; });

  const one = async (sql, params) => (await asStaff((tx) => tx.query(sql, params))).rows;

  before(async () => {
    if (!process.env.AD_TOKEN_ENC_KEY) process.env.AD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");
    ({ orgId: org, tokens, ids: staffIds } = await makeMarketingOrg(SLUG));

    partnerId = (await db.query(
      `INSERT INTO partners (org_id, name, slug, status, contact_email, agreement_signed_at)
       VALUES ($1,'Mm05 partner',$2,'active',$3,now()) RETURNING id`,
      [org, SLUG, `${SLUG}@example.com`]
    )).rows[0].id;

    // 052 seeds the Meta category map for the default org only; a campaign
    // insert needs it (046 launch guard).
    await db.query(
      `INSERT INTO ad_platform_category_map (org_id, platform, offer_type, special_ad_category, notes)
       VALUES ($1,'meta','funding','CREDIT','mm05 test org') ON CONFLICT DO NOTHING`, [org]);

    // Offers: slo owns /roadmap; direct_book and blueprint share /watch.
    await db.query(
      `INSERT INTO marketing_offers (org_id, tag, name, status, steps, meta_campaign_ids) VALUES
         ($1,'slo','SLO','live','[{"type":"ad","url":null},{"type":"sales_page","url":"https://apply.fundhub.ai/roadmap"}]','{}'),
         ($1,'direct_book','Direct Book','live','[{"type":"vsl_page","url":"https://apply.fundhub.ai/watch"},{"type":"survey","url":"https://apply.fundhub.ai/apply"}]','{"camp-direct-1"}'),
         ($1,'blueprint','Blueprint','live','[{"type":"vsl_page","url":"https://apply.fundhub.ai/watch"}]','{}')`,
      [org]
    );
    await db.query(
      `INSERT INTO ad_offer_tags (org_id, ad_number, offer_tag, source) VALUES ($1, 43, 'direct_book', 'decision_9')`,
      [org]
    );

    await asStaff(async (tx) => {
      connId = (await tx.query(
        `INSERT INTO ad_platform_connections
           (org_id, partner_id, platform, external_ad_account_id, connection_state,
            platform_verification_state, encrypted_access_token)
         VALUES ($1,$2,'meta',$3,'active','approved',$4) RETURNING id`,
        [org, partnerId, `act_${SLUG}`, encryptToken("fake-token", { partnerId })]
      )).rows[0].id;
      const camp = (ext, name) => tx.query(
        `INSERT INTO campaigns (org_id, partner_id, connection_id, name, offer_type, budget_cents,
                                approval_state, external_id)
         VALUES ($1,$2,$3,$4,'funding',10000,'draft',$5) RETURNING id`,
        [org, partnerId, connId, name, ext]).then((r) => r.rows[0].id);
      campA = await camp("camp-direct-1", "oPur: TOF-Direct");
      campB = await camp("camp-other-2", "oPur: TOF-SLO: $297");
      const set = (c) => tx.query(
        `INSERT INTO ad_sets (org_id, partner_id, connection_id, campaign_id, name, budget_cents, approval_state)
         VALUES ($1,$2,$3,$4,'set',10000,'draft') RETURNING id`, [org, partnerId, connId, c]).then((r) => r.rows[0].id);
      setA = await set(campA);
      setB = await set(campB);

      // Ad 88 runs in two ad sets (allowed since 411) under Meta id A and a name.
      await ad(tx, "slo88a", { name: "oVid: SLO2", number: "88", external: META_ID_A, set: setB, camp: campB });
      await ad(tx, "slo88b", { name: "SLO Ad 88 — second set", number: "088", set: setB, camp: campB });
      // Two ads share a name but disagree on the number: never a guess.
      await ad(tx, "amb1", { name: "Twin name", number: "70", set: setB, camp: campB });
      await ad(tx, "amb2", { name: "Twin name", number: "71", set: setB, camp: campB });
      // No number yet, on a direct-book campaign, with Meta id B.
      await ad(tx, "nonum", { name: "oVid: Direct7", external: META_ID_B });
      // No number, other campaign, landing on /roadmap → slo by page.
      await ad(tx, "bypage", { name: "page only", set: setB, camp: campB, landing: "https://apply.fundhub.ai/roadmap/?utm_source=fb" });
      // No number, other campaign, landing on the shared /watch → untagged.
      await ad(tx, "shared", { name: "shared page", set: setB, camp: campB, landing: "https://apply.fundhub.ai/watch" });
      // A live script for ad 91 tagged slo, and one with an unknown offer_key.
      await tx.query(
        `INSERT INTO ad_scripts (org_id, partner_id, body, ad_id, offer_key) VALUES
           ($1,$2,'script 91','91','slo'), ($1,$2,'script 92','92','not_an_offer')`,
        [org, partnerId]);
      await ad(tx, "s91", { name: "script ad", number: "91", set: setB, camp: campB });
      await ad(tx, "s43", { name: "registry ad 43", number: "43", set: setB, camp: campB });
    });

    // Leads, one per resolver path.
    await client("digits", { content: "043-ringlights", campaign: "sorting", path: "/apply" });
    await client("metaid", { content: "oVid: SLO2", term: META_ID_A, campaign: "oPur: TOF-SLO: $297", path: "/roadmap/" });
    await client("byname", { content: "slo ad 88 — second set" });
    await client("twin", { content: "Twin name" });
    await client("nomatch", { content: "oVid: Direct7", term: META_ID_B, campaign: "oPur: TOF-Direct", path: "/watch" });
    await client("organic", { path: "/roadmap" });
    await client("shared", { path: "/watch" });
  });

  after(async () => {
    if (!org) { await close(); return; }
    await asStaff(async (tx) => {
      for (const t of ["ad_metrics_daily", "ads", "ad_sets", "campaigns", "ad_scripts", "ad_platform_connections"]) {
        await tx.query(`DELETE FROM ${t} WHERE org_id = $1`, [org]);
      }
    });
    for (const t of ["events", "transactions", "call_outcomes", "funding_rounds", "crs_results", "bookings"]) {
      await db.query(`DELETE FROM ${t} WHERE org_id = $1`, [org]);
    }
    await db.query(`DELETE FROM clients WHERE org_id = $1`, [org]);
    await db.query(`DELETE FROM partners WHERE org_id = $1`, [org]);
    await db.query(`DELETE FROM ad_platform_category_map WHERE org_id = $1`, [org]);
    await wipeMarketingOrg(org);
    await closeRlsPool();
    await close();
  });

  const numberOf = async (tag) => (await one(
    `SELECT ad_number, ad_number_source FROM v_client_ad_number WHERE client_id = $1`, [clients[tag]]))[0];

  // ── v_client_ad_number ──────────────────────────────────────────────────

  test("step 1: utm_content digits, compared as an integer (043 = 43)", async () => {
    assert.deepEqual(await numberOf("digits"), { ad_number: 43, ad_number_source: "utm_content" });
  });

  test("step 2: Meta's ad id in utm_term → that ad's number", async () => {
    assert.deepEqual(await numberOf("metaid"), { ad_number: 88, ad_number_source: "meta_ad_id" });
  });

  test("step 3: utm_content = the ad's name, any case; 088 and 88 agree", async () => {
    assert.deepEqual(await numberOf("byname"), { ad_number: 88, ad_number_source: "ad_name" });
  });

  test("read/ad-attribution answers with the RESOLVED number, not the bare utm_content digits", async () => {
    const r = mkRes();
    await adAttribution(mkReq(tokens.owner, { query: { client_id: clients.metaid } }), r);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.attribution.ad_id, null, "the bare column is empty for a live-ad lead");
    assert.equal(r.body.ad_number, 88);
    assert.equal(r.body.ad_number_source, "meta_ad_id");
    assert.equal(r.body.registry.id, "88");
  });

  test("two ads with one name and two numbers: no guess", async () => {
    assert.deepEqual(await numberOf("twin"), { ad_number: null, ad_number_source: null });
  });

  /* Meaningful only as the unprivileged app role: a superuser or table owner
     bypasses row-level security. CI's isolation step sets APP_DATABASE_URL. */
  test("a bare query sees no ads rows (forced RLS), so only step 1 answers — run it in asStaff()",
    { skip: rlsIsReal() ? false : "needs APP_DATABASE_URL (the unprivileged fundhub_app role)" }, async () => {
    const c = await rlsPool().connect();
    let bare;
    try {
      bare = (await c.query(
        `SELECT client_id, ad_number FROM v_client_ad_number WHERE org_id = $1`, [org])).rows;
    } finally { c.release(); }
    const by = Object.fromEntries(bare.map((r) => [r.client_id, r.ad_number]));
    assert.equal(by[clients.digits], 43);
    assert.equal(by[clients.metaid], null, "a bare query must not see the ads table");
  });

  test("v_visitor_ad_number: one row per email, first touch wins", async () => {
    const ev = (email, content, at) => db.query(
      `INSERT INTO events (org_id, name, payload, created_at)
       VALUES ($1,'slo.contact_started',$2::jsonb,$3)`,
      [org, JSON.stringify({ email, actor: "person", attribution: { utm_content: content } }), at]);
    await ev(`v1.${SLUG}@example.com`, "90-x", "2026-10-01T10:00:00Z");
    await ev(`V1.${SLUG}@example.com`, "84", "2026-10-02T10:00:00Z");
    await ev(`v2.${SLUG}@example.com`, "SLO Ad 88 — second set", "2026-10-02T10:00:00Z");
    const rows = await one(
      `SELECT email, ad_number, ad_number_source FROM v_visitor_ad_number WHERE org_id = $1 ORDER BY email`, [org]);
    assert.deepEqual(rows, [
      { email: `v1.${SLUG}@example.com`, ad_number: 90, ad_number_source: "utm_content" },
      { email: `v2.${SLUG}@example.com`, ad_number: 88, ad_number_source: "ad_name" }
    ]);
  });

  // ── tags ────────────────────────────────────────────────────────────────

  test("v_ad_offer_tag: script, then ad_offer_tags, then campaign, then landing page", async () => {
    const rows = await one(`SELECT ad_row_id, offer_tag, offer_tag_source FROM v_ad_offer_tag WHERE org_id = $1`, [org]);
    const by = Object.fromEntries(rows.map((r) => [r.ad_row_id, [r.offer_tag, r.offer_tag_source]]));
    assert.deepEqual(by[ads.s91], ["slo", "script"]);
    assert.deepEqual(by[ads.s43], ["direct_book", "ad_offer_tags"]);
    assert.deepEqual(by[ads.nonum], ["direct_book", "campaign"]);
    assert.deepEqual(by[ads.bypage], ["slo", "landing_page"]);
    assert.deepEqual(by[ads.shared], [null, null], "a page two offers share tags nobody");
  });

  test("an offer_key that is not a real offer tag is not a tag", async () => {
    const t = await one(`SELECT * FROM fundhub_offer_tag_for_number($1, 92)`, [org]);
    assert.deepEqual(t, []);
  });

  test("v_client_offer_tag: each lead's tag, by number, campaign or page", async () => {
    const rows = await one(`SELECT client_id, offer_tag, offer_tag_source FROM v_client_offer_tag WHERE org_id = $1`, [org]);
    const by = Object.fromEntries(rows.map((r) => [r.client_id, [r.offer_tag, r.offer_tag_source]]));
    assert.deepEqual(by[clients.digits], ["direct_book", "ad_offer_tags"]);
    assert.deepEqual(by[clients.nomatch], ["direct_book", "campaign"], "Meta ad id → its ad → its campaign");
    assert.deepEqual(by[clients.organic], ["slo", "landing_page"]);
    assert.deepEqual(by[clients.shared], [null, null]);
  });

  // ── v_client_level ──────────────────────────────────────────────────────

  test("v_client_level: cold → engaged → warm → pulled → client → funded, never down", async () => {
    const lv = {};
    for (const t of ["cold", "survey", "booked", "warm", "noshow", "pulled", "paid", "diag", "funded", "demo"]) {
      lv[t] = await client(`lv-${t}`);
    }
    const s = staffIds.owner;
    await db.query(`INSERT INTO events (org_id, name, client_id) VALUES ($1,'survey.submitted',$2)`, [org, lv.survey]);
    await db.query(`INSERT INTO bookings (org_id, source, status, attendee_email) VALUES ($1,'sim','booked',$2)`,
      [org, `${SLUG}.lv-booked@example.com`.toUpperCase()]);
    await db.query(`INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome) VALUES ($1,$2,$3,'callback')`, [org, lv.warm, s]);
    await db.query(`INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome) VALUES ($1,$2,$3,'no_show')`, [org, lv.noshow, s]);
    await db.query(`INSERT INTO crs_results (org_id, client_id, result) VALUES ($1,$2,'{}')`, [org, lv.pulled]);
    await db.query(`INSERT INTO transactions (org_id, client_id, product_name, status) VALUES ($1,$2,'roadmap','succeeded')`, [org, lv.paid]);
    await db.query(`INSERT INTO transactions (org_id, client_id, product_name, status) VALUES ($1,$2,'roadmap','refunded')`, [org, lv.cold]);
    await db.query(`INSERT INTO events (org_id, name, client_id) VALUES ($1,'diagnostic.paid',$2)`, [org, lv.diag]);
    await db.query(`INSERT INTO call_outcomes (org_id, client_id, staff_id, outcome) VALUES ($1,$2,$3,'deposit')`, [org, lv.funded, s]);
    await db.query(`INSERT INTO funding_rounds (org_id, client_id, round_number, status, funded_amount) VALUES ($1,$2,1,'funded',50000)`, [org, lv.funded]);
    await db.query(`INSERT INTO transactions (org_id, client_id, product_name, status, is_demo) VALUES ($1,$2,'x','succeeded',true)`, [org, lv.demo]);

    const rows = (await db.query(`SELECT client_id, level, level_rank FROM v_client_level WHERE org_id = $1`, [org])).rows;
    const by = Object.fromEntries(rows.map((r) => [r.client_id, r.level]));
    assert.deepEqual(
      Object.fromEntries(Object.entries(lv).map(([k, id]) => [k, by[id]])),
      { cold: "cold", survey: "engaged", booked: "engaged", warm: "warm", noshow: "cold",
        pulled: "pulled", paid: "client", diag: "client", funded: "funded", demo: "cold" });
  });

  // ── the route ───────────────────────────────────────────────────────────

  test("marketing/ad-links: a csm is refused", async () => {
    const r = mkRes();
    await adLinks(mkReq(tokens.csm), r);
    assert.equal(r.code, 403);
  });

  test("GET lists the unmatched; POST Link sets the number on every ad with that id, and the lead resolves", async () => {
    let r = mkRes();
    await adLinks(mkReq(tokens.owner), r);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const row = r.body.unmatched.find((u) => u.meta_ad_id === META_ID_B);
    assert.ok(row, "the lead from the unnumbered Meta ad is not on the unmatched list");
    assert.equal(row.leads, 1);
    assert.equal(row.ads_known, 1);

    r = mkRes();
    await adLinks(mkReq(tokens.owner, { method: "POST", body: { ad_number: "095", meta_ad_id: META_ID_B } }), r);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.linked, 1);
    assert.equal(r.body.ads[0].fundhub_ad_number, "95");
    assert.equal(r.body.ads[0].fundhub_ad_number_source, "manual");
    assert.deepEqual(await numberOf("nomatch"), { ad_number: 95, ad_number_source: "meta_ad_id" });
  });

  test("POST refuses a bad number, nothing to match, and an id nobody has", async () => {
    const post = async (body) => { const r = mkRes(); await adLinks(mkReq(tokens.owner, { method: "POST", body }), r); return r; };
    assert.equal((await post({ ad_number: "abc", name: "x" })).body.error, "ad_number_invalid");
    assert.equal((await post({ ad_number: "9" })).body.error, "nothing_to_link");
    assert.equal((await post({ ad_number: "9", meta_ad_id: "42" })).body.error, "meta_ad_id_invalid");
    assert.equal((await post({ ad_number: "9", name: "no such ad" })).code, 404);
  });

  // ── the sync, with a fake Meta ──────────────────────────────────────────

  test("the sync stores link_clicks and reads our number off the ad's link, never over a manual one", async () => {
    const seen = [];
    const fake = async (url) => {
      const u = String(url);
      seen.push(u);
      let data = [];
      if (u.includes("/campaigns?")) data = [{ id: "camp-sync-1", name: "Sync camp", status: "ACTIVE" }];
      else if (u.includes("/adsets?")) data = [{ id: "set-sync-1", name: "Sync set", status: "ACTIVE" }];
      else if (u.includes("/ads?")) data = [
        { id: "900000000000000001", name: "Whatever", status: "ACTIVE",
          creative: { url_tags: "utm_source=fb&utm_content=96-new",
                      object_story_spec: { link_data: { link: "https://apply.fundhub.ai/roadmap" } } } },
        { id: META_ID_A, name: "SLO Ad 97 — renamed", status: "ACTIVE" }
      ];
      else if (u.includes("/insights?")) data = [
        { ad_id: "900000000000000001", date_start: "2026-10-04", spend: "5.00", impressions: "100",
          clicks: "9", inline_link_clicks: "4" }
      ];
      return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
    };
    // The fixture's META_ID_A ad belongs to this same connection, so the sync updates it in place.
    const stats = await syncPartnerConnections({ partnerId, deps: { fetch: fake }, windowDays: 3 });
    assert.deepEqual(stats.errors, []);
    assert.ok(seen.find((u) => u.includes("/insights?")).includes("inline_link_clicks"));
    assert.ok(seen.find((u) => u.includes("/ads?")).includes("creative"));

    const rows = await one(
      `SELECT external_id, fundhub_ad_number, fundhub_ad_number_source, landing_url FROM ads
        WHERE org_id = $1 AND external_id = ANY($2) ORDER BY external_id`,
      [org, ["900000000000000001", META_ID_A]]);
    assert.deepEqual(rows, [
      { external_id: META_ID_A, fundhub_ad_number: "88", fundhub_ad_number_source: "manual", landing_url: null },
      { external_id: "900000000000000001", fundhub_ad_number: "96", fundhub_ad_number_source: "utm",
        landing_url: "https://apply.fundhub.ai/roadmap" }
    ]);
    const m = await one(
      `SELECT m.link_clicks, m.clicks FROM ad_metrics_daily m JOIN ads a ON a.id = m.ad_id
        WHERE a.org_id = $1 AND a.external_id = '900000000000000001'`, [org]);
    assert.equal(Number(m[0].link_clicks), 4);
    assert.equal(Number(m[0].clicks), 9);
  });
});
