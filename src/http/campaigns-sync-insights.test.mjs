// How /api/campaigns/sync pulls the numbers, and what it says when a run died.
//
// THIS FILE NEEDS NO DATABASE AND DOES RUN. The four functions it checks are
// exported from api/campaigns/sync.mjs with no database in them, so the two
// breaks below can be pinned without Postgres. The end-to-end proof — the whole
// pull driven against a fake Meta, writing real rows — lives in
// campaigns-video-metrics.pg.test.mjs and needs DATABASE_URL, so it has never
// run on this machine.
//
// Lives under src/ deliberately: npm test's glob is "src/**" and "scripts/**",
// so a test placed under api/ silently never runs (CLAUDE.md §12).
//
// ── THE TWO BREAKS THIS PINS ────────────────────────────────────────────────
//
// 1. ONE CALL PER AD. The numbers used to be pulled with a separate request to
//    Meta for every single ad. Four hundred ads meant four hundred requests one
//    after another inside one page load, which does not finish before the
//    server gives up. Meta's insights endpoint takes a `level` setting, so
//    asking the AD ACCOUNT for `level=ad` brings back a row per ad in one
//    answer. The rows are matched back to each ad by the `ad_id` Meta puts on
//    every row.
//
// 2. SAYING "ok" AFTER THE RUN DIED. The answer used to be ok:true with counts
//    even when the writing had already failed and nothing had been saved. Chris
//    would then go looking for data that was never there. Now a run that lost
//    anything says so, and says what it did manage to save.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  insightsRequestUrl,
  fetchInsightPages,
  groupInsightsByAd,
  insightWindow,
  buildSyncResponse,
  INSIGHT_WINDOW_DAYS
} from "../../api/campaigns/sync.mjs";

const connection = { external_ad_account_id: "act_1234567890" };

/* A fake Meta. Answers the shape callPlatform reads: ok + text()
   (src/adplatforms/_api.mjs:22-39). */
const replyWith = (pages) => {
  const seen = [];
  let i = 0;
  const fetchImpl = async (url) => {
    seen.push(String(url));
    const body = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, seen };
};

// ── 1. one call, at the account, keyed by ad ────────────────────────────────

describe("the insights request", () => {
  test("asks the ad account, not one ad", () => {
    const url = insightsRequestUrl(connection, { since: "2026-09-01", until: "2026-09-08" });
    assert.ok(url.includes("/act_1234567890/insights?"),
      `the request went to ${url} — it must be the ad account`);
  });

  test("asks for level=ad, which is what makes one call enough", () => {
    const url = decodeURIComponent(
      insightsRequestUrl(connection, { since: "2026-09-01", until: "2026-09-08" })
    );
    assert.ok(url.includes("level=ad"),
      "without level=ad Meta answers with one lump for the account and every ad looks identical");
  });

  test("asks for ad_id, or the rows cannot be tied back to an ad", () => {
    const url = decodeURIComponent(
      insightsRequestUrl(connection, { since: "2026-09-01", until: "2026-09-08" })
    );
    assert.ok(/(^|[?&,])ad_id(,|&|$)/.test(url) || url.includes("fields=ad_id"),
      "ad_id is not in the field list");
  });

  test("keeps the same date window and one row per day", () => {
    const url = decodeURIComponent(
      insightsRequestUrl(connection, { since: "2026-09-01", until: "2026-09-08" })
    );
    assert.ok(url.includes('"since":"2026-09-01"'), "the start of the window moved");
    assert.ok(url.includes('"until":"2026-09-08"'), "the end of the window moved");
    assert.ok(url.includes("time_increment=1"), "the day-by-day breakdown was lost");
  });

  test("the window is still the last seven days", () => {
    const { since, until } = insightWindow(Date.UTC(2026, 8, 9));
    assert.equal(until, "2026-09-09");
    assert.equal(since, "2026-09-02");
    assert.equal(INSIGHT_WINDOW_DAYS, 7);
  });

  /* An account with hundreds of ads used to mean hundreds of requests. */
  test("one ad account is one request when Meta sends no next page", async () => {
    const { fetchImpl, seen } = replyWith([
      { data: [{ ad_id: "a1" }, { ad_id: "a2" }, { ad_id: "a3" }] }
    ]);
    const out = await fetchInsightPages({
      url: insightsRequestUrl(connection, { since: "2026-09-01", until: "2026-09-08" }),
      token: "t",
      ctx: { fetch: fetchImpl }
    });
    assert.equal(seen.length, 1, `Meta was called ${seen.length} times for one account`);
    assert.equal(out.rows.length, 3);
    assert.equal(out.truncated, false);
  });
});

