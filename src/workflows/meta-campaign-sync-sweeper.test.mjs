// The Meta ad-numbers sweeper — that it is registered, and that one bad
// partner cannot end the pass.
//
// NO DATABASE AND NO META IN HERE. sweep() takes its partner list and its sync
// function as arguments, so every case below is driven with plain functions.
// The database-backed proof — that DUE_PARTNERS_SQL selects the right rows —
// belongs in a .pg.test.mjs and there is no Postgres on this machine to write
// it against; see the task report.

import { test, describe } from "node:test";
import assert from "node:assert";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  sweep,
  SWEEP_CRON,
  SOURCE_WORKFLOW,
  DUE_PARTNERS_SQL,
  PASSES,
  passFor,
  metaCampaignSyncSweeper
} from "./meta-campaign-sync-sweeper.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { INSIGHT_WINDOW_DAYS } from "../../api/campaigns/sync.mjs";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

const clean = (over = {}) => ({
  connections: 1, campaigns: 2, ad_sets: 3, ads: 4, insights: 5, errors: [], ...over
});

/* ── THE POINT OF THE WHOLE FILE ─────────────────────────────────────────── */

describe("the pull runs on a clock, not only when somebody presses a button", () => {
  /* THE REGRESSION THIS GUARDS. Nothing in this repo ever ran
     api/campaigns/sync.mjs on a schedule. Miss eight days and, with the old
     seven-day window, day eight was gone for good — and a missing day is drawn
     as zero spend, so it looked like the money was never spent. */
  /* Since 2026-10-05 (spec M0 step 5) the clock is a Netlify scheduled function,
     not an Inngest cron: hourly 3 days plus a nightly 28 does not fit the 26 s
     /api/inngest gets. The schedule lives in netlify.toml. */
  test("netlify.toml puts the Meta pull on an hourly clock", () => {
    const toml = readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
    const m = /\[functions\."meta-sync-sweeper"\]\s*\n\s*schedule\s*=\s*"([^"]+)"/.exec(toml);
    assert.ok(m, "meta-sync-sweeper has no schedule — the pull is back to button-only");
    assert.equal(m[1], SWEEP_CRON, "netlify.toml and SWEEP_CRON disagree");
    assert.equal(SWEEP_CRON, "17 * * * *", "every hour");
  });

  test("the sweeper is not also an Inngest cron, so no pass runs twice", async () => {
    const { functions } = await import("./index.mjs");
    const ids = functions.map((fn) => fn.id());
    assert.ok(!ids.includes("meta-campaign-sync-sweeper"),
      "the Meta sync is registered on Inngest again — every pass would run twice, " +
      "and the Inngest one is killed at 26 seconds");
  });

  test("the 07:00 UTC hour is the nightly 28-day pass; every other hour reads 3 days", () => {
    assert.equal(passFor(new Date("2026-10-05T07:17:00Z")), "nightly");
    assert.equal(passFor(new Date("2026-10-05T08:17:00Z")), "hourly");
    assert.equal(passFor(new Date("2026-10-05T06:59:59Z")), "hourly");
    assert.deepEqual({ ...PASSES }, { hourly: 3, nightly: 28 });
  });

  test("the window it is asked for reaches the sync", async () => {
    const seen = [];
    await sweep({
      listPartners: async () => [A],
      sync: async ({ windowDays }) => { seen.push(windowDays); return clean(); },
      windowDays: 3
    });
    assert.deepEqual(seen, [3]);
  });

  test("the id the registry sees is the id this file exports", () => {
    assert.equal(metaCampaignSyncSweeper.opts.id, "meta-campaign-sync-sweeper");
    assert.equal(SOURCE_WORKFLOW, "meta-campaign-sync-sweeper");
  });

  /* A schedule alone still loses days if the window is too short: the clock and
     the 28-day reach are one fix in two halves. */
  test("the window it pulls is long enough to catch up a missed week", () => {
    assert.ok(INSIGHT_WINDOW_DAYS >= 28,
      `the pull only reaches back ${INSIGHT_WINDOW_DAYS} days — a pass that is missed for ` +
      "longer than that loses those days permanently");
  });
});

/* ── ONE BROKEN PARTNER MUST NOT END THE PASS ────────────────────────────── */

