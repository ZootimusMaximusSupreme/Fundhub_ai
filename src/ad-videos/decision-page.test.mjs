// The throwaway screen. What matters here is that nothing it is handed can
// become script in Chris's browser.

import { test, describe } from "node:test";
import assert from "node:assert";

import { renderDecisionPage, renderGonePage, safeVideoUrl } from "./decision-page.mjs";

const TOKEN = `avd_${"a".repeat(32)}_${"b".repeat(64)}`;

const page = (over = {}) => renderDecisionPage({
  token: TOKEN, adIdPadded: "043", takeNo: 2,
  videoUrl: "https://cdn.submagic.test/043_t02.mp4",
  facts: [["Ad number", "043"], ["Take", 2]],
  ...over
});

describe("safeVideoUrl — the one attacker-shaped value on the page", () => {
  test("keeps an https URL", () => {
    assert.equal(safeVideoUrl("https://cdn.submagic.test/a.mp4"), "https://cdn.submagic.test/a.mp4");
  });

  test("*** DROPS javascript: AND data: ***", () => {
    // This value comes back from Submagic. A vendor response must never be
    // able to put script in a src attribute.
    assert.equal(safeVideoUrl("javascript:alert(1)"), null);
    assert.equal(safeVideoUrl("JavaScript:alert(1)"), null);
    assert.equal(safeVideoUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(safeVideoUrl("vbscript:msgbox(1)"), null);
  });

  test("drops http, relative paths and junk", () => {
    assert.equal(safeVideoUrl("http://cdn.test/a.mp4"), null);
    assert.equal(safeVideoUrl("/local/a.mp4"), null);
    assert.equal(safeVideoUrl(""), null);
    assert.equal(safeVideoUrl(null), null);
    assert.equal(safeVideoUrl("not a url"), null);
  });

  test("drops something absurdly long rather than rendering it", () => {
    assert.equal(safeVideoUrl(`https://a.test/${"x".repeat(3000)}`), null);
  });
});

describe("escaping", () => {
  test("a fact carrying markup comes out as text, not as tags", () => {
    const html = page({ facts: [["Kind", '<img src=x onerror="alert(1)">']] });
    assert.ok(!html.includes("<img"), "markup survived into the page");
    assert.ok(html.includes("&lt;img"));
  });

  test("a fact LABEL is escaped too, not just its value", () => {
    const html = page({ facts: [['<script>x</script>', "ok"]] });
    assert.ok(!html.includes("<script>x</script>"));
  });

  test("a quote in a value cannot break out of an attribute", () => {
    const html = page({ adIdPadded: '043" onload="alert(1)' });
    assert.ok(!html.includes('onload="alert(1)"'));
    assert.ok(html.includes("&quot;"));
  });

  test("the warning line is escaped", () => {
    const html = page({ warn: "<b>not 4K</b>" });
    assert.ok(!html.includes("<b>not 4K</b>"));
  });

  test("a hostile video URL never reaches a src attribute", () => {
    const html = page({ videoUrl: 'javascript:alert(1)' });
    assert.ok(!html.includes("javascript:"));
    assert.ok(!html.includes("<video"), "no player at all is the right answer");
    assert.match(html, /not linkable from here/);
  });
});

describe("the page itself", () => {
  test("has both buttons and the token the page posts back", () => {
    const html = page();
    assert.match(html, /id="yes"/);
    assert.match(html, /id="no"/);
    assert.ok(html.includes(JSON.stringify(TOKEN)));
  });

  test("the page posts; it never navigates to decide", () => {
    const html = page();
    assert.match(html, /method:\s*"POST"/);
    assert.ok(!/<form/i.test(html), "a form could be submitted as a GET");
  });

  test("tells search engines and referrers to keep away", () => {
    // The URL of this page contains a live one-time approval key.
    const html = page();
    assert.match(html, /name="robots" content="noindex/);
    assert.match(html, /name="referrer" content="no-referrer"/);
  });

  test("renders without a player when there is nothing to play", () => {
    const html = page({ videoUrl: null });
    assert.ok(!html.includes("<video"));
    assert.match(html, /Decide from the copy in Drive/);
  });

  test("drops an empty fact rather than showing a blank row", () => {
    const html = page({ facts: [["Runs for", null], ["Picture", ""], ["Take", 2]] });
    assert.ok(!html.includes("Runs for"));
    assert.ok(!html.includes("Picture"));
    assert.ok(html.includes("Take"));
  });
});

describe("the refusal page", () => {
  test("says nothing about any video", () => {
    const html = renderGonePage();
    for (const secret of ["043", "submagic", "take", "approve", "avd_"]) {
      assert.ok(!html.toLowerCase().includes(secret.toLowerCase()), `leaked "${secret}"`);
    }
  });

  test("is identical however it is reached, when the default message is used", () => {
    assert.equal(renderGonePage(), renderGonePage());
  });

  test("escapes a message it is given", () => {
    assert.ok(!renderGonePage("<script>x</script>").includes("<script>x</script>"));
  });
});
