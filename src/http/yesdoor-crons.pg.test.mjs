// Postgres-backed tests for the four Yesdoor crons (B3b):
//   yd-recheck  yd-touches  yd-rules-stale  yd-outbox-dispatch
//
// Lives under src/http/ with the other Yesdoor pg tests (npm test's glob is src/**).
// Skips without DATABASE_URL; the real run is against a SCRATCH database as
// fundhub_app, never production. Each describe builds its own two fresh orgs, so
// counts never depend on another describe.
//
// What is proved, per the build spec §6 and §7:
//   * who is due is the pure schedule's answer, and the cron writes exactly that
//   * every cron is safe to run twice, and at the same time: no duplicate touch,
//     no second email, no second re-check
//   * one company's cron never reads or writes another company's rows
//   * a re-check runs under the stored consent, never asks the renter, and an
//     open application that drops to "no" produces a staff event
//   * the sandbox dispatcher marks rows sent and sends nothing

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture } from "../yesdoor/testing/fixture.mjs";
import { recheckRenter, recheckSweep } from "../yesdoor/crons/recheck.mjs";
import { touchesSweep } from "../yesdoor/crons/touches.mjs";
import { rulesStaleSweep } from "../yesdoor/crons/rules-stale.mjs";
import { outboxDispatchSweep } from "../yesdoor/crons/outbox-dispatch.mjs";
import { failIfNotOk, runYdCron } from "../yesdoor/crons/run.mjs";
import { _resetYdOrgCache } from "../yesdoor/store/org.mjs";
import { YD_TEMPLATES } from "../yesdoor/config.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const count = async (table, where, params) =>
  Number((await one(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)).n);

let seq = 0;
const uniq = (p) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

/** A renter with consent, and one finished screening dated `ageDays` ago. */
async function mkRenter(fx, { stage = "matched", recheckConsent = true, ageDays = 40, credit = {}, city = "Phoenix", org = "A" } = {}) {
  const orgId = org === "A" ? fx.orgA : fx.orgB;
  const email = `${uniq("cron")}@example.test`;
  const c = { score: 700, collections: 0, evictions: 0, evictionLast: null, flags: [], ...credit };
  const renter = (await one(
    `INSERT INTO yd_renters (org_id, email, first_name, last_name, stage, current_address)
     VALUES ($1,$2,'Cron','Tester',$3,$4::jsonb) RETURNING id`,
    [orgId, email, stage, JSON.stringify({ city, state: "AZ" })])).id;
  const screeningConsent = (await one(
    `INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method)
     VALUES ($1,$2,'screening','I agree, now and for repeat checks.','v1','checkbox') RETURNING id`, [orgId, renter])).id;
  let recheckConsentId = null;
  if (recheckConsent) {
    recheckConsentId = (await one(
      `INSERT INTO yd_consents (org_id, renter_id, kind, consent_text, consent_version, method)
       VALUES ($1,$2,'recheck','I agree, now and for repeat checks.','v1','checkbox') RETURNING id`, [orgId, renter])).id;
  }
  const screening = (await one(
    `INSERT INTO yd_screenings (org_id, renter_id, consent_id, kind, provider, status, credit_score, collections_count,
                                eviction_count, eviction_last_at, criminal_flags, raw_ref, result_at)
     VALUES ($1,$2,$3,'initial','crs_sandbox','complete',$4,$5,$6,$7,$8::jsonb,'cron-test', now() - ($9::int * interval '1 day'))
     RETURNING id`,
    [orgId, renter, screeningConsent, c.score, c.collections, c.evictions, c.evictionLast, JSON.stringify(c.flags), ageDays])).id;
  return { renter, email, screening, screeningConsent, recheckConsentId, orgId };
}

