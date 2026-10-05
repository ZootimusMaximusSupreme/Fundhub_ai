/* The pulse's database checks against a real Postgres (MB2, 2026-10-05):
 * the message queue, failed_events, Commas payment notices, Meta server events.
 *
 * Each runs in its own throwaway company (orgs row), so the counts are only
 * this run's rows and never the scratch database's other data.
 *
 * SKIPS WITHOUT A DATABASE, LOUDLY:
 *   DATABASE_URL=postgres://… node --test src/pulse/system-checks.pg.test.mjs
 *
 * failed_events refuses DELETE by design (039), so its rows stay behind in the
 * throwaway company. Everything else is removed in after().
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { checkMessageQueue, checkFailedEvents, checkMoneyIn, checkMetaTracking } from "./system-checks.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const NONCE = `pulsechk-${process.pid}-${Date.now()}`;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe("pulse database checks", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  const now = new Date();
  const ago = (ms) => new Date(now.getTime() - ms);

  before(async () => {
    org = (await db.query(
      `INSERT INTO orgs (slug, name) VALUES ($1, 'Pulse check pg test') RETURNING id`, [NONCE])).rows[0].id;
  });

  after(async () => {
    await db.query(`DELETE FROM messages WHERE org_id = $1`, [org]).catch(() => {});
    await db.query(`DELETE FROM commas_inbox WHERE org_id = $1`, [org]).catch(() => {});
    await db.query(`DELETE FROM events WHERE org_id = $1`, [org]).catch(() => {});
    await close();
  });

  const msg = (channel, status, createdAgo, extra = {}) => db.query(
    `INSERT INTO messages (org_id, direction, channel, status, created_at, updated_at, scheduled_at)
     VALUES ($1, 'outbound', $2, $3, $4, $5, $6)`,
    [org, channel, status, ago(createdAgo), extra.updatedAt || ago(createdAgo), extra.scheduledAt || null]);

  test("empty company: queue and dead letters are green with counts as proof", async () => {
    const q = await checkMessageQueue({ db, orgId: org, now });
    assert.deepEqual(q.map((r) => r.status), ["PASS", "PASS"]);
    assert.match(q[0].detail, /0 sms waiting/);
    const f = await checkFailedEvents({ db, orgId: org, now });
    assert.equal(f.status, "PASS");
    assert.match(f.detail, /0 open/);
  });

  test("a text waiting 45 minutes is red; one held for quiet hours is not waiting yet", async () => {
    await msg("email", "queued", 5 * MIN);
    await msg("email", "queued", 2 * HOUR, { scheduledAt: new Date(now.getTime() + HOUR) });
    await msg("sms", "queued", 45 * MIN);
    const q = await checkMessageQueue({ db, orgId: org, now });
    const by = Object.fromEntries(q.map((r) => [r.id, r]));
    assert.equal(by["msg-queue-sms"].status, "FAIL");
    assert.match(by["msg-queue-sms"].detail, /45 min old/);
    assert.equal(by["msg-queue-email"].status, "PASS", by["msg-queue-email"].detail);
  });

  test("a send failure in the last 24 hours is red; an older one is not", async () => {
    await msg("email", "failed", 30 * HOUR, { updatedAt: ago(30 * HOUR) });
    let by = Object.fromEntries((await checkMessageQueue({ db, orgId: org, now })).map((r) => [r.id, r]));
    assert.equal(by["msg-queue-email"].status, "PASS");
    await msg("email", "failed", 2 * HOUR, { updatedAt: ago(1 * HOUR) });
    by = Object.fromEntries((await checkMessageQueue({ db, orgId: org, now })).map((r) => [r.id, r]));
    assert.equal(by["msg-queue-email"].status, "FAIL");
    assert.match(by["msg-queue-email"].detail, /1 failed to send/);
  });

  test("an open dead letter is red and names its handler", async () => {
    await db.query(
      `INSERT INTO failed_events (org_id, event_name, handler_name, error_message, status, first_seen_at, last_seen_at)
       VALUES ($1, 'docs.received', 'doc-check', 'openai 429', 'exhausted', $2, $2)`,
      [org, ago(3 * HOUR)]);
    const f = await checkFailedEvents({ db, orgId: org, now });
    assert.equal(f.status, "FAIL");
    assert.match(f.detail, /1 open \(1 gave up\), 1 new in 24 hours/);
    assert.match(f.detail, /doc-check/);
  });

  test("Commas: never a notice is red, one inside 72 hours is green, an old one is red", async () => {
    let [commas] = await checkMoneyIn({ db, orgId: org, now });
    assert.equal(commas.status, "FAIL");
    await db.query(
      `INSERT INTO commas_inbox (org_id, dedupe_key, raw_body, received_at) VALUES ($1, $2, '{}', $3)`,
      [org, `${NONCE}:old`, ago(80 * HOUR)]);
    [commas] = await checkMoneyIn({ db, orgId: org, now });
    assert.equal(commas.status, "FAIL");
    assert.match(commas.detail, /over 72 hours/);
    await db.query(
      `INSERT INTO commas_inbox (org_id, dedupe_key, raw_body, received_at) VALUES ($1, $2, '{}', $3)`,
      [org, `${NONCE}:new`, ago(10 * HOUR)]);
    const rows = await checkMoneyIn({ db, orgId: org, now });
    assert.equal(rows[0].status, "PASS");
    assert.equal(rows.find((r) => r.id === "pay-clickfunnels").status, "skip");
    assert.equal(rows.find((r) => r.id === "pay-claritypay").status, "skip");
  });

  test("Meta: switched off is not checked; accepted with no errors is green; any error is red", async () => {
    const off = await checkMetaTracking({ db, orgId: org, now, env: {} });
    assert.equal(off.status, "skip");
    const env = { META_CAPI_ENABLED: "1" };
    assert.equal((await checkMetaTracking({ db, orgId: org, now, env })).status, "FAIL", "nothing sent in 24h is red");
    await db.query(`INSERT INTO events (org_id, name, payload, created_at) VALUES ($1, 'funnel.track', $2, $3)`,
      [org, JSON.stringify({ meta: { sent: 2, event_name: "Lead" } }), ago(HOUR)]);
    const ok = await checkMetaTracking({ db, orgId: org, now, env });
    assert.equal(ok.status, "PASS", ok.detail);
    assert.match(ok.detail, /2 accepted, 0 error/);
    await db.query(`INSERT INTO events (org_id, name, payload, created_at) VALUES ($1, 'funnel.track', $2, $3)`,
      [org, JSON.stringify({ meta: { sent: 0, error: "Invalid OAuth access token" } }), ago(HOUR)]);
    const bad = await checkMetaTracking({ db, orgId: org, now, env });
    assert.equal(bad.status, "FAIL");
    assert.match(bad.detail, /1 error/);
  });
});
