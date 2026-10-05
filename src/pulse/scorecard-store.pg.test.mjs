/* The stored morning scorecard against a real Postgres (MB2, 2026-10-05).
 *
 * Pinned:
 *   1. One row per morning; a re-run the same morning replaces it.
 *   2. The headline counts must equal the checks list (430's CHECK).
 *   3. Day 2: a live pulse run reads yesterday's stored row and carries since.
 *   4. The app may not delete a morning (430's REVOKE).
 *
 * Uses mornings in 1990 so it cannot collide with a real morning's row, and
 * re-runs are idempotent (upsert). The app role cannot delete rows, so they
 * stay behind in a scratch database by design.
 *
 * SKIPS WITHOUT A DATABASE, LOUDLY:
 *   DATABASE_URL=postgres://… node --test src/pulse/scorecard-store.pg.test.mjs
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, close } from "../db.mjs";
import { saveScorecard, loadPreviousScorecard, readScorecard } from "./scorecard.mjs";
import { runDailyPulse } from "./daily-pulse.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("stored scorecard", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  after(async () => { await close(); });

  test("one row per morning; a re-run replaces it", async () => {
    const card = (status) => ({
      date: "1990-01-01",
      ran_at: "1990-01-01T13:00:00.000Z",
      checks: [{ id: "x", group: "backend", status, ...(status === "green" ? { proof: "ok" } : { reason: "none" }) }]
    });
    await saveScorecard(db, card("not_checked"));
    await saveScorecard(db, card("green"));
    const { rows } = await db.query(
      `SELECT green_count, not_checked_count, checks FROM pulse_scorecards WHERE scorecard_date = '1990-01-01'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].green_count, 1);
    assert.equal(rows[0].not_checked_count, 0);
  });

  test("a headline that disagrees with its own list is refused", async () => {
    // One not_checked check counted as one green: same total, wrong words.
    await assert.rejects(db.query(
      `INSERT INTO pulse_scorecards (scorecard_date, checks, green_count, red_count, not_checked_count)
       VALUES ('1990-01-02', '[{"id":"a","status":"not_checked"}]'::jsonb, 1, 0, 0)`),
      /pulse_scorecards_counts_match/);
    await assert.rejects(db.query(
      `INSERT INTO pulse_scorecards (scorecard_date, checks, green_count, red_count, not_checked_count)
       VALUES ('1990-01-02', '[{"id":"a","status":"skipped"}]'::jsonb, 0, 0, 0)`),
      /pulse_scorecards_counts_match/, "a status outside the three words is refused");
  });

  test("a live run reads yesterday's row: the same red says day 2", async () => {
    await saveScorecard(db, {
      date: "1990-03-01",
      ran_at: "1990-03-01T13:00:00.000Z",
      checks: [{ id: "mac-repo", group: "mac", status: "red", proof: "p", since: "1990-02-28", day_count: 2, fix: "f", customer_sees: "c" }]
    });
    // Force the same check red today by handing a probe that reports it red.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
    const result = await runDailyPulse({
      dryRun: false,
      now: new Date("1990-03-02T13:00:00Z"),
      fetchImpl: async () => ({ status: 503, text: async () => "down" }),
      boardDir: tmp,
      db,
      env: {},
      recordRun: false,
      probesImpl: async () => [{ id: "svc-test", group: "outside", status: "FAIL", detail: "refused", suggestedFix: "fix" }]
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    assert.equal(result.stored.saved, true);
    assert.equal(result.sms.sent, false, "no number in env — nothing is texted");

    const prev = await loadPreviousScorecard(db, "1990-03-02");
    assert.equal(prev.date, "1990-03-01");
    const [stored] = await readScorecard(db, "1990-03-02");
    assert.equal(stored.date, "1990-03-02");
    const health = stored.checks.find((c) => c.id === "health");
    assert.equal(health.status, "red");
    assert.equal(health.day_count, 1, "first red morning for health");
    assert.ok(health.customer_sees && health.fix);
    // mac-repo is not_checked today (plan only), so its red streak does not continue.
    assert.equal(stored.checks.find((c) => c.id === "mac-repo").status, "not_checked");
    assert.equal(stored.red_count + stored.green_count + stored.not_checked_count, stored.checks.length);

    // Run again the next morning: health is red two mornings running → day 2.
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
    const next = await runDailyPulse({
      dryRun: false,
      now: new Date("1990-03-03T13:00:00Z"),
      fetchImpl: async () => ({ status: 503, text: async () => "down" }),
      boardDir: tmp2,
      db,
      env: {},
      recordRun: false,
      probesImpl: async () => []
    });
    fs.rmSync(tmp2, { recursive: true, force: true });
    const h2 = next.scorecard.checks.find((c) => c.id === "health");
    assert.equal(h2.since, "1990-03-02");
    assert.equal(h2.day_count, 2);
  });

  test("the app may update a morning but never delete one", async () => {
    const { rows } = await db.query(
      `SELECT has_table_privilege('fundhub_app', 'pulse_scorecards', 'UPDATE') AS upd,
              has_table_privilege('fundhub_app', 'pulse_scorecards', 'DELETE') AS del`);
    assert.deepEqual(rows[0], { upd: true, del: false });
  });
});
