// The video drop-off parser — Meta's action arrays turned into one number.
//
// THIS FILE NEEDS NO DATABASE AND IT RUNS ON THIS MACHINE. That is the point of
// it: the shape it checks is the shape that decides whether the seven columns
// added by db/migrations/378_ad_video_metrics.sql ever hold anything. Getting it
// wrong stores NULL forever and looks exactly like "Meta has no data".
//
// The shape being asserted is Meta's documented one for the *_watched_actions
// insights fields: a LIST of objects, each { action_type, value }, with value a
// STRING. Nothing in this repository had ever handled one before, and there is
// no recorded response from a real ad account to check against — the fixtures
// below are written from Meta's documentation, not from an observed call.

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  watchedActionCount,
  videoMetrics,
  normalizeInsight,
  VIDEO_INSIGHT_FIELDS,
  VIDEO_INSIGHT_REQUEST_FIELDS
} from "./meta.mjs";

/* One field as Meta sends it. */
const views = (n) => [{ action_type: "video_view", value: String(n) }];

describe("watchedActionCount — one Meta action array, one number", () => {
  test("the documented shape gives the number inside it", () => {
    assert.strictEqual(watchedActionCount(views(1234)), 1234);
  });

  test("the value is a STRING and is still read as a number", () => {
    const out = watchedActionCount([{ action_type: "video_view", value: "7" }]);
    assert.strictEqual(out, 7, "a string value was not converted");
    assert.strictEqual(typeof out, "number", "the count came back as a string");
  });

  test("a real zero is kept as zero — not turned into 'we do not know'", () => {
    assert.strictEqual(watchedActionCount(views(0)), 0);
  });

  // The rule the whole migration exists for.
  test("a field Meta did not send is null, never 0", () => {
    assert.strictEqual(watchedActionCount(undefined), null);
    assert.strictEqual(watchedActionCount(null), null);
  });

  test("an empty list is null — there is no number in it to store", () => {
    assert.strictEqual(watchedActionCount([]), null);
  });

  test("junk inside the list is skipped rather than stored as 0", () => {
    assert.strictEqual(watchedActionCount([{ action_type: "video_view", value: "" }]), null);
    assert.strictEqual(watchedActionCount([{ action_type: "video_view", value: "abc" }]), null);
    assert.strictEqual(watchedActionCount([null, "nope", 5]), null);
    assert.strictEqual(watchedActionCount([{ action_type: "video_view", value: "-3" }]), null);
  });

  test("a breakdown is not double counted — the total wins, the parts do not add up", () => {
    // With a breakdown Meta returns the parts AND their total in one list.
    // Adding them would count the same people twice, silently.
    const withBreakdown = [
      { action_type: "video_view", action_video_type: "click_to_play", value: "40" },
      { action_type: "video_view", action_video_type: "impressions", value: "60" },
      { action_type: "video_view", action_video_type: "total", value: "100" }
    ];
    assert.strictEqual(watchedActionCount(withBreakdown), 100);
  });

  test("a video_view entry beats another action type in the same list", () => {
    const mixed = [
      { action_type: "post_engagement", value: "9999" },
      { action_type: "video_view", value: "12" }
    ];
    assert.strictEqual(watchedActionCount(mixed), 12);
  });

  test("with no video_view entry at all, the largest other entry is used", () => {
    assert.strictEqual(watchedActionCount([{ action_type: "other", value: "8" }]), 8);
  });

  test("a plain number or numeric string is read rather than thrown away", () => {
    assert.strictEqual(watchedActionCount(42), 42);
    assert.strictEqual(watchedActionCount("42"), 42);
  });

  test("a whole number every time — a fraction is never stored as a decimal", () => {
    assert.strictEqual(watchedActionCount(views("12.9")), 12);
  });
});