/** A placement walked to moved_in (or on to paid / refunded), with its dates set explicitly. */
async function mkPlacement(fx, renterId, { building = fx.A.bSigned, listing = fx.A.lPublic1, movedInDaysAgo = 0,
  leaseStartDays = 10, leaseEndDays = 374, final = "moved_in", org = "A" } = {}) {
  const orgId = org === "A" ? fx.orgA : fx.orgB;
  const outbox = (await one(
    `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind)
     VALUES ($1,'email','leasing@example.test','yd-registration','{}','application') RETURNING id`, [orgId])).id;
  const app = (await one(
    `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [orgId, renterId, building, listing])).id;
  const step = (sql, p = []) => db.query(sql, [app, ...p]);
  await step(`UPDATE yd_applications SET stage='registered', registration_sent_at=now(), registration_outbox_id=$2 WHERE id=$1`, [outbox]);
  await step(`UPDATE yd_applications SET stage='toured' WHERE id=$1`);
  await step(`UPDATE yd_applications SET stage='applied' WHERE id=$1`);
  await step(`UPDATE yd_applications SET stage='approved' WHERE id=$1`);
  await step(`UPDATE yd_applications SET stage='lease_signed', lease_start=current_date + $2::int, lease_end=current_date + $3::int, rent_cents=150000 WHERE id=$1`,
    [leaseStartDays, leaseEndDays]);
  await step(`UPDATE yd_applications SET stage='moved_in', moved_in_at = now() - ($2::int * interval '1 day') WHERE id=$1`, [movedInDaysAgo]);
  for (const next of ["invoiced", "paid", "refunded"]) {
    if (final === "moved_in") break;
    await step(`UPDATE yd_applications SET stage='${next}' WHERE id=$1`);
    if (final === next) break;
  }
  return app;
}

/* ====================================================================== */

describe("yd-touches (hourly): the lifetime path", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx;
  before(async () => { fx = await buildYdFixture(db); });
  after(async () => { await close(); });

  const touches = (orgId, appId) => q(`SELECT kind, due_at, sent_at FROM yd_touches WHERE org_id=$1 AND application_id=$2 ORDER BY kind`, [orgId, appId]);

  test("a renter who moved in today is owed the welcome, once: a table row, a queued email, an event", async () => {
    const r = await touchesSweep(db, { orgId: fx.orgA });
    assert.equal(r.ok, true);
    assert.equal(r.queued, 1, JSON.stringify(r));
    assert.equal(r.count, 1);
    assert.equal(r.failed, 0);

    const t = await touches(fx.orgA, fx.A.app1);
    assert.deepEqual(t.map((x) => x.kind), ["move_in_welcome"]);
    assert.equal(t[0].sent_at, null, "nothing is sent by this cron");

    const touch = await one(`SELECT id, renter_id FROM yd_touches WHERE application_id=$1`, [fx.A.app1]);
    assert.equal(touch.renter_id, fx.A.renter1);
    const mail = await one(`SELECT channel, to_address, template_key, status, provider, context, related_kind FROM yd_outbox WHERE related_id=$1`, [touch.id]);
    assert.equal(mail.channel, "email");
    assert.equal(mail.to_address, `rita+a${fx.rand}@example.test`);
    assert.equal(mail.template_key, YD_TEMPLATES.touch.move_in_welcome);
    assert.equal(mail.status, "queued");
    assert.equal(mail.provider, null);
    assert.equal(mail.related_kind, "touch");
    assert.equal(mail.context.touch, "move_in_welcome");
    assert.match(mail.context.building_name, /^Alder Test Lofts/);

    const ev = await one(`SELECT name, entity_kind, actor_kind, payload FROM yd_events WHERE entity_id=$1 AND name='touch.queued'`, [touch.id]);
    assert.equal(ev.entity_kind, "touch");
    assert.equal(ev.actor_kind, "system");
    assert.equal(ev.payload.kind, "move_in_welcome");
    assert.equal(ev.payload.application_id, fx.A.app1);
  });

  test("running it again queues nothing: no duplicate touch, no second email", async () => {
    const before = await count("yd_outbox", "org_id=$1 AND related_kind='touch'", [fx.orgA]);
    const r = await touchesSweep(db, { orgId: fx.orgA });
    assert.equal(r.queued, 0);
    assert.equal(r.due, 0);
    assert.equal(await count("yd_outbox", "org_id=$1 AND related_kind='touch'", [fx.orgA]), before);
    assert.equal(await count("yd_touches", "application_id=$1", [fx.A.app1]), 1);
  });

  test("touches come due on their own days: day 30 after 40 days, month 6 after 200, lease_end_90 inside 90 days of the end", async () => {
    const r40 = (await mkRenter(fx, { stage: "placed" })).renter;
    const a40 = await mkPlacement(fx, r40, { movedInDaysAgo: 40, leaseStartDays: -40, leaseEndDays: 325 });
    const r200 = (await mkRenter(fx, { stage: "placed" })).renter;
    const a200 = await mkPlacement(fx, r200, { movedInDaysAgo: 200, leaseStartDays: -200, leaseEndDays: 60 });
    const r5 = (await mkRenter(fx, { stage: "placed" })).renter;
    const a5 = await mkPlacement(fx, r5, { movedInDaysAgo: 5, leaseStartDays: -5, leaseEndDays: 360 });

    const r = await touchesSweep(db, { orgId: fx.orgA });
    assert.equal(r.queued, 2 + 4 + 1, JSON.stringify(r));
    assert.deepEqual((await touches(fx.orgA, a40)).map((x) => x.kind), ["day_30", "move_in_welcome"]);
    assert.deepEqual((await touches(fx.orgA, a200)).map((x) => x.kind), ["day_30", "lease_end_90", "month_6", "move_in_welcome"]);
    assert.deepEqual((await touches(fx.orgA, a5)).map((x) => x.kind), ["move_in_welcome"]);
  });

  test("a refunded placement gets no touches", async () => {
    const renter = (await mkRenter(fx, { stage: "inactive" })).renter;
    const app = await mkPlacement(fx, renter, { movedInDaysAgo: 100, leaseStartDays: -100, leaseEndDays: 265, final: "refunded" });
    await touchesSweep(db, { orgId: fx.orgA });
    assert.deepEqual(await touches(fx.orgA, app), []);
  });

  test("a booked or cancelled application is not placed: no touches", async () => {
    // fixture app2 (Omar) is still at booked
    assert.equal(await count("yd_touches", "application_id=$1", [fx.A.app2]), 0);
  });

  test("two crons at the same moment still queue one touch and one email per kind", async () => {
    const renter = (await mkRenter(fx, { stage: "placed" })).renter;
    const app = await mkPlacement(fx, renter, { movedInDaysAgo: 40, leaseStartDays: -40, leaseEndDays: 325 });
    const [a, b] = await Promise.all([touchesSweep(db, { orgId: fx.orgA }), touchesSweep(db, { orgId: fx.orgA })]);
    assert.equal(a.queued + b.queued, 2, `${JSON.stringify(a)} ${JSON.stringify(b)}`);
    assert.deepEqual((await touches(fx.orgA, app)).map((x) => x.kind), ["day_30", "move_in_welcome"]);
    const touchIds = (await q(`SELECT id FROM yd_touches WHERE application_id=$1`, [app])).map((x) => x.id);
    assert.equal(await count("yd_outbox", "related_kind='touch' AND related_id = ANY($1::uuid[])", [touchIds]), 2);
    assert.equal(await count("yd_events", "name='touch.queued' AND entity_id = ANY($1::uuid[])", [touchIds]), 2);
  });

  test("another company's placements are never read or written", async () => {
    const bBefore = await count("yd_touches", "org_id=$1", [fx.orgB]);
    assert.equal(bBefore, 0, "org A's passes did not touch org B");
    const r = await touchesSweep(db, { orgId: fx.orgB });
    assert.equal(r.queued, 1);
    assert.equal(await count("yd_touches", "org_id=$1 AND application_id=$2", [fx.orgB, fx.B.app1]), 1);
    assert.equal(await count("yd_touches", "org_id=$1 AND application_id=$2", [fx.orgA, fx.B.app1]), 0);
    assert.equal(await count("yd_outbox", "org_id=$1 AND related_kind='touch' AND to_address LIKE $2", [fx.orgA, `%b${fx.rand}%`]), 0);
  });

  test("it will not run without a company", async () => {
    const r = await touchesSweep(db, {});
    assert.equal(r.ok, false);
    assert.equal(r.queued, 0);
  });
});

/* ====================================================================== */

describe("yd-rules-stale (daily)", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx;
  before(async () => { fx = await buildYdFixture(db); });
  after(async () => { await close(); });

  const staleEvents = (orgId, building) =>
    count("yd_events", "org_id=$1 AND entity_id=$2 AND name='building.rules_stale'", [orgId, building]);
  const emails = (orgId, building) =>
    count("yd_outbox", "org_id=$1 AND related_kind='building_rules_reconfirm' AND related_id=$2", [orgId, building]);
  const newRules = (orgId, building, confirmed) => one(
    `INSERT INTO yd_building_rules (org_id, building_id, confirmed_at, min_score, income_multiple, max_evictions, source)
     VALUES ($1,$2,${confirmed},600,3,1,'staff') RETURNING id, version`, [orgId, building]);

  test("fresh rules are not flagged, and buildings that are not signed or live are never looked at", async () => {
    const r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.ok, true);
    assert.equal(r.stale, 0);
    assert.equal(r.flagged, 0);
    assert.equal(r.queued, 0);
    assert.equal(await count("yd_events", "org_id=$1 AND name='building.rules_stale'", [fx.orgA]), 0);
  });

  test("a building past 30 days is flagged and its leasing contact gets ONE re-confirm email", async () => {
    await newRules(fx.orgA, fx.A.bSigned, "now() - interval '40 days'");
    const r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.stale, 1);
    assert.equal(r.flagged, 1);
    assert.equal(r.queued, 1);
    assert.equal(r.count, 1);

    const ev = await one(`SELECT entity_kind, actor_kind, payload FROM yd_events WHERE entity_id=$1 AND name='building.rules_stale'`, [fx.A.bSigned]);
    assert.equal(ev.entity_kind, "building");
    assert.equal(ev.actor_kind, "system");
    assert.equal(ev.payload.rules_version, 2);
    assert.equal(ev.payload.never_confirmed, false);
    assert.ok(ev.payload.days_since_confirmed >= 40);

    const mail = await one(`SELECT channel, to_address, template_key, status, provider, context FROM yd_outbox WHERE related_id=$1 AND related_kind='building_rules_reconfirm'`, [fx.A.bSigned]);
    assert.equal(mail.channel, "email");
    assert.equal(mail.to_address, `leasing+a${fx.rand}@example.test`);
    assert.equal(mail.template_key, YD_TEMPLATES.rulesReconfirm);
    assert.equal(mail.status, "queued");
    assert.equal(mail.provider, null);
    assert.equal(mail.context.rules_version, "2");
  });

  test("the next day (and the next) it flags nothing new and sends no second email", async () => {
    for (let day = 0; day < 3; day++) {
      const r = await rulesStaleSweep(db, { orgId: fx.orgA });
      assert.equal(r.stale, 1);
      assert.equal(r.flagged, 0);
      assert.equal(r.queued, 0);
    }
    assert.equal(await staleEvents(fx.orgA, fx.A.bSigned), 1);
    assert.equal(await emails(fx.orgA, fx.A.bSigned), 1);
  });

  test("it never changes the building or its rules (rules never change automatically)", async () => {
    const rules = await q(`SELECT version, confirmed_at FROM yd_building_rules WHERE building_id=$1 ORDER BY version`, [fx.A.bSigned]);
    assert.equal(rules.length, 2);
    const b = await one(`SELECT status FROM yd_buildings WHERE id=$1`, [fx.A.bSigned]);
    assert.equal(b.status, "signed");
    await rulesStaleSweep(db, { orgId: fx.orgA });
    const after = await q(`SELECT version, confirmed_at FROM yd_building_rules WHERE building_id=$1 ORDER BY version`, [fx.A.bSigned]);
    assert.deepEqual(after, rules);
  });

  test("when the building confirms, the episode ends; a later stale spell is a new episode with a new email", async () => {
    // confirm today
    await db.query(`UPDATE yd_building_rules SET confirmed_at = now() WHERE building_id=$1 AND version=2`, [fx.A.bSigned]);
    let r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.stale, 0, "confirmed today: not stale");
    // time passes: the first email is 60 days old, the confirmation 45 days old
    await db.query(`UPDATE yd_outbox SET created_at = now() - interval '60 days' WHERE related_kind='building_rules_reconfirm' AND related_id=$1`, [fx.A.bSigned]);
    await db.query(`UPDATE yd_building_rules SET confirmed_at = now() - interval '45 days' WHERE building_id=$1 AND version=2`, [fx.A.bSigned]);
    r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.flagged, 1, "a new episode is flagged again");
    assert.equal(r.queued, 1, "and the building is asked again");
    assert.equal(await staleEvents(fx.orgA, fx.A.bSigned), 2);
    assert.equal(await emails(fx.orgA, fx.A.bSigned), 2);
    r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.deepEqual([r.flagged, r.queued], [0, 0]);
  });

  test("rules that were never confirmed are stale too, flagged once with one email", async () => {
    const b = (await one(
      `INSERT INTO yd_buildings (org_id, company_id, name, city, state, status, leasing_email)
       VALUES ($1,$2,'Never Confirmed Court','Phoenix','AZ','live','never@example.test') RETURNING id`, [fx.orgA, fx.A.company])).id;
    await newRules(fx.orgA, b, "NULL");
    const r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.flagged, 1);
    assert.equal(r.queued, 1);
    const ev = await one(`SELECT payload FROM yd_events WHERE entity_id=$1 AND name='building.rules_stale'`, [b]);
    assert.equal(ev.payload.never_confirmed, true);
    assert.equal(ev.payload.days_since_confirmed, null);
    const again = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.deepEqual([again.flagged, again.queued], [0, 0]);
    assert.equal(await emails(fx.orgA, b), 1);
  });

  test("a building with no leasing email is flagged but nobody is emailed; add one and the email follows", async () => {
    const b = (await one(
      `INSERT INTO yd_buildings (org_id, company_id, name, city, state, status) VALUES ($1,$2,'No Email Court','Phoenix','AZ','signed') RETURNING id`,
      [fx.orgA, fx.A.company])).id;
    await newRules(fx.orgA, b, "now() - interval '90 days'");
    let r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.noEmail, 1);
    assert.equal(await staleEvents(fx.orgA, b), 1);
    assert.equal(await emails(fx.orgA, b), 0);
    await db.query(`UPDATE yd_buildings SET leasing_email='leasing@noemail.example.test' WHERE id=$1`, [b]);
    r = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(r.flagged, 0, "the flag is already on file");
    assert.equal(r.queued, 1, "but the email now goes");
    assert.equal(await emails(fx.orgA, b), 1);
  });

  test("a paused, churned or target building with old rules is not flagged", async () => {
    for (const status of ["paused", "churned", "target"]) {
      const b = (await one(
        `INSERT INTO yd_buildings (org_id, company_id, name, city, state, status, leasing_email) VALUES ($1,$2,$3,'Phoenix','AZ',$4,'x@example.test') RETURNING id`,
        [fx.orgA, fx.A.company, `Old Rules ${status}`, status])).id;
      await newRules(fx.orgA, b, "now() - interval '200 days'");
      await rulesStaleSweep(db, { orgId: fx.orgA });
      assert.equal(await staleEvents(fx.orgA, b), 0, status);
      assert.equal(await emails(fx.orgA, b), 0, status);
    }
  });

  test("two crons at the same moment send one email", async () => {
    const b = (await one(
      `INSERT INTO yd_buildings (org_id, company_id, name, city, state, status, leasing_email) VALUES ($1,$2,'Race Court','Phoenix','AZ','live','race@example.test') RETURNING id`,
      [fx.orgA, fx.A.company])).id;
    await newRules(fx.orgA, b, "now() - interval '70 days'");
    await Promise.all([rulesStaleSweep(db, { orgId: fx.orgA }), rulesStaleSweep(db, { orgId: fx.orgA }), rulesStaleSweep(db, { orgId: fx.orgA })]);
    assert.equal(await emails(fx.orgA, b), 1);
    assert.equal(await staleEvents(fx.orgA, b), 1);
  });

  test("another company's buildings are never read or written", async () => {
    await newRules(fx.orgB, fx.B.bSigned, "now() - interval '80 days'");
    const a = await rulesStaleSweep(db, { orgId: fx.orgA });
    assert.equal(await staleEvents(fx.orgB, fx.B.bSigned), 0, "org A's pass did not flag org B's building");
    const b = await rulesStaleSweep(db, { orgId: fx.orgB });
    assert.equal(b.flagged, 1);
    assert.equal(await staleEvents(fx.orgB, fx.B.bSigned), 1);
    assert.equal(await staleEvents(fx.orgA, fx.B.bSigned), 0);
    assert.ok(a.ok && b.ok);
  });

  test("it will not run without a company", async () => {
    assert.equal((await rulesStaleSweep(db, {})).ok, false);
  });
});

/* ====================================================================== */

describe("yd-outbox-dispatch (every 5 minutes): the sandbox", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx;
  before(async () => { fx = await buildYdFixture(db); });
  after(async () => { await close(); });

  const queue = async (orgId, o = {}) => (await one(
    `INSERT INTO yd_outbox (org_id, channel, to_address, template_key, context, related_kind, related_id)
     VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,$6) RETURNING id`,
    [orgId, o.channel ?? "email", o.to ?? "someone@example.test", o.template ?? "yd-test", o.kind ?? null, o.related ?? null])).id;
  const row = (id) => one(`SELECT status, provider, provider_ref, sent_at, context FROM yd_outbox WHERE id=$1`, [id]);

  test("a queued email is marked sent by the sandbox, with a reference and a time, and nothing else", async () => {
    // clear anything the fixture queued, so the counts below are exact
    await outboxDispatchSweep(db, { orgId: fx.orgA });
    const id = await queue(fx.orgA);
    const r = await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.equal(r.ok, true);
    assert.equal(r.claimed, 1);
    assert.equal(r.sent, 1);
    assert.equal(r.count, 1);
    assert.equal(r.failed, 0);
    const x = await row(id);
    assert.equal(x.status, "sent");
    assert.equal(x.provider, "sandbox");
    assert.equal(x.provider_ref, `sandbox-${id}`);
    assert.ok(x.sent_at);
    const ev = await one(`SELECT actor_kind, payload FROM yd_events WHERE entity_id=$1 AND name='outbox.sent'`, [id]);
    assert.equal(ev.actor_kind, "sandbox");
    assert.equal(ev.payload.provider, "sandbox");
  });

  test("running it again sends nothing twice", async () => {
    const r = await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.equal(r.claimed, 0);
    assert.equal(r.sent, 0);
  });

  test("an address that cannot be delivered even in a sandbox is failed, with the reason kept in the row", async () => {
    const bad = await queue(fx.orgA, { to: "not-an-email" });
    const sms = await queue(fx.orgA, { channel: "sms", to: "123" });
    const ok = await queue(fx.orgA, { channel: "sms", to: "+16025550123" });
    const r = await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.equal(r.sent, 1);
    assert.equal(r.failed, 2);
    assert.equal((await row(bad)).status, "failed");
    assert.match((await row(bad)).context.dispatch_error, /not an email address/);
    assert.equal((await row(sms)).status, "failed");
    assert.match((await row(sms)).context.dispatch_error, /not a phone number/);
    assert.equal((await row(ok)).status, "sent");
    assert.equal(await count("yd_events", "name='outbox.failed' AND entity_id = ANY($1::uuid[])", [[bad, sms]]), 2);
    // failed is final: it is not retried every five minutes
    assert.equal((await outboxDispatchSweep(db, { orgId: fx.orgA })).claimed, 0);
  });

  test("a sent touch email stamps the touch it belongs to", async () => {
    await touchesSweep(db, { orgId: fx.orgA });
    const touch = await one(`SELECT id, sent_at, outcome FROM yd_touches WHERE application_id=$1`, [fx.A.app1]);
    assert.equal(touch.sent_at, null);
    const r = await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.ok(r.sent >= 1);
    const after = await one(`SELECT sent_at, outcome FROM yd_touches WHERE id=$1`, [touch.id]);
    assert.ok(after.sent_at);
    assert.equal(after.outcome, "sent");
  });

  test("it is bounded: one pass claims at most the limit, the rest waits for the next", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await queue(fx.orgA));
    const first = await outboxDispatchSweep(db, { orgId: fx.orgA, limit: 2 });
    assert.equal(first.claimed, 2);
    const left = await count("yd_outbox", "id = ANY($1::uuid[]) AND status='queued'", [ids]);
    assert.equal(left, 3);
    const rest = await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.equal(rest.sent, 3);
  });

  test("two dispatchers at the same moment send each row exactly once", async () => {
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push(await queue(fx.orgA));
    const results = await Promise.all([
      outboxDispatchSweep(db, { orgId: fx.orgA, limit: 5 }),
      outboxDispatchSweep(db, { orgId: fx.orgA, limit: 5 }),
      outboxDispatchSweep(db, { orgId: fx.orgA, limit: 5 })
    ]);
    await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.equal(await count("yd_outbox", "id = ANY($1::uuid[]) AND status='sent'", [ids]), 12);
    assert.equal(await count("yd_events", "name='outbox.sent' AND entity_id = ANY($1::uuid[])", [ids]), 12, "one event per row, not two");
    assert.ok(results.every((r) => r.ok));
  });

  test("another company's queue is never touched", async () => {
    const theirs = await queue(fx.orgB);
    await outboxDispatchSweep(db, { orgId: fx.orgA });
    assert.equal((await row(theirs)).status, "queued");
    const r = await outboxDispatchSweep(db, { orgId: fx.orgB });
    assert.ok(r.sent >= 1);
    assert.equal((await row(theirs)).status, "sent");
  });

  test("it never transmits: the dispatcher is handed rows and returns updates, and nothing here opens a connection", async () => {
    const seen = [];
    const spy = { dispatch: (rows) => { seen.push(...rows); return { updates: [], skipped: [] }; } };
    const id = await queue(fx.orgA);
    const r = await outboxDispatchSweep(db, { orgId: fx.orgA, dispatcher: spy });
    assert.equal(r.claimed, 1);
    assert.equal(seen[0].id, id);
    assert.equal((await row(id)).status, "queued", "no update from the dispatcher, no change");
    await outboxDispatchSweep(db, { orgId: fx.orgA });
  });

  test("it will not run without a company", async () => {
    assert.equal((await outboxDispatchSweep(db, {})).ok, false);
  });
});

/* ====================================================================== */

describe("yd-recheck (daily)", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx;
  before(async () => { fx = await buildYdFixture(db); });
  after(async () => { await close(); });

  const screenings = (renter) => q(`SELECT id, kind, status, consent_id, credit_score FROM yd_screenings WHERE renter_id=$1 ORDER BY created_at, id`, [renter]);
  const rechecks = (renter) => count("yd_screenings", "renter_id=$1 AND kind='recheck'", [renter]);
  /** A fake bureau whose answer has moved. */
  const lowered = (score = 540) => ({
    crs: {
      PROVIDER: "crs_sandbox",
      rescreen: async () => ({
        provider: "crs_sandbox", sandbox: true, status: "complete", credit_score: score, collections_count: 3,
        eviction_count: 2, eviction_last_at: "2025-06-01", criminal_flags: [], raw_ref: "stub:lowered", raw: { sandbox: true, stub: true }
      })
    }
  });

  test("a renter whose last screening is 40 days old is re-checked under the stored recheck consent", async () => {
    const r = await mkRenter(fx, { ageDays: 40 });
    const out = await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(out.ok, true);
    assert.ok(out.rechecked >= 1, JSON.stringify(out));
    assert.equal(out.failed, 0, JSON.stringify(out));

    const s = await screenings(r.renter);
    assert.equal(s.length, 2);
    const re = s.find((x) => x.kind === "recheck");
    assert.equal(re.status, "complete");
    assert.equal(re.consent_id, r.recheckConsentId, "it runs under the RECHECK consent, nobody was asked");
    assert.equal(re.credit_score, 700);
    assert.equal(await count("yd_screening_raw", "screening_id=$1", [re.id]), 1);
    assert.equal(await count("yd_consents", "renter_id=$1", [r.renter]), 2, "no new consent was asked for");
    const ev = await one(`SELECT payload FROM yd_events WHERE entity_id=$1 AND name='renter.rechecked'`, [r.renter]);
    assert.equal(ev.payload.reason, "stale_screening");
    assert.equal(ev.payload.consent_id, r.recheckConsentId);

    // the matches were recomputed from the NEW screening
    const m = await q(`SELECT DISTINCT screening_id FROM yd_matches WHERE renter_id=$1`, [r.renter]);
    assert.deepEqual(m.map((x) => x.screening_id), [re.id]);
    assert.ok((await count("yd_matches", "renter_id=$1", [r.renter])) > 0);
  });

  test("it is idempotent: a second pass finds the renter fresh and re-checks nothing", async () => {
    const r = await mkRenter(fx, { ageDays: 45 });
    await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(await rechecks(r.renter), 1);
    await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(await rechecks(r.renter), 1);
    const direct = await recheckRenter(db, { orgId: fx.orgA, renterId: r.renter });
    assert.deepEqual(direct, { outcome: "skipped", reason: "not_due" });
  });

  test("a renter screened 5 days ago, a lead, an inactive renter and one with no recheck consent are all left alone", async () => {
    const fresh = await mkRenter(fx, { ageDays: 5 });
    const lead = await mkRenter(fx, { ageDays: 90, stage: "lead" });
    const inactive = await mkRenter(fx, { ageDays: 90, stage: "inactive" });
    const noConsent = await mkRenter(fx, { ageDays: 90, recheckConsent: false });
    const out = await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(out.ok, true);
    for (const r of [fresh, lead, inactive, noConsent]) assert.equal(await rechecks(r.renter), 0);
    // and asking for the no-consent renter directly is also a refusal
    const direct = await recheckRenter(db, { orgId: fx.orgA, renterId: noConsent.renter });
    assert.equal(direct.outcome, "skipped");
  });

  test("an open application whose building now says no produces a staff event; the application itself is untouched", async () => {
    const r = await mkRenter(fx, { ageDays: 40, stage: "booked", credit: { score: 700 } });
    // they were approved at the building when they booked
    const match = (await one(
      `INSERT INTO yd_matches (org_id, renter_id, building_id, listing_id, screening_id, rules_id, result, reasons, max_rent_cents)
       VALUES ($1,$2,$3,$4,$5,$6,'approved','[]',240000) RETURNING id`,
      [fx.orgA, r.renter, fx.A.bSigned, fx.A.lPublic1, r.screening, fx.A.rSigned])).id;
    const app = (await one(
      `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [fx.orgA, r.renter, fx.A.bSigned, fx.A.lPublic1, match])).id;

    const out = await recheckSweep(db, { orgId: fx.orgA, providers: lowered(540) });
    assert.equal(out.ok, true);
    assert.ok(out.dropped >= 1, JSON.stringify(out));

    const ev = await q(`SELECT payload, actor_kind, entity_kind FROM yd_events WHERE entity_id=$1 AND name='application.match_dropped'`, [app]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].entity_kind, "application");
    assert.equal(ev[0].actor_kind, "system");
    assert.equal(ev[0].payload.from, "approved");
    assert.equal(ev[0].payload.to, "no");
    assert.equal(ev[0].payload.building_id, fx.A.bSigned);
    assert.ok(ev[0].payload.failed_rules.includes("score"));
    assert.equal(JSON.stringify(ev[0].payload).includes("540"), false, "the staff event names the rule that failed, not credit numbers");

    const a = await one(`SELECT stage FROM yd_applications WHERE id=$1`, [app]);
    assert.equal(a.stage, "booked", "the cron flags it for staff; it never cancels the application");
    const latest = await one(`SELECT result FROM yd_matches WHERE renter_id=$1 AND building_id=$2 ORDER BY computed_at DESC, id DESC LIMIT 1`, [r.renter, fx.A.bSigned]);
    assert.equal(latest.result, "no");
    const renter = await one(`SELECT risk_tier, lane FROM yd_renters WHERE id=$1`, [r.renter]);
    assert.equal(renter.risk_tier, "D");
    assert.equal(renter.lane, "second_chance");

    // running it again raises nothing new
    await recheckSweep(db, { orgId: fx.orgA, providers: lowered(540) });
    assert.equal(await count("yd_events", "entity_id=$1 AND name='application.match_dropped'", [app]), 1);
  });

  test("an answer that stays good raises no event", async () => {
    const r = await mkRenter(fx, { ageDays: 40, stage: "booked" });
    const match = (await one(
      `INSERT INTO yd_matches (org_id, renter_id, building_id, listing_id, screening_id, rules_id, result, reasons)
       VALUES ($1,$2,$3,$4,$5,$6,'likely','[]') RETURNING id`,
      [fx.orgA, r.renter, fx.A.bSigned, fx.A.lPublic1, r.screening, fx.A.rSigned])).id;
    const app = (await one(
      `INSERT INTO yd_applications (org_id, renter_id, building_id, listing_id, match_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [fx.orgA, r.renter, fx.A.bSigned, fx.A.lPublic1, match])).id;
    await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(await count("yd_events", "entity_id=$1 AND name='application.match_dropped'", [app]), 0);
  });

  test("a placed renter 90 days before the lease ends is re-checked; one with a long lease is not", async () => {
    const soon = await mkRenter(fx, { ageDays: 100, stage: "placed" });
    await mkPlacement(fx, soon.renter, { movedInDaysAgo: 300, leaseStartDays: -300, leaseEndDays: 60 });
    const later = await mkRenter(fx, { ageDays: 100, stage: "placed" });
    await mkPlacement(fx, later.renter, { movedInDaysAgo: 100, leaseStartDays: -100, leaseEndDays: 265 });
    await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(await rechecks(soon.renter), 1);
    assert.equal(await rechecks(later.renter), 0);
    const ev = await one(`SELECT payload FROM yd_events WHERE entity_id=$1 AND name='renter.rechecked'`, [soon.renter]);
    assert.equal(ev.payload.reason, "lease_end_90");
  });

  test("a bureau that cannot answer is counted and kept on file as failed, and does not stop the others", async () => {
    const flaky = await mkRenter(fx, { ageDays: 50 });
    const fine = await mkRenter(fx, { ageDays: 50 });
    const providers = {
      crs: {
        PROVIDER: "crs_sandbox",
        rescreen: async ({ email }) => {
          if (email === flaky.email) throw new Error("bureau timeout");
          return {
            provider: "crs_sandbox", sandbox: true, status: "complete", credit_score: 710, collections_count: 0,
            eviction_count: 0, eviction_last_at: null, criminal_flags: [], raw_ref: "stub:ok", raw: { sandbox: true }
          };
        }
      }
    };
    const out = await recheckSweep(db, { orgId: fx.orgA, providers });
    assert.equal(out.ok, true);
    assert.ok(out.failed >= 1, JSON.stringify(out));
    assert.equal(await count("yd_screenings", "renter_id=$1 AND kind='recheck' AND status='failed'", [flaky.renter]), 1);
    assert.equal(await count("yd_screenings", "renter_id=$1 AND kind='recheck' AND status='complete'", [fine.renter]), 1);
    // the failed one is still due: tomorrow's pass tries again
    const next = await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(await count("yd_screenings", "renter_id=$1 AND kind='recheck'", [flaky.renter]), 2);
    assert.ok(next.ok);
  });

  test("one pass is bounded by the limit; the rest is done by the next", async () => {
    const orgB = fx.orgB;
    const made = [];
    for (let i = 0; i < 3; i++) made.push(await mkRenter(fx, { ageDays: 60, org: "B" }));
    // org B also has its own fixture renters; count only the new ones
    const first = await recheckSweep(db, { orgId: orgB, limit: 2 });
    assert.equal(first.rechecked, 2, JSON.stringify(first));
    const done = async () => {
      let n = 0;
      for (const r of made) n += await rechecks(r.renter);
      return n;
    };
    assert.ok((await done()) <= 2);
    await recheckSweep(db, { orgId: orgB, limit: 10 });
    assert.equal(await done(), 3);
  });

  test("another company's renters are never read or written", async () => {
    const mineB = await mkRenter(fx, { ageDays: 70, org: "B" });
    const mineA = await mkRenter(fx, { ageDays: 70, org: "A" });
    await recheckSweep(db, { orgId: fx.orgA });
    assert.equal(await rechecks(mineA.renter), 1);
    assert.equal(await rechecks(mineB.renter), 0, "org A's pass left org B's renter alone");
    await recheckSweep(db, { orgId: fx.orgB });
    assert.equal(await rechecks(mineB.renter), 1);
  });

  test("two crons at the same moment re-check a renter once", async () => {
    const r = await mkRenter(fx, { ageDays: 80 });
    await Promise.all([recheckSweep(db, { orgId: fx.orgA }), recheckSweep(db, { orgId: fx.orgA }), recheckSweep(db, { orgId: fx.orgA })]);
    assert.equal(await rechecks(r.renter), 1);
  });

  test("it will not run without a company", async () => {
    const out = await recheckSweep(db, {});
    assert.equal(out.ok, false);
    assert.equal(out.rechecked, 0);
  });
});

/* ====================================================================== */

describe("the workflow shells", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx;
  const useOrg = (slug) => { process.env.YD_ORG_SLUG = slug; _resetYdOrgCache(); };
  before(async () => { fx = await buildYdFixture(db); });
  after(async () => { delete process.env.YD_ORG_SLUG; await close(); });

  const shells = [
    ["yd-recheck", () => import("../workflows/yd-recheck.mjs")],
    ["yd-touches", () => import("../workflows/yd-touches.mjs")],
    ["yd-rules-stale", () => import("../workflows/yd-rules-stale.mjs")],
    ["yd-outbox-dispatch", () => import("../workflows/yd-outbox-dispatch.mjs")]
  ];

  for (const [name, load] of shells) {
    test(`${name}: sweep() resolves the deployment's company and runs one pass`, async () => {
      useOrg(fx.slugA);
      const mod = await load();
      assert.equal(mod.SOURCE_WORKFLOW, name);
      const r = await mod.sweep(db);
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(typeof r.count, "number");
    });

    test(`${name}: a pass that cannot even find the company reports ok:false, never throws; the Inngest wrapper then fails loudly`, async () => {
      useOrg("yesdoor-no-such-company");
      const mod = await load();
      const r = await mod.sweep(db);
      assert.equal(r.ok, false);
      assert.match(r.errors[0], /not found/);
      assert.throws(() => failIfNotOk(name, r), new RegExp(`^Error: ${name}: `));
      // handle() is what the journey runner calls: it also returns, never throws
      const h = await mod.handle({ db });
      assert.equal(h.ok, false);
    });
  }

  test("failIfNotOk lets a pass with partial failures through (those are counted and retried), and stops one that could not run", () => {
    assert.deepEqual(failIfNotOk("x", { ok: true, count: 3, failed: 2 }), { ok: true, count: 3, failed: 2 });
    assert.throws(() => failIfNotOk("x", { ok: false, errors: ["boom"] }), /x: boom/);
    assert.throws(() => failIfNotOk("x", undefined), /could not run/);
  });

  test("runYdCron passes the company in and swallows a thrown error into ok:false", async () => {
    const seen = [];
    const ok = await runYdCron(db, async (d, o) => { seen.push(o.orgId); return { ok: true, count: 0 }; }, { orgId: fx.orgA });
    assert.deepEqual(seen, [fx.orgA]);
    assert.equal(ok.ok, true);
    const boom = await runYdCron(db, async () => { throw new Error("kaput"); }, { orgId: fx.orgA });
    assert.deepEqual(boom, { ok: false, count: 0, errors: ["kaput"] });
  });
});