describe("one partner's broken connection never stops the others", () => {
  test("a partner that throws is recorded, and the rest still sync", async () => {
    const tried = [];
    const out = await sweep({
      listPartners: async () => [A, B, C],
      sync: async ({ partnerId }) => {
        tried.push(partnerId);
        if (partnerId === B) throw new Error("Meta says: (#190) invalid token");
        return clean();
      }
    });

    assert.deepEqual(tried, [A, B, C], "the loop stopped at the broken partner");
    assert.equal(out.ok, true);
    assert.equal(out.partners, 3);
    assert.equal(out.synced, 2);
    assert.equal(out.errored.length, 1);
    assert.equal(out.errored[0].partner_id, B);
    assert.match(out.errored[0].error, /invalid token/);
  });

  test("the whole pass never throws, whatever one partner does", async () => {
    const out = await sweep({
      listPartners: async () => [A],
      sync: async () => { throw new Error("boom"); }
    });
    assert.equal(out.ok, true, "a partner-level failure is not a failure of the pass");
    assert.equal(out.synced, 0);
    assert.equal(out.errored.length, 1);
  });

  test("a connection that cannot be used yet is a skip with a reason, not an error", async () => {
    const notReady = new Error("This Meta connection has no ad account number yet.");
    notReady.code = "NO_CONNECTION";
    const out = await sweep({
      listPartners: async () => [A, B],
      sync: async ({ partnerId }) => {
        if (partnerId === A) throw notReady;
        return clean();
      }
    });
    assert.equal(out.errored.length, 0, "a not-ready connection is not a fault of the pass");
    assert.equal(out.skipped.length, 1);
    assert.equal(out.skipped[0].partner_id, A);
    assert.match(out.skipped[0].reason, /no ad account number/);
    assert.equal(out.synced, 1);
  });
});

/* ── IT RECORDS WHAT IT DID ──────────────────────────────────────────────── */

describe("the run says what it actually did", () => {
  test("rows written are added up across partners", async () => {
    const out = await sweep({
      listPartners: async () => [A, B],
      sync: async () => clean({ campaigns: 2, ad_sets: 3, ads: 4, insights: 5 })
    });
    assert.equal(out.partners, 2);
    assert.equal(out.synced, 2);
    assert.equal(out.campaigns, 4);
    assert.equal(out.ad_sets, 6);
    assert.equal(out.ads, 8);
    assert.equal(out.days_of_numbers, 10, "days of numbers is the count that says data landed");
    assert.equal(out.window_days, INSIGHT_WINDOW_DAYS);
  });

  /* A partner can save some campaigns and lose others. Rounding that up to
     "synced" is the same class of lie buildSyncResponse() was written to stop. */
  test("a partner that only half-saved is named, not counted as clean", async () => {
    const out = await sweep({
      listPartners: async () => [A],
      sync: async () => clean({ errors: [{ campaign: "c1", error: "column does not exist" }] })
    });
    assert.equal(out.synced, 1, "what committed still committed");
    assert.equal(out.errored.length, 1, "and what failed is still visible");
    assert.equal(out.errored[0].partial, true);
    assert.match(out.errored[0].error, /column does not exist/);
  });

  test("no partners to sync is an honest empty pass", async () => {
    const out = await sweep({ listPartners: async () => [] });
    assert.equal(out.ok, true);
    assert.equal(out.partners, 0);
    assert.equal(out.synced, 0);
  });

  /* "0 partners, all fine" when the lookup itself died would hide the outage. */
  test("failing to even list the partners reports ok:false, not an empty success", async () => {
    const out = await sweep({
      listPartners: async () => { throw new Error("database is down"); }
    });
    assert.equal(out.ok, false);
    assert.equal(out.partners, 0);
    assert.match(out.error, /database is down/);
  });
});

/* ── WHO IT ASKS FOR ─────────────────────────────────────────────────────── */

describe("which connections a pass reaches for", () => {
  test("it asks for Meta connections that are active or waiting on approval", () => {
    assert.match(DUE_PARTNERS_SQL, /platform = 'meta'/);
    assert.match(DUE_PARTNERS_SQL, /connection_state IN \('active', 'pending'\)/);
  });

  /* Rows that cannot work are left out here as well as inside the sync: no
     stored key, and the `pending:biz:<id>` placeholder meta-agency.mjs writes
     when nobody typed an act_ number. Asking Meta about either only produces a
     confusing 400. */
  test("it leaves out connections with no key and placeholder ad accounts", () => {
    assert.match(DUE_PARTNERS_SQL, /encrypted_access_token IS NOT NULL/);
    assert.match(DUE_PARTNERS_SQL, /NOT ILIKE 'pending:%'/);
  });
});
