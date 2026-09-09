// POST /api/campaigns/sync — a freshly connected Meta account can actually sync,
// and the first sync that comes back is what makes it 'active'.
//
// ⚠️ NEVER RUN. Written 2026-09-09 on a machine with no Postgres, so every test
// in this file SKIPPED. It has proved nothing yet. Run it against a scratch
// database before trusting any claim made here:
//   DATABASE_URL=... npx node --test src/http/campaigns-sync-activation.pg.test.mjs
//
// WHAT IT IS FOR. api/campaigns/sync.mjs used to read
// `connection_state = 'active'` only, and nothing in the tree ever wrote
// 'active' — api/campaigns/meta-agency.mjs inserts 'pending' and the column
// defaults to 'pending' (046_ad_platforms.sql:69). So the first press of "Sync
// Meta now" after connecting an account answered "Connect a Meta ad account for
// this partner first", and so did every press after that. Nothing downstream
// ever received data.
//
// The other pg tests in this directory seed connection_state = 'active' by hand
// (src/http/ad-spine.pg.test.mjs:117 and friends), which is correct for what
// they check and is exactly why none of them caught this: no test ever started
// from the state a real connection is actually created in. This one does.
//
// Lives under src/ because npm test's glob is "src/**" and "scripts/**" — a test
// under api/ silently never runs (CLAUDE.md §12).

import { test, before, after, describe } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";

const HAS_DB = !!process.env.DATABASE_URL;

// The token cipher refuses to store anything without a key, by design
// (src/adplatforms/tokens.mjs:39). A run-local key is enough here: this suite
// encrypts a fake token and decrypts it again inside the same process.
if (!process.env.AD_TOKEN_ENC_KEY) {
  process.env.AD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");
}

const MARK = "syncact";
const SENTINEL_EMAIL = `partner.${MARK}@example.com`;

const GOOD_ACCOUNT = "act_9001000100010001";
const PLACEHOLDER_ACCOUNT = "pending:biz:9001000100010001";
const DEAD_ACCOUNT = "act_9001000100010002";
const HALF_DEAD_ACCOUNT = "act_9001000100010003";
const VERIFIED_ACCOUNT = "act_9001000100010004";
const NO_VERIF_ANSWER_ACCOUNT = "act_9001000100010005";

const res = () => {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = () => r;
  return r;
};

/* metaStub — a fake Meta. One campaign, one ad set, one ad, one day of numbers.
   Returns the same envelope shape callPlatform parses: an HTTP-ish object with
   .ok, .status and .text().

   The numbers come back from the AD ACCOUNT's insights in one answer, with an
   `ad_id` on each row, because that is how sync.mjs asks for them
   (insightsRequestUrl → fetchInsightPages → groupInsightsByAd). No `paging.next`
   is sent, so the pager stops after one page. */
function metaStub({ failEverything = false, failAdSets = false, verification = null } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(String(url));
      /* The business verification read. sync.mjs asks the Business node for
         verification_status right after it has already recorded the promotion,
         so what this returns can never affect connection_state. */
      if (/verification_status/.test(url)) {
        return verification
          ? { ok: true, status: 200,
              text: async () => JSON.stringify({ verification_status: verification }) }
          : { ok: false, status: 400,
              text: async () => JSON.stringify({
                error: { message: "(#200) business_management permission required", code: 200 }
              }) };
      }
      /* Meta answers the account-level reads, then refuses the walk. This is
         the shape that used to strand a big account forever: the proof of
         access arrived, and the promotion below the walk was never reached. */
      if (failAdSets && /\/adsets\?/.test(url)) {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({
            error: { message: "Please reduce the amount of data you're asking for", code: 1 }
          })
        };
      }
      if (failEverything) {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({
            error: { message: "Unsupported get request. Object does not exist", code: 803 }
          })
        };
      }
      const body =
        /\/insights\?/.test(url)
          ? { data: [{ ad_id: "syncact_a1", date_start: "2026-09-08", spend: "12.34",
                       impressions: "100", clicks: "5", ctr: "5" }] }
        : /\/campaigns\?/.test(url)
          ? { data: [{ id: "syncact_c1", name: "Syncact campaign", status: "ACTIVE",
                       objective: "OUTCOME_LEADS", daily_budget: "1000" }] }
        : /\/adsets\?/.test(url)
          ? { data: [{ id: "syncact_s1", name: "Syncact ad set", status: "ACTIVE",
                       daily_budget: "500" }] }
        : /\/ads\?/.test(url)
          ? { data: [{ id: "syncact_a1", name: "Syncact ad", status: "ACTIVE" }] }
          : { data: [] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }
  };
}

