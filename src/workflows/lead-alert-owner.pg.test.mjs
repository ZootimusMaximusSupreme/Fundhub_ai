// The lead alert to Chris against a real Postgres.
//
// Skipped without DATABASE_URL:
//   DATABASE_URL=postgres://… node --test src/workflows/lead-alert-owner.pg.test.mjs
//
// The unit tests script the database. What only a real engine proves is the part
// this feature stands on: the once-only stamp is claimed by ONE caller when five
// events land together, a failed send really puts its stamp back (jsonb key
// removal), the ad row the source line reads really comes out of the generated
// ad_id column, and an old, test or synthetic client really is skipped.
//
// NOTHING IS SENT. The two provider functions are replaced with recorders and
// the settings are made-up values passed in as `env`, so no request leaves the
// process. Each test runs in its own throwaway company.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { db as realDb, close } from "../db.mjs";
import { handle, SMS_STAMP, EMAIL_STAMP } from "./lead-alert-owner.mjs";
import { fakeStep } from "./test-support.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const NONCE = `leadalert-${process.pid}-${Date.now()}`;
const HOUR = 60 * 60 * 1000;

const ENV = {
  MESSAGING_DRY_RUN: "0",
  LEAD_ALERT_SMS_TO: "+15555550100",
  LEAD_ALERT_EMAIL_TO: "owner@example.test"
};
const sent = { status: "sent", providerMessageId: "SM1", error: null, retryable: false };

/* The shared resolveClient step ends with a CRM-link read of the clients table
   (backfillCrmLinkIfMissing in src/handlers/client-lifecycle.mjs) that names a
   column migration 372 renames on a database built from zero. That read is not
   what this file is about, and on a fresh database it fails for every test that
   goes through resolveClient (src/handlers/money-chain.pg.test.mjs fails the same
   way). It is answered "no row" here so the alert itself is what gets measured.
   Every other statement goes to the real database, untouched. */
const db = {
  query(sql, params) {
    if (/SELECT id, ghl_contact_id, email, phone, first_name, last_name\s+FROM clients/.test(String(sql))) {
      return Promise.resolve({ rows: [] });
    }
    return realDb.query(sql, params);
  }
};

