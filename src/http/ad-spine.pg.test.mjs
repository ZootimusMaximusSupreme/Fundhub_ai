// Endpoint tests for GET /api/read/ad-spine, against real Postgres.
//
// Lives under src/http/, not next to the handler under api/, because npm test's
// glob is "src/**" and "scripts/**" only (CLAUDE.md §12) — a test file placed
// under api/ silently never runs and reports nothing while looking green.
//
// Drives the handler directly rather than through netlify/functions/api.mjs and
// its ROUTES map, the same way src/http/analytics-youtube.pg.test.mjs does: this
// route is not in ROUTES yet and this lane does not own that file.
//
// Skips cleanly with DATABASE_URL unset — the whole describe block is skipped,
// exactly like its neighbours. A skipped .pg.test.mjs is NOT green (CLAUDE.md
// §12), and this file has never been executed against a real database: there is
// no Postgres on the machine it was written on.
//
// WHO EACH QUERY RUNS AS. ads, creative_assets, ad_scripts and ad_labels all
// carry FORCEd row-level security. A bare db.query against one of them is
// anonymous to those policies and touches ZERO rows rather than erroring, so
// every fixture write and every verification read here goes through asStaff().
// The bare db.query calls are against partners, staff and sessions, which carry
// no policy.

import { test, before, after, describe } from "node:test";
import assert from "node:assert";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { createSession } from "../auth/session.mjs";
import { asStaff } from "../partners/rls.mjs";
import spineHandler from "../../api/read/ad-spine.mjs";

const HAS_DB = !!process.env.DATABASE_URL;
const SLUG = "adspine-pg-test";
const EMAIL_TAG = "adspine_pg_test";

const res = () => {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = () => r;
  return r;
};

const req = (token, { method = "GET", query = {} } = {}) => ({
  method,
  headers: token ? { authorization: "Bearer " + token } : {},
  query
});

/* call — one request, one response, so each test reads as a sentence. */
async function call(token, query) {
  const r = res();
  await spineHandler(req(token, { query }), r, { db });
  return r;
}

