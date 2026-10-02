// kind "track" (src/funnel/track.mjs) against a real Postgres.
//
// What only a database can prove: the real unique index on
// (org_id, idempotency_key) makes a retried seq one row; a page_view lands on
// the same funnel-page key an old kind "page" row already holds; the 500-a-day
// cap counts real rows, ignores rows older than a day, and its LIKE pattern
// escapes "_" so one session never counts another's rows; and the cap query
// can use idx_events_funnel_track (db/migrations/404_funnel_track_index.sql).
//
// Lives under src/http/ so npm test collects it (CLAUDE.md §12). Skipped
// without DATABASE_URL, like every other *.pg.test.mjs, and also refuses a
// hosted Supabase address: run it on a LOCAL scratch database only. It inserts
// events rows keyed to this run and removes them after.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close, pool } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { recordTrack, TRACK_CAP_SQL, MAX_TRACK_PER_SESSION } from "../funnel/track.mjs";

const URL_SET = process.env.DATABASE_URL || "";
const HOSTED = /supabase\.(co|com)\b|oqpnlusrotpxfenysfxz/i.test(URL_SET);
const SKIP = !URL_SET ? "no DATABASE_URL"
  : HOSTED ? "DATABASE_URL is a hosted Supabase database; scratch Postgres only"
  : false;

// Session ids are [A-Za-z0-9_-]{8,80}. Every key this run writes starts with RUN.
const RUN = `pgtrk${Date.now().toString(36)}`;
const sid = (tag) => `${RUN}-${tag}`;
const UA = "Mozilla/5.0 (Macintosh; pg test)";

describe("kind track — real events table", { skip: SKIP }, () => {
  let org;
  const deps = () => ({ db, orgId: org, userAgent: UA });
  const track = (body) => recordTrack({ page: "/roadmap", ...body }, deps());

  async function purge() {
    await db.query(
      `DELETE FROM events
        WHERE org_id = $1 AND (idempotency_key LIKE $2 OR idempotency_key LIKE $3)`,
      [org, `funnel-track:${RUN}-%`, `funnel-page:${RUN}-%`]
    );
  }

  async function rowsFor(prefix) {
    return (await db.query(
      `SELECT name, idempotency_key, payload FROM events
        WHERE org_id = $1 AND idempotency_key LIKE $2
        ORDER BY idempotency_key`,
      [org, `${prefix}%`]
    )).rows;
  }

  /** n rows for one session, as kind "track" would have saved them. */
  async function fill(session, n, age = "0 seconds") {
    await db.query(
      `INSERT INTO events (org_id, name, idempotency_key, payload, created_at)
       SELECT $1, 'funnel.scroll', 'funnel-track:' || $2 || ':' || g, '{}'::jsonb,
              now() - $4::interval
         FROM generate_series(1, $3::int) g`,
      [org, session, n, age]
    );
  }

  before(async () => {
    org = await resolveDefaultOrg(db);
    await purge();
  });

  after(async () => {
    await purge();
    await close();
  });

  test("a scroll is one funnel.scroll row with the spec's payload; a retry is that same row", async () => {
    const s = sid("scroll");
    const body = { event: "scroll", session_id: s, props: { depth: 50, ssn: "123-45-6789" }, utm_content: "43-roadmap" };
    assert.deepEqual(await track({ ...body, seq: 1 }), { ok: true, actor: "person", saved: true });
    assert.deepEqual(await track({ ...body, seq: 1 }), { ok: true, actor: "person", saved: false });
    assert.deepEqual(await track({ ...body, seq: 2 }), { ok: true, actor: "person", saved: true });

    const rows = await rowsFor(`funnel-track:${s}:`);
    assert.deepEqual(rows.map((r) => [r.name, r.idempotency_key]),
      [["funnel.scroll", `funnel-track:${s}:1`], ["funnel.scroll", `funnel-track:${s}:2`]]);
    const p = rows[0].payload;
    assert.deepEqual(Object.keys(p).sort(), [
      "actor", "actor_reason", "attribution", "event", "funnel", "landing_path",
      "page", "props", "seq", "session_id", "step"
    ]);
    assert.deepEqual([p.page, p.funnel, p.step, p.seq, p.event], ["/roadmap", "roadmap", 1, 1, "scroll"]);
    assert.deepEqual(p.props, { depth: 50 }, "the SSN-shaped value never reached the row");
    assert.equal(p.attribution.utm_content, "43-roadmap");
  });

  test("page_view shares the old kind page key: one funnel.page row per session per page", async () => {
    const s = sid("pages");
    // What kind "page" already wrote for this session.
    await db.query(
      `INSERT INTO events (org_id, name, idempotency_key, payload)
       VALUES ($1, 'funnel.page', $2, '{}'::jsonb)`,
      [org, `funnel-page:${s}:/roadmap`]
    );
    const again = await track({ event: "page_view", session_id: s, seq: 1, props: { title: "Roadmap" } });
    assert.equal(again.saved, false);
    const next = await track({ event: "page_view", session_id: s, seq: 2, page: "/roadmap-book/" });
    assert.equal(next.saved, true);
    const rows = await rowsFor(`funnel-page:${s}:`);
    assert.deepEqual(rows.map((r) => [r.name, r.idempotency_key]), [
      ["funnel.page", `funnel-page:${s}:/roadmap`],
      ["funnel.page", `funnel-page:${s}:/roadmap-book`]
    ]);
    assert.deepEqual([rows[1].payload.funnel, rows[1].payload.step], ["roadmap", 2]);
  });

  test("500 rows today stop the next one; page_view still lands", async () => {
    const s = sid("capped");
    await fill(s, MAX_TRACK_PER_SESSION);
    assert.deepEqual(await track({ event: "scroll", session_id: s, seq: 501, props: { depth: 25 } }),
      { ok: true, actor: "person", saved: false });
    assert.equal((await rowsFor(`funnel-track:${s}:`)).length, MAX_TRACK_PER_SESSION);
    assert.equal((await track({ event: "page_view", session_id: s, seq: 502 })).saved, true);
  });

  test("rows older than a day do not count", async () => {
    const s = sid("oldrows");
    await fill(s, MAX_TRACK_PER_SESSION, "2 days");
    assert.equal((await track({ event: "scroll", session_id: s, seq: 501 })).saved, true);
  });

  test("an underscore in a session id is not a wildcard", async () => {
    // Unescaped, "cap_a" would match "capza" and count its 500 rows.
    await fill(sid("capza"), MAX_TRACK_PER_SESSION);
    assert.equal((await track({ event: "scroll", session_id: sid("cap_a"), seq: 1 })).saved, true);
  });

  test("the cap count can use idx_events_funnel_track", async () => {
    const idx = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'events' AND indexname = 'idx_events_funnel_track'`);
    assert.equal(idx.rows.length, 1, "migration 404 is applied");
    assert.match(idx.rows[0].indexdef, /text_pattern_ops/);

    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      // Inside this transaction only: make the planner show whether it CAN use
      // an index, not whether a near-empty scratch table makes a scan cheaper.
      await client.query("SET LOCAL enable_seqscan = off");
      const sql = TRACK_CAP_SQL
        .replace("$1", client.escapeLiteral(org))
        .replace("$2", client.escapeLiteral(`funnel-track:${sid("capped")}:%`));
      const plan = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`);
      assert.match(JSON.stringify(plan.rows[0]), /idx_events_funnel_track/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
