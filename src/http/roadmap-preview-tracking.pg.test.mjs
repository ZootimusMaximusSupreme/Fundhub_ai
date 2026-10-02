// Sample-preview tracking on /roadmap, against a real Postgres.
//
// Proves, with the real events table and the real views from
// db/migrations/405_roadmap_preview_views.sql:
//   * preview_opened / preview_closed save through the real handler
//     (api/public/slo-interest.mjs, kind "track");
//   * a deliverable that is not on the allow-list is refused and saves nothing;
//   * open_ms is clamped to 0..600000;
//   * v_roadmap_preview_continue_daily returns the right counts and rates, with
//     the same-session join, "Continue before the first open does not count",
//     and our own agents left out;
//   * v_roadmap_preview_open_ms_daily returns the right average per deliverable.
//
// Lives under src/http/ so npm test collects it (CLAUDE.md §12). Scratch
// Postgres only, like slo-interest-track.pg.test.mjs: it refuses a hosted
// Supabase address. Rows it writes are keyed to this run and removed after.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/public/slo-interest.mjs";
import { db, close } from "../db.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";

const URL_SET = process.env.DATABASE_URL || "";
const HOSTED = /supabase\.(co|com)\b|oqpnlusrotpxfenysfxz/i.test(URL_SET);
const SKIP = !URL_SET ? "no DATABASE_URL"
  : HOSTED ? "DATABASE_URL is a hosted Supabase database; scratch Postgres only"
  : false;

const RUN = `pgprv${Date.now().toString(36)}`;
const sid = (tag) => `${RUN}-${tag}`;
const UA = "Mozilla/5.0 (Macintosh; pg test)";
const HOW = "how_much_you_qualify_for";
const ANALYSIS = "credit_analysis_report";

function fakeRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; }
  };
}

