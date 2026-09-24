// B-roll placement.
//
// Pure: no network, no database, no clock. The tests below are the whole
// contract, because a bad placement is not caught by anything a person looks
// at — the ad renders fine and shows the wrong picture at the wrong moment.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  planBroll, keywordsFromName, normaliseWords,
  BROLL_FOLDERS, MAX_ITEM_SECONDS, DEFAULT_LEAD_IN_SECONDS, DEFAULT_MAX_CLIPS, layoutFor
} from "./broll.mjs";
import { MAX_ITEM_SECONDS as PROVIDER_MAX, buildItems } from "../messaging/providers/submagic.mjs";

/** A one-word-per-half-second transcript, so times are easy to read. */
function words(sentence, { from = 0, step = 0.5 } = {}) {
  return sentence.split(" ").map((w, i) => ({
    word: w, startTime: from + i * step, endTime: from + i * step + step * 0.8
  }));
}

const TAKE = words(
  "most people apply in the wrong order and the bank says no " +
  "we fix the order first then the approval email lands and the portal shows every lender " +
  "your deliverables arrive the same week"
);

describe("tagging", () => {
  test("a clip's file name IS its tags", () => {
    assert.deepEqual(keywordsFromName("approval-email-chase-45k.mp4"), ["approval", "email", "chase", "45k"]);
  });

  test("bare numbers are dropped, so broll-01.mp4 does not fire on the word one", () => {
    assert.deepEqual(keywordsFromName("broll-01.mp4"), ["broll"]);
  });

  test("the Drive folders the matcher reads include the proof folders", () => {
    assert.deepEqual([...BROLL_FOLDERS].sort(), [
      "approvals", "client-wins", "deliverables", "portal",
      "video-testimonials", "written-testimonials"
    ]);
    assert.ok(!BROLL_FOLDERS.includes("old-approvals"),
      "old-approvals is a leftover and must stay out of the matcher");
  });

  /* The order is the priority order — planBroll walks the clips as handed and the
     cursor only moves forward, so whatever comes first takes the early moments.
     Measured 2026-09-23: with approvals first, the 62 approval pictures took every
     slot and the roadmap, the credit report and the bank list never placed. */
  test("the documents Chris names out loud come before the approval pictures", () => {
    const order = [...BROLL_FOLDERS];
    assert.ok(order.indexOf("deliverables") < order.indexOf("approvals"),
      "deliverables must be offered before approvals or the specific documents never place");
    assert.ok(order.indexOf("portal") < order.indexOf("approvals"),
      "portal screens must be offered before approvals for the same reason");
    for (const proof of ["client-wins", "video-testimonials", "written-testimonials"]) {
      assert.ok(order.indexOf("approvals") < order.indexOf(proof),
        proof + " must come after the three original folders");
    }
  });
});

describe("reading Submagic's words", () => {
  test("both field spellings are accepted", () => {
    const out = normaliseWords([
      { word: "a", startTime: 0, endTime: 1 },
      { text: "b", start: 1, end: 2 }
    ]);
    assert.equal(out.length, 2);
  });

  test("a word with no usable times is dropped, never defaulted to zero", () => {
    const out = normaliseWords([{ word: "a" }, { word: "b", startTime: 1, endTime: 2 }]);
    assert.deepEqual(out.map((w) => w.text), ["b"]);
    // Defaulting would stack every untimed clip on the first frame.
  });
});