describe("POST /api/campaigns/sync — a new connection can sync, and that is what activates it",
  { skip: !HAS_DB ? "no DATABASE_URL" : false }, () => {

  let org, partnerId, partnerToken, syncHandler, encryptToken;

  const callSync = (connectionId, deps) => {
    const r = res();
    return syncHandler(
      {
        method: "POST",
        query: {},
        body: { connection_id: connectionId },
        headers: { authorization: "Bearer " + partnerToken }
      },
      r,
      deps
    ).then(() => r);
  };

  /* One pending connection, exactly as api/campaigns/meta-agency.mjs writes it:
     state 'pending', verification 'unverified', an encrypted token, and the
     ad account id it was given. Nothing here is hand-stamped 'active' — that is
     the entire point of the file. */
  async function seedPendingConnection(externalAdAccountId) {
    const enc = encryptToken(`fake-meta-token-${MARK}`, { partnerId });
    return (await db.query(
      `INSERT INTO ad_platform_connections
         (org_id, partner_id, platform, external_business_id, external_ad_account_id,
          encrypted_access_token, scopes, connection_state, platform_verification_state)
       VALUES ($1,$2,'meta','9001000100010001',$3,$4,'["ads_read"]'::jsonb,
               'pending','unverified')
       RETURNING id`,
      [org, partnerId, externalAdAccountId, enc]
    )).rows[0].id;
  }

  const stateOf = async (id) => (await db.query(
    `SELECT connection_state, platform_verification_state, last_synced_at, last_error
       FROM ad_platform_connections WHERE id = $1`, [id])).rows[0];

  async function dropRunRows() {
    if (!partnerId) return;
    await db.query(`DELETE FROM ad_metrics_daily WHERE partner_id = $1`, [partnerId]);
    await db.query(`DELETE FROM ads WHERE partner_id = $1`, [partnerId]);
    await db.query(`DELETE FROM ad_sets WHERE partner_id = $1`, [partnerId]);
    await db.query(`DELETE FROM campaigns WHERE partner_id = $1`, [partnerId]);
    await db.query(`DELETE FROM ad_platform_connections WHERE partner_id = $1`, [partnerId]);
  }

  before(async () => {
    ({ default: syncHandler } = await import("../../api/campaigns/sync.mjs"));
    ({ encryptToken } = await import("../adplatforms/tokens.mjs"));

    org = await resolveDefaultOrg(db);

    // Staff first: 044_accounts.sql makes a partner account invite-only, so
    // invited_by has to name a real staff row. ORDER BY created_at pins this to
    // the seeded roster rather than to whatever another concurrent test file
    // happens to have inserted.
    const s = await db.query(
      `SELECT id, org_id FROM staff WHERE org_id = $1 AND status = 'active'
        ORDER BY created_at LIMIT 1`, [org]);
    if (!s.rows[0]) throw new Error("no active staff — run scripts/seed-staff.mjs");
    const staffId = s.rows[0].id;

    partnerId = (await db.query(
      `INSERT INTO partners (org_id, name, slug, status, contact_email)
       VALUES ($1,$2,$3,'active',$4)
       ON CONFLICT (org_id, slug) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [org, "Syncact Partner", "syncact-partner", SENTINEL_EMAIL]
    )).rows[0].id;

    // Leftovers from a run that died before its after() hook, so a poisoned
    // database self-heals rather than wedging on the connection's unique key.
    await dropRunRows();

    const { createAccount, createAccountSession } =
      await import("../auth/account-session.mjs");
    const existing = await db.query(`SELECT id FROM accounts WHERE email = $1`, [SENTINEL_EMAIL]);
    const accountId = existing.rows[0]
      ? existing.rows[0].id
      : (await createAccount(db, {
          orgId: org, kind: "partner", email: SENTINEL_EMAIL, name: "Syncact Partner",
          password: `Syncact-${MARK}-passw0rd!`, partnerId, invitedBy: staffId
        })).id;
    partnerToken = (await createAccountSession(db, { accountId, orgId: org })).token;
  });

  after(async () => {
    await dropRunRows();
    await close();
  });

  test("THE BREAK: a pending connection syncs, and the sync marks it active", async () => {
    const connectionId = await seedPendingConnection(GOOD_ACCOUNT);
    assert.equal((await stateOf(connectionId)).connection_state, "pending",
      "fixture must start pending — that is the state a real connection is created in");

    const meta = metaStub();
    const r = await callSync(connectionId, { fetch: meta.fetch });

    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true, JSON.stringify(r.body));
    assert.equal(r.body.connections, 1);
    assert.equal(r.body.campaigns, 1);
    assert.equal(r.body.ad_sets, 1);
    assert.equal(r.body.ads, 1);
    assert.equal(r.body.insights, 1);
    assert.deepEqual(r.body.errors, []);

    const after = await stateOf(connectionId);
    assert.equal(after.connection_state, "active",
      "a Meta read that came back is what 'active' means");
    assert.ok(after.last_synced_at, "last_synced_at must be stamped");
    assert.equal(after.last_error, null);

    // Syncing again must be a no-op on the state, not a downgrade.
    const again = await callSync(connectionId, { fetch: metaStub().fetch });
    assert.equal(again.body.ok, true);
    assert.equal((await stateOf(connectionId)).connection_state, "active");
  });

  test("a Meta failure leaves it pending and records Meta's own words", async () => {
    const connectionId = await seedPendingConnection(DEAD_ACCOUNT);
    const meta = metaStub({ failEverything: true });
    const r = await callSync(connectionId, { fetch: meta.fetch });

    // Nothing saved and one failure → 502 with ok:false, per buildSyncResponse.
    assert.equal(r.code, 502, JSON.stringify(r.body));
    assert.equal(r.body.ok, false);
    assert.equal(r.body.errors.length, 1, JSON.stringify(r.body.errors));

    const after = await stateOf(connectionId);
    assert.equal(after.connection_state, "pending",
      "nothing was proved, so nothing is promoted");
    assert.match(String(after.last_error), /does not exist/i);
  });

  /* THE REGRESSION THIS FILE EXISTS TO STOP COMING BACK.
     The promotion used to sit BELOW the campaign walk. The walk makes one call
     per campaign and one per ad set, so a big account can run out of time
     before the walk ends — and then the promotion was never reached, the row
     stayed 'pending', and the next press did the same thing. Same permanent
     dead end, bigger accounts. Here Meta answers the two account-level reads
     and then refuses the walk: the run must report the failure AND the account
     must still be switched on, because access was already proved. */
  test("the account switches on even when a campaign fails", async () => {
    const connectionId = await seedPendingConnection(HALF_DEAD_ACCOUNT);
    const r = await callSync(connectionId, { fetch: metaStub({ failAdSets: true }).fetch });

    assert.equal(r.body.ok, false, "a failed campaign must not read as a clean run");
    assert.equal(r.body.campaigns, 0, "nothing under that campaign was saved");
    assert.equal(r.body.errors.length, 1, JSON.stringify(r.body.errors));

    assert.equal((await stateOf(connectionId)).connection_state, "active",
      "Meta answered the ad account read — that is the proof, and it is recorded " +
      "before the walk, not after it");
  });

  /* THE SECOND GATE. 046_ad_platforms.sql:414-418 will not let a credit-related
     campaign go live unless this column says 'approved', and before this fix
     nothing anywhere ever wrote 'approved'. */
  test("Meta saying 'verified' is what marks the business approved", async () => {
    const connectionId = await seedPendingConnection(VERIFIED_ACCOUNT);
    assert.equal((await stateOf(connectionId)).platform_verification_state, "unverified",
      "fixture must start unverified — that is how a real connection is created");

    const r = await callSync(connectionId, { fetch: metaStub({ verification: "verified" }).fetch });
    assert.equal(r.body.ok, true, JSON.stringify(r.body));

    assert.equal((await stateOf(connectionId)).platform_verification_state, "approved",
      "Meta's own word is the only thing that opens the launch gate");
  });

  test("when Meta will not answer the verification read, the column is left alone",
    async () => {
      // metaStub with no `verification` refuses that one read with a 400.
      const connectionId = await seedPendingConnection(NO_VERIF_ANSWER_ACCOUNT);
      const r = await callSync(connectionId, { fetch: metaStub().fetch });

      assert.equal(r.body.ok, true,
        "a refused verification read is not a failure of the sync");
      const after = await stateOf(connectionId);
      assert.equal(after.connection_state, "active");
      assert.equal(after.platform_verification_state, "unverified",
        "we never award 'approved' ourselves");
    });

  test("a connection with no ad account number says so, instead of 'connect one first'",
    async () => {
      const connectionId = await seedPendingConnection(PLACEHOLDER_ACCOUNT);
      const r = await callSync(connectionId, { fetch: metaStub().fetch });

      assert.equal(r.code, 400);
      assert.equal(r.body.ok, false);
      assert.match(r.body.need, /act_/,
        "the answer must name the missing ad account number");
      assert.doesNotMatch(r.body.need, /Connect a Meta ad account for this partner first/,
        "telling him to redo the thing he already did is the dead end this fixes");
    });
});