describe("videoMetrics — the seven fields, keyed by our column names", () => {
  test("every column comes back, and each carries its own field's number", () => {
    const row = {
      video_3sec_watched_actions: views(1000),
      video_p25_watched_actions: views(400),
      video_p50_watched_actions: views(250),
      video_p75_watched_actions: views(120),
      video_p95_watched_actions: views(70),
      video_p100_watched_actions: views(60),
      video_thruplay_watched_actions: views(310)
    };
    assert.deepStrictEqual(videoMetrics(row), {
      video_3sec_watched: 1000,
      video_p25_watched: 400,
      video_p50_watched: 250,
      video_p75_watched: 120,
      video_p95_watched: 70,
      video_p100_watched: 60,
      video_thruplay_watched: 310
    });
  });

  test("a photo ad — no video fields at all — is seven nulls, not seven zeros", () => {
    const out = videoMetrics({ spend: "10.00", impressions: "500" });
    for (const [, column] of VIDEO_INSIGHT_FIELDS) {
      assert.strictEqual(out[column], null, `${column} was invented as ${out[column]}`);
      assert.notStrictEqual(out[column], 0, `${column} turned "no video" into "nobody watched"`);
    }
  });

  test("one field missing does not blank the others", () => {
    const out = videoMetrics({
      video_3sec_watched_actions: views(500),
      video_p100_watched_actions: views(20)
    });
    assert.strictEqual(out.video_3sec_watched, 500);
    assert.strictEqual(out.video_p100_watched, 20);
    assert.strictEqual(out.video_p50_watched, null);
  });

  test("videoMetrics() with no argument does not throw", () => {
    assert.strictEqual(videoMetrics().video_p75_watched, null);
  });
});

describe("the request list and the parser cannot drift apart", () => {
  test("seven fields are asked for, and they are the seven that are parsed", () => {
    assert.strictEqual(VIDEO_INSIGHT_REQUEST_FIELDS.length, 7);
    assert.deepStrictEqual(
      [...VIDEO_INSIGHT_REQUEST_FIELDS],
      VIDEO_INSIGHT_FIELDS.map(([metaField]) => metaField)
    );
  });

  test("the field names are Meta's exact spelling", () => {
    assert.deepStrictEqual([...VIDEO_INSIGHT_REQUEST_FIELDS], [
      "video_3sec_watched_actions",
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
      "video_thruplay_watched_actions"
    ]);
  });
});

describe("normalizeInsight carries the video numbers without disturbing the old ones", () => {
  const row = {
    ad_id: "123",
    date_start: "2026-09-08",
    spend: "12.34",
    impressions: "1000",
    clicks: "25",
    ctr: "2.5",
    actions: [{ action_type: "lead", value: "3" }],
    purchase_roas: [{ value: "1.8" }],
    video_3sec_watched_actions: views(400),
    video_p75_watched_actions: views(90)
  };

  test("money is still integer cents and the counts are unchanged", () => {
    const out = normalizeInsight(row);
    assert.strictEqual(out.spend_cents, 1234, "money stopped being integer cents");
    assert.strictEqual(out.impressions, 1000);
    assert.strictEqual(out.clicks, 25);
    assert.strictEqual(out.conversions, 3);
  });

  test("the video numbers ride along on the same row", () => {
    const out = normalizeInsight(row);
    assert.strictEqual(out.video_3sec_watched, 400);
    assert.strictEqual(out.video_p75_watched, 90);
  });

  test("an insight row with no video fields carries seven nulls", () => {
    const out = normalizeInsight({ spend: "1.00", impressions: "10", date_start: "2026-09-08" });
    for (const [, column] of VIDEO_INSIGHT_FIELDS) {
      assert.strictEqual(out[column], null, `${column} was ${out[column]} instead of null`);
    }
  });

  test("null survives being turned into JSON and back — it does not become 0", () => {
    const out = JSON.parse(JSON.stringify(normalizeInsight({ date_start: "2026-09-08" })));
    assert.strictEqual(out.video_p50_watched, null);
    assert.ok(Object.prototype.hasOwnProperty.call(out, "video_p50_watched"),
      "the key vanished, so a reader cannot tell 'not reported' from 'not asked for'");
  });
});