describe("GET /api/read/ad-spine", { skip: !HAS_DB ? "no DATABASE_URL" : false }, () => {
  let org, partnerId, connId, campaignId, adSetId;
  let tokenStaff, tokenNonStaff;

  before(async () => {
    org = await resolveDefaultOrg(db);
    await cleanup();

    partnerId = (await db.query(
      `INSERT INTO partners (org_id, name, slug, status, agreement_signed_at)
       VALUES ($1,'Ad spine fixture',$2,'active',now()) RETURNING id`,
      [org, SLUG]
    )).rows[0].id;

    const staffRow = (await db.query(
      `INSERT INTO staff (org_id, email, name, role, status)
       VALUES ($1,$2,'Ad Spine Fixture','owner','active') RETURNING id`,
      [org, `${EMAIL_TAG}.owner@example.com`]
    )).rows[0];
    tokenStaff = (await createSession(db, { staffId: staffRow.id, orgId: org })).token;

    // csm is a real role (290_csm_role.sql) deliberately NOT in ROLE_SETS.STAFF,
    // so it is the shortest path to a real 403 rather than a 401.
    const csmRow = (await db.query(
      `INSERT INTO staff (org_id, email, name, role, status)
       VALUES ($1,$2,'Ad Spine Non-Staff','csm','active') RETURNING id`,
      [org, `${EMAIL_TAG}.csm@example.com`]
    )).rows[0];
    tokenNonStaff = (await createSession(db, { staffId: csmRow.id, orgId: org })).token;

    await asStaff(async (tx) => {
      connId = (await tx.query(
        `INSERT INTO ad_platform_connections
           (org_id, partner_id, platform, external_ad_account_id, connection_state,
            platform_verification_state, encrypted_access_token)
         VALUES ($1,$2,'meta',$3,'active','approved','v1:x:y:z') RETURNING id`,
        [org, partnerId, `acct-${SLUG}`]
      )).rows[0].id;

      // offer_type 'funding' is one of the three seeded into
      // ad_platform_category_map by 052_config_defaults.sql, so the guard trigger
      // at 046:348-354 lets this insert through.
      campaignId = (await tx.query(
        `INSERT INTO campaigns (org_id, partner_id, connection_id, name, offer_type,
                                budget_cents, approval_state)
         VALUES ($1,$2,$3,'Ad spine campaign','funding',10000,'draft') RETURNING id`,
        [org, partnerId, connId]
      )).rows[0].id;

      adSetId = (await tx.query(
        `INSERT INTO ad_sets (org_id, partner_id, connection_id, campaign_id, name,
                              budget_cents, approval_state)
         VALUES ($1,$2,$3,$4,'Ad spine ad set',10000,'draft') RETURNING id`,
        [org, partnerId, connId, campaignId]
      )).rows[0].id;

      /* THE FIXTURE, IN ONE PICTURE.

           script alpha  →  creative C1  →  ad "Adspine alpha 1"   (number 901)
                                         →  ad "Adspine alpha 2"   (number 902)
           script beta   →  creative C2  →  ad "Adspine beta 1"    (number 903)
           (no script)   →  (no creative)→  ad "Adspine naked ad"  (no number)

         So group_by=angle must report adspine_alpha = 2 and adspine_beta = 1,
         and the naked ad must still appear with every label null.

         The dictionary gets a name for alpha and DELIBERATELY NOT for beta —
         ad_scripts has no foreign key to ad_labels (377's header says why), so a
         label with no dictionary row must still group, just with a null name. */
      const alpha = (await tx.query(
        `INSERT INTO ad_scripts (org_id, partner_id, title, body, hook_text,
                                 script_type, lane, angle_key, hook_key, offer_key)
         VALUES ($1,$2,'Alpha script','HOOK: they said no.\nBODY: here is why.\nCTA: book a call.',
                 'They said no and nobody told you why.',
                 'cold','premium','adspine_alpha','adspine_h1','adspine_offer')
         RETURNING id`,
        [org, partnerId]
      )).rows[0].id;

      const beta = (await tx.query(
        `INSERT INTO ad_scripts (org_id, partner_id, title, body, angle_key)
         VALUES ($1,$2,'Beta script','HOOK: a broker burned you.','adspine_beta')
         RETURNING id`,
        [org, partnerId]
      )).rows[0].id;

      const c1 = (await tx.query(
        `INSERT INTO creative_assets (org_id, partner_id, kind, format, ai_generated, script_id)
         VALUES ($1,$2,'video','9x16',true,$3) RETURNING id`,
        [org, partnerId, alpha]
      )).rows[0].id;

      const c2 = (await tx.query(
        `INSERT INTO creative_assets (org_id, partner_id, kind, format, ai_generated, script_id)
         VALUES ($1,$2,'video','9x16',true,$3) RETURNING id`,
        [org, partnerId, beta]
      )).rows[0].id;

      const insertAd = (name, assetId, number) => tx.query(
        `INSERT INTO ads (org_id, partner_id, connection_id, campaign_id, ad_set_id,
                          name, approval_state, asset_id, fundhub_ad_number)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8)`,
        [org, partnerId, connId, campaignId, adSetId, name, assetId, number]
      );

      await insertAd("Adspine alpha 1", c1, "901");
      await insertAd("Adspine alpha 2", c1, "902");
      await insertAd("Adspine beta 1", c2, "903");
      await insertAd("Adspine naked ad", null, null);

      await tx.query(
        `INSERT INTO ad_labels (org_id, kind, key, name, description, source_ref, sort_order)
         VALUES ($1,'angle','adspine_alpha','Alpha Angle','Fixture angle.','src/http/ad-spine.pg.test.mjs',1)
         ON CONFLICT (org_id, kind, key) DO NOTHING`,
        [org]
      );
    });
  });

  after(async () => { await cleanup(); await close(); });

  async function cleanup() {
    const ids = (await db.query(
      `SELECT id FROM partners WHERE slug LIKE $1`, [`${SLUG}%`]
    )).rows.map((r) => r.id);

    if (ids.length) {
      // creative_assets refuses a direct DELETE (fundhub_no_delete, 045:236-240).
      // Same escape hatch src/db/label-spine.pg.test.mjs:143 uses.
      await db.query(`ALTER TABLE creative_assets DISABLE TRIGGER trg_creative_assets_no_delete`);
      try {
        await asStaff(async (tx) => {
          for (const t of ["ad_metrics_daily", "ads", "ad_sets", "campaigns"]) {
            await tx.query(`DELETE FROM ${t} WHERE partner_id = ANY($1)`, [ids]);
          }
          await tx.query(`DELETE FROM creative_assets WHERE partner_id = ANY($1)`, [ids]);
          // Children before parents: parent_script_id is ON DELETE RESTRICT.
          await tx.query(
            `DELETE FROM ad_scripts WHERE partner_id = ANY($1) AND parent_script_id IS NOT NULL`, [ids]);
          await tx.query(`DELETE FROM ad_scripts WHERE partner_id = ANY($1)`, [ids]);
          await tx.query(`DELETE FROM ad_platform_connections WHERE partner_id = ANY($1)`, [ids]);
        });
      } finally {
        await db.query(`ALTER TABLE creative_assets ENABLE TRIGGER trg_creative_assets_no_delete`);
      }
      await db.query(`DELETE FROM partners WHERE id = ANY($1)`, [ids]);
    }

    await asStaff((tx) => tx.query(
      `DELETE FROM ad_labels WHERE org_id = $1 AND key LIKE 'adspine_%'`, [org]));
    await db.query(
      `DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE email LIKE $1)`,
      [`${EMAIL_TAG}%`]);
    await db.query(`DELETE FROM staff WHERE email LIKE $1`, [`${EMAIL_TAG}%`]);
  }

  const mine = (items, name) => items.find((i) => i.ad_name === name);

  // ── the gate ────────────────────────────────────────────────────────────

  test("a call with no session is refused", async () => {
    const r = await call(null, {});
    assert.equal(r.code, 401, `an unauthenticated caller got ${r.code}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ok, false);
  });

  test("a signed-in role outside ROLE_SETS.STAFF is refused", async () => {
    const r = await call(tokenNonStaff, {});
    assert.equal(r.code, 403);
    assert.equal(r.body.ok, false);
  });

  test("a method other than GET is refused", async () => {
    const r = res();
    await spineHandler(req(tokenStaff, { method: "POST" }), r, { db });
    assert.equal(r.code, 405);
  });

  // ── the list ────────────────────────────────────────────────────────────

  test("a staff call returns rows, newest ad first", async () => {
    const r = await call(tokenStaff, { limit: "200" });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(r.body.group_by, null, "a plain call must not be in group mode");
    assert.ok(Array.isArray(r.body.items), "items is not an array");
    assert.ok(r.body.items.length >= 4, `the four fixture ads did not come back (${r.body.items.length} rows)`);

    const row = mine(r.body.items, "Adspine alpha 1");
    assert.ok(row, "the fixture ad did not come back from the read endpoint");
    assert.equal(row.angle_key, "adspine_alpha", "the angle did not carry down from the script");
    assert.equal(row.hook_key, "adspine_h1");
    assert.equal(row.lane, "premium");
    assert.equal(row.script_title, "Alpha script");
    assert.equal(row.fundhub_ad_number, "901", "our own ad number did not survive");

    // Newest first. Every fixture ad is written in one transaction and so shares
    // created_at exactly, which is why this asserts non-increasing rather than
    // strictly decreasing.
    const times = r.body.items.map((i) => new Date(i.created_at).getTime());
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] <= times[i - 1], "the list is not newest first");
    }
  });

  test("filtering by a label value narrows the list to that value", async () => {
    const r = await call(tokenStaff, { angle: "adspine_alpha", limit: "200" });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.filters, { angle: "adspine_alpha" });
    assert.equal(r.body.items.length, 2, "the alpha filter did not return exactly the two alpha ads");
    for (const row of r.body.items) assert.equal(row.angle_key, "adspine_alpha");
  });

  // ── grouping ────────────────────────────────────────────────────────────

  test("grouping by angle gives one row per angle with the right count and the friendly name", async () => {
    const r = await call(tokenStaff, { group_by: "angle", limit: "200" });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.group_by, "angle");

    const byKey = new Map(r.body.items.map((g) => [g.key, g]));
    assert.equal(byKey.size, r.body.items.length, "grouping returned the same angle more than once");

    const alpha = byKey.get("adspine_alpha");
    assert.ok(alpha, "the alpha angle did not come back as a group");
    assert.equal(alpha.ads, 2, "the two ads built from one angle did not group together");
    assert.equal(alpha.name, "Alpha Angle", "the friendly name did not come from ad_labels");

    // Beta has no dictionary row on purpose: a label groups whether or not
    // anybody has written it down, and its name is then null rather than "".
    const beta = byKey.get("adspine_beta");
    assert.ok(beta, "an angle with no dictionary row fell out of the grouping");
    assert.equal(beta.ads, 1);
    assert.strictEqual(beta.name, null, "an unnamed label got an invented name");
  });

  test("grouping by lane, hook, offer and script_type all work", async () => {
    for (const [groupBy, key] of [
      ["lane", "premium"],
      ["hook", "adspine_h1"],
      ["offer", "adspine_offer"],
      ["script_type", "cold"]
    ]) {
      const r = await call(tokenStaff, { group_by: groupBy, limit: "200" });
      assert.equal(r.code, 200, `${groupBy}: ${JSON.stringify(r.body)}`);
      const hit = r.body.items.find((g) => g.key === key);
      assert.ok(hit, `group_by=${groupBy} did not return a group for ${key}`);
      assert.ok(hit.ads >= 2, `group_by=${groupBy} counted ${hit.ads} ads for ${key}, expected at least 2`);
    }
  });

  test("a group and a filter combine — one group, and it is the one asked for", async () => {
    const r = await call(tokenStaff, { group_by: "angle", angle: "adspine_alpha" });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].key, "adspine_alpha");
    assert.equal(r.body.items[0].ads, 2);
  });

  test("an unknown group_by is the caller's mistake, not a server fault", async () => {
    const r = await call(tokenStaff, { group_by: "mechanism" });
    assert.equal(r.code, 400);
    assert.equal(r.body.error, "invalid_group_by");
  });

  // ── unknown stays unknown ───────────────────────────────────────────────

  test("an ad with no creative still appears, with NULL labels — not dropped", async () => {
    const r = await call(tokenStaff, { limit: "200" });
    const naked = mine(r.body.items, "Adspine naked ad");
    assert.ok(naked, "an ad with no creative fell out of the endpoint entirely");

    for (const c of ["asset_id", "asset_kind", "asset_aspect_ratio", "duration_sec",
                     "script_id", "script_version", "parent_script_id", "script_title",
                     "script_type", "lane", "angle_key", "hook_key", "offer_key",
                     "hook_text", "fundhub_ad_number", "script_archived_at",
                     "asset_archived_at"]) {
      assert.strictEqual(naked[c], null,
        `${c} came back as ${JSON.stringify(naked[c])} instead of null for an ad with no creative`);
    }
    assert.notStrictEqual(naked.duration_sec, 0, "an unknown length became 0");
    assert.notStrictEqual(naked.script_type, "", "an unknown label became an empty string");
  });

  test("NULL survives the JSON body as null — the unlabelled ads are counted, not hidden", async () => {
    const r = await call(tokenStaff, { group_by: "angle", limit: "200" });
    const unlabelled = r.body.items.find((g) => g.key === null);
    assert.ok(unlabelled, "the ads nobody has labelled were dropped instead of grouped under null");
    assert.strictEqual(unlabelled.key, null, "the unknown group was keyed with something other than null");
    assert.strictEqual(unlabelled.name, null);
    // At least the naked fixture ad. Other unlabelled ads in the org land here
    // too, which is why this is "at least one" and not an exact number.
    assert.ok(unlabelled.ads >= 1, "the ad with no creative was not counted in the unknown group");

    // And the same value survives as null in the raw JSON, not as the string
    // "null" and not as an empty string.
    const asJson = JSON.parse(JSON.stringify(r.body));
    const again = asJson.items.find((g) => g.key === null);
    assert.ok(again, "null did not survive JSON serialisation of the response body");
  });
});
