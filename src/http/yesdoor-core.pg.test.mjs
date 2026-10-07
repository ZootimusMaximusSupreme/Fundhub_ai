// Postgres-backed tests for the Yesdoor SCHEMA: migrations 434 / 435 / 436 and the
// seed in db/seed/296. CLAUDE.md §3a puts constraints, enums and guards in the
// database, so this file pushes on the database directly (no handler in between)
// and checks that it refuses what the spec says it must refuse.
//
// Every guard here is a promise from docs/specs/yesdoor-mvp-build-spec.md §0, §2, §3
// or §5b. Where the number lives in YD_DEFAULTS and the database cannot read that
// file (the open-application cap, the dispute window), the test compares the two so
// they cannot drift apart silently.
//
// SCRATCH database only, as fundhub_app (the unprivileged role production uses).
// Yesdoor rows are never deleted, so each run builds its own orgs. Skips without
// DATABASE_URL. The one test that needs the owner connection (a trigger that blocks
// DELETE even for the table owner) reads MIGRATION_DATABASE_URL, which CI sets.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db, close, pool } from "../db.mjs";
import { buildYdFixture } from "../yesdoor/testing/fixture.mjs";
import { YD_DEFAULTS } from "../yesdoor/config.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const ADMIN_URL = process.env.MIGRATION_DATABASE_URL || "";

// Postgres error codes the guards raise.
const CHECK = "23514", UNIQUE = "23505", FK = "23503", DENIED = "42501";

async function rejects(promise, code, pattern) {
  try {
    await promise;
  } catch (e) {
    assert.equal(e.code, code, `expected SQLSTATE ${code}, got ${e.code}: ${e.message}`);
    if (pattern) assert.match(e.message, pattern);
    return e;
  }
  assert.fail(`expected the database to refuse this (SQLSTATE ${code}), but it was accepted`);
}

const STAGE_ORDER = ["booked", "registered", "toured", "applied", "approved", "lease_signed", "moved_in", "invoiced", "paid"];

