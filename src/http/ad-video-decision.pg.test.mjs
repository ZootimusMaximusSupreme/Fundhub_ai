/* The phone-approval door, against a real database.
 *
 * ⚠️ THIS FILE WAS NOT RUN. There is no local Postgres on the machine this was
 *    built on, so with DATABASE_URL unset every test below SKIPS and the suite
 *    still reports green. Nothing here is proved. CLAUDE.md §12 is explicit
 *    that a skipped .pg.test.mjs is not green, and this header exists so
 *    nobody reads a passing suite as evidence that the SQL works.
 *
 * WHAT ONLY A DATABASE CAN PROVE, and therefore why this file exists at all
 * alongside src/http/ad-video-decision.test.mjs:
 *
 *   1. THE COLUMN NAMES ARE REAL. The unit test's fake answers whatever SQL it
 *      is given. If ad_videos calls it `submagic_download_url` and this code
 *      asks for `final_url`, only a real table says so.
 *
 *   2. THE REPLAY GUARD IS ATOMIC. The unit test models `used_at IS NULL` in
 *      JavaScript, which proves the handler's contract but not Postgres's.
 *      Only a real connection proves that two taps racing each other cannot
 *      both find the key unspent.
 *
 *   3. 390's POLICIES HOLD. The door runs unauthenticated with one setting set.
 *      Whether that really puts one token row and one video row in reach — and
 *      nothing else — is a row-level-security question, and RLS is not
 *      something a stub can imitate.
 *
 * It goes through netlify/functions/api.mjs rather than importing the handler
 * directly, because a handler file is not a route: one missing from the ROUTES
 * map 404s locally and deployed, and that has shipped broken twice.
 *
 * DEPENDS ON db/migrations/389_ad_videos.sql, which is built in the sibling
 * workflow. Until 389 is merged these tests cannot pass even with a database,
 * because ad_videos does not exist.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";

import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { mintDecisionToken, expiresAt } from "../video/decision-token.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("ad video decision door", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let org, handler;
  let seq = 0;

  const url = "https://x/api/public/ad-video-decision";

  const post = async (body) =>
    handler(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", host: "x" },
      body: JSON.stringify(body)
    }), {});

  const get = async (token) =>
    handler(new Request(`${url}?t=${encodeURIComponent(token)}`, {
      method: "GET", headers: { host: "x" }
    }), {});

  const json = async (r) => { try { return JSON.parse(await r.text()); } catch { return null; } };

  /* A take waiting on a decision, and a live key for it. Every test makes its
     own: a shared row would make "exactly one row changed" true only because
     of the order the tests happened to run in. */
  async function newTakeAwaitingApproval(status = "awaiting_approval") {
    seq += 1;
    const adId = String(900000 + seq);
    const { rows } = await db.query(
      `INSERT INTO ad_videos (org_id, ad_id, take_no, status, video_kind,
                              finished_version, duration_seconds, width, height,
                              submagic_download_url)
       VALUES ($1, $2, 1, $3, 'ad', 1, 102, 1920, 1080, 'https://cdn.test/x.mp4')
       RETURNING id, ad_id, take_no, status`,
      [org, adId, status]
    );
    return rows[0];
  }

  async function keyFor(adVideoId, { minutes = 60 } = {}) {
    const { token, selector, verifierHash } = mintDecisionToken();
    const { rows } = await db.query(
      `INSERT INTO ad_video_decision_tokens
         (org_id, ad_video_id, selector, verifier_sha256, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [org, adVideoId, selector, verifierHash, expiresAt(new Date(), minutes)]
    );
    return { token, selector, id: rows[0].id };
  }

  const videoRow = async (id) => (await db.query(
    `SELECT status, approved_at, approved_by, rejected_reason FROM ad_videos WHERE id = $1`, [id]
  )).rows[0];

  const tokenRow = async (id) => (await db.query(
    `SELECT used_at, decision FROM ad_video_decision_tokens WHERE id = $1`, [id]
  )).rows[0];

  before(async () => {
    org = await resolveDefaultOrg(db);
    ({ default: handler } = await import("../../netlify/functions/api.mjs"));
  });

  after(async () => {
    await db.query(
      `DELETE FROM ad_videos WHERE org_id = $1 AND ad_id LIKE '9%' AND ad_id ~ '^90[0-9]{4}$'`, [org]);
    await close();
  });

  test("the route is reachable at all — a handler is not a route", async () => {
    const res = await get("rubbish");
    assert.notEqual(res.status, 404 && (await res.text()).includes("no such page"),
      "the ROUTES key is missing from netlify/functions/api.mjs");
  });

  test("a valid token approves the take, once", async () => {
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id);

    const res = await post({ token: key.token, decision: "approve" });
    assert.equal(res.status, 200);
    assert.equal((await json(res)).status, "approved");

    const v = await videoRow(take.id);
    assert.equal(v.status, "approved");
    assert.ok(v.approved_at);
    assert.equal(v.approved_by, "chris");

    const t = await tokenRow(key.id);
    assert.ok(t.used_at);
    assert.equal(t.decision, "approve");
  });

  test("*** A REPLAY IS REFUSED AND CANNOT OVERTURN THE FIRST DECISION ***", async () => {
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id);

    assert.equal((await post({ token: key.token, decision: "reject" })).status, 200);
    const second = await post({ token: key.token, decision: "approve" });
    assert.equal(second.status, 404);
    assert.deepEqual(await json(second), { ok: false, error: "invalid" });

    const v = await videoRow(take.id);
    assert.equal(v.status, "rejected", "the first decision must stand");
    assert.equal(v.approved_by, null);
  });

  test("*** TWO SIMULTANEOUS TAPS: EXACTLY ONE WINS ***", async () => {
    /* The assertion that cannot be made without a real connection. Both
       requests are in flight before either resolves, so they race the way two
       taps on a phone actually do. */
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id);

    const [a, b] = await Promise.all([
      post({ token: key.token, decision: "approve" }),
      post({ token: key.token, decision: "reject" })
    ]);

    const codes = [a.status, b.status].sort();
    assert.deepEqual(codes, [200, 404], "exactly one tap must win");

    const t = await tokenRow(key.id);
    assert.ok(t.used_at);
    const v = await videoRow(take.id);
    assert.ok(["approved", "rejected"].includes(v.status));
  });

  test("the right selector with the wrong secret is refused", async () => {
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id);
    const [, selector] = key.token.split("_");
    const forged = `avd_${selector}_${crypto.randomBytes(32).toString("hex")}`;

    const res = await post({ token: forged, decision: "approve" });
    assert.equal(res.status, 404);
    assert.equal((await videoRow(take.id)).status, "awaiting_approval");
    assert.equal((await tokenRow(key.id)).used_at, null, "a forged secret spent the key");
  });

  test("an expired token is refused and stays unspent", async () => {
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id, { minutes: -5 });

    assert.equal((await post({ token: key.token, decision: "approve" })).status, 404);
    assert.equal((await videoRow(take.id)).status, "awaiting_approval");
  });

  test("a take that is not awaiting a decision cannot be decided", async () => {
    const take = await newTakeAwaitingApproval("editing");
    const key = await keyFor(take.id);

    assert.equal((await post({ token: key.token, decision: "approve" })).status, 404);
    assert.equal((await videoRow(take.id)).status, "editing");
  });

  test("a reject stores the reason, capped at 280", async () => {
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id);

    await post({ token: key.token, decision: "reject", reason: "x".repeat(500) });
    const v = await videoRow(take.id);
    assert.equal(v.status, "rejected");
    assert.equal(v.rejected_reason.length, 280);
  });

  test("a GET renders the take and decides nothing", async () => {
    const take = await newTakeAwaitingApproval();
    const key = await keyFor(take.id);

    const res = await get(key.token);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /approve/i);

    assert.equal((await videoRow(take.id)).status, "awaiting_approval");
    assert.equal((await tokenRow(key.id)).used_at, null, "a GET spent the key");
  });

  test("a GET with no valid token leaks nothing about any take", async () => {
    const take = await newTakeAwaitingApproval();
    await keyFor(take.id);

    const res = await get(`avd_${"a".repeat(32)}_${"b".repeat(64)}`);
    assert.equal(res.status, 404);
    const page = await res.text();
    assert.ok(!page.includes(take.ad_id));
    assert.ok(!page.includes("cdn.test"));
  });

  describe("390's constraints", () => {
    test("a malformed selector is refused by the database, not just by the code", async () => {
      const take = await newTakeAwaitingApproval();
      await assert.rejects(() => db.query(
        `INSERT INTO ad_video_decision_tokens (org_id, ad_video_id, selector, verifier_sha256, expires_at)
         VALUES ($1, $2, 'NOT-HEX', $3, now() + interval '1 hour')`,
        [org, take.id, crypto.randomBytes(32)]
      ), /selector_ck/);
    });

    test("a truncated verifier hash is refused", async () => {
      const take = await newTakeAwaitingApproval();
      await assert.rejects(() => db.query(
        `INSERT INTO ad_video_decision_tokens (org_id, ad_video_id, selector, verifier_sha256, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
        [org, take.id, crypto.randomBytes(16).toString("hex"), crypto.randomBytes(16)]
      ), /verifier_ck/);
    });

    test("a key cannot be spent without recording which way", async () => {
      const take = await newTakeAwaitingApproval();
      const key = await keyFor(take.id);
      await assert.rejects(() => db.query(
        `UPDATE ad_video_decision_tokens SET used_at = now() WHERE id = $1`, [key.id]
      ), /spend_ck/);
    });

    test("deleting a take takes its keys with it", async () => {
      const take = await newTakeAwaitingApproval();
      const key = await keyFor(take.id);
      await db.query(`DELETE FROM ad_videos WHERE id = $1`, [take.id]);
      assert.equal((await db.query(
        `SELECT 1 FROM ad_video_decision_tokens WHERE id = $1`, [key.id])).rows.length, 0);
    });
  });
});
