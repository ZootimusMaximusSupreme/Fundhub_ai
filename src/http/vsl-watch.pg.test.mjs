// POST /api/public/vsl-watch, against a real Postgres — does the beacon
// actually land, and can the one open door in this batch be abused?
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS FILE IS HERE AND NOT NEXT TO THE HANDLER
//
// npm test's glob is "src/**" and "scripts/**" only (CLAUDE.md §12). A test
// placed under api/ is never collected and passes forever by never running. The
// handler is imported from here instead — the same arrangement, and the same
// reason, as src/http/ad-asset-link.pg.test.mjs:6-10.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** IT CALLS THE HANDLER DIRECTLY, NOT THE FRONT DOOR, AND THAT IS A GAP ***
//
// src/http/affiliate-click.pg.test.mjs goes through netlify/functions/api.mjs
// on purpose, because a handler file is not a route: one missing from the
// hardcoded ROUTES map returns "no such page" locally and deployed, and that
// has shipped broken twice.
//
// This file CANNOT do that yet. The key "public/vsl-watch" is not in that map —
// this unit deliberately does not edit netlify/functions/api.mjs, and adding the
// line is the integrator's job. So everything below proves the HANDLER and the
// TABLES, and proves nothing at all about whether a browser can reach them.
// src/http/routes.test.mjs is the test that fails until the line lands, and it
// is meant to.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** NOTHING IN THIS FILE HAS EVER RUN. ***
//
// There is no Postgres on the machine this was written on, so every test below
// SKIPPED. It is written to be correct and it is not evidence of anything. A
// skipped .pg.test.mjs is NOT green (CLAUDE.md §12). The first person with a
// database must run it and report the real result.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// THE READS RUN AS STAFF, THE WRITES DO NOT
//
// vsl_watch_sessions and vsl_watch_positions carry FORCEd row-level security
// (379, Part 6) and a bare db.query is anonymous to those policies — it matches
// ZERO rows rather than erroring, which makes a test look green while proving
// nothing. So every assertion reads through asStaff().
//
// The handler is left alone to open its own narrow transaction, because HOW it
// gets its row in is the single most interesting thing about this unit.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE DOES *NOT* PROVE — ROW-LEVEL SECURITY
//
// A superuser, and the table owner under some configurations, bypasses every
// policy. CI runs most of this suite as the owner. So the isolation test at the
// end routes through src/testing/rls-pool.mjs and says out loud, via
// rlsIsReal(), when APP_DATABASE_URL is unset and it is therefore proving
// nothing. Do not read a green run as proof of the policies unless that
// variable is set.
//
//   ⚠️ TO WHOEVER RUNS THIS FIRST: SET APP_DATABASE_URL, pointing at fundhub_app.
//      Without it that one test PRINTS A LINE AND PASSES, and the security rules
//      on both new tables stay completely unproven. A green run with the
//      variable unset is not evidence about them. This is the same trap
//      CLAUDE.md §12 records: a whole isolation suite once passed falsely
//      because the connection was a superuser.

import { test, before, after, describe } from "node:test";
import assert from "node:assert";
import { db, close } from "../db.mjs";
import { asStaff } from "../partners/rls.mjs";
import { rlsDb, rlsIsReal } from "../testing/rls-pool.mjs";
import handler from "../../api/public/vsl-watch.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const MARK = "vslpgtest";
const VIDEO = "funnel/vsl.mp4";

/* The res shim every endpoint test in this repo uses: the adapter only ever
   gives a handler status(), json() and setHeader(). */
const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  return r;
};