describe("yesdoor schema guards", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, A, B, orgA, orgB;
  const q = (sql, params) => db.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  // Run a statement AS the app role. CI runs the main suite as the database owner, so
  // privilege checks switch to fundhub_app first (SET LOCAL ROLE, rolled back): the
  // refusal is the privilege check, which comes before any row is touched.
  const asApp = async (sql, params) => {
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE fundhub_app");
      return await client.query(sql, params);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  };
  let seq = 0;
  const uniq = (p) => `${p}${++seq}-${fx.rand}`;

  before(async () => {
    fx = await buildYdFixture(db);
    ({ A, B, orgA, orgB } = fx);
  });
  after(async () => { await close(); });

  const mkRenter = async (org = orgA, extra = {}) => (await one(
    `INSERT INTO yd_renters (org_id, email, first_name, last_name, source_kind, source_ad_id, source_broker_id)
     VALUES ($1,$2,'T','Renter',$3,$4,$5) RETURNING id`,
    [org, `${uniq("r")}@example.test`, extra.kind || "direct", extra.adId || null, extra.brokerId || null])).id;

  const mkBuilding = async (org = orgA, { status = "target", sample = true, company = null, name } = {}) => (await one(
    `INSERT INTO yd_buildings (org_id, company_id, name, status, is_sample) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [org, company, name || uniq("B"), status, sample])).id;

  const mkOutbox = async (org = orgA) => (await one(
    `INSERT INTO yd_outbox (org_id, channel, to_address, template_key) VALUES ($1,'email','x@example.test','yd-registration') RETURNING id`,
    [org])).id;

  const mkApp = async (renter, building, extra = {}) => (await one(
    `INSERT INTO yd_applications (org_id, renter_id, building_id, broker_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [extra.org || orgA, renter, building, extra.broker || null])).id;

  /** Walk an application along the real arrows up to `to`. */
  async function walk(appId, to, org = orgA) {
    for (const stage of STAGE_ORDER.slice(1, STAGE_ORDER.indexOf(to) + 1)) {
      if (stage === "registered") {
        await q(`UPDATE yd_applications SET stage='registered', registration_sent_at=now(), registration_outbox_id=$2 WHERE id=$1`,
          [appId, await mkOutbox(org)]);
      } else if (stage === "lease_signed") {
        await q(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date+10, lease_end=current_date+374, rent_cents=150000 WHERE id=$1`, [appId]);
      } else {
        await q(`UPDATE yd_applications SET stage=$2 WHERE id=$1`, [appId, stage]);
      }
    }
  }

  /** A brand-new placement for a brand-new renter, walked to `to`. */
  async function placement({ to = "moved_in", broker = null, building } = {}) {
    const b = building || await mkBuilding(orgA);
    const renter = await mkRenter(orgA);
    const app = await mkApp(renter, b, { broker });
    await walk(app, to);
    return { renter, app, building: b };
  }

  const fee = async (app, building, amount = 150000, extra = {}) => (await one(
    `INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, idempotency_key, reverses_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgA, app, building, extra.kind || "placement_fee", amount, extra.key === undefined ? uniq("fee") : extra.key, extra.reverses || null])).id;

  const invoice = async (building, total = 150000) => (await one(
    `INSERT INTO yd_invoices (org_id, building_id, total_cents) VALUES ($1,$2,$3) RETURNING id, number, issued_at, due_at`,
    [orgA, building, total]));

  /* ── the shape every table must have ──────────────────────────────────── */

  describe("every yd_ table follows the repo pattern", () => {
    let tables;
    before(async () => {
      tables = (await q(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'yd\\_%' ORDER BY c.relname`)).rows;
    });

    test("all the spec §2 tables exist", () => {
      const names = tables.map((t) => t.relname);
      for (const t of [
        "yd_renters", "yd_accounts", "yd_account_buildings", "yd_sessions", "yd_magic_links", "yd_brokers",
        "yd_consents", "yd_screenings", "yd_screening_raw", "yd_income_checks",
        "yd_companies", "yd_buildings", "yd_building_rules", "yd_listings",
        "yd_matches", "yd_applications", "yd_tours", "yd_agreements",
        "yd_fee_ledger", "yd_invoices", "yd_broker_ledger", "yd_renter_refunds",
        "yd_disputes", "yd_touches", "yd_state_rules", "yd_outbox", "yd_events"
      ]) assert.ok(names.includes(t), `missing table ${t}`);
    });

    test("row security is ENABLED and FORCED, with a <table>_app_all policy", async () => {
      const policies = (await q(`SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'yd\\_%'`)).rows;
      for (const t of tables) {
        assert.equal(t.relrowsecurity, true, `${t.relname}: row security off`);
        assert.equal(t.relforcerowsecurity, true, `${t.relname}: row security not forced`);
        assert.ok(policies.some((p) => p.tablename === t.relname && p.policyname === `${t.relname}_app_all`),
          `${t.relname}: no ${t.relname}_app_all policy (locked shut against the app)`);
      }
    });

    test("fundhub_app can read, insert and update, and can NOT delete or truncate", async () => {
      for (const t of tables) {
        for (const priv of ["SELECT", "INSERT", "UPDATE"]) {
          assert.equal((await one(`SELECT has_table_privilege('fundhub_app', $1, $2) AS ok`, [`public.${t.relname}`, priv])).ok, true, `${t.relname} lacks ${priv}`);
        }
        for (const priv of ["DELETE", "TRUNCATE"]) {
          assert.equal((await one(`SELECT has_table_privilege('fundhub_app', $1, $2) AS ok`, [`public.${t.relname}`, priv])).ok, false, `${t.relname} still grants ${priv}`);
        }
      }
      // Try it AS the app role. CI runs the main suite as the database owner, so the
      // attempt switches to fundhub_app first (SET LOCAL ROLE, rolled back): the
      // refusal is the privilege check, which comes before any row is touched.
      await rejects(asApp(`DELETE FROM yd_events WHERE org_id = $1`, [orgA]), DENIED);
      await rejects(asApp(`DELETE FROM yd_fee_ledger WHERE org_id = $1`, [orgA]), DENIED);
      await rejects(asApp(`TRUNCATE yd_fee_ledger`), DENIED);
      await rejects(asApp(`TRUNCATE yd_events`), DENIED);
    });

    test("every table has org_id NOT NULL referencing orgs, an id uuid key, and the updated_at trigger", async () => {
      for (const t of tables) {
        const col = await one(
          `SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='org_id'`, [t.relname]);
        assert.ok(col, `${t.relname}: no org_id`);
        assert.equal(col.is_nullable, "NO", `${t.relname}: org_id nullable`);
        const trg = await one(`SELECT 1 AS ok FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2`, [`public.${t.relname}`, `trg_${t.relname}_updated_at`]);
        assert.ok(trg, `${t.relname}: no updated_at trigger`);
      }
    });

    test("the ONLY foreign key into a Fundhub table is orgs(id)", async () => {
      const fks = (await q(
        `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
           FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text LIKE 'yd\\_%'`)).rows;
      assert.ok(fks.length > 30);
      const outside = fks.filter((f) => !f.parent.startsWith("yd_") && f.parent !== "orgs");
      assert.deepEqual(outside, [], "a yd_ table points into a Fundhub table");
    });

    test("every foreign key between yd_ tables carries org_id (a composite key), so rows cannot cross companies", async () => {
      const fks = (await q(
        `SELECT conname, conrelid::regclass::text AS child, confrelid::regclass::text AS parent,
                (SELECT array_agg(attname::text) FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey)) AS cols
           FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text LIKE 'yd\\_%' AND confrelid::regclass::text LIKE 'yd\\_%'`)).rows;
      const loose = fks.filter((f) => !f.cols.includes("org_id") && !(f.conname === "yd_matches_listing_fk" || f.conname.endsWith("_listing_fk")));
      assert.deepEqual(loose.map((f) => f.conname), [],
        "a yd_ foreign key without org_id lets a row point at another company's row");
    });

    test("every *_cents column is bigint, and no Yesdoor column stores money as a float", async () => {
      const cols = (await q(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
          WHERE table_schema='public' AND table_name LIKE 'yd\\_%'`)).rows;
      const cents = cols.filter((c) => c.column_name.endsWith("_cents"));
      const named = new Set(cents.map((c) => `${c.table_name}.${c.column_name}`));
      for (const must of ["yd_renters.approved_max_rent_cents", "yd_buildings.app_fee_cents", "yd_buildings.fee_flat_cents",
        "yd_listings.rent_cents", "yd_applications.rent_cents", "yd_matches.max_rent_cents", "yd_income_checks.monthly_income_cents",
        "yd_fee_ledger.amount_cents", "yd_invoices.total_cents", "yd_broker_ledger.amount_cents", "yd_renter_refunds.amount_cents"]) {
        assert.ok(named.has(must), `${must} is missing or not named *_cents`);
      }
      for (const c of cents) assert.equal(c.data_type, "bigint", `${c.table_name}.${c.column_name} is ${c.data_type}, not bigint`);
      const floats = cols.filter((c) => ["real", "double precision", "money"].includes(c.data_type));
      assert.deepEqual(floats, [], "a float or money column in a Yesdoor table");
      // Anything named like money must be a *_cents column (percents and multiples are fine).
      const loose = cols.filter((c) => /(amount|total|price|fee|income|rent)(?!.*(percent|multiple|waived|kind|days|_at$|_id$|state|stage))/.test(c.column_name)
        && !c.column_name.endsWith("_cents") && !/(percent|multiple|waived|kind|days|_at$|_id$|state|stage|address|current|verified|source|policy|unit|label|terms|incentive|app_fee_)/.test(c.column_name));
      assert.deepEqual(loose.map((c) => `${c.table_name}.${c.column_name}`), []);
    });

    test("the no-delete trigger is on every ledger, event, consent and screening table", async () => {
      const must = ["yd_fee_ledger", "yd_broker_ledger", "yd_invoices", "yd_renter_refunds",
        "yd_events", "yd_consents", "yd_screenings", "yd_screening_raw", "yd_income_checks",
        "yd_matches", "yd_building_rules", "yd_agreements", "yd_applications", "yd_disputes", "yd_tours"];
      for (const t of must) {
        const trg = await one(
          `SELECT p.proname FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid WHERE g.tgrelid = $1::regclass AND g.tgname = $2`,
          [`public.${t}`, `trg_${t}_no_delete`]);
        assert.equal(trg && trg.proname, "fundhub_no_delete", `${t} has no fundhub_no_delete() trigger`);
      }
    });

    test("the no-delete trigger blocks even the table OWNER (not just the revoked privilege)", { skip: ADMIN_URL ? false : "MIGRATION_DATABASE_URL not set" }, async () => {
      const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
      try {
        const ev = (await q(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id) VALUES ($1,'test.owner_delete','renter',$2) RETURNING id`, [orgA, A.renter1])).rows[0].id;
        await rejects(admin.query(`DELETE FROM yd_events WHERE id = $1`, [ev]), "P0001", /not deletable/);
        await rejects(admin.query(`DELETE FROM yd_fee_ledger WHERE org_id = $1`, [orgA]), "P0001", /not deletable/);
        await rejects(admin.query(`DELETE FROM yd_consents WHERE org_id = $1`, [orgA]), "P0001", /not deletable/);
        await rejects(admin.query(`DELETE FROM yd_screenings WHERE org_id = $1`, [orgA]), "P0001", /not deletable/);
      } finally { await admin.end(); }
    });

    test("tunable numbers the database holds equal YD_DEFAULTS (open cap 3, dispute window 14 days)", async () => {
      assert.equal(YD_DEFAULTS.maxOpenApplications, 3);
      assert.equal(YD_DEFAULTS.disputeDays, 14);
      assert.equal(YD_DEFAULTS.refundDays, 60);
      const b = await one(`SELECT column_default FROM information_schema.columns WHERE table_name='yd_buildings' AND column_name='refund_days'`);
      assert.equal(Number(b.column_default), YD_DEFAULTS.refundDays, "the building refund_days default drifted from YD_DEFAULTS.refundDays");
      const d = await one(`INSERT INTO yd_disputes (org_id, kind, opened_by_kind) VALUES ($1,'fee','staff') RETURNING opened_at, due_by`, [orgA]);
      assert.equal(Math.round((new Date(d.due_by) - new Date(d.opened_at)) / 86400000), YD_DEFAULTS.disputeDays);
    });
  });

  /* ── people: renters, brokers, accounts ───────────────────────────────── */

  describe("renters, brokers and accounts", () => {
    test("first touch is written once and locked", async () => {
      const r = await mkRenter(orgA, { kind: "ad", adId: "43" });
      await rejects(q(`UPDATE yd_renters SET source_kind='organic' WHERE id=$1`, [r]), CHECK, /yd_first_touch_locked/);
      await rejects(q(`UPDATE yd_renters SET source_ad_id='44' WHERE id=$1`, [r]), CHECK, /yd_first_touch_locked/);
      await rejects(q(`UPDATE yd_renters SET first_touch_at = now() + interval '1 day' WHERE id=$1`, [r]), CHECK, /yd_first_touch_locked/);
      await rejects(q(`UPDATE yd_renters SET source_broker_id=$2 WHERE id=$1`, [r, A.broker]), CHECK, /yd_first_touch_locked/);
      // Everything else is still editable.
      await q(`UPDATE yd_renters SET phone='555-0199', stage='screened' WHERE id=$1`, [r]);
      const row = await one(`SELECT phone, stage, source_kind, source_ad_id FROM yd_renters WHERE id=$1`, [r]);
      assert.deepEqual(row, { phone: "555-0199", stage: "screened", source_kind: "ad", source_ad_id: "43" });
    });

    test("a first touch of kind ad or broker must name the ad or the broker", async () => {
      await rejects(q(`INSERT INTO yd_renters (org_id, email, source_kind) VALUES ($1,$2,'ad')`, [orgA, `${uniq("x")}@example.test`]), CHECK);
      await rejects(q(`INSERT INTO yd_renters (org_id, email, source_kind) VALUES ($1,$2,'broker')`, [orgA, `${uniq("x")}@example.test`]), CHECK);
    });

    test("email is lower-case, unique per company, and the same address may exist in another company", async () => {
      await rejects(q(`INSERT INTO yd_renters (org_id, email) VALUES ($1,'MixedCase@Example.test')`, [orgA]), CHECK);
      const email = `${uniq("dup")}@example.test`;
      await q(`INSERT INTO yd_renters (org_id, email) VALUES ($1,$2)`, [orgA, email]);
      await rejects(q(`INSERT INTO yd_renters (org_id, email) VALUES ($1,$2)`, [orgA, email]), UNIQUE);
      await q(`INSERT INTO yd_renters (org_id, email) VALUES ($1,$2)`, [orgB, email]);
    });

    test("no SSN column exists anywhere in Yesdoor", async () => {
      const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'yd\\_%' AND (column_name ILIKE '%ssn%' OR column_name ILIKE '%social%')`)).rows;
      assert.deepEqual(cols, []);
    });

    test("stage, lane and tier are enums; a max rent cannot be negative", async () => {
      const r = await mkRenter();
      await rejects(q(`UPDATE yd_renters SET stage='vip' WHERE id=$1`, [r]), CHECK);
      await rejects(q(`UPDATE yd_renters SET lane='gold' WHERE id=$1`, [r]), CHECK);
      await rejects(q(`UPDATE yd_renters SET risk_tier='E' WHERE id=$1`, [r]), CHECK);
      await rejects(q(`UPDATE yd_renters SET approved_max_rent_cents=-1 WHERE id=$1`, [r]), CHECK);
      const fresh = await one(`SELECT approved_max_rent_cents, lane, risk_tier FROM yd_renters WHERE id=$1`, [r]);
      assert.deepEqual(fresh, { approved_max_rent_cents: null, lane: null, risk_tier: null }, "unknown must stay NULL, not 0");
    });

    test("broker tracking code is minted as YD- plus 6 digits, unique per company ignoring case", async () => {
      const b = await one(`INSERT INTO yd_brokers (org_id, name, email) VALUES ($1,'Code Broker',$2) RETURNING tracking_code`, [orgA, `${uniq("cb")}@example.test`]);
      assert.match(b.tracking_code, /^YD-\d{6}$/);
      await rejects(q(`INSERT INTO yd_brokers (org_id, name, email, tracking_code) VALUES ($1,'Dup',$2,$3)`,
        [orgA, `${uniq("cb")}@example.test`, b.tracking_code.toLowerCase()]), UNIQUE);
      const custom = await one(`INSERT INTO yd_brokers (org_id, name, email, tracking_code) VALUES ($1,'Custom',$2,'MY-CODE') RETURNING tracking_code`, [orgA, `${uniq("cb")}@example.test`]);
      assert.equal(custom.tracking_code, "MY-CODE");
    });

    test("broker plan, licence state and split are bounded", async () => {
      const e = () => `${uniq("bb")}@example.test`;
      await rejects(q(`INSERT INTO yd_brokers (org_id, name, email, plan) VALUES ($1,'x',$2,'free')`, [orgA, e()]), CHECK);
      await rejects(q(`INSERT INTO yd_brokers (org_id, name, email, licence_state) VALUES ($1,'x',$2,'TX')`, [orgA, e()]), CHECK);
      await rejects(q(`INSERT INTO yd_brokers (org_id, name, email, split_percent) VALUES ($1,'x',$2,101)`, [orgA, e()]), CHECK);
      const ok = await one(`INSERT INTO yd_brokers (org_id, name, email) VALUES ($1,'x',$2) RETURNING split_percent::float8 AS split, plan, status`, [orgA, e()]);
      assert.equal(ok.split, YD_DEFAULTS.brokerSplitPercent, "the split default drifted from YD_DEFAULTS.brokerSplitPercent");
      assert.equal(ok.status, "applied");
    });

    test("an account points at exactly the subject its kind names", async () => {
      const e = () => `${uniq("ac")}@example.test`;
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'renter',$2)`, [orgA, e()]), CHECK);
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'broker',$2)`, [orgA, e()]), CHECK);
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email, renter_id) VALUES ($1,'building_user',$2,$3)`, [orgA, e(), A.renter2]), CHECK);
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email, renter_id, broker_id) VALUES ($1,'renter',$2,$3,$4)`, [orgA, e(), A.renter2, A.broker]), CHECK);
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email) VALUES ($1,'staff',$2)`, [orgA, e()]), CHECK);
    });

    test("one account per renter and per broker", async () => {
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email, renter_id) VALUES ($1,'renter',$2,$3)`, [orgA, `${uniq("ac")}@example.test`, A.renter1]), UNIQUE);
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3)`, [orgA, `${uniq("ac")}@example.test`, A.broker]), UNIQUE);
    });

    test("an account cannot be tied to another company's renter or broker", async () => {
      // Subjects in company B that have no account yet, so only the company check can refuse them.
      const bRenter = await mkRenter(orgB);
      const bBroker = (await one(`INSERT INTO yd_brokers (org_id, name, email) VALUES ($1,'B Broker',$2) RETURNING id`, [orgB, `${uniq("bb")}@example.test`])).id;
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email, renter_id) VALUES ($1,'renter',$2,$3)`, [orgA, `${uniq("ac")}@example.test`, bRenter]), FK);
      await rejects(q(`INSERT INTO yd_accounts (org_id, kind, email, broker_id) VALUES ($1,'broker',$2,$3)`, [orgA, `${uniq("ac")}@example.test`, bBroker]), FK);
      await rejects(q(`INSERT INTO yd_account_buildings (org_id, account_id, building_id) VALUES ($1,$2,$3)`, [orgA, A.acctBuilding, B.bSigned]), FK);
    });

    test("a renter's first-touch broker must be in the same company", async () => {
      await rejects(q(`INSERT INTO yd_renters (org_id, email, source_kind, source_broker_id) VALUES ($1,$2,'broker',$3)`, [orgA, `${uniq("x")}@example.test`, B.broker]), FK);
    });

    test("magic link rows: issued ones carry a hash and a deadline, receipts carry neither", async () => {
      const e = `${uniq("ml")}@example.test`;
      await rejects(q(`INSERT INTO yd_magic_links (org_id, email, outcome) VALUES ($1,$2,'issued')`, [orgA, e]), CHECK);
      await rejects(q(`INSERT INTO yd_magic_links (org_id, email, outcome, token_hash, expires_at) VALUES ($1,$2,'no_account','h',now())`, [orgA, e]), CHECK);
      await q(`INSERT INTO yd_magic_links (org_id, email, outcome) VALUES ($1,$2,'no_account')`, [orgA, e]);
      await rejects(q(`INSERT INTO yd_magic_links (org_id, email, outcome, token_hash, expires_at) VALUES ($1,$2,'issued','dup-hash',now()+interval '15 minutes'), ($1,$2,'issued','dup-hash',now()+interval '15 minutes')`, [orgA, e]), UNIQUE);
    });
  });

  /* ── consent and screening ────────────────────────────────────────────── */

  describe("consent and screening", () => {
    test("a consent row is written once: no edit, whoever asks", async () => {
      const c = (await one(`INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method) VALUES ($1,$2,'recheck','repeat checks ok','v1','typed') RETURNING id`, [orgA, A.renter2])).id;
      await rejects(q(`UPDATE yd_consents SET consent_text='changed' WHERE id=$1`, [c]), CHECK, /written once/);
      await rejects(q(`UPDATE yd_consents SET kind='sms' WHERE id=$1`, [c]), CHECK);
    });

    test("consent kind and method are enums; the text and version are required", async () => {
      const ins = (kind, text, ver, method) => q(
        `INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method) VALUES ($1,$2,$3,$4,$5,$6)`,
        [orgA, A.renter2, kind, text, ver, method]);
      await rejects(ins("marketing", "t", "v1", "checkbox"), CHECK);
      await rejects(ins("screening", "t", "v1", "click"), CHECK);
      await rejects(ins("screening", "  ", "v1", "checkbox"), CHECK);
      await rejects(ins("screening", "t", "", "checkbox"), CHECK);
    });

    test("no screening without a consent row that belongs to the SAME renter", async () => {
      const ins = (renter, consent) => q(
        `INSERT INTO yd_screenings (org_id, renter_id, consent_id) VALUES ($1,$2,$3)`, [orgA, renter, consent]);
      await rejects(ins(A.renter2, A.consent), FK);             // renter1's consent
      await rejects(ins(A.renter2, "11111111-1111-4111-8111-111111111111"), FK);
      await rejects(q(`INSERT INTO yd_screenings (org_id, renter_id) VALUES ($1,$2)`, [orgA, A.renter2]), "23502");
      await q(`INSERT INTO yd_screenings (org_id, renter_id, consent_id) VALUES ($1,$2,$3)`, [orgA, A.renter1, A.consent]);
    });

    test("a queued screening moves to complete once, then it is frozen forever", async () => {
      const s = (await one(`INSERT INTO yd_screenings (org_id, renter_id, consent_id) VALUES ($1,$2,$3) RETURNING id, status`, [orgA, A.renter1, A.consent]));
      assert.equal(s.status, "queued");
      await q(`UPDATE yd_screenings SET status='processing' WHERE id=$1`, [s.id]);
      await q(`UPDATE yd_screenings SET status='complete', credit_score=700, collections_count=0, eviction_count=0, result_at=now() WHERE id=$1`, [s.id]);
      await rejects(q(`UPDATE yd_screenings SET credit_score=800 WHERE id=$1`, [s.id]), CHECK, /yd_screening_frozen/);
      await rejects(q(`UPDATE yd_screenings SET status='failed' WHERE id=$1`, [s.id]), CHECK, /yd_screening_frozen/);
      assert.equal((await one(`SELECT credit_score FROM yd_screenings WHERE id=$1`, [s.id])).credit_score, 700);
    });

    test("screening rules: finish time goes with a finished status; no_match carries no numbers; score is 300-850", async () => {
      const mk = (cols, vals) => q(`INSERT INTO yd_screenings (org_id, renter_id, consent_id, ${cols}) VALUES ($1,$2,$3,${vals})`, [orgA, A.renter1, A.consent]);
      await rejects(mk("status", "'complete'"), CHECK);                           // no result_at
      await rejects(mk("status, result_at", "'queued', now()"), CHECK);           // result_at on an unfinished one
      await rejects(mk("status, result_at, credit_score", "'no_match', now(), 650"), CHECK);
      await rejects(mk("status, result_at, credit_score", "'complete', now(), 900"), CHECK);
      await rejects(mk("status, result_at, credit_score", "'complete', now(), 200"), CHECK);
      await rejects(mk("status, result_at, eviction_count", "'complete', now(), -1"), CHECK);
      await rejects(mk("criminal_flags", "'{}'::jsonb"), CHECK);                  // must be an array
      await rejects(mk("status", "'sorted'"), CHECK);
      await rejects(mk("provider", "'experian'"), CHECK);
      await mk("status, result_at", "'no_match', now()");
      // An unknown credit file stays NULL.
      const nm = await one(`SELECT credit_score, eviction_count FROM yd_screenings WHERE org_id=$1 AND status='no_match' ORDER BY created_at DESC LIMIT 1`, [orgA]);
      assert.deepEqual(nm, { credit_score: null, eviction_count: null });
    });

    test("a screening cannot be tied to another company's renter", async () => {
      await rejects(q(`INSERT INTO yd_screenings (org_id, renter_id, consent_id) VALUES ($1,$2,$3)`, [orgA, B.renter1, B.consent]), FK);
    });

    test("the raw payload: one per screening, written once", async () => {
      await rejects(q(`INSERT INTO yd_screening_raw (org_id, screening_id, payload) VALUES ($1,$2,'{}')`, [orgA, A.screening]), UNIQUE);
      await rejects(q(`UPDATE yd_screening_raw SET payload='{"x":1}' WHERE screening_id=$1`, [A.screening]), CHECK, /written once/);
      // A screening with no payload yet, offered to the other company: refused by the company key.
      const fresh = (await one(`INSERT INTO yd_screenings (org_id, renter_id, consent_id) VALUES ($1,$2,$3) RETURNING id`, [orgA, A.renter1, A.consent])).id;
      await rejects(q(`INSERT INTO yd_screening_raw (org_id, screening_id, payload) VALUES ($1,$2,'{}')`, [orgB, fresh]), FK);
      await q(`INSERT INTO yd_screening_raw (org_id, screening_id, payload) VALUES ($1,$2,'{}')`, [orgA, fresh]);
    });

    test("income: 'verified' means a number and a date; the amount is never defaulted", async () => {
      const mk = (status, cents, checked) => q(
        `INSERT INTO yd_income_checks (org_id, renter_id, method, status, monthly_income_cents, checked_at) VALUES ($1,$2,'statements',$3,$4,$5)`,
        [orgA, A.renter2, status, cents, checked]);
      await rejects(mk("verified", null, null), CHECK);
      await rejects(mk("verified", 500000, null), CHECK);
      await rejects(mk("verified", -1, new Date()), CHECK);
      await mk("review", null, null);
      const r = await one(`SELECT monthly_income_cents FROM yd_income_checks WHERE renter_id=$1 AND status='review' LIMIT 1`, [A.renter2]);
      assert.strictEqual(r.monthly_income_cents, null);
    });
  });

  /* ── buildings, rules, listings ───────────────────────────────────────── */

  describe("buildings, rules and listings", () => {
    test("building fee terms: percent needs a percent, flat needs an amount; refund days and terms are bounded", async () => {
      const ins = (cols, vals) => q(`INSERT INTO yd_buildings (org_id, name, ${cols}) VALUES ($1,$2,${vals})`, [orgA, uniq("FB")]);
      await rejects(ins("fee_kind, fee_percent", "'flat', NULL"), CHECK);
      await rejects(ins("fee_kind, fee_percent, fee_flat_cents", "'percent_first_month', NULL, NULL"), CHECK);
      await rejects(ins("fee_kind", "'tiered'"), CHECK);
      await rejects(ins("refund_days", "-1"), CHECK);
      await rejects(ins("payment_terms_days", "-5"), CHECK);
      await rejects(ins("state", "'Arizona'"), CHECK);
      await rejects(ins("status", "'open'"), CHECK);
      await rejects(ins("software", "'excel'"), CHECK);
      await rejects(ins("app_fee_cents", "-1"), CHECK);
      await ins("fee_kind, fee_flat_cents", "'flat', 100000");
      const d = await one(`INSERT INTO yd_buildings (org_id, name) VALUES ($1,$2) RETURNING fee_kind, fee_percent::float8 AS pct, refund_days, payment_terms_days, app_fee_cents, allows_renter_incentive, app_fee_waived, status`, [orgA, uniq("DB")]);
      assert.deepEqual(d, { fee_kind: "percent_first_month", pct: 100, refund_days: 60, payment_terms_days: 30, app_fee_cents: null, allows_renter_incentive: false, app_fee_waived: false, status: "target" });
    });

    test("a building cannot belong to another company's property company", async () => {
      await rejects(q(`INSERT INTO yd_buildings (org_id, company_id, name) VALUES ($1,$2,$3)`, [orgA, B.company, uniq("X")]), FK);
    });

    test("rules are versioned: the version counts up, an old row is never edited, only confirmed_at moves", async () => {
      const b = await mkBuilding();
      const r1 = (await one(`INSERT INTO yd_building_rules (org_id, building_id, min_score) VALUES ($1,$2,600) RETURNING id, version`, [orgA, b]));
      const r2 = (await one(`INSERT INTO yd_building_rules (org_id, building_id, min_score) VALUES ($1,$2,650) RETURNING id, version`, [orgA, b]));
      assert.equal(r1.version, 1);
      assert.equal(r2.version, 2);
      await rejects(q(`INSERT INTO yd_building_rules (org_id, building_id, version, min_score) VALUES ($1,$2,2,700)`, [orgA, b]), UNIQUE);
      await rejects(q(`UPDATE yd_building_rules SET min_score=500 WHERE id=$1`, [r1.id]), CHECK, /yd_rules_versioned/);
      await rejects(q(`UPDATE yd_building_rules SET criminal_policy='{"felony":1}' WHERE id=$1`, [r1.id]), CHECK, /yd_rules_versioned/);
      await rejects(q(`UPDATE yd_building_rules SET source='feed' WHERE id=$1`, [r1.id]), CHECK);
      await q(`UPDATE yd_building_rules SET confirmed_at = now() WHERE id=$1`, [r1.id]);
      assert.ok((await one(`SELECT confirmed_at FROM yd_building_rules WHERE id=$1`, [r1.id])).confirmed_at);
      assert.equal((await one(`SELECT min_score FROM yd_building_rules WHERE id=$1`, [r1.id])).min_score, 600);
    });

    test("rule values are bounded and the criminal policy has a fixed shape", async () => {
      const b = await mkBuilding();
      const ins = (cols, vals) => q(`INSERT INTO yd_building_rules (org_id, building_id, ${cols}) VALUES ($1,$2,${vals})`, [orgA, b]);
      await rejects(ins("min_score", "900"), CHECK);
      await rejects(ins("min_score", "100"), CHECK);
      await rejects(ins("income_multiple", "0"), CHECK);
      await rejects(ins("max_evictions", "-1"), CHECK);
      await rejects(ins("eviction_lookback_years", "-2"), CHECK);
      await rejects(ins("source", "'guess'"), CHECK);
      await rejects(ins("criminal_policy", `'{"felony":"sometimes"}'`), CHECK);
      await rejects(ins("criminal_policy", `'{"felony":-3}'`), CHECK);
      await rejects(ins("criminal_policy", `'{"felony":true}'`), CHECK);
      await rejects(ins("criminal_policy", `'["felony"]'`), CHECK);
      await ins("criminal_policy", `'{"felony":7,"misdemeanor":"case_by_case","violent":"never"}'`);
      // A rule the building does not state is NULL (the matcher then uses the default), not 0.
      const bare = await one(`INSERT INTO yd_building_rules (org_id, building_id) VALUES ($1,$2) RETURNING min_score, income_multiple, eviction_lookback_years, max_evictions`, [orgA, b]);
      assert.deepEqual(bare, { min_score: null, income_multiple: null, eviction_lookback_years: null, max_evictions: 0 });
    });

    test("rules cannot point at another company's building", async () => {
      await rejects(q(`INSERT INTO yd_building_rules (org_id, building_id) VALUES ($1,$2)`, [orgA, B.bSigned]), FK);
    });

    test("listings: rent is positive cents, one row per unit per building, beds and source bounded", async () => {
      const b = await mkBuilding();
      const ins = (unit, rent, extra = "") => q(`INSERT INTO yd_listings (org_id, building_id, unit_label, rent_cents ${extra ? "," + extra.split("=")[0] : ""}) VALUES ($1,$2,$3,$4 ${extra ? "," + extra.split("=")[1] : ""})`, [orgA, b, unit, rent]);
      await rejects(ins("1", 0), CHECK);
      await rejects(ins("1", -5), CHECK);
      await rejects(ins("  ", 100000), CHECK);
      await rejects(ins("1", 100000, "beds=11"), CHECK);
      await rejects(ins("1", 100000, "source='scrape'"), CHECK);
      await ins("1", 100000);
      await rejects(ins("1", 110000), UNIQUE);
      await q(`INSERT INTO yd_listings (org_id, building_id, unit_label, rent_cents) VALUES ($1,$2,'1b',100000)`, [orgA, b]);
      await rejects(q(`INSERT INTO yd_listings (org_id, building_id, unit_label, rent_cents) VALUES ($1,$2,'1B',100000)`, [orgA, b]), UNIQUE);
    });

    test("a listing cannot belong to another company's building", async () => {
      await rejects(q(`INSERT INTO yd_listings (org_id, building_id, unit_label, rent_cents) VALUES ($1,$2,'X',100000)`, [orgA, B.bSigned]), FK);
    });
  });

  /* ── agreements and who may be matched ────────────────────────────────── */

  describe("agreements and the signed-building rule", () => {
    test("an agreement's party must exist in this company", async () => {
      await rejects(q(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'building',$2,'building_fee')`, [orgA, B.bSigned]), FK, /yd_agreement_party_missing/);
      await rejects(q(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'company',$2,'building_fee')`, [orgA, A.broker]), FK);
      await rejects(q(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'broker',$2,'broker_partner')`, [orgA, B.broker]), FK);
    });

    test("the kind and the party agree: a fee agreement is not with a broker, a partner agreement is", async () => {
      await rejects(q(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'broker',$2,'building_fee')`, [orgA, A.broker]), CHECK);
      await rejects(q(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'building',$2,'broker_partner')`, [orgA, A.bSigned]), CHECK);
      await q(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'broker',$2,'broker_partner')`, [orgA, A.broker]);
    });

    test("status only moves draft -> sent -> signed (or void); signing needs a signer and a time; sent needs sent_at", async () => {
      const b = await mkBuilding();
      const a = (await one(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind, terms) VALUES ($1,'building',$2,'building_fee','{"fee_percent":100}') RETURNING id`, [orgA, b])).id;
      await rejects(q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='X' WHERE id=$1`, [a]), CHECK, /yd_agreement_move/);
      await rejects(q(`UPDATE yd_agreements SET status='sent' WHERE id=$1`, [a]), CHECK);                // no sent_at
      await q(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [a]);
      await rejects(q(`UPDATE yd_agreements SET terms='{"fee_percent":50}' WHERE id=$1`, [a]), CHECK, /terms are fixed/);
      await rejects(q(`UPDATE yd_agreements SET status='signed', signed_at=now() WHERE id=$1`, [a]), CHECK);   // no signer
      await rejects(q(`UPDATE yd_agreements SET status='draft' WHERE id=$1`, [a]), CHECK, /yd_agreement_move/);
      await q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='Pat Signer', signer_ip='203.0.113.9' WHERE id=$1`, [a]);
      await rejects(q(`UPDATE yd_agreements SET signer_name='Someone Else' WHERE id=$1`, [a]), CHECK, /yd_agreement_signed/);
      await rejects(q(`UPDATE yd_agreements SET terms='{}' WHERE id=$1`, [a]), CHECK);
      await q(`UPDATE yd_agreements SET status='void' WHERE id=$1`, [a]);
      await rejects(q(`UPDATE yd_agreements SET status='signed' WHERE id=$1`, [a]), CHECK);
    });

    test("an unsigned real building can be neither matched nor booked", async () => {
      const b = await mkBuilding(orgA, { status: "target", sample: false });
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false);
      const renter = await mkRenter();
      await rejects(mkApp(renter, b), CHECK, /yd_building_not_signed/);
      // Valid rules and screening, but the building is unsigned: the signed-building guard refuses it.
      const rules = (await one(`INSERT INTO yd_building_rules (org_id, building_id, min_score) VALUES ($1,$2,600) RETURNING id`, [orgA, b])).id;
      await rejects(q(
        `INSERT INTO yd_matches (org_id, renter_id, building_id, screening_id, rules_id, result)
         VALUES ($1,$2,$3,$4,$5,'approved')`, [orgA, A.renter1, b, A.screening, rules]), CHECK, /yd_building_not_signed/);
    });

    test("signed status alone is not enough: it also needs a signed fee agreement", async () => {
      const b = await mkBuilding(orgA, { status: "signed", sample: false });
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false);
      await rejects(mkApp(await mkRenter(), b), CHECK, /yd_building_not_signed/);
      const ag = (await one(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'building',$2,'building_fee') RETURNING id`, [orgA, b])).id;
      await q(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [ag]);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false, "a SENT agreement must not count");
      await q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='S' WHERE id=$1`, [ag]);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, true);
      await mkApp(await mkRenter(), b);
      // Voiding it takes the building out again.
      await q(`UPDATE yd_agreements SET status='void' WHERE id=$1`, [ag]);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false);
      await rejects(mkApp(await mkRenter(), b), CHECK, /yd_building_not_signed/);
    });

    test("a signed COMPANY agreement covers its buildings", async () => {
      const company = (await one(`INSERT INTO yd_companies (org_id, name) VALUES ($1,$2) RETURNING id`, [orgA, uniq("Co")])).id;
      const b = await mkBuilding(orgA, { status: "live", sample: false, company });
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false);
      const ag = (await one(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'company',$2,'building_fee') RETURNING id`, [orgA, company])).id;
      await q(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [ag]);
      await q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='S' WHERE id=$1`, [ag]);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, true);
    });

    test("a paused or churned building is not matchable even with a signed agreement", async () => {
      const b = await mkBuilding(orgA, { status: "paused", sample: false });
      const ag = (await one(`INSERT INTO yd_agreements (org_id, party_kind, party_id, kind) VALUES ($1,'building',$2,'building_fee') RETURNING id`, [orgA, b])).id;
      await q(`UPDATE yd_agreements SET status='sent', sent_at=now() WHERE id=$1`, [ag]);
      await q(`UPDATE yd_agreements SET status='signed', signed_at=now(), signer_name='S' WHERE id=$1`, [ag]);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false);
      await q(`UPDATE yd_buildings SET status='churned' WHERE id=$1`, [b]);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [b])).ok, false);
    });

    test("flagged SAMPLE buildings are matchable (the demo funnel), and a missing building is not", async () => {
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, [A.bSample])).ok, true);
      assert.equal((await one(`SELECT yd_building_is_matchable($1) AS ok`, ["11111111-1111-4111-8111-111111111111"])).ok, false);
    });
  });

  /* ── matches ──────────────────────────────────────────────────────────── */

  describe("matches", () => {
    const ins = (cols, vals, params = []) => q(
      `INSERT INTO yd_matches (org_id, renter_id, building_id, screening_id, rules_id, ${cols}) VALUES ($1,$2,$3,$4,$5,${vals})`,
      [orgA, A.renter1, A.bSigned, A.screening, A.rSigned, ...params]);

    test("result is approved/likely/no, reasons is an array, max rent is never negative", async () => {
      await rejects(ins("result", "'maybe'"), CHECK);
      await rejects(ins("result, reasons", "'no', '{}'::jsonb"), CHECK);
      await rejects(ins("result, max_rent_cents", "'no', -1"), CHECK);
      await ins("result", "'likely'");
    });

    test("a backup match must be an approved one", async () => {
      await rejects(ins("result, is_backup", "'likely', true"), CHECK);
      await rejects(ins("result, is_backup", "'no', true"), CHECK);
      await ins("result, is_backup", "'approved', true");
    });

    test("a match must use the building's own rules, the renter's own screening, and the renter's own income check", async () => {
      await rejects(q(`INSERT INTO yd_matches (org_id, renter_id, building_id, screening_id, rules_id, result) VALUES ($1,$2,$3,$4,$5,'approved')`,
        [orgA, A.renter1, A.bSigned, A.screening, A.rOther]), FK);                 // rules of a different building
      await rejects(q(`INSERT INTO yd_matches (org_id, renter_id, building_id, screening_id, rules_id, result) VALUES ($1,$2,$3,$4,$5,'approved')`,
        [orgA, A.renter2, A.bSigned, A.screening, A.rSigned]), FK);                // renter1's screening on renter2
      await rejects(q(`INSERT INTO yd_matches (org_id, renter_id, building_id, screening_id, rules_id, income_check_id, result) VALUES ($1,$2,$3,$4,$5,$6,'approved')`,
        [orgA, A.renter1, A.bSigned, A.screening, A.rSigned, B.income]), FK);      // another company's income check
      await rejects(q(`INSERT INTO yd_matches (org_id, renter_id, building_id, listing_id, screening_id, rules_id, result) VALUES ($1,$2,$3,$4,$5,$6,'approved')`,
        [orgA, A.renter1, A.bSigned, A.lOther, A.screening, A.rSigned]), FK);      // a listing from a different building
    });

    test("another company's building, renter or rules can never be matched (composite keys)", async () => {
      await rejects(q(`INSERT INTO yd_matches (org_id, renter_id, building_id, screening_id, rules_id, result) VALUES ($1,$2,$3,$4,$5,'approved')`,
        [orgA, A.renter1, B.bSigned, A.screening, B.rSigned]), FK);
    });

    test("every result is kept: matches are never deleted, and recomputing adds a row", async () => {
      const before = Number((await one(`SELECT count(*) AS n FROM yd_matches WHERE renter_id=$1 AND building_id=$2`, [A.renter1, A.bSigned])).n);
      await ins("result", "'no'");
      const after = Number((await one(`SELECT count(*) AS n FROM yd_matches WHERE renter_id=$1 AND building_id=$2`, [A.renter1, A.bSigned])).n);
      assert.equal(after, before + 1);
    });
  });

  /* ── applications: the placement record ───────────────────────────────── */

  describe("applications", () => {
    test("a placement starts at booked", async () => {
      const b = await mkBuilding();
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id, stage) VALUES ($1,$2,$3,'registered')`, [orgA, await mkRenter(), b]), CHECK, /yd_application_start/);
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id, stage) VALUES ($1,$2,$3,'paid')`, [orgA, await mkRenter(), b]), CHECK);
      const id = await mkApp(await mkRenter(), b);
      assert.equal((await one(`SELECT stage FROM yd_applications WHERE id=$1`, [id])).stage, "booked");
    });

    test("the open-application cap: a renter holds at most YD_DEFAULTS.maxOpenApplications", async () => {
      const cap = YD_DEFAULTS.maxOpenApplications;
      const renter = await mkRenter();
      const apps = [];
      for (let i = 0; i < cap; i++) apps.push(await mkApp(renter, await mkBuilding()));
      await rejects(mkApp(renter, await mkBuilding()), CHECK, /yd_open_application_cap/);
      // A denial frees a slot.
      await walk(apps[0], "applied");
      await q(`UPDATE yd_applications SET stage='denied', denial_reason='credit' WHERE id=$1`, [apps[0]]);
      const fourth = await mkApp(renter, await mkBuilding());
      assert.ok(fourth);
      await rejects(mkApp(renter, await mkBuilding()), CHECK, /yd_open_application_cap/);
      // A cancelled booking frees one too.
      await q(`UPDATE yd_applications SET stage='cancelled' WHERE id=$1`, [apps[1]]);
      await mkApp(renter, await mkBuilding());
    });

    test("the cap holds under a race: six simultaneous bookings, exactly three get in", async () => {
      const renter = await mkRenter();
      const buildings = [];
      for (let i = 0; i < 6; i++) buildings.push(await mkBuilding());
      const results = await Promise.allSettled(buildings.map((b) => mkApp(renter, b)));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, YD_DEFAULTS.maxOpenApplications);
      for (const r of results.filter((x) => x.status === "rejected")) assert.match(r.reason.message, /yd_open_application_cap/);
    });

    test("a renter's placements that are past move-in do not count as open", async () => {
      const renter = await mkRenter();
      for (let i = 0; i < YD_DEFAULTS.maxOpenApplications; i++) {
        const app = await mkApp(renter, await mkBuilding());
        await walk(app, "moved_in");
      }
      await mkApp(renter, await mkBuilding());
    });

    test("one open application per renter per building (an application fee is paid per building)", async () => {
      const b = await mkBuilding();
      const renter = await mkRenter();
      await mkApp(renter, b);
      await rejects(mkApp(renter, b), UNIQUE);
    });

    test("stages move only along the §3 arrows", async () => {
      const move = (app, stage, extra = "") => q(`UPDATE yd_applications SET stage=$2 ${extra} WHERE id=$1`, [app, stage]);
      const b = await mkBuilding();
      const app = await mkApp(await mkRenter(), b);
      await rejects(move(app, "toured"), CHECK, /yd_stage_move/);          // skipping registered
      await rejects(move(app, "paid"), CHECK, /yd_stage_move/);
      await rejects(move(app, "moved_in"), CHECK, /yd_stage_move/);
      await rejects(move(app, "denied", ", denial_reason='x'"), CHECK, /yd_stage_move/);
      await walk(app, "registered");
      await rejects(move(app, "booked"), CHECK, /yd_stage_move/);         // never backward
      await rejects(move(app, "applied"), CHECK, /yd_stage_move/);
      await move(app, "no_show");
      for (const to of ["toured", "booked", "registered", "applied", "cancelled"]) {
        await rejects(move(app, to), CHECK, /yd_stage_move/);             // no_show is final
      }
    });

    test("the full arrow table, checked against the function the trigger uses", async () => {
      // 437 added registered -> cancelled and toured -> cancelled (a renter who withdraws frees a place in the cap).
      const arrows = [["booked", "registered"], ["booked", "cancelled"], ["registered", "toured"], ["registered", "no_show"],
        ["registered", "cancelled"], ["toured", "cancelled"], ["toured", "applied"], ["applied", "approved"], ["applied", "denied"], ["approved", "lease_signed"],
        ["lease_signed", "moved_in"], ["moved_in", "invoiced"], ["invoiced", "paid"], ["paid", "safe"], ["paid", "refunded"]];
      const stages = ["booked", "registered", "toured", "no_show", "applied", "approved", "denied", "lease_signed", "moved_in", "invoiced", "paid", "safe", "refunded", "cancelled"];
      for (const from of stages) {
        for (const to of stages) {
          const expected = arrows.some(([f, t]) => f === from && t === to);
          const got = (await one(`SELECT yd_stage_move_ok($1,$2) AS ok`, [from, to])).ok;
          assert.equal(got, expected, `${from} -> ${to}`);
        }
      }
    });

    test("denied needs a reason; lease_signed needs the lease; a lease must end after it starts", async () => {
      const b = await mkBuilding();
      const app = await mkApp(await mkRenter(), b);
      await walk(app, "applied");
      await rejects(q(`UPDATE yd_applications SET stage='denied' WHERE id=$1`, [app]), CHECK);
      await rejects(q(`UPDATE yd_applications SET stage='denied', denial_reason='  ' WHERE id=$1`, [app]), CHECK);
      await q(`UPDATE yd_applications SET stage='approved' WHERE id=$1`, [app]);
      await rejects(q(`UPDATE yd_applications SET stage='lease_signed' WHERE id=$1`, [app]), CHECK);
      await rejects(q(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date, lease_end=current_date+30 WHERE id=$1`, [app]), CHECK);   // no rent
      await rejects(q(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date+30, lease_end=current_date, rent_cents=1000 WHERE id=$1`, [app]), CHECK);
      await rejects(q(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date, lease_end=current_date+30, rent_cents=0 WHERE id=$1`, [app]), CHECK);
      await q(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date, lease_end=current_date+30, rent_cents=150000 WHERE id=$1`, [app]);
    });

    test("the registration email is the referral proof: no tour without it, the timestamp and message go together, and it never changes", async () => {
      const b = await mkBuilding();
      const app = await mkApp(await mkRenter(), b);
      await rejects(q(`UPDATE yd_applications SET stage='registered' WHERE id=$1`, [app]), CHECK);             // no proof
      await rejects(q(`UPDATE yd_applications SET stage='registered', registration_sent_at=now() WHERE id=$1`, [app]), CHECK);   // timestamp without the message
      await rejects(q(`UPDATE yd_applications SET registration_outbox_id=$2 WHERE id=$1`, [app, await mkOutbox()]), CHECK);
      const outbox = await mkOutbox();
      await q(`UPDATE yd_applications SET stage='registered', registration_sent_at=now(), registration_outbox_id=$2 WHERE id=$1`, [app, outbox]);
      await rejects(q(`UPDATE yd_applications SET registration_sent_at = now() - interval '30 days' WHERE id=$1`, [app]), CHECK, /yd_registration_locked/);
      await rejects(q(`UPDATE yd_applications SET registration_outbox_id=$2 WHERE id=$1`, [app, await mkOutbox()]), CHECK, /yd_registration_locked/);
    });

    test("the registration message must be this company's", async () => {
      const app = await mkApp(await mkRenter(), await mkBuilding());
      await rejects(q(`UPDATE yd_applications SET stage='registered', registration_sent_at=now(), registration_outbox_id=$2 WHERE id=$1`, [app, await mkOutbox(orgB)]), FK);
    });

    test("the renter and the building of an application never change", async () => {
      const app = await mkApp(await mkRenter(), await mkBuilding());
      await rejects(q(`UPDATE yd_applications SET renter_id=$2 WHERE id=$1`, [app, await mkRenter()]), CHECK, /yd_application_fixed/);
      await rejects(q(`UPDATE yd_applications SET building_id=$2 WHERE id=$1`, [app, await mkBuilding()]), CHECK, /yd_application_fixed/);
    });

    test("a placement can only join a renter, building, listing, match and broker of the SAME company", async () => {
      const b = await mkBuilding();
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id) VALUES ($1,$2,$3)`, [orgA, B.renter1, b]), FK);
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id) VALUES ($1,$2,$3)`, [orgA, await mkRenter(), B.bSigned]), FK);
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id, broker_id) VALUES ($1,$2,$3,$4)`, [orgA, await mkRenter(), b, B.broker]), FK);
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id) VALUES ($1,$2,$3,$4)`, [orgA, await mkRenter(), b, A.lPublic1]), FK);   // listing from another building
      await rejects(q(`INSERT INTO yd_applications (org_id, renter_id, building_id, match_id) VALUES ($1,$2,$3,$4)`, [orgA, await mkRenter(), b, A.match]), FK);        // someone else's match
    });

    test("every move writes exactly one event, stamps its own timestamp, and is not duplicated by a no-op update", async () => {
      const b = await mkBuilding();
      const app = await mkApp(await mkRenter(), b);
      const events = async () => (await q(`SELECT name, payload, actor_kind, idempotency_key FROM yd_events WHERE entity_id=$1 ORDER BY occurred_at, id`, [app])).rows;
      assert.deepEqual((await events()).map((e) => e.name), ["application.booked"]);
      await walk(app, "approved");
      assert.deepEqual((await events()).map((e) => e.name),
        ["application.booked", "application.registered", "application.toured", "application.applied", "application.approved"]);
      await q(`UPDATE yd_applications SET denial_reason=NULL WHERE id=$1`, [app]);          // not a move
      await q(`UPDATE yd_applications SET stage='approved' WHERE id=$1`, [app]);            // same stage again
      assert.equal((await events()).length, 5, "a non-move wrote an event");
      const row = await one(`SELECT booked_at, registered_at, toured_at, applied_at, approved_at, denied_at, moved_in_at FROM yd_applications WHERE id=$1`, [app]);
      for (const k of ["booked_at", "registered_at", "toured_at", "applied_at", "approved_at"]) assert.ok(row[k], `${k} was not stamped`);
      assert.equal(row.denied_at, null);
      assert.equal(row.moved_in_at, null);
      const ev = (await events())[1];
      assert.deepEqual(ev.payload, { from: "booked", to: "registered", renter_id: ev.payload.renter_id, building_id: b });
      assert.equal(ev.actor_kind, "system");
      assert.equal(ev.idempotency_key, `app-stage:${app}:registered`);
    });

    test("the actor on a move comes from the session settings when the caller sets them", async () => {
      const app = await mkApp(await mkRenter(), await mkBuilding());
      const client = await pool().connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('yd.actor_kind','staff',true), set_config('yd.actor_id',$1,true)`, [fx.staffIds.opsA]);
        await client.query(`UPDATE yd_applications SET stage='registered', registration_sent_at=now(), registration_outbox_id=$2 WHERE id=$1`, [app, await mkOutbox()]);
        await client.query("COMMIT");
      } finally { client.release(); }
      const ev = await one(`SELECT actor_kind, actor_id FROM yd_events WHERE entity_id=$1 AND name='application.registered'`, [app]);
      assert.deepEqual(ev, { actor_kind: "staff", actor_id: fx.staffIds.opsA });
    });

    test("known prospect (spec §5b): the building's evidence is required, and it can open an attribution dispute", async () => {
      const app = await mkApp(await mkRenter(), await mkBuilding());
      await rejects(q(`UPDATE yd_applications SET known_prospect_at=now() WHERE id=$1`, [app]), CHECK);
      await rejects(q(`UPDATE yd_applications SET known_prospect_at=now(), known_prospect_evidence='  ' WHERE id=$1`, [app]), CHECK);
      await q(`UPDATE yd_applications SET known_prospect_at=now(), known_prospect_evidence='Visitor record dated 2026-09-01' WHERE id=$1`, [app]);
      const d = await one(`INSERT INTO yd_disputes (org_id, kind, subject, opened_by_kind) VALUES ($1,'attribution',$2::jsonb,'building_user') RETURNING id, due_by, opened_at`, [orgA, JSON.stringify({ application_id: app })]);
      assert.ok(d.id);
    });

    test("applications are never deleted, and cancelled ones stay as history", async () => {
      const app = await mkApp(await mkRenter(), await mkBuilding());
      await q(`UPDATE yd_applications SET stage='cancelled' WHERE id=$1`, [app]);
      await rejects(asApp(`DELETE FROM yd_applications WHERE id=$1`, [app]), DENIED);
      assert.equal((await one(`SELECT stage FROM yd_applications WHERE id=$1`, [app])).stage, "cancelled");
    });
  });

  describe("tours and touches", () => {
    test("a tour ends after it starts, and its status is an enum", async () => {
      const { app } = await placement({ to: "registered" });
      await rejects(q(`INSERT INTO yd_tours (org_id, application_id, starts_at, ends_at) VALUES ($1,$2,now(),now() - interval '1 hour')`, [orgA, app]), CHECK);
      await rejects(q(`INSERT INTO yd_tours (org_id, application_id, starts_at, status) VALUES ($1,$2,now(),'late')`, [orgA, app]), CHECK);
      await q(`INSERT INTO yd_tours (org_id, application_id, starts_at, status) VALUES ($1,$2,now(),'noshow')`, [orgA, app]);
      await rejects(q(`INSERT INTO yd_tours (org_id, application_id, starts_at) VALUES ($1,$2,now())`, [orgB, app]), FK);
    });

    test("lifetime touches: one of each kind per application, kinds bounded", async () => {
      const { renter, app } = await placement({ to: "registered" });
      await q(`INSERT INTO yd_touches (org_id, renter_id, application_id, kind, due_at) VALUES ($1,$2,$3,'day_30',now())`, [orgA, renter, app]);
      await rejects(q(`INSERT INTO yd_touches (org_id, renter_id, application_id, kind, due_at) VALUES ($1,$2,$3,'day_30',now())`, [orgA, renter, app]), UNIQUE);
      await rejects(q(`INSERT INTO yd_touches (org_id, renter_id, application_id, kind, due_at) VALUES ($1,$2,$3,'day_45',now())`, [orgA, renter, app]), CHECK);
      for (const kind of ["move_in_welcome", "month_6", "lease_end_90"]) {
        await q(`INSERT INTO yd_touches (org_id, renter_id, application_id, kind, due_at) VALUES ($1,$2,$3,$4,now())`, [orgA, renter, app, kind]);
      }
    });
  });

  /* ── disputes ─────────────────────────────────────────────────────────── */

  describe("disputes", () => {
    test("due 14 days after opening unless a date is given; a decided one needs everything and is final", async () => {
      const d = await one(`INSERT INTO yd_disputes (org_id, kind, opened_by_kind) VALUES ($1,'denial','renter') RETURNING id, opened_at, due_by`, [orgA]);
      assert.equal(Math.round((new Date(d.due_by) - new Date(d.opened_at)) / 86400000), 14);
      await rejects(q(`UPDATE yd_disputes SET status='decided' WHERE id=$1`, [d.id]), CHECK);
      await rejects(q(`UPDATE yd_disputes SET status='decided', decision='Renter wins' WHERE id=$1`, [d.id]), CHECK);
      await q(`UPDATE yd_disputes SET status='decided', decision='Renter wins', decided_by=$2, decided_at=now() WHERE id=$1`, [d.id, fx.staffIds.opsA]);
      await rejects(q(`UPDATE yd_disputes SET decision='Building wins' WHERE id=$1`, [d.id]), CHECK, /yd_dispute_decided/);
      await rejects(q(`UPDATE yd_disputes SET status='open' WHERE id=$1`, [d.id]), CHECK, /yd_dispute_decided/);
    });

    test("kind and opener are enums; the subject is an object; a due date cannot precede the opening", async () => {
      await rejects(q(`INSERT INTO yd_disputes (org_id, kind, opened_by_kind) VALUES ($1,'noise','staff')`, [orgA]), CHECK);
      await rejects(q(`INSERT INTO yd_disputes (org_id, kind, opened_by_kind) VALUES ($1,'fee','landlord')`, [orgA]), CHECK);
      await rejects(q(`INSERT INTO yd_disputes (org_id, kind, opened_by_kind, subject) VALUES ($1,'fee','staff','[]')`, [orgA]), CHECK);
      await rejects(q(`INSERT INTO yd_disputes (org_id, kind, opened_by_kind, opened_at, due_by) VALUES ($1,'fee','staff',now(), now() - interval '1 day')`, [orgA]), CHECK);
    });
  });

  /* ── money ────────────────────────────────────────────────────────────── */

  describe("invoices", () => {
    test("the number is minted YD-INV- + 6 digits and is unique; due date follows the building's payment terms", async () => {
      const b = (await one(`INSERT INTO yd_buildings (org_id, name, payment_terms_days, status, is_sample) VALUES ($1,$2,45,'target',true) RETURNING id`, [orgA, uniq("Net45")])).id;
      const i = await invoice(b);
      assert.match(i.number, /^YD-INV-\d{6,}$/);
      assert.equal(Math.round((new Date(i.due_at) - new Date(i.issued_at)) / 86400000), 45);
      const j = await invoice(b);
      assert.notEqual(i.number, j.number);
      await rejects(q(`INSERT INTO yd_invoices (org_id, building_id, total_cents, number) VALUES ($1,$2,100,$3)`, [orgA, b, i.number]), UNIQUE);
      await rejects(q(`INSERT INTO yd_invoices (org_id, building_id, total_cents, number) VALUES ($1,$2,100,'INV-1')`, [orgA, b]), CHECK);
    });

    test("an invoice needs a subject, a non-negative total, and a building or company in this company", async () => {
      await rejects(q(`INSERT INTO yd_invoices (org_id, total_cents) VALUES ($1,100)`, [orgA]), CHECK);
      await rejects(q(`INSERT INTO yd_invoices (org_id, building_id, total_cents) VALUES ($1,$2,-1)`, [orgA, A.bSigned]), CHECK);
      await rejects(q(`INSERT INTO yd_invoices (org_id, building_id, total_cents) VALUES ($1,$2,100)`, [orgA, B.bSigned]), FK);
      await rejects(q(`INSERT INTO yd_invoices (org_id, company_id, total_cents) VALUES ($1,$2,100)`, [orgA, B.company]), FK);
      await q(`INSERT INTO yd_invoices (org_id, company_id, total_cents) VALUES ($1,$2,100)`, [orgA, A.company]);
    });

    test("number, total, subject and dates are frozen once issued; status moves open -> paid or void, and paid is final", async () => {
      const i = await invoice(A.bSigned, 100000);
      await rejects(q(`UPDATE yd_invoices SET total_cents=1 WHERE id=$1`, [i.id]), CHECK, /yd_invoice_frozen/);
      await rejects(q(`UPDATE yd_invoices SET number='YD-INV-999999' WHERE id=$1`, [i.id]), CHECK, /yd_invoice_frozen/);
      await rejects(q(`UPDATE yd_invoices SET building_id=$2 WHERE id=$1`, [i.id, A.bOther]), CHECK, /yd_invoice_frozen/);
      await rejects(q(`UPDATE yd_invoices SET due_at = due_at + interval '1 day' WHERE id=$1`, [i.id]), CHECK, /yd_invoice_frozen/);
      await rejects(q(`UPDATE yd_invoices SET status='paid' WHERE id=$1`, [i.id]), CHECK);                      // no payment method
      await rejects(q(`UPDATE yd_invoices SET status='paid', payment_method='cash' WHERE id=$1`, [i.id]), CHECK);
      await q(`UPDATE yd_invoices SET status='paid', payment_method='wire', payment_ref='W-1' WHERE id=$1`, [i.id]);
      const paid = await one(`SELECT paid_at FROM yd_invoices WHERE id=$1`, [i.id]);
      assert.ok(paid.paid_at, "paid_at is stamped when it moves to paid");
      await rejects(q(`UPDATE yd_invoices SET status='open' WHERE id=$1`, [i.id]), CHECK, /yd_invoice_move/);
      await rejects(q(`UPDATE yd_invoices SET status='void' WHERE id=$1`, [i.id]), CHECK, /yd_invoice_move/);
      await rejects(q(`UPDATE yd_invoices SET payment_ref='W-2' WHERE id=$1`, [i.id]), CHECK, /yd_invoice_frozen/);
      const v = await invoice(A.bSigned, 5);
      await q(`UPDATE yd_invoices SET status='void' WHERE id=$1`, [v.id]);
      await rejects(q(`UPDATE yd_invoices SET status='paid', payment_method='ach' WHERE id=$1`, [v.id]), CHECK);
    });

    test("a payment cannot predate the invoice", async () => {
      const i = await invoice(A.bSigned);
      await rejects(q(`UPDATE yd_invoices SET status='paid', payment_method='ach', paid_at = now() - interval '2 days' WHERE id=$1`, [i.id]), CHECK);
    });
  });

  describe("fee ledger", () => {
    test("a placement fee is positive cents, a refund is negative cents and names what it reverses", async () => {
      const { app, building } = await placement();
      await rejects(fee(app, building, 0), CHECK);
      await rejects(fee(app, building, -100), CHECK);
      const f = await fee(app, building, 150000);
      await rejects(fee(app, building, 100, { kind: "refund", reverses: f }), CHECK);              // positive refund
      await rejects(q(`INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, idempotency_key) VALUES ($1,$2,$3,'refund',-150000,$4)`, [orgA, app, building, uniq("k")]), CHECK);   // no reverses_id
      await rejects(fee(app, building, -150000, { kind: "placement_fee", reverses: f }), CHECK);     // a fee that claims to reverse
      await rejects(fee(app, building, 150000, { key: "" }), CHECK);
      assert.strictEqual((await one(`SELECT amount_cents FROM yd_fee_ledger WHERE id=$1`, [f])).amount_cents, "150000", "bigint arrives as a string; the API layer converts it");
    });

    test("one placement fee per application, and the idempotency key can never earn a fee twice", async () => {
      const { app, building } = await placement();
      const key = uniq("replay");
      await fee(app, building, 150000, { key });
      await rejects(fee(app, building, 150000, { key }), UNIQUE);
      await rejects(fee(app, building, 150000), UNIQUE);          // second fee, different key, same application
    });

    test("a refund reverses the original IN FULL, once, on the same application; the original stays", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      await rejects(fee(app, building, -100000, { kind: "refund", reverses: f }), CHECK, /yd_refund_amount/);
      await rejects(fee(app, building, -150000, { kind: "refund", reverses: "11111111-1111-4111-8111-111111111111" }), CHECK, /yd_refund_target/);
      const other = await placement();
      await rejects(fee(other.app, other.building, -150000, { kind: "refund", reverses: f }), CHECK, /yd_refund_target/);
      const r = await fee(app, building, -150000, { kind: "refund", reverses: f });
      await rejects(fee(app, building, -150000, { kind: "refund", reverses: f }), UNIQUE);
      assert.ok(r);
      const original = await one(`SELECT amount_cents, status FROM yd_fee_ledger WHERE id=$1`, [f]);
      assert.deepEqual(original, { amount_cents: "150000", status: "earned" }, "the original row was touched by its reversal");
      const net = await one(`SELECT sum(amount_cents)::int AS net FROM yd_fee_ledger WHERE application_id=$1`, [app]);
      assert.equal(net.net, 0);
      // A refund cannot reverse another refund.
      await rejects(fee(app, building, 150000, { kind: "refund", reverses: r }), CHECK);
    });

    test("status moves earned -> invoiced -> paid -> safe, with void as the exit; nothing skips or goes back", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      const inv = await invoice(building, 150000);
      await rejects(q(`UPDATE yd_fee_ledger SET status='paid', paid_at=now() WHERE id=$1`, [f]), CHECK, /yd_ledger_move/);      // skips invoiced
      await rejects(q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [f]), CHECK, /yd_ledger_move/);
      await rejects(q(`UPDATE yd_fee_ledger SET status='invoiced' WHERE id=$1`, [f]), CHECK);                                  // no invoice
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f, inv.id]);
      const row = await one(`SELECT invoiced_at FROM yd_fee_ledger WHERE id=$1`, [f]);
      assert.ok(row.invoiced_at, "invoiced_at is stamped on the move");
      await rejects(q(`UPDATE yd_fee_ledger SET status='earned' WHERE id=$1`, [f]), CHECK, /yd_ledger_move/);
      await q(`UPDATE yd_fee_ledger SET status='paid' WHERE id=$1`, [f]);
      await rejects(q(`UPDATE yd_fee_ledger SET status='invoiced' WHERE id=$1`, [f]), CHECK, /yd_ledger_move/);
      await rejects(q(`UPDATE yd_fee_ledger SET status='void' WHERE id=$1`, [f]), CHECK, /yd_ledger_move/);                    // paid money is reversed, not voided
    });

    test("the amount is frozen the moment it leaves earned, and identity never changes", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      await q(`UPDATE yd_fee_ledger SET amount_cents=160000 WHERE id=$1`, [f]);                       // still earned: a correction is allowed
      const inv = await invoice(building, 160000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f, inv.id]);
      await rejects(q(`UPDATE yd_fee_ledger SET amount_cents=1 WHERE id=$1`, [f]), CHECK, /yd_ledger_amount_frozen/);
      await rejects(q(`UPDATE yd_fee_ledger SET building_id=$2 WHERE id=$1`, [f, A.bSigned]), CHECK, /yd_ledger_frozen/);
      await rejects(q(`UPDATE yd_fee_ledger SET application_id=$2 WHERE id=$1`, [f, A.app1]), CHECK, /yd_ledger_frozen/);
      await rejects(q(`UPDATE yd_fee_ledger SET kind='refund' WHERE id=$1`, [f]), CHECK, /yd_ledger_frozen/);
      await rejects(q(`UPDATE yd_fee_ledger SET idempotency_key='new' WHERE id=$1`, [f]), CHECK, /yd_ledger_frozen/);
      await rejects(q(`UPDATE yd_fee_ledger SET earned_at = now() WHERE id=$1`, [f]), CHECK, /yd_ledger_frozen/);
      const other = await invoice(building, 1);
      await rejects(q(`UPDATE yd_fee_ledger SET invoice_id=$2 WHERE id=$1`, [f, other.id]), CHECK, /yd_ledger_invoice_fixed/);
    });

    test("a fee can only be billed on its own building's (or company's) invoice", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      const wrong = await invoice(A.bSigned, 150000);
      await rejects(q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f, wrong.id]), CHECK, /yd_invoice_subject/);
      const company = (await one(`INSERT INTO yd_companies (org_id, name) VALUES ($1,$2) RETURNING id`, [orgA, uniq("Co")])).id;
      const b2 = await mkBuilding(orgA, { company });
      const p2 = await placement({ building: b2 });
      const f2 = await fee(p2.app, b2, 100000);
      const companyInv = (await one(`INSERT INTO yd_invoices (org_id, company_id, total_cents) VALUES ($1,$2,100000) RETURNING id`, [orgA, company])).id;
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f2, companyInv]);
    });

    test("safe means paid AND refund_days later: not a day early, then yes", async () => {
      // Paid just now: not safe.
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      const inv = await invoice(building, 150000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f, inv.id]);
      await q(`UPDATE yd_fee_ledger SET status='paid' WHERE id=$1`, [f]);
      await rejects(q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [f]), CHECK, /yd_not_safe_yet/);

      // Paid 59 days ago: still not safe (the window is 60).
      const p59 = await placement({ building });
      const f59 = await fee(p59.app, building, 100000);
      const i59 = await invoice(building, 100000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2, invoiced_at = now() - interval '70 days' WHERE id=$1`, [f59, i59.id]);
      await q(`UPDATE yd_fee_ledger SET status='paid', paid_at = now() - interval '59 days' WHERE id=$1`, [f59]);
      await rejects(q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [f59]), CHECK, /yd_not_safe_yet/);

      // Paid 61 days ago (the fixture's fee): safe. Then it is final.
      await q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [A.fee]);
      const safe = await one(`SELECT status, safe_at FROM yd_fee_ledger WHERE id=$1`, [A.fee]);
      assert.equal(safe.status, "safe");
      assert.ok(safe.safe_at);
      await rejects(q(`UPDATE yd_fee_ledger SET status='void' WHERE id=$1`, [A.fee]), CHECK);
      await rejects(q(`UPDATE yd_fee_ledger SET safe_at = now() WHERE id=$1`, [A.fee]), CHECK, /yd_ledger_time_fixed|yd_ledger_frozen/);
    });

    test("a stamped invoiced / paid time never changes (the back-dating door is shut)", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      const inv = await invoice(building, 150000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f, inv.id]);
      await rejects(q(`UPDATE yd_fee_ledger SET invoiced_at = now() - interval '90 days' WHERE id=$1`, [f]), CHECK, /yd_ledger_time_fixed/);
      await q(`UPDATE yd_fee_ledger SET status='paid' WHERE id=$1`, [f]);
      await rejects(q(`UPDATE yd_fee_ledger SET paid_at = now() - interval '90 days' WHERE id=$1`, [f]), CHECK, /yd_ledger_time_fixed/);
      await rejects(q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [f]), CHECK, /yd_not_safe_yet/);
    });

    test("the safe window is the BUILDING's refund_days", async () => {
      const b = (await one(`INSERT INTO yd_buildings (org_id, name, refund_days, status, is_sample) VALUES ($1,$2,90,'target',true) RETURNING id`, [orgA, uniq("R90")])).id;
      const p = await placement({ building: b });
      const f = await fee(p.app, b, 100000);
      const inv = await invoice(b, 100000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2, invoiced_at = now() - interval '100 days' WHERE id=$1`, [f, inv.id]);
      await q(`UPDATE yd_fee_ledger SET status='paid', paid_at = now() - interval '80 days' WHERE id=$1`, [f]);
      await rejects(q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [f]), CHECK, /yd_not_safe_yet/);
    });

    test("time runs forward: paid cannot precede invoiced, safe cannot precede paid", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      const inv = await invoice(building, 150000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2 WHERE id=$1`, [f, inv.id]);
      await rejects(q(`UPDATE yd_fee_ledger SET status='paid', paid_at = now() - interval '3 days' WHERE id=$1`, [f]), CHECK);
    });

    test("a refund row is a credit: earned -> paid or void, never safe, never invoiced", async () => {
      const { app, building } = await placement();
      const f = await fee(app, building, 150000);
      const r = await fee(app, building, -150000, { kind: "refund", reverses: f });
      await rejects(q(`UPDATE yd_fee_ledger SET status='safe', safe_at=now() WHERE id=$1`, [r]), CHECK);
      await rejects(q(`UPDATE yd_fee_ledger SET status='invoiced' WHERE id=$1`, [r]), CHECK);
      await q(`UPDATE yd_fee_ledger SET status='paid' WHERE id=$1`, [r]);
    });

    test("a fee cannot be written against another company's application or building", async () => {
      await rejects(q(`INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, idempotency_key) VALUES ($1,$2,$3,'placement_fee',100,$4)`, [orgA, B.app2, B.bOther, uniq("k")]), FK);
      // The application is real and in this company, but the building is not the one it was booked at.
      await rejects(q(`INSERT INTO yd_fee_ledger (org_id, application_id, building_id, kind, amount_cents, idempotency_key) VALUES ($1,$2,$3,'placement_fee',100,$4)`, [orgA, A.app2, A.bSigned, uniq("k")]), FK);
    });
  });

  describe("broker ledger", () => {
    async function brokerFee({ broker = A.broker } = {}) {
      const p = await placement({ broker });
      const f = await fee(p.app, p.building, 100000);
      const inv = await invoice(p.building, 100000);
      await q(`UPDATE yd_fee_ledger SET status='invoiced', invoice_id=$2, invoiced_at = now() - interval '70 days' WHERE id=$1`, [f, inv.id]);
      await q(`UPDATE yd_fee_ledger SET status='paid', paid_at = now() - interval '61 days' WHERE id=$1`, [f]);
      return { ...p, fee: f };
    }
    const mk = (feeId, broker, amount = 25000) => q(
      `INSERT INTO yd_broker_ledger (org_id, broker_id, fee_ledger_id, amount_cents) VALUES ($1,$2,$3,$4) RETURNING id`, [orgA, broker, feeId, amount]);

    test("a broker is only paid on a placement THAT broker first-touched", async () => {
      const mine = await brokerFee({ broker: A.broker });
      const noBroker = await brokerFee({ broker: null });
      const other = (await one(`INSERT INTO yd_brokers (org_id, name, email) VALUES ($1,'Other',$2) RETURNING id`, [orgA, `${uniq("ob")}@example.test`])).id;
      await rejects(mk(mine.fee, other), CHECK, /yd_broker_attribution/);
      await rejects(mk(noBroker.fee, A.broker), CHECK, /yd_broker_attribution/);
      await rejects(mk(mine.fee, B.broker), CHECK, /yd_broker_attribution/);
      await mk(mine.fee, A.broker);
    });

    test("one share per fee, never more than the fee, never negative, and only on a placement fee", async () => {
      const p = await brokerFee();
      await rejects(mk(p.fee, A.broker, 100001), CHECK, /yd_broker_amount/);
      await rejects(mk(p.fee, A.broker, -1), CHECK);
      await mk(p.fee, A.broker, 25000);
      await rejects(mk(p.fee, A.broker, 25000), UNIQUE);
      const refundRow = await fee(p.app, p.building, -100000, { kind: "refund", reverses: p.fee });
      await rejects(mk(refundRow, A.broker), CHECK, /yd_broker_fee/);
    });

    test("earned -> held -> payable -> paid; payable and paid wait for the building's fee to be SAFE", async () => {
      const p = await brokerFee();
      const id = (await mk(p.fee, A.broker)).rows[0].id;
      await rejects(q(`UPDATE yd_broker_ledger SET status='payable' WHERE id=$1`, [id]), CHECK, /yd_broker_move/);              // skips held
      await rejects(q(`UPDATE yd_broker_ledger SET status='held' WHERE id=$1`, [id]), CHECK);                                  // no hold_until
      await q(`UPDATE yd_broker_ledger SET status='held', hold_until = now() - interval '1 hour' WHERE id=$1`, [id]);
      await rejects(q(`UPDATE yd_broker_ledger SET status='payable' WHERE id=$1`, [id]), CHECK, /yd_broker_hold/);              // fee is paid, not safe
      await q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [p.fee]);
      await q(`UPDATE yd_broker_ledger SET status='payable' WHERE id=$1`, [id]);
      await rejects(q(`UPDATE yd_broker_ledger SET status='paid' WHERE id=$1`, [id]), CHECK);                                  // no payout ref
      await q(`UPDATE yd_broker_ledger SET status='paid', payout_ref='PAYOUT-1' WHERE id=$1`, [id]);
      const row = await one(`SELECT paid_at FROM yd_broker_ledger WHERE id=$1`, [id]);
      assert.ok(row.paid_at);
      await rejects(q(`UPDATE yd_broker_ledger SET payout_ref='PAYOUT-2' WHERE id=$1`, [id]), CHECK, /yd_ledger_frozen/);
      await rejects(q(`UPDATE yd_broker_ledger SET status='void' WHERE id=$1`, [id]), CHECK);
    });

    test("the hold_until date is respected even after the fee is safe", async () => {
      const p = await brokerFee();
      const id = (await mk(p.fee, A.broker)).rows[0].id;
      await q(`UPDATE yd_broker_ledger SET status='held', hold_until = now() + interval '3 days' WHERE id=$1`, [id]);
      await q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [p.fee]);
      await rejects(q(`UPDATE yd_broker_ledger SET status='payable' WHERE id=$1`, [id]), CHECK, /the hold runs until/);
    });

    test("amount, broker and fee of a broker row never change", async () => {
      const p = await brokerFee();
      const id = (await mk(p.fee, A.broker)).rows[0].id;
      const other = (await one(`INSERT INTO yd_brokers (org_id, name, email) VALUES ($1,'Other',$2) RETURNING id`, [orgA, `${uniq("ob")}@example.test`])).id;
      await rejects(q(`UPDATE yd_broker_ledger SET amount_cents=1 WHERE id=$1`, [id]), CHECK, /yd_ledger_frozen/);
      await rejects(q(`UPDATE yd_broker_ledger SET broker_id=$2 WHERE id=$1`, [id, other]), CHECK, /yd_ledger_frozen/);
    });

    test("refunding the building's fee VOIDS the broker's unpaid share, and leaves a paid-out one alone", async () => {
      const unpaid = await brokerFee();
      const unpaidRow = (await mk(unpaid.fee, A.broker)).rows[0].id;
      await q(`UPDATE yd_broker_ledger SET status='held', hold_until=now() + interval '10 days' WHERE id=$1`, [unpaidRow]);
      await fee(unpaid.app, unpaid.building, -100000, { kind: "refund", reverses: unpaid.fee });
      assert.equal((await one(`SELECT status FROM yd_broker_ledger WHERE id=$1`, [unpaidRow])).status, "void");

      const paid = await brokerFee();
      const paidRow = (await mk(paid.fee, A.broker)).rows[0].id;
      await q(`UPDATE yd_broker_ledger SET status='held', hold_until = now() - interval '1 hour' WHERE id=$1`, [paidRow]);
      await q(`UPDATE yd_fee_ledger SET status='safe' WHERE id=$1`, [paid.fee]);
      await q(`UPDATE yd_broker_ledger SET status='payable' WHERE id=$1`, [paidRow]);
      await q(`UPDATE yd_broker_ledger SET status='paid', payout_ref='P-9' WHERE id=$1`, [paidRow]);
      await fee(paid.app, paid.building, -100000, { kind: "refund", reverses: paid.fee });
      assert.equal((await one(`SELECT status FROM yd_broker_ledger WHERE id=$1`, [paidRow])).status, "paid", "a paid-out share must be left for a person to claw back");
    });

    test("a void share is final", async () => {
      const p = await brokerFee();
      const id = (await mk(p.fee, A.broker)).rows[0].id;
      await q(`UPDATE yd_broker_ledger SET status='void' WHERE id=$1`, [id]);
      await rejects(q(`UPDATE yd_broker_ledger SET status='held', hold_until=now() WHERE id=$1`, [id]), CHECK);
    });
  });

  describe("renter refunds", () => {
    test("one app-fee refund per application, positive cents, owed -> paid or void, then frozen", async () => {
      const { renter, app } = await placement({ to: "applied" });
      const ins = (cents) => q(`INSERT INTO yd_renter_refunds (org_id, renter_id, application_id, amount_cents) VALUES ($1,$2,$3,$4) RETURNING id`, [orgA, renter, app, cents]);
      await rejects(ins(0), CHECK);
      await rejects(ins(-5), CHECK);
      const id = (await ins(5000)).rows[0].id;
      await rejects(ins(5000), UNIQUE);
      await rejects(q(`UPDATE yd_renter_refunds SET amount_cents=6000 WHERE id=$1`, [id]), CHECK, /yd_refund_frozen/);
      await rejects(q(`UPDATE yd_renter_refunds SET reason='other' WHERE id=$1`, [id]), CHECK);
      await q(`UPDATE yd_renter_refunds SET status='paid' WHERE id=$1`, [id]);
      assert.ok((await one(`SELECT paid_at FROM yd_renter_refunds WHERE id=$1`, [id])).paid_at);
      await rejects(q(`UPDATE yd_renter_refunds SET status='owed' WHERE id=$1`, [id]), CHECK, /yd_refund_move/);
      await rejects(q(`UPDATE yd_renter_refunds SET status='void' WHERE id=$1`, [id]), CHECK, /yd_refund_move/);
    });

    test("the refund must name the renter who actually holds that application", async () => {
      const { app } = await placement({ to: "applied" });
      await rejects(q(`INSERT INTO yd_renter_refunds (org_id, renter_id, application_id, amount_cents) VALUES ($1,$2,$3,5000)`, [orgA, await mkRenter(), app]), FK);
    });
  });

  /* ── events and the outbox ────────────────────────────────────────────── */

  describe("events and outbox", () => {
    test("events are written once: no edit, an idempotency key can never repeat, actors are an enum", async () => {
      const key = uniq("evt");
      const id = (await one(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id, idempotency_key) VALUES ($1,'test.once','renter',$2,$3) RETURNING id`, [orgA, A.renter1, key])).id;
      await rejects(q(`UPDATE yd_events SET name='test.changed' WHERE id=$1`, [id]), CHECK, /written once/);
      await rejects(q(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id, idempotency_key) VALUES ($1,'test.twice','renter',$2,$3)`, [orgA, A.renter1, key]), UNIQUE);
      await q(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id, idempotency_key) VALUES ($1,'test.twice','renter',$2,$3)`, [orgB, B.renter1, key]);   // same key, other company: fine
      await rejects(q(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id, actor_kind) VALUES ($1,'x','renter',$2,'robot')`, [orgA, A.renter1]), CHECK);
      await rejects(q(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id, payload) VALUES ($1,'x','renter',$2,'[]')`, [orgA, A.renter1]), CHECK);
      // No key at all is allowed, many times.
      for (let i = 0; i < 2; i++) await q(`INSERT INTO yd_events (org_id, name, entity_kind, entity_id) VALUES ($1,'test.nokey','renter',$2)`, [orgA, A.renter1]);
    });

    test("the outbox: a sent message needs a provider and a time; it is queued, never sent, until something marks it", async () => {
      const ins = (cols, vals) => q(`INSERT INTO yd_outbox (org_id, channel, to_address, template_key, ${cols}) VALUES ($1,'email','a@example.test','t',${vals})`, [orgA]);
      await rejects(ins("status", "'sent'"), CHECK);
      await rejects(ins("status, provider", "'sent','sandbox'"), CHECK);
      await rejects(q(`INSERT INTO yd_outbox (org_id, channel, to_address, template_key) VALUES ($1,'fax','a','t')`, [orgA]), CHECK);
      await rejects(q(`INSERT INTO yd_outbox (org_id, channel, to_address, template_key) VALUES ($1,'sms',' ','t')`, [orgA]), CHECK);
      await ins("status, provider, sent_at", "'sent','sandbox',now()");
      assert.equal((await one(`SELECT status FROM yd_outbox WHERE id=$1`, [await mkOutbox()])).status, "queued");
    });
  });

  /* ── state rules and the seed ─────────────────────────────────────────── */

  describe("seed: org, state rules and the Arizona sample data", () => {
    let yd;
    before(async () => { yd = (await one(`SELECT id FROM orgs WHERE slug='yesdoor'`)).id; });

    test("the Yesdoor org exists and is not the default org", async () => {
      assert.ok(yd);
      assert.equal((await one(`SELECT is_default FROM orgs WHERE id=$1`, [yd])).is_default, false);
    });

    test("state rules: California has the screening-fee cap and the background-check notice; Arizona says none are on file", async () => {
      const rows = (await q(`SELECT state, key, value FROM yd_state_rules WHERE org_id=$1 ORDER BY state, key`, [yd])).rows;
      const by = Object.fromEntries(rows.map((r) => [`${r.state}.${r.key}`, r.value]));
      assert.ok(by["CA.screening_fee_cap"]);
      assert.ok(Number.isInteger(by["CA.screening_fee_cap"].amount_cents));
      assert.equal(by["CA.screening_fee_cap"].approximate, true, "the cap figure is approximate and must say so");
      assert.equal(by["CA.background_check_notice_required"].required, true);
      assert.equal(by["AZ.state_rules_on_file"].on_file, false);
      assert.equal(rows.filter((r) => r.state === "AZ").length, 1);
      await rejects(q(`INSERT INTO yd_state_rules (org_id, state, key, value) VALUES ($1,'CA','screening_fee_cap','{}')`, [yd]), UNIQUE);
      await rejects(q(`INSERT INTO yd_state_rules (org_id, state, key, value) VALUES ($1,'California','x','{}')`, [yd]), CHECK);
    });

    test("3 sample companies, 8 sample buildings in the five cities, rules v1 (296) then v2 (297, criminal keys renamed)", async () => {
      const cos = (await q(`SELECT name, is_sample, status FROM yd_companies WHERE org_id=$1`, [yd])).rows;
      assert.equal(cos.length, 3);
      assert.ok(cos.every((c) => c.is_sample === true && c.status === "target"));
      const bs = (await q(`SELECT id, name, city, state, zip, lat, lng, is_sample, status, second_chance, app_fee_cents FROM yd_buildings WHERE org_id=$1`, [yd])).rows;
      assert.equal(bs.length, 8);
      assert.ok(bs.every((b) => b.is_sample === true), "every seeded building must be flagged as a sample");
      assert.ok(bs.every((b) => b.status === "target"), "no sample building may claim to be signed");
      assert.ok(bs.every((b) => b.state === "AZ" && /^85\d{3}$/.test(b.zip) && b.lat !== null && b.lng !== null));
      assert.deepEqual([...new Set(bs.map((b) => b.city))].sort(), ["Chandler", "Mesa", "Phoenix", "Scottsdale", "Tempe"]);
      assert.equal(bs.filter((b) => b.second_chance).length, 3);
      assert.equal(bs.filter((b) => b.app_fee_cents === null).length, 1, "one building's application fee is unknown and must stay NULL");
      // 296 wrote version 1; 297 superseded it with version 2 (same numbers, the criminal
      // keys renamed to the matcher's). Rules are versioned, so both rows stay.
      const all = (await q(`SELECT building_id, version FROM yd_building_rules WHERE org_id=$1`, [yd])).rows;
      assert.equal(all.length, 16);
      assert.ok(all.every((r) => r.version === 1 || r.version === 2));
      const rules = (await q(`SELECT DISTINCT ON (building_id) building_id, version, accepts_second_chance, min_score, criminal_policy
                                FROM yd_building_rules WHERE org_id=$1 ORDER BY building_id, version DESC`, [yd])).rows;
      assert.equal(rules.length, 8);
      assert.ok(rules.every((r) => r.version === 2));
      assert.equal(new Set(rules.map((r) => r.building_id)).size, 8);
      const sc = rules.filter((r) => r.accepts_second_chance);
      assert.equal(sc.length, 3);
      assert.ok(Math.max(...sc.map((r) => r.min_score)) < Math.min(...rules.filter((r) => !r.accepts_second_chance).map((r) => r.min_score)),
        "second-chance buildings have lower score floors than the standard ones");
      const scBuildings = new Set(bs.filter((b) => b.second_chance).map((b) => b.id));
      assert.ok(sc.every((r) => scBuildings.has(r.building_id)), "a building's second_chance flag matches its rules");
    });

    test("24 sample listings, $1,200 to $2,400, flagged, 3 per building, with real cities", async () => {
      const ls = (await q(`SELECT rent_cents, is_sample, building_id, beds, active, available_on FROM yd_listings WHERE org_id=$1`, [yd])).rows;
      assert.equal(ls.length, 24);
      assert.ok(ls.every((l) => l.is_sample === true && l.active === true));
      assert.ok(ls.every((l) => Number(l.rent_cents) >= 120000 && Number(l.rent_cents) <= 240000));
      const per = {};
      for (const l of ls) per[l.building_id] = (per[l.building_id] || 0) + 1;
      assert.ok(Object.values(per).every((n) => n === 3));
      const avg = ls.reduce((s, l) => s + Number(l.rent_cents), 0) / ls.length;
      assert.ok(avg > 150000 && avg < 175000, `average rent ${avg} is not near the researched $1,550`);
      assert.ok(new Set(ls.map((l) => l.beds)).size >= 3, "a mix of studios, 1, 2 and 3 bedrooms");
    });

    test("sample names are made up: no seeded name is a known property operator", async () => {
      const names = (await q(`SELECT name FROM yd_companies WHERE org_id=$1 UNION ALL SELECT name FROM yd_buildings WHERE org_id=$1`, [yd])).rows.map((r) => r.name.toLowerCase());
      for (const real of ["greystar", "camden", "avalon", "irvine", "equity", "mid-america", "roscoe", "lincoln", "alliance", "essex"]) {
        assert.ok(!names.some((n) => n.includes(real)), `a sample name contains ${real}`);
      }
    });

    test("sample rules are flagged as sample data in their notes", async () => {
      const notes = (await q(`SELECT notes FROM yd_building_rules WHERE org_id=$1`, [yd])).rows;
      assert.ok(notes.every((n) => /SAMPLE DATA/.test(n.notes)));
    });

    test("no sample renters, matches, applications or money exist (the demo funnel creates them)", async () => {
      for (const t of ["yd_renters", "yd_matches", "yd_applications", "yd_fee_ledger", "yd_invoices", "yd_broker_ledger", "yd_agreements"]) {
        const n = Number((await one(`SELECT count(*) AS n FROM ${t} WHERE org_id=$1`, [yd])).n);
        assert.equal(n, 0, `${t} has seeded rows in the live org`);
      }
    });
  });
});