describe("paging through the numbers", () => {
  test("follows Meta's next link and keeps every page", async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      const body = call === 1
        ? { data: [{ ad_id: "a1" }], paging: { next: "https://graph.facebook.com/page2" } }
        : { data: [{ ad_id: "a2" }] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
    const out = await fetchInsightPages({ url: "https://graph.facebook.com/page1", token: "t", ctx: { fetch: fetchImpl } });
    assert.equal(out.rows.length, 2, "a page of numbers was lost");
    assert.equal(out.pages, 2);
    assert.equal(out.truncated, false);
  });

  test("stops at the page cap and says it stopped, keeping what it read", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          data: [{ ad_id: `a${n}` }],
          paging: { next: `https://graph.facebook.com/page${n + 1}` }
        })
      };
    };
    const out = await fetchInsightPages({
      url: "https://graph.facebook.com/page1", token: "t",
      ctx: { fetch: fetchImpl }, maxPages: 3
    });
    assert.equal(out.pages, 3, "the cap did not hold");
    assert.equal(out.rows.length, 3, "the rows already read were thrown away");
    assert.equal(out.truncated, true, "a short pull said it was complete");
  });

  /* A cursor that points back at itself would otherwise never end. */
  test("a page link that loops back on itself does not hang", async () => {
    const fetchImpl = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        data: [{ ad_id: "a1" }],
        paging: { next: "https://graph.facebook.com/same" }
      })
    });
    const out = await fetchInsightPages({
      url: "https://graph.facebook.com/same", token: "t", ctx: { fetch: fetchImpl }
    });
    assert.equal(out.pages, 1);
    assert.equal(out.rows.length, 1);
  });
});

describe("matching the rows back to each ad", () => {
  test("every row lands on the ad Meta named", () => {
    const byAd = groupInsightsByAd([
      { ad_id: "a1", date_start: "2026-09-01" },
      { ad_id: "a1", date_start: "2026-09-02" },
      { ad_id: "a2", date_start: "2026-09-01" }
    ]);
    assert.equal(byAd.get("a1").length, 2);
    assert.equal(byAd.get("a2").length, 1);
    assert.equal(byAd.get("a3"), undefined, "an ad with no numbers was invented");
  });

  test("a row with no ad on it is dropped, never guessed onto another ad", () => {
    const byAd = groupInsightsByAd([{ date_start: "2026-09-01", spend: "9.99" }, { ad_id: "a1" }]);
    assert.equal(byAd.size, 1, "an unlabelled row was attached to something");
    assert.equal(byAd.get("a1").length, 1);
  });

  test("a number for an ad id survives being a number", () => {
    const byAd = groupInsightsByAd([{ ad_id: 123456 }]);
    assert.equal(byAd.get("123456").length, 1, "a numeric ad id did not match");
  });
});

// ── 2. the answer never claims what was not saved ───────────────────────────

const stats = (over = {}) => ({
  connections: 1, campaigns: 0, ad_sets: 0, ads: 0, insights: 0, errors: [], ...over
});

describe("what the run says when it is over", () => {
  test("everything saved — ok, with the counts", () => {
    const { status, body } = buildSyncResponse({
      stats: stats({ campaigns: 2, ad_sets: 3, ads: 9, insights: 63 }),
      missingApp: true
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.partial, false);
    assert.match(body.message, /^Pulled in 2 campaigns, 3 ad sets, 9 ads and 63 days of numbers\./);
  });

  /* THE ONE THAT MATTERS. This used to answer ok:true with counts. */
  test("something failed — the answer is not ok, and says what did save", () => {
    const { status, body } = buildSyncResponse({
      stats: stats({
        campaigns: 1, ad_sets: 1, ads: 4, insights: 28,
        errors: [{ campaign: "23849", error: "column does not exist" }]
      }),
      missingApp: false
    });
    assert.equal(body.ok, false, "a run that lost a campaign still said ok");
    assert.equal(body.partial, true);
    assert.equal(status, 200, "a run that saved most of its work is not a server failure");
    assert.match(body.message, /Saved 1 campaign, 1 ad set, 4 ads and 28 days of numbers, then stopped\./);
    assert.match(body.message, /1 part did not save/);
    assert.match(body.message, /campaign 23849 — column does not exist/);
    assert.equal(body.campaigns, 1, "the counts stopped matching what was saved");
  });

  test("nothing saved at all — not ok, and it does not pretend otherwise", () => {
    const { status, body } = buildSyncResponse({
      stats: stats({ errors: [{ connection: "c-1", error: "platform 500: try later" }] }),
      missingApp: false
    });
    assert.equal(body.ok, false);
    assert.equal(body.partial, false);
    assert.equal(status, 502);
    assert.match(body.message, /^Nothing was saved\./);
    assert.match(body.message, /ad account link c-1 — platform 500: try later/);
  });

  test("the counts in the answer are the counts that were passed in", () => {
    const { body } = buildSyncResponse({
      stats: stats({ campaigns: 5, ad_sets: 11, ads: 40, insights: 280 }),
      missingApp: false
    });
    assert.equal(body.campaigns, 5);
    assert.equal(body.ad_sets, 11);
    assert.equal(body.ads, 40);
    assert.equal(body.insights, 280);
    assert.deepEqual(body.errors, []);
  });
});