describe("/roadmap sample previews — real events table and views", { skip: SKIP }, () => {
  let org;
  const seqs = {};

  /** One track event through the real handler. */
  async function send(session, event, props = {}, extra = {}) {
    seqs[session] = (seqs[session] || 0) + 1;
    const res = fakeRes();
    await handler({
      method: "POST",
      headers: { origin: "https://apply.fundhub.ai", "user-agent": UA },
      body: { kind: "track", page: "/roadmap", session_id: session, seq: seqs[session], event, props, ...extra }
    }, res, { db, orgId: org });
    // Rows must land in a strict order; a coarse clock could stamp two alike.
    await new Promise((r) => setTimeout(r, 5));
    return res;
  }

  async function purge() {
    await db.query(
      `DELETE FROM events WHERE org_id = $1 AND (idempotency_key LIKE $2 OR idempotency_key LIKE $3)`,
      [org, `funnel-track:${RUN}-%`, `funnel-page:${RUN}-%`]
    );
  }

  async function today() {
    const r = await db.query(
      `SELECT * FROM v_roadmap_preview_continue_daily
        WHERE org_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`, [org]);
    const row = r.rows[0] || {};
    const n = (k) => Number(row[k] || 0);
    return {
      opened_visitors: n("opened_visitors"), opened_continued: n("opened_continued"),
      unopened_visitors: n("unopened_visitors"), unopened_continued: n("unopened_continued"),
      opened_continue_rate: row.opened_continue_rate, unopened_continue_rate: row.unopened_continue_rate
    };
  }

  async function ms(deliverable) {
    const r = await db.query(
      `SELECT closes, avg_open_ms FROM v_roadmap_preview_open_ms_daily
        WHERE org_id = $1 AND deliverable = $2 AND day = (now() AT TIME ZONE 'UTC')::date`,
      [org, deliverable]);
    const row = r.rows[0];
    return { closes: Number(row?.closes || 0), sum: Number(row?.avg_open_ms || 0) * Number(row?.closes || 0) };
  }

  before(async () => {
    org = await resolveDefaultOrg(db);
    await purge();
  });
  after(async () => {
    await purge();
    await close();
  });

  test("the handler saves an open and a close; a bad deliverable is refused and saves nothing", async () => {
    const s = sid("basic");
    assert.equal((await send(s, "preview_opened", { deliverable: HOW })).statusCode, 200);
    const closed = await send(s, "preview_closed", { deliverable: HOW, open_ms: 4321 });
    assert.equal(closed.statusCode, 200);

    const bad = await send(s, "preview_opened", { deliverable: "free_money" });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.error, "deliverable_invalid");
    const none = await send(s, "preview_closed", { open_ms: 100 });
    assert.equal(none.statusCode, 400);
    const injected = await send(s, "preview_opened", { deliverable: `${HOW}'; DROP TABLE events;--` });
    assert.equal(injected.statusCode, 400);

    const rows = (await db.query(
      `SELECT name, payload FROM events WHERE org_id = $1 AND idempotency_key LIKE $2 ORDER BY created_at, id`,
      [org, `funnel-track:${s}:%`])).rows;
    assert.deepEqual(rows.map((r) => r.name), ["funnel.preview_opened", "funnel.preview_closed"]);
    assert.deepEqual(rows[0].payload.props, { deliverable: HOW });
    assert.deepEqual(rows[1].payload.props, { deliverable: HOW, open_ms: 4321 });
    assert.equal(rows[1].payload.session_id, s, "same session id the Continue event carries");
  });

  test("open_ms is clamped to 0..600000", async () => {
    const s = sid("clamp");
    await send(s, "preview_closed", { deliverable: HOW, open_ms: 99999999 });
    await send(s, "preview_closed", { deliverable: HOW, open_ms: -50 });
    const rows = (await db.query(
      `SELECT payload->'props'->>'open_ms' AS ms FROM events
        WHERE org_id = $1 AND idempotency_key LIKE $2 ORDER BY created_at, id`,
      [org, `funnel-track:${s}:%`])).rows;
    assert.deepEqual(rows.map((r) => r.ms), ["600000", "0"]);
  });

  test("the Continue-rate view and the open-time view return the right numbers on seeded rows", async () => {
    const before = await today();
    const howBefore = await ms(HOW);
    const anaBefore = await ms(ANALYSIS);

    const A = sid("A"), B = sid("B"), C = sid("C"), D = sid("D"), E = sid("E"), G = sid("G");
    // A: opened, then pressed Continue                       -> opened, continued
    await send(A, "page_view");
    await send(A, "preview_opened", { deliverable: HOW });
    await send(A, "preview_closed", { deliverable: HOW, open_ms: 4000 });
    await send(A, "continue", { step: 1 });
    // B: opened, never pressed Continue                      -> opened, not continued
    await send(B, "page_view");
    await send(B, "preview_opened", { deliverable: HOW });
    await send(B, "preview_closed", { deliverable: HOW, open_ms: 2000 });
    // C: pressed Continue BEFORE the first open              -> opened, not continued
    await send(C, "page_view");
    await send(C, "continue", { step: 1 });
    await send(C, "preview_opened", { deliverable: ANALYSIS });
    await send(C, "preview_closed", { deliverable: ANALYSIS, open_ms: 9999999 });
    // D: opened nothing, pressed Continue                    -> unopened, continued
    await send(D, "page_view");
    await send(D, "continue", { step: 1 });
    // E: opened nothing, no Continue                         -> unopened, not continued
    await send(E, "page_view");
    // G: one of our own agents opened a preview and continued -> not counted anywhere
    await send(G, "page_view", {}, { webdriver: true });
    await send(G, "preview_opened", { deliverable: HOW }, { webdriver: true });
    await send(G, "preview_closed", { deliverable: HOW, open_ms: 50000 }, { webdriver: true });
    await send(G, "continue", { step: 1 }, { webdriver: true });

    const after = await today();
    assert.equal(after.opened_visitors - before.opened_visitors, 3);
    assert.equal(after.opened_continued - before.opened_continued, 1);
    assert.equal(after.unopened_visitors - before.unopened_visitors, 2);
    assert.equal(after.unopened_continued - before.unopened_continued, 1);
    assert.equal(Number(after.opened_continue_rate),
      Math.round(after.opened_continued / after.opened_visitors * 10000) / 10000);
    assert.equal(Number(after.unopened_continue_rate),
      Math.round(after.unopened_continued / after.unopened_visitors * 10000) / 10000);

    const how = await ms(HOW), ana = await ms(ANALYSIS);
    assert.equal(how.closes - howBefore.closes, 2, "the agent's close is left out");
    assert.equal(how.sum - howBefore.sum, 6000, "4000 + 2000");
    assert.equal(ana.closes - anaBefore.closes, 1);
    assert.equal(ana.sum - anaBefore.sum, 600000, "9999999 was clamped");
  });
});
