// The notification Chris sees, and the two buttons that decide from it.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  buildApprovalNotice,
  publicBaseUrl,
  padAdId,
  runtimeLabel,
  sizeLabel,
  notFourK,
  DECISION_PATH
} from "./approval-notice.mjs";

const TOKEN = `avd_${"a".repeat(32)}_${"b".repeat(64)}`;
const ENV = { PUBLIC_BASE_URL: "https://fundhub.ai" };

const notice = (over = {}) => buildApprovalNotice({
  token: TOKEN, adId: "43", takeNo: 2, videoKind: "ad",
  durationSeconds: 102, width: 1920, height: 1080, env: ENV, ...over
});

describe("the link base", () => {
  test("prefers PUBLIC_BASE_URL, then APP_BASE_URL, then the live site", () => {
    assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: "https://a.test" }), "https://a.test");
    assert.equal(publicBaseUrl({ APP_BASE_URL: "https://b.test" }), "https://b.test");
    assert.equal(publicBaseUrl({}), "https://fundhub.ai");
  });

  test("never doubles the slash", () => {
    assert.equal(publicBaseUrl({ PUBLIC_BASE_URL: "https://a.test///" }), "https://a.test");
  });
});

describe("padAdId", () => {
  test("pads for the folder name and for reading", () => {
    assert.equal(padAdId("43"), "043");
    assert.equal(padAdId(7), "007");
    assert.equal(padAdId("1234"), "1234", "never truncates a number past three digits");
  });

  test("leaves a non-numeric id alone rather than mangling it", () => {
    assert.equal(padAdId("43-hook"), "43-hook");
    assert.equal(padAdId(""), "");
  });

  test("*** THE PADDED FORM NEVER REACHES A LINK ***", () => {
    // fundhub_ad_id() returns TEXT, so utm_content=043 and utm_content=43 are
    // two different ads and one ad's results split in half
    // (286_client_ad_attribution.sql:81-84, plan §4).
    const n = notice({ adId: "43" });
    const everyUrl = [n.click, ...n.actions.map((a) => a.url)].join(" ");
    assert.ok(!everyUrl.includes("043"), "a padded ad number got into a URL");
    // It is fine — and wanted — in the words a person reads.
    assert.match(n.title, /043/);
  });
});

describe("the small readable facts", () => {
  test("runtime reads as minutes and seconds", () => {
    assert.equal(runtimeLabel(102), "1:42");
    assert.equal(runtimeLabel(60), "1:00");
    assert.equal(runtimeLabel(9), "0:09");
  });

  test("an unmeasured runtime is null, never 0:00", () => {
    // A length nobody measured and a one-second video must not read the same.
    assert.equal(runtimeLabel(null), null);
    assert.equal(runtimeLabel(0), null);
    assert.equal(runtimeLabel("banana"), null);
  });

  test("size is width by height, or nothing", () => {
    assert.equal(sizeLabel(1920, 1080), "1920x1080");
    assert.equal(sizeLabel(null, 1080), null);
    assert.equal(sizeLabel(0, 0), null);
  });
});

describe("the 4K law", () => {
  test("a paid ad is never flagged — 1080p is fine for a paid ad", () => {
    assert.equal(notFourK({ videoKind: "ad", height: 1080 }), false);
  });

  test("anything that is not an ad is flagged under 2160", () => {
    assert.equal(notFourK({ videoKind: "not_ad", height: 1080 }), true);
    assert.equal(notFourK({ videoKind: "not_ad", height: 2160 }), false);
  });

  test("an UNMEASURED height is not reported as a failure", () => {
    // Unknown and wrong are different things. Saying "not 4K" about a take
    // nobody measured would teach Chris to ignore the line.
    assert.equal(notFourK({ videoKind: "not_ad", height: null }), false);
    assert.equal(notFourK({ videoKind: "not_ad" }), false);
  });

  test("the warning reaches the words Chris reads", () => {
    const n = notice({ videoKind: "not_ad", height: 1080 });
    assert.match(n.body, /NOT 4K/);
    assert.ok(!notice().body.includes("NOT 4K"), "a paid ad must not carry the warning");
  });
});

describe("the notification", () => {
  test("says which ad and which take, in the title", () => {
    assert.equal(notice().title, "Ad 043 t02 — approve?");
  });

  test("tapping the notification opens the READ-ONLY page", () => {
    const n = notice();
    assert.equal(n.click, `https://fundhub.ai${DECISION_PATH}?t=${TOKEN}`);
  });

  test("*** BOTH DECISION BUTTONS ARE POSTs, NEVER GETs ***", () => {
    /* The load-bearing one. A GET that decided would be fired by every link
       preview, mail prefetcher and URL scanner that touched this notification,
       approving videos nobody watched. */
    const n = notice();
    const decisions = n.actions.filter((a) => a.action === "http");
    assert.equal(decisions.length, 2);
    for (const a of decisions) {
      assert.equal(a.method, "POST", `${a.label} must POST`);
      assert.equal(a.url, `https://fundhub.ai${DECISION_PATH}`);
    }
  });

  test("the two buttons are approve and reject, and carry the token in the BODY", () => {
    // Not the query string: a one-time approval key in a URL is written to
    // every proxy and access log it passes.
    const n = notice();
    const [yes, no] = n.actions;
    assert.equal(yes.label, "Approve");
    assert.equal(no.label, "Reject");
    assert.deepEqual(JSON.parse(yes.body), { token: TOKEN, decision: "approve" });
    assert.deepEqual(JSON.parse(no.body), { token: TOKEN, decision: "reject" });
    assert.ok(!yes.url.includes(TOKEN), "the token must not be in the button URL");
    assert.ok(!no.url.includes(TOKEN));
  });

  test("both buttons clear the notification, so no stale copy is left to tap", () => {
    for (const a of notice().actions.filter((x) => x.action === "http")) {
      assert.equal(a.clear, true);
    }
  });

  test("a Watch button appears only when there is something to watch", () => {
    const withVideo = notice({ videoUrl: "https://cdn.submagic.co/out.mp4" });
    const watch = withVideo.actions.find((a) => a.action === "view");
    assert.equal(watch.url, "https://cdn.submagic.co/out.mp4");

    assert.equal(notice().actions.some((a) => a.action === "view"), false,
      "no URL must mean no button, not a button that fails in his hand");
    assert.equal(
      notice({ videoUrl: "javascript:alert(1)" }).actions.some((a) => a.action === "view"),
      false, "a non-https URL must not become a button");
  });

  test("buzzes a locked phone but is not reserved-for-broken priority", () => {
    assert.equal(notice().priority, 4);
  });

  test("refuses to build without a token or an ad number", () => {
    // Called by a worker, not a request. A notification with no key is a buzz
    // Chris cannot act on — louder to fail than to send something useless.
    assert.throws(() => buildApprovalNotice({ adId: "43", env: ENV }), /token is required/);
    assert.throws(() => buildApprovalNotice({ token: TOKEN, env: ENV }), /ad number is required/);
  });
});
