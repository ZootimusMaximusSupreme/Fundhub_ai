// Reading our ad number off a Meta ad, with no database and no Meta.
// Spec M0 step 5. The database half (the resolver views and Link) is in
// src/http/marketing-ad-numbers.pg.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  normalizeAdNumber,
  adNumberFromUtmContent,
  adNumberFromName,
  landingUrlFromCreative,
  adNumberFromMetaAd
} from "./ad-numbers.mjs";
import { normalizeInsight } from "../adplatforms/meta.mjs";
import { insightsRequestUrl, AD_FIELDS_WITH_CREATIVE, insightWindow, HOURLY_WINDOW_DAYS } from "../../api/campaigns/sync.mjs";

describe("our number is an integer, so 043 and 43 are one ad", () => {
  test("normalizeAdNumber", () => {
    assert.equal(normalizeAdNumber("043"), 43);
    assert.equal(normalizeAdNumber(43), 43);
    assert.equal(normalizeAdNumber(" 7 "), 7);
    assert.equal(normalizeAdNumber("0"), null);
    assert.equal(normalizeAdNumber("1234567890"), null, "ten digits is not ours");
    assert.equal(normalizeAdNumber("43a"), null);
    assert.equal(normalizeAdNumber(null), null);
  });

  test("utm_content: leading digits then an optional slug, same as fundhub_ad_id()", () => {
    assert.equal(adNumberFromUtmContent("43-ringlights"), 43);
    assert.equal(adNumberFromUtmContent("043_x"), 43);
    assert.equal(adNumberFromUtmContent("91"), 91);
    assert.equal(adNumberFromUtmContent("oVid: SLO2"), null, "the live ads' ad name is not a number");
    assert.equal(adNumberFromUtmContent("{{ad.name}}"), null);
    assert.equal(adNumberFromUtmContent("120253626444640264"), null, "a Meta ad id is not ours");
  });

  test("an ad name: the word Ad, then the number", () => {
    assert.equal(adNumberFromName("SLO Ad 93 — Haynes, the call that was never a roadmap"), 93);
    assert.equal(adNumberFromName("Ad 7"), 7);
    assert.equal(adNumberFromName("direct book ad #12 v2"), 12);
    assert.equal(adNumberFromName("oVid: SLO2"), null);
    assert.equal(adNumberFromName("Lead 55"), null, "'lead' is not the word ad");
    assert.equal(adNumberFromName("Ad 2026-10-04 test"), null, "a date is not an ad number");
    assert.equal(adNumberFromName(null), null);
  });
});

describe("the sync reads the number off the Meta ad, link first", () => {
  test("url_tags utm_content wins over the name", () => {
    const out = adNumberFromMetaAd({
      id: "1", name: "SLO Ad 93 — x",
      creative: { url_tags: "utm_source=fb&utm_content=94-alt", object_story_spec: {
        video_data: { call_to_action: { value: { link: "https://apply.fundhub.ai/roadmap" } } } } }
    });
    assert.deepEqual(out, { number: 94, source: "utm", landingUrl: "https://apply.fundhub.ai/roadmap" });
  });

  test("a link with utm_content in it counts as utm", () => {
    const out = adNumberFromMetaAd({ name: "x", creative: { object_story_spec: {
      link_data: { link: "https://apply.fundhub.ai/watch?utm_content=16-phase" } } } });
    assert.equal(out.number, 16);
    assert.equal(out.source, "utm");
  });

  test("Meta's dynamic parameters are not a number; the name is the fallback", () => {
    const out = adNumberFromMetaAd({ name: "SLO Ad 88 — x",
      creative: { url_tags: "utm_content={{ad.name}}&utm_term={{ad.id}}" } });
    assert.deepEqual(out, { number: 88, source: "name", landingUrl: null });
  });

  test("nothing readable → no number, and no guess", () => {
    assert.deepEqual(adNumberFromMetaAd({ name: "oVid: SLO2" }), { number: null, source: null, landingUrl: null });
  });

  test("landing url: only http(s), from the usual creative spots", () => {
    assert.equal(landingUrlFromCreative({ link_url: "https://apply.fundhub.ai/x" }), "https://apply.fundhub.ai/x");
    assert.equal(landingUrlFromCreative({ link_url: "javascript:alert(1)" }), null);
    assert.equal(landingUrlFromCreative(null), null);
  });
});

describe("link clicks and the hourly window", () => {
  test("the insights request asks Meta for inline_link_clicks", () => {
    const url = new URL(insightsRequestUrl({ external_ad_account_id: "act_1" }, { since: "2026-10-01", until: "2026-10-04" }));
    assert.ok(url.searchParams.get("fields").split(",").includes("inline_link_clicks"));
    assert.ok(url.pathname.startsWith("/v26.0/"), `version: ${url.pathname}`);
  });

  test("normalizeInsight keeps link_clicks, and null when Meta did not send it", () => {
    assert.equal(normalizeInsight({ inline_link_clicks: "12", spend: "1.00" }).link_clicks, 12);
    assert.equal(normalizeInsight({ inline_link_clicks: "0" }).link_clicks, 0);
    assert.equal(normalizeInsight({ spend: "1.00" }).link_clicks, null);
  });

  test("the ads list asks for the creative's link fields", () => {
    assert.ok(AD_FIELDS_WITH_CREATIVE.includes("creative{url_tags,link_url,object_story_spec}"));
  });

  test("the hourly window is 3 days", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    assert.deepEqual(insightWindow(now, HOURLY_WINDOW_DAYS), { since: "2026-10-02", until: "2026-10-05" });
  });
});
