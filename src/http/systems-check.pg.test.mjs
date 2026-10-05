/* GET /api/read/systems-check against a real Postgres (MB2, 2026-10-05).
 *
 * Pinned:
 *   1. THE ROUTE EXISTS — called through netlify/functions/api.mjs's real
 *      ROUTES map (CLAUDE.md §12: a handler file is not a route).
 *   2. Owner and admin read it; a closer is refused (403); no session is 401.
 *   3. ?date= returns that morning in the board contract shape; a bad date is
 *      400; a morning with no row is 404.
 *
 * SKIPS WITHOUT A DATABASE, LOUDLY:
 *   DATABASE_URL=postgres://… node --test src/http/systems-check.pg.test.mjs
 *
 * Uses a 1990 morning so it cannot collide with a real one (upsert, re-runnable).
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { createSession } from "../auth/session.mjs";
import { resolveDefaultOrg } from "../auth/org.mjs";
import { saveScorecard } from "../pulse/scorecard.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const DATE = "1990-06-01";

describe("GET /api/read/systems-check", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let handler, ownerToken, closerToken;

  const call = async (path, token) => {
    const headers = { host: "x" };
    if (token) headers.authorization = "Bearer " + token;
    const r = await handler(new Request("https://x" + path, { headers }), {});
    let body = null;
    try { body = JSON.parse(await r.text()); } catch { /* not json */ }
    return { status: r.status, body };
  };

  before(async () => {
    ({ default: handler } = await import("../../netlify/functions/api.mjs"));
    const org = await resolveDefaultOrg(db);
    const staffOf = async (role) => (await db.query(
      `SELECT id, org_id FROM staff WHERE org_id = $1 AND role = $2 LIMIT 1`, [org, role])).rows[0];
    const owner = await staffOf("owner");
    const closer = await staffOf("closer");
    assert.ok(owner && closer, "the default org has an owner and a closer (seeded)");
    ownerToken = (await createSession(db, { staffId: owner.id, orgId: owner.org_id })).token;
    closerToken = (await createSession(db, { staffId: closer.id, orgId: closer.org_id })).token;
    await saveScorecard(db, {
      date: DATE,
      ran_at: "1990-06-01T13:00:00.000Z",
      checks: [
        { id: "health", group: "backend", status: "green", proof: "strict health answered 200" },
        { id: "job:message-dispatch-sweeper", group: "jobs", status: "red", proof: "last run 3 h ago",
          customer_sees: "texts are late", since: "1990-05-31", day_count: 2, fix: "read the last run" },
        { id: "mac-repo", group: "mac", status: "not_checked", reason: "plan only" }
      ]
    });
  });

  after(async () => { await close(); });

  test("owner reads one morning in the contract shape", async () => {
    const r = await call(`/api/read/systems-check?date=${DATE}`, ownerToken);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(r.body.date, DATE);
    assert.equal(r.body.green_count, 1);
    assert.equal(r.body.red_count, 1);
    assert.equal(r.body.not_checked_count, 1);
    const red = r.body.checks.find((c) => c.status === "red");
    assert.equal(red.day_count, 2);
    assert.equal(red.since, "1990-05-31");
    assert.ok(red.customer_sees && red.fix && red.proof);
  });

  test("no date returns the newest morning", async () => {
    const r = await call(`/api/read/systems-check`, ownerToken);
    assert.equal(r.status, 200);
    assert.match(r.body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.body.date >= DATE);
  });

  test("a bad date is 400, a morning with no row is 404", async () => {
    assert.equal((await call(`/api/read/systems-check?date=yesterday`, ownerToken)).status, 400);
    assert.equal((await call(`/api/read/systems-check?date=1990-06-02`, ownerToken)).status, 404);
  });

  test("a closer is refused, and no session is 401", async () => {
    assert.equal((await call(`/api/read/systems-check?date=${DATE}`, closerToken)).status, 403);
    const anon = await call(`/api/read/systems-check?date=${DATE}`, null);
    assert.equal(anon.status, 401);
    assert.equal(anon.body.ok, false, "the app's own refusal — what the tightened pulse ping expects");
  });
});