describe("placement", () => {
  const clips = [
    { id: "c1", name: "approval-email.mp4", userMediaId: "m1" },
    { id: "c2", name: "portal-lenders.mp4", userMediaId: "m2" },
    { id: "c3", name: "deliverables-pack.mp4", userMediaId: "m3" }
  ];

  test("a clip lands where its subject is actually being talked about", () => {
    const { placements } = planBroll({ words: TAKE, clips });
    const approval = placements.find((p) => p.userMediaId === "m1");
    assert.ok(approval, "the approval clip was not placed");
    assert.equal(approval.matchedKeyword, "approval");
    const hit = normaliseWords(TAKE).find((w) => w.text === "approval");
    assert.equal(approval.startTime, hit.start);
  });

  test("NOTHING COVERS THE HOOK", () => {
    const { placements } = planBroll({ words: TAKE, clips, leadInSeconds: 8 });
    assert.ok(placements.every((p) => p.startTime >= 8),
      "the first seconds decide whether anyone watches — a clip there is a cut hook");
  });

  test("clips never overlap, and the gap is kept", () => {
    const { placements } = planBroll({ words: TAKE, clips, minGapSeconds: 4 });
    for (let i = 1; i < placements.length; i += 1) {
      assert.ok(placements[i].startTime >= placements[i - 1].endTime + 4,
        "two clips ran into each other, which Submagic refuses outright");
    }
  });

  test("no clip is longer than the vendor limit, whatever is asked for", () => {
    const { placements } = planBroll({ words: TAKE, clips, clipSeconds: 60 });
    assert.ok(placements.every((p) => p.endTime - p.startTime <= MAX_ITEM_SECONDS));
  });

  test("the limit here equals the limit the provider enforces", () => {
    assert.equal(MAX_ITEM_SECONDS, PROVIDER_MAX,
      "two copies of a vendor limit that can drift is a silent 422 waiting to happen");
  });

  test("what comes out passes the provider's own validation", () => {
    const { placements } = planBroll({ words: TAKE, clips });
    const built = buildItems(placements);
    assert.equal(built.ok, true, built.errors.join("; "));
  });

  test("a clip with no userMediaId is REPORTED, not dropped in silence", () => {
    const { placements, skipped } = planBroll({
      words: TAKE, clips: [{ id: "c9", name: "approval-email.mp4" }]
    });
    assert.equal(placements.length, 0);
    assert.match(skipped[0].why, /userMediaId/);
  });

  test("a clip about something nobody said is reported too", () => {
    const { skipped } = planBroll({
      words: TAKE, clips: [{ id: "c8", name: "helicopter-beach.mp4", userMediaId: "m8" }]
    });
    assert.match(skipped[0].why, /nothing in the take/);
  });

  test("the count is capped so the talking head does not disappear", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: "the-order.mp4", userMediaId: `m${i}` }));
    const { placements } = planBroll({ words: TAKE, clips: many, minGapSeconds: 0, leadInSeconds: 0 });
    assert.ok(placements.length <= DEFAULT_MAX_CLIPS);
  });

  test("no words means no placements and a reason, not a crash", () => {
    const out = planBroll({ words: [], clips });
    assert.deepEqual(out.placements, []);
    assert.match(out.reason, /no word timings/);
  });

  test("the same input twice gives the same answer — a retry cannot reshuffle the ad", () => {
    const a = planBroll({ words: TAKE, clips });
    const b = planBroll({ words: TAKE, clips });
    assert.deepEqual(a.placements, b.placements);
  });

  test("the default lead-in is not zero", () => {
    assert.ok(DEFAULT_LEAD_IN_SECONDS > 0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Video beats a still, and the reason is the face.

   Submagic gives a still only the `cover`, `contain`, `rounded` and `square`
   layouts, and every one of them fills the frame — so Chris is gone for the
   three seconds it is up. A video clip can use `split-35-65` or
   `pip-bottom-right` and keep him on screen next to it. The face is the ad.

   The ordering itself lives in listBrollClips (the Drive provider), because
   that is what decides the order planBroll is handed. This guards the rule the
   ordering exists to serve: offered video first, the video is what places.
   ───────────────────────────────────────────────────────────────────────── */
describe("a moving clip beats a picture of the same thing", () => {
  test("the video placed, the still did not", () => {
    const words = ["today", "your", "roadmap", "is", "ready", "and", "waiting"]
      .map((t, i) => ({ text: t, start: i, end: i + 0.9 }));
    const clips = [
      { name: "roadmap-document.mp4", userMediaId: "video", mimeType: "video/mp4" },
      { name: "roadmap-document.png", userMediaId: "still", mimeType: "image/png" }
    ];
    const plan = planBroll({ words, clips, leadInSeconds: 0 });
    assert.equal(plan.placements.length, 1, "both match the same word, so only the first can place");
    assert.equal(plan.placements[0].userMediaId, "video",
      "offered first, the video must take the slot — a still hides the face for the whole beat");
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   The face stays on screen when the clip is a video.

   Submagic gives a still only frame-filling layouts, so a picture hides Chris
   for its three seconds and nothing can change that. A video clip can sit
   beside him. Measured 2026-09-24 on the first real take: every clip was going
   out `cover`, so the face vanished four times in 67 seconds. This is the rule
   that stops that.
   ───────────────────────────────────────────────────────────────────────── */
describe("a moving clip sits beside the face; a picture fills the frame", () => {
  test("video gets split-35-65, a still gets cover", () => {
    const words = ["your", "roadmap", "and", "your", "funding", "today"]
      .map((t, i) => ({ text: t, start: i * 8, end: i * 8 + 0.9 }));
    const clips = [
      { name: "roadmap-document.mp4", mimeType: "video/mp4", userMediaId: "v" },
      { name: "funding-snapshot.png", mimeType: "image/png", userMediaId: "s" }
    ];
    const plan = planBroll({ words, clips, leadInSeconds: 0 });
    const by = Object.fromEntries(plan.placements.map((p) => [p.userMediaId, p.layout]));
    assert.equal(by.v, "split-35-65", "a video must keep Chris on screen beside it");
    assert.equal(by.s, "cover", "a still can only fill the frame");
  });

  test("a clip with no mime type is judged by its file name", () => {
    assert.equal(layoutFor({ name: "credit-report.mp4" }), "split-35-65");
    assert.equal(layoutFor({ name: "credit-report.jpg" }), "cover");
  });
});
