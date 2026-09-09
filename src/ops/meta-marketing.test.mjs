import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  specialAdCategoryRule,
  costPerBooked,
  watchRate,
  marketingSnapshot
} from "./meta-marketing.mjs";
import { MIN_N_RATE } from "./discoveries.mjs";

describe("specialAdCategoryRule", () => {
  it("is mandatory and fail-closed", () => {
    const rule = specialAdCategoryRule();
    assert.equal(rule.required, true);
    assert.equal(rule.fail_closed, true);
    assert.equal(rule.source, "ad_platform_category_map");
  });
});

describe("costPerBooked", () => {
  it("is INSUFFICIENT when booked n is under 10", () => {
    const out = costPerBooked({ spendCents: 100000, bookedN: MIN_N_RATE - 1 });
    assert.equal(out.status, "INSUFFICIENT");
    assert.equal(out.cost_cents, null);
    assert.equal(out.n, 9);
    assert.match(out.note, /Do not invent/);
  });

  it("computes spend per booked call when n is 10 or more", () => {
    const out = costPerBooked({ spendCents: 100000, bookedN: MIN_N_RATE });
    assert.equal(out.status, "MEASURED");
    assert.equal(out.cost_cents, 10000);
    assert.equal(out.n, 10);
  });

  it("does not invent a cost when spend is missing", () => {
    const out = costPerBooked({ spendCents: null, bookedN: 12 });
    assert.equal(out.status, "INSUFFICIENT");
    assert.equal(out.cost_cents, null);
  });
});

/* watchRate is hook rate AND hold rate. One function, because a rate defined
   twice is how two screens end up giving two answers to one question — see the
   header of db/migrations/378_ad_video_metrics.sql. */
describe("watchRate", () => {
  it("divides when there is enough to divide by", () => {
    // hook rate: 320 people got past 3 seconds out of 1000 impressions.
    const out = watchRate({ numerator: 320, denominator: 1000 });
    assert.equal(out.status, "MEASURED");
    assert.equal(out.rate, 0.32);
    assert.equal(out.n, 1000);
  });

  it("gives back a plain fraction, rounded, not a percent string", () => {
    const out = watchRate({ numerator: 1000, denominator: 3000 });
    assert.equal(typeof out.rate, "number");
    assert.equal(out.rate, 0.3333, "the rate was not rounded, so a screen would print 0.3333333333333333");
  });

  it("is null when the top is unknown — a photo ad has no video views at all", () => {
    // THE HEADLINE CLAIM, and the whole reason 378's columns are nullable.
    for (const missing of [null, undefined, ""]) {
      const out = watchRate({ numerator: missing, denominator: 1000 });
      assert.equal(out.rate, null, `a missing numerator produced ${out.rate} instead of null`);
      assert.equal(out.status, "INSUFFICIENT");
      assert.match(out.note, /photo ad/);
    }
  });

  it("is null when the bottom is unknown", () => {
    const out = watchRate({ numerator: 320, denominator: null });
    assert.equal(out.rate, null);
    assert.equal(out.status, "INSUFFICIENT");
  });

  it("is null when the bottom is zero, rather than dividing by it", () => {
    const out = watchRate({ numerator: 0, denominator: 0 });
    assert.equal(out.rate, null, "a zero denominator produced a number");
    assert.equal(out.n, 0);
    assert.match(out.note, /Nothing to divide by/);
  });

  it("refuses a tiny sample under the SAME threshold costPerBooked uses", () => {
    // MIN_N_RATE is not restated here on purpose — this asserts the one rule is
    // reached, not what its value happens to be.
    const out = watchRate({ numerator: 4, denominator: MIN_N_RATE - 1 });
    assert.equal(out.status, "INSUFFICIENT");
    assert.equal(out.rate, null, "a rate was computed off a sample too small to mean anything");
    assert.equal(out.n, MIN_N_RATE - 1);

    const enough = watchRate({ numerator: 4, denominator: MIN_N_RATE });
    assert.equal(enough.status, "MEASURED", "the threshold is exclusive where costPerBooked's is inclusive");
  });

  it("keeps a real zero as a real zero", () => {
    // A video ad nobody watched past 3 seconds has a hook rate of 0. That is a
    // measurement, not a missing value, and it must not be hidden.
    const out = watchRate({ numerator: 0, denominator: 1000 });
    assert.equal(out.status, "MEASURED");
    assert.equal(out.rate, 0);
  });

  it("does not clamp a rate above 1, because Meta restates its own counts", () => {
    const out = watchRate({ numerator: 120, denominator: 100 });
    assert.equal(out.status, "MEASURED");
    assert.equal(out.rate, 1.2);
  });

  it("refuses nonsense instead of returning NaN", () => {
    for (const bad of ["banana", -5, Infinity]) {
      assert.equal(watchRate({ numerator: bad, denominator: 1000 }).rate, null);
      assert.equal(watchRate({ numerator: 10, denominator: bad }).rate, null);
    }
  });
});

describe("marketingSnapshot", () => {
  it("carries spend, cost per booked, and the category rule", () => {
    const out = marketingSnapshot({
      ads: { status: "ok", spend_cents: 50000 },
      bookedN: 10
    });
    assert.equal(out.spend_cents, 50000);
    assert.equal(out.spend_status, "ok");
    assert.equal(out.cost_per_booked.status, "MEASURED");
    assert.equal(out.special_ad_category.required, true);
    assert.match(out.note, /does not buy/);
  });

  it("does not export a campaign write", async () => {
    const mod = await import("./meta-marketing.mjs");
    assert.equal(mod.createCampaign, undefined);
    assert.equal(mod.pauseAd, undefined);
  });
});