describe("POST /api/public/vsl-watch", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let seq = 0;

  /* Every test makes its own ids, so no assertion rests on the order the tests
     happened to run in. The shape matches 379's CHECK: 16-64 of [A-Za-z0-9_-]. */
  const newVisitor = () => `${MARK}-v-${String(++seq).padStart(6, "0")}-xxxx`;
  const newSession = () => `${MARK}-s-${String(++seq).padStart(6, "0")}-xxxx`;

  const post = async (body, { method = "POST", headers = {}, deps = {}, raw } = {}) => {
    const r = res();
    await handler(
      {
        method,
        headers,
        query: {},
        body,
        rawBody: raw !== undefined ? raw : JSON.stringify(body ?? {})
      },
      r,
      deps
    );
    return r;
  };

  const sessionRow = async (visitorId) => (await asStaff((tx) => tx.query(
    `SELECT * FROM vsl_watch_sessions WHERE visitor_id = $1`, [visitorId]
  ))).rows[0];

  const sessionRows = async (visitorId) => (await asStaff((tx) => tx.query(
    `SELECT * FROM vsl_watch_sessions WHERE visitor_id = $1 ORDER BY started_at`, [visitorId]
  ))).rows;

  const curveRow = async (visitorId) => (await asStaff((tx) => tx.query(
    `SELECT p.* FROM vsl_watch_positions p
       JOIN vsl_watch_sessions s ON s.id = p.session_id
      WHERE s.visitor_id = $1`, [visitorId]
  ))).rows[0];

  before(async () => { await purge(); });
  after(async () => { await purge(); await close(); });

  async function purge() {
    if (!HAVE_DB) return;
    // Positions go with their session by ON DELETE CASCADE (379, Part 4).
    await asStaff((tx) => tx.query(
      `DELETE FROM vsl_watch_sessions WHERE visitor_id LIKE $1`, [`${MARK}%`]
    ));
  }

  // ── it lands at all ──────────────────────────────────────────────────────

  test("a good beacon writes exactly one row, and the answer says nothing else", async () => {
    const vid = newVisitor();
    const r = await post({
      v: VIDEO, vid, sid: newSession(),
      dur: 207.215, pos: 91.4, unmuted: true, device: "mobile",
      page: "https://apply.fundhub.ai/watch"
    });

    assert.equal(r.code, 200);
    assert.deepEqual(r.body, { ok: true }, "the response must carry nothing but ok");

    const row = await sessionRow(vid);
    assert.ok(row, "a row must exist — a 200 that writes nothing is the failure this test is for");
    assert.equal(row.video_key, VIDEO);
    assert.equal(Number(row.video_duration_seconds), 207.215);
    assert.equal(Number(row.max_position_seconds), 91.4);
    assert.equal(row.unmuted, true);
    assert.equal(row.device_hint, "mobile");
    assert.equal(row.page_url, "https://apply.fundhub.ai/watch");
    assert.equal(row.actor, "person");
    assert.equal(row.actor_reason, "browser");
  });

  test("a robot browser is saved as an agent, and a later ordinary beacon cannot undo that", async () => {
    const vid = newVisitor();
    const sid = newSession();
    const first = await post(
      { v: VIDEO, vid, sid, dur: 207.215, pos: 4, wd: true },
      { headers: { "user-agent": "Mozilla/5.0" } }
    );
    assert.equal(first.code, 200);
    let row = await sessionRow(vid);
    assert.equal(row.actor, "agent");
    assert.equal(row.actor_reason, "automated_browser");

    await post(
      { v: VIDEO, vid, sid, pos: 20 },
      { headers: { "user-agent": "Mozilla/5.0" } }
    );
    row = await sessionRow(vid);
    assert.equal(row.actor, "agent", "an agent must stay an agent");
    assert.equal(row.actor_reason, "automated_browser");
    assert.equal(Number(row.max_position_seconds), 20);
  });

  test("the fraction is stored, and it is ours rather than the caller's", async () => {
    const vid = newVisitor();
    await post({ v: VIDEO, vid, sid: newSession(), dur: 200, pos: 50, watched_fraction: 1 });
    const row = await sessionRow(vid);
    assert.equal(Number(row.watched_fraction), 0.25);
  });

  test("the times come from the server, not from the browser", async () => {
    const vid = newVisitor();
    await post({
      v: VIDEO, vid, sid: newSession(),
      started_at: "2019-01-01T00:00:00Z", created_at: "2019-01-01T00:00:00Z"
    });
    const row = await sessionRow(vid);
    assert.ok(row.started_at.getUTCFullYear() >= 2026,
      "a browser with the wrong clock must not be able to file a viewing under 2019");
  });

  // ── NULL means unknown, and it has to survive the whole trip ─────────────

  test("what the beacon did not say stays NULL in the row, never 0 and never false", async () => {
    const vid = newVisitor();
    await post({ v: VIDEO, vid, sid: newSession() });
    const row = await sessionRow(vid);

    for (const col of [
      "video_duration_seconds", "max_position_seconds",
      "max_position_after_unmute_seconds", "watched_fraction",
      "unmuted", "finished", "autoplay_blocked",
      "replay_count", "rewind_count", "skip_count",
      "utm_content", "ad_number", "page_url", "referrer", "device_hint"
    ]) {
      assert.strictEqual(row[col], null, `${col} must be NULL when nothing said otherwise`);
    }
  });

  test("'did not finish' and 'we never heard' end up as different rows", async () => {
    const said = newVisitor();
    await post({ v: VIDEO, vid: said, sid: newSession(), finished: false });
    const silent = newVisitor();
    await post({ v: VIDEO, vid: silent, sid: newSession() });

    assert.strictEqual((await sessionRow(said)).finished, false);
    assert.strictEqual((await sessionRow(silent)).finished, null);
  });

  test("a beacon that carries no curve writes no positions row at all", async () => {
    const vid = newVisitor();
    await post({ v: VIDEO, vid, sid: newSession(), pos: 30 });
    assert.equal(await curveRow(vid), undefined,
      "an empty curve row would turn 'we were never told' into 'we asked and got nothing'");
  });

  // ── the same viewing, more than once ─────────────────────────────────────

  test("a second beacon for the same viewing updates the row instead of adding one", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, pos: 10 });
    await post({ v: VIDEO, vid, sid, pos: 120, unmuted: true });

    const rows = await sessionRows(vid);
    assert.equal(rows.length, 1, "one viewing must be one row");
    assert.equal(Number(rows[0].max_position_seconds), 120);
    assert.equal(rows[0].unmuted, true);
  });

  test("the very same beacon sent twice changes nothing the second time", async () => {
    const vid = newVisitor(), sid = newSession();
    const beacon = { v: VIDEO, vid, sid, pos: 77, finished: true, samples: [1, 2, 3], n: 3 };
    await post(beacon);
    const first = await sessionRow(vid);
    await post(beacon);
    const second = await sessionRow(vid);

    assert.equal(Number(first.max_position_seconds), Number(second.max_position_seconds));
    assert.equal(first.finished, second.finished);
    assert.equal(first.id, second.id);
  });

  test("a LATE beacon cannot shrink a viewing — this is the whole point of the trigger", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, pos: 182, finished: true, unmuted: true, rewinds: 4 });
    // the delayed duplicate of an EARLIER report finally arrives
    await post({ v: VIDEO, vid, sid, pos: 4, finished: false, unmuted: false, rewinds: 0 });

    const row = await sessionRow(vid);
    assert.equal(Number(row.max_position_seconds), 182, "the furthest second must not fall");
    assert.equal(row.finished, true, "a true must stay true");
    assert.equal(row.unmuted, true, "a true must stay true");
    assert.equal(row.rewind_count, 4, "a count must not fall");
  });

  test("a later beacon cannot move a viewing to a different video or a different person", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, pos: 10 });
    await post({ v: "funnel/slo/offer.mp4", vid, sid, pos: 20 });

    const rows = await sessionRows(vid);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].video_key, VIDEO, "the video is frozen to what the first write said");
  });

  test("learning something later is allowed; a NULL never erases a known value", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, pos: 10 });                       // duration unknown
    await post({ v: VIDEO, vid, sid, pos: 20, dur: 207.215 });         // now known
    await post({ v: VIDEO, vid, sid, pos: 30 });                       // silent again

    const row = await sessionRow(vid);
    assert.equal(Number(row.video_duration_seconds), 207.215,
      "a beacon that says nothing must not unset what an earlier one said");
    assert.equal(Number(row.max_position_seconds), 30);
  });

  // ── the two runs of one viewing ──────────────────────────────────────────
  //
  // This is the number that was silently wrong before the second column
  // existed. Tapping for sound sets currentTime=0, so a viewing that was
  // unmuted holds two runs of the same video and one "furthest second" adds
  // them together.

  test("THE ONE THAT MATTERS: a silent watch to 3:00 then a tap then leaving", async () => {
    const vid = newVisitor(), sid = newSession();

    // The video plays silently and reaches 3:00.
    await post({ v: VIDEO, vid, sid, dur: 207.215, pos: 180 });
    // They tap for sound. The player restarts at 0. They leave almost at once.
    await post({ v: VIDEO, vid, sid, dur: 207.215, pos: 180, pos_unmuted: 2, unmuted: true });

    const row = await sessionRow(vid);
    assert.equal(row.unmuted, true);
    assert.equal(Number(row.max_position_seconds), 180,
      "the whole viewing did reach 3:00 — that part was always right");
    assert.equal(Number(row.max_position_after_unmute_seconds), 2,
      "AFTER choosing to watch they saw two seconds. Reading max_position_seconds " +
      "here would report 3:00 and be the exact opposite of what happened.");
  });

  test("somebody who never tapped has no second run, and it is NULL not 0", async () => {
    const vid = newVisitor();
    await post({ v: VIDEO, vid, sid: newSession(), pos: 180, unmuted: false });
    const row = await sessionRow(vid);
    assert.strictEqual(row.max_position_after_unmute_seconds, null,
      "a 0 would say they tapped and watched none of it, which is a different person");
  });

  test("the second run's furthest second rises and never falls", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, pos: 190, pos_unmuted: 90, unmuted: true });
    // a delayed duplicate of an earlier report finally arrives
    await post({ v: VIDEO, vid, sid, pos: 12, pos_unmuted: 3, unmuted: true });

    const row = await sessionRow(vid);
    assert.equal(Number(row.max_position_after_unmute_seconds), 90);
    assert.equal(Number(row.max_position_seconds), 190);
  });

  test("the position and its fraction always describe the same moment", async () => {
    const vid = newVisitor(), sid = newSession();
    // The furthest report comes first, but nothing knows the video's length yet,
    // so it carries no fraction at all.
    await post({ v: VIDEO, vid, sid, pos: 100 });
    // A LATER, SHORTER report is the first to learn the length. Raised on its
    // own, its fraction (50/200) would be stored next to a position of 100.
    await post({ v: VIDEO, vid, sid, pos: 50, dur: 200 });

    const row = await sessionRow(vid);
    assert.equal(Number(row.max_position_seconds), 100, "the furthest second must not fall");
    assert.equal(Number(row.watched_fraction), 0.5,
      "0.5 is second 100 of a 200-second video. 0.25 would be the SHORTER beacon's " +
      "fraction sitting next to the LONGER beacon's position — two numbers about " +
      "two different moments.");
  });

  test("with the length still unknown there is nothing to divide by, so it stays NULL", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, pos: 100 });
    await post({ v: VIDEO, vid, sid, pos: 140 });
    const row = await sessionRow(vid);
    assert.equal(Number(row.max_position_seconds), 140);
    assert.strictEqual(row.watched_fraction, null,
      "an unknown share must not become 0 just because the position is known");
  });

  // ── the curve ────────────────────────────────────────────────────────────

  test("curves from separate beacons are joined by union, in order, without repeats", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, samples: [0, 5, 10], n: 3 });
    await post({ v: VIDEO, vid, sid, samples: [10, 15, 5], n: 6 });

    const curve = await curveRow(vid);
    assert.deepEqual(curve.seconds_seen.map(Number), [0, 5, 10, 15]);
    assert.equal(curve.sample_count, 6, "the running total is the highest one reported");
  });

  test("a curve cannot be shortened by a later beacon", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, samples: [0, 5, 10, 15, 20], n: 5 });
    await post({ v: VIDEO, vid, sid, samples: [0], n: 1 });

    const curve = await curveRow(vid);
    assert.deepEqual(curve.seconds_seen.map(Number), [0, 5, 10, 15, 20]);
    assert.equal(curve.sample_count, 5);
  });

  test("a curve row cannot claim a visitor its own session does not have", async () => {
    const vid = newVisitor(), sid = newSession();
    await post({ v: VIDEO, vid, sid, samples: [1], n: 1 });
    const row = await sessionRow(vid);

    await assert.rejects(
      () => asStaff((tx) => tx.query(
        `INSERT INTO vsl_watch_positions (session_id, visitor_id, seconds_seen)
         VALUES ($1, $2, ARRAY[1,2,3])
         ON CONFLICT (session_id) DO UPDATE SET visitor_id = EXCLUDED.visitor_id`,
        [row.id, `${MARK}-somebody-else-000`]
      )),
      "the composite foreign key must refuse a positions row whose visitor disagrees with its parent"
    );
  });

  // ── the join to the label spine ──────────────────────────────────────────

  test("the ad number is worked out by the database from utm_content", async () => {
    const withSlug = newVisitor();
    await post({ v: VIDEO, vid: withSlug, sid: newSession(), utm_content: "42-phase" });
    assert.equal((await sessionRow(withSlug)).ad_number, "42",
      "the slug is ignored — an ad is identified by its number, never by its name");

    const bare = newVisitor();
    await post({ v: VIDEO, vid: bare, sid: newSession(), utm_content: "42" });
    assert.equal((await sessionRow(bare)).ad_number, "42");

    const junk = newVisitor();
    await post({ v: VIDEO, vid: junk, sid: newSession(), utm_content: "not-an-ad" });
    const row = await sessionRow(junk);
    assert.strictEqual(row.ad_number, null, "an unreadable utm_content is NULL, never a guess");
    assert.equal(row.utm_content, "not-an-ad", "the raw value is kept whatever it was");
  });

  test("the ad number matches what a lead row would carry for the same link", async () => {
    const vid = newVisitor();
    await post({ v: VIDEO, vid, sid: newSession(), utm_content: "16_phase" });
    const mine = (await sessionRow(vid)).ad_number;
    const theirs = (await asStaff((tx) => tx.query(
      `SELECT fundhub_ad_id($1) AS id`, ["16_phase"]
    ))).rows[0].id;
    assert.equal(mine, theirs,
      "watch rows and client_ad_attribution must land on the same number or they cannot be joined");
  });

  // ── the caps and the refusals ────────────────────────────────────────────

  test("a body over the cap is refused, and nothing is written", async () => {
    const vid = newVisitor();
    const r = await post(
      { v: VIDEO, vid, sid: newSession() },
      { raw: "x".repeat(9000) }
    );
    assert.equal(r.code, 413);
    assert.equal(await sessionRow(vid), undefined);
  });

  test("too many samples in one call is refused, and nothing is written", async () => {
    const vid = newVisitor();
    const r = await post({
      v: VIDEO, vid, sid: newSession(),
      samples: Array.from({ length: 241 }, (_, i) => i)
    });
    assert.equal(r.code, 400);
    assert.equal(r.body.error, "invalid", "the reason must not be handed back");
    assert.equal(await sessionRow(vid), undefined);
  });

  test("one bad field throws the whole beacon away rather than storing half of it", async () => {
    const vid = newVisitor();
    const r = await post({ v: VIDEO, vid, sid: newSession(), pos: 60, unmuted: "yes" });
    assert.equal(r.code, 400);
    assert.equal(await sessionRow(vid), undefined,
      "a half-arrived row would count as a viewing on every screen that reads this table");
  });

  test("every refusal says the same single word", async () => {
    const bodies = [
      { v: VIDEO, vid: "tooshort", sid: newSession() },
      { v: "../../etc/passwd", vid: newVisitor(), sid: newSession() },
      { v: VIDEO, vid: newVisitor(), sid: newSession(), pos: "91.4" },
      { v: VIDEO, vid: newVisitor(), sid: newSession(), page: "javascript:alert(1)" },
      "not even an object"
    ];
    for (const b of bodies) {
      const r = await post(b);
      assert.equal(r.code, 400);
      assert.deepEqual(r.body, { ok: false, error: "invalid" });
    }
  });

  test("only POST and the browser's permission question are answered", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH", "HEAD"]) {
      const r = await post({ v: VIDEO, vid: newVisitor(), sid: newSession() }, { method });
      assert.equal(r.code, 405, `${method} must not be a way in`);
    }
  });

  test("the funnel page is allowed across sites and a stranger's page is not", async () => {
    const ok = await post(
      { v: VIDEO, vid: newVisitor(), sid: newSession() },
      { method: "OPTIONS", headers: { origin: "https://apply.fundhub.ai" } }
    );
    assert.equal(ok.code, 200);
    assert.equal(ok.headers["access-control-allow-origin"], "https://apply.fundhub.ai");

    const no = await post(
      { v: VIDEO, vid: newVisitor(), sid: newSession() },
      { method: "OPTIONS", headers: { origin: "https://evil.test" } }
    );
    assert.equal(no.headers["access-control-allow-origin"], undefined,
      "no header at all is what makes the browser refuse it");
  });

  // ── the rate limit ───────────────────────────────────────────────────────

  test("one browser cannot open unlimited viewings, but its own viewing keeps reporting", async () => {
    const vid = newVisitor();
    const limits = { maxNewSessionsPerVisitor: 3, windowMinutes: 60 };

    const first = newSession();
    for (const sid of [first, newSession(), newSession()]) {
      const r = await post({ v: VIDEO, vid, sid, pos: 1 }, { deps: { limits } });
      assert.equal(r.code, 200);
    }

    const over = await post({ v: VIDEO, vid, sid: newSession(), pos: 1 }, { deps: { limits } });
    assert.equal(over.code, 429, "the fourth NEW viewing is refused");
    assert.ok(Number(over.headers["retry-after"]) > 0, "a 429 must say when to come back");

    // The limit is on NEW viewings. A viewing that already exists must keep
    // being able to report, or the longest watches — the ones worth the most —
    // are exactly the ones thrown away.
    const again = await post({ v: VIDEO, vid, sid: first, pos: 150 }, { deps: { limits } });
    assert.equal(again.code, 200);
    assert.equal(Number((await sessionRows(vid))[0].max_position_seconds), 150);

    assert.equal((await sessionRows(vid)).length, 3, "the refused one must not have been written");
  });

  test("one browser's limit is not another browser's limit", async () => {
    const limits = { maxNewSessionsPerVisitor: 1, windowMinutes: 60 };
    const a = newVisitor(), b = newVisitor();
    assert.equal((await post({ v: VIDEO, vid: a, sid: newSession() }, { deps: { limits } })).code, 200);
    assert.equal((await post({ v: VIDEO, vid: a, sid: newSession() }, { deps: { limits } })).code, 429);
    assert.equal((await post({ v: VIDEO, vid: b, sid: newSession() }, { deps: { limits } })).code, 200);
  });

  // ── the flood ceiling: the guard a made-up visitor id cannot walk around ──
  //
  // ⚠️ THESE TWO TESTS COUNT EVERY ROW IN THE TABLE, not just this test file's.
  //    They therefore set the ceiling relative to what is already there. Run
  //    against a database with real watch rows they still behave, because the
  //    baseline is read first.

  const siteCount = async (minutes) => (await asStaff((tx) => tx.query(
    `SELECT fundhub_vsl_recent_count($1::int) AS n`, [minutes]
  ))).rows[0].n;

  test("a flood spread across made-up visitor ids is stopped, which the per-browser count cannot do", async () => {
    const base = Number(await siteCount(10));
    // Room for exactly two more NEW viewings site-wide.
    const limits = {
      maxNewSessionsPerVisitor: 1000,   // this guard is deliberately wide open
      windowMinutes: 60,
      maxNewSessionsSiteWide: base + 2,
      siteWindowMinutes: 10
    };

    // A different visitor id every time — the exact move that resets the
    // per-browser allowance and is why this second guard has to exist.
    const first = { vid: newVisitor(), sid: newSession() };
    assert.equal((await post({ v: VIDEO, ...first }, { deps: { limits } })).code, 200);
    assert.equal((await post({ v: VIDEO, vid: newVisitor(), sid: newSession() }, { deps: { limits } })).code, 200);

    const blocked = await post(
      { v: VIDEO, vid: newVisitor(), sid: newSession() }, { deps: { limits } }
    );
    assert.equal(blocked.code, 429,
      "a fresh visitor id must NOT buy a fresh allowance once the site ceiling is reached");
    assert.ok(Number(blocked.headers["retry-after"]) > 0, "a 429 must say when to come back");

    // And the viewing that already exists keeps reporting straight through the
    // flood. It cannot make the table grow, and these late reports are the ones
    // worth the most.
    const during = await post(
      { v: VIDEO, ...first, pos: 150 }, { deps: { limits } }
    );
    assert.equal(during.code, 200,
      "an existing viewing must not be cut off by a flood somebody else caused");
    assert.equal(Number((await sessionRow(first.vid)).max_position_seconds), 150);
  });

  test("the counting function hands back a number and never a row", async () => {
    const n = await siteCount(10);
    assert.equal(typeof Number(n), "number");
    assert.ok(Number(n) >= 0);
    // The window is clamped, so an absurd ask cannot turn it into a scan of all
    // history: 1440 minutes is the most it will ever look back.
    assert.equal(Number(await siteCount(999999)), Number(await siteCount(1440)));
    assert.equal(Number(await siteCount(-5)), Number(await siteCount(1)));
  });


  // ── row-level security ───────────────────────────────────────────────────

  test("a connection that names no visitor and is not staff reads nothing", async () => {
    const vid = newVisitor();
    await post({ v: VIDEO, vid, sid: newSession(), pos: 42 });

    if (!rlsIsReal()) {
      // Said out loud rather than reported as a pass. Under the table owner
      // every policy is bypassed and this assertion would be meaningless.
      console.log("SKIPPED THE ONLY RLS ASSERTION: APP_DATABASE_URL is not set, " +
                  "so this run connects as a privileged role and proves nothing about the policies.");
      return;
    }

    const seen = await rlsDb.query(
      `SELECT count(*)::int AS n FROM vsl_watch_sessions WHERE visitor_id = $1`, [vid]
    );
    assert.equal(seen.rows[0].n, 0,
      "watch rows must be staff-only to anyone who has not declared the visitor");
  });
});