describe("lead alert to Chris, real Postgres", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org;
  let n = 0;

  before(async () => {
    org = (await realDb.query(
      `INSERT INTO orgs (slug, name) VALUES ($1, 'Lead alert pg test') RETURNING id`, [NONCE])).rows[0].id;
  });

  after(async () => {
    await realDb.query(`DELETE FROM client_ad_attribution WHERE org_id = $1`, [org]).catch(() => {});
    await realDb.query(`DELETE FROM events WHERE org_id = $1`, [org]).catch(() => {});
    await realDb.query(`DELETE FROM clients WHERE org_id = $1`, [org]).catch(() => {});
    await realDb.query(`DELETE FROM orgs WHERE id = $1`, [org]).catch(() => {});
    await close();
  });

  /* A lead, made the way the intake paths make one: a clients row. Nothing here
     calls out of this database. */
  async function lead({ ageMs = 5 * 60 * 1000, isDemo = false, custom = {}, phone = "+16025550142", source = "clickfunnels" } = {}) {
    n += 1;
    const r = await db.query(
      `INSERT INTO clients (org_id, email, first_name, last_name, phone, channel_source, is_demo,
                            custom_fields, created_at)
       VALUES ($1, $2, 'Jane', $3, $4, $5, $6, $7::jsonb, now() - ($8::bigint * interval '1 millisecond'))
       RETURNING id`,
      [org, `lead${n}.${NONCE}@example.test`, `Smith${n}`, phone, source, isDemo,
        JSON.stringify(custom), ageMs]);
    return r.rows[0].id;
  }

  const stamps = async (id) => {
    const r = await db.query(`SELECT custom_fields FROM clients WHERE id = $1`, [id]);
    const cf = r.rows[0].custom_fields || {};
    return { sms: cf[SMS_STAMP] || null, email: cf[EMAIL_STAMP] || null, all: cf };
  };

  function senders({ sms = async () => sent, email = async () => sent } = {}) {
    const calls = { sms: [], email: [] };
    return {
      calls,
      sendSms: async (m) => { calls.sms.push(m); return sms(m); },
      sendEmail: async (m) => { calls.email.push(m); return email(m); }
    };
  }

  const run = (clientId, s, name = "entry.captured") =>
    handle({
      event: { id: `evt-${n}`, name, orgId: org, clientId, payload: {} },
      db, step: fakeStep(), env: ENV, sendSms: s.sendSms, sendEmail: s.sendEmail
    });

  test("a new lead sends one text and one email and stamps both on the real client row", async () => {
    const id = await lead();
    await db.query(
      `INSERT INTO client_ad_attribution (client_id, org_id, utm_source, utm_content)
       VALUES ($1, $2, 'facebook', '42-ringlights')`, [id, org]);
    const s = senders();
    const res = await run(id, s);
    assert.equal(res.done, true);
    assert.equal(s.calls.sms.length, 1);
    assert.equal(s.calls.email.length, 1);
    const st = await stamps(id);
    assert.ok(st.sms && st.email, "both stamps are in the database");
    assert.match(s.calls.sms[0].body, /Source: Ad 42 \(42-ringlights\)/, "the ad row is read through the generated ad_id column");
    assert.match(s.calls.sms[0].body, new RegExp(`Open: https://[^\\s]+/app/client-control-panel\\.html\\?id=${id}`));
    assert.match(s.calls.sms[0].body, /\(602\) 555-0142/);
  });

  test("the same lead again, as entry.captured or booking.created, sends nothing", async () => {
    const id = await lead();
    const s = senders();
    await run(id, s, "entry.captured");
    await run(id, s, "entry.captured");
    await run(id, s, "booking.created");
    assert.equal(s.calls.sms.length, 1);
    assert.equal(s.calls.email.length, 1);
  });

  test("five events at the same moment send exactly once (the claim is atomic)", async () => {
    const id = await lead();
    const s = senders();
    await Promise.all([1, 2, 3, 4, 5].map((i) => run(id, s, i % 2 ? "entry.captured" : "booking.created")));
    assert.equal(s.calls.sms.length, 1, "one text");
    assert.equal(s.calls.email.length, 1, "one email");
  });

  test("a failed text puts its stamp back in the database, keeps the email stamp, and retries only the text", async () => {
    const id = await lead();
    const down = senders({ sms: async () => ({ status: "failed", retryable: true, error: "twilio returned HTTP 503" }) });
    await assert.rejects(run(id, down), /lead alert sms not sent/);
    let st = await stamps(id);
    assert.equal(st.sms, null, "the text stamp is gone");
    assert.ok(st.email, "the email stamp stays");
    assert.ok(!(SMS_STAMP in st.all), "the key is removed, not blanked");
    assert.equal(down.calls.email.length, 1);

    const up = senders();
    const res = await run(id, up);
    assert.equal(res.sms.status, "sent");
    assert.equal(res.email.status, "already_alerted");
    assert.equal(up.calls.sms.length, 1);
    assert.equal(up.calls.email.length, 0);
    st = await stamps(id);
    assert.ok(st.sms && st.email);
  });

  test("other things on the client file are not disturbed by the stamps", async () => {
    const id = await lead({ custom: { lifecycle_status: "New Lead", utm_source: "facebook" } });
    const down = senders({ sms: async () => ({ status: "failed", retryable: true, error: "x" }) });
    await assert.rejects(run(id, down));
    const st = await stamps(id);
    assert.equal(st.all.lifecycle_status, "New Lead");
    assert.equal(st.all.utm_source, "facebook");
  });

  test("a client made 25 hours ago, a test file and a synthetic client get nothing and are not stamped", async () => {
    const old = await lead({ ageMs: 25 * HOUR });
    const demo = await lead({ isDemo: true });
    const synthetic = await lead({ custom: { synthetic: true } });
    for (const id of [old, demo, synthetic]) {
      const s = senders();
      const res = await run(id, s);
      assert.equal(res.done, false);
      assert.equal(s.calls.sms.length + s.calls.email.length, 0);
      const st = await stamps(id);
      assert.equal(st.sms, null);
      assert.equal(st.email, null);
    }
  });

  test("a client from another company is never alerted about", async () => {
    const id = await lead();
    const s = senders();
    const other = await db.query(`INSERT INTO orgs (slug, name) VALUES ($1, 'Lead alert pg test other') RETURNING id`, [`${NONCE}-other`]);
    try {
      const res = await handle({
        event: { id: "evt-x", orgId: other.rows[0].id, clientId: id, payload: {} },
        db, step: fakeStep(), env: ENV, sendSms: s.sendSms, sendEmail: s.sendEmail
      });
      assert.equal(res.done, false);
      assert.equal(s.calls.sms.length + s.calls.email.length, 0);
    } finally {
      await db.query(`DELETE FROM orgs WHERE id = $1`, [other.rows[0].id]).catch(() => {});
    }
  });

  test("with both settings unset nothing is sent and no stamp is written", async () => {
    const id = await lead();
    const s = senders();
    const res = await handle({
      event: { id: "evt-y", orgId: org, clientId: id, payload: {} },
      db, step: fakeStep(), env: { MESSAGING_DRY_RUN: "0" }, sendSms: s.sendSms, sendEmail: s.sendEmail
    });
    assert.equal(res.sms.status, "not_configured");
    assert.equal(res.email.status, "not_configured");
    const st = await stamps(id);
    assert.equal(st.sms, null);
    assert.equal(st.email, null);
    assert.equal(s.calls.sms.length + s.calls.email.length, 0);
  });
});
