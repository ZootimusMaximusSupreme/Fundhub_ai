import { test, describe } from "node:test";
import assert from "node:assert";

import {
  planAnimations, resolveAnimations, placeCandidates, retimeAnimations, tokenStream,
  worstAnchorDrift, isDataTied, catalogIndex, FULLFRAME, ANCHOR_TOLERANCE_SECONDS,
} from "./animation-plan.mjs";

const CATALOG = [
  { id: "StepPath", minFrames: 60, maxFrames: 90 },
  { id: "RatesRising", minFrames: 60, maxFrames: 90 },
  { id: "SoftPull", minFrames: 60, maxFrames: 90 },
  { id: "QualifyToday", minFrames: 60, maxFrames: 90 },
  { id: "ProofWall", minFrames: 60, maxFrames: 120 },
  { id: "ProofFloodWide", minFrames: 60, maxFrames: 180 },
];

/** A resolver over a table of phrase -> time, like anchorTime over a cut plan. */
const resolver = (table) => (anchor) => {
  const key = anchor.phrase ?? `${anchor.cue}:${anchor.keyword}`;
  return key in table ? { time: table[key], found: true } : null;
};

const plan = (...items) => items.map(([phrase, template, seconds, props]) => ({ anchor: { phrase }, template, seconds, props }));

describe("resolving anchors", () => {
  test("an item whose line was cut is skipped and flagged", () => {
    const r = planAnimations({
      animationPlan: plan(["kept line", "StepPath", 3], ["cut line", "SoftPull", 3]),
      resolveAnchor: resolver({ "kept line": 10 }),
      catalog: CATALOG, masterSeconds: 60,
    });
    assert.deepStrictEqual(r.items.map((i) => i.template), ["StepPath"]);
    assert.deepStrictEqual(r.skipped, [{ index: 1, template: "SoftPull", reason: "line_cut" }]);
    assert.ok(r.flags.includes("anchor_cut"));
  });

  test("a template not in the catalog is skipped, never rendered", () => {
    const r = planAnimations({
      animationPlan: plan(["a", "Hologram", 3]), resolveAnchor: resolver({ a: 10 }), catalog: CATALOG, masterSeconds: 60,
    });
    assert.strictEqual(r.items.length, 0);
    assert.strictEqual(r.skipped[0].reason, "unknown_template");
    assert.ok(r.flags.includes("no_animation"));
  });

  test("length is clamped to the template's frames and snapped to 1/30 s", () => {
    const { candidates } = resolveAnimations({
      animationPlan: plan(["a", "StepPath", 9], ["b", "StepPath", 0.5], ["c", "StepPath", 2.51]),
      resolveAnchor: resolver({ a: 10, b: 20, c: 30 }), catalog: CATALOG,
    });
    assert.deepStrictEqual(candidates.map((c) => c.seconds), [3, 2, 2.5]);
  });

  test("ProofWall may run 4 s and ProofFlood 6 s in full-frame mode, others stop at 3 s", () => {
    const { candidates } = resolveAnimations({
      animationPlan: plan(["a", "ProofWall", 6], ["b", "ProofFloodWide", 9], ["c", "SoftPull", 6]),
      resolveAnchor: resolver({ a: 10, b: 20, c: 30 }), catalog: CATALOG,
    });
    assert.deepStrictEqual(candidates.map((c) => c.seconds), [4, 6, 3]);
  });

  test("data-tied templates lose any data props the writer sent", () => {
    const { candidates } = resolveAnimations({
      animationPlan: plan(["a", "QualifyToday", 3, { today: 199000 }], ["b", "StepPath", 3, { steps: 3 }]),
      resolveAnchor: resolver({ a: 10, b: 20 }), catalog: CATALOG,
    });
    assert.deepStrictEqual(candidates[0].props, {});
    assert.deepStrictEqual(candidates[1].props, { steps: 3 });
    assert.ok(isDataTied("ApprovalCarouselX") && isDataTied("ProofFloodWide") && !isDataTied("StepPath"));
  });

  test("the catalog may be an object keyed by id", () => {
    assert.strictEqual(catalogIndex({ StepPath: { minFrames: 60, maxFrames: 90 } }).get("StepPath").id, "StepPath");
  });

  test("a bad mode or resolver throws", () => {
    assert.throws(() => resolveAnimations({ animationPlan: [], resolveAnchor: () => null, catalog: CATALOG, mode: "x" }), RangeError);
    assert.throws(() => resolveAnimations({ animationPlan: [], resolveAnchor: null, catalog: CATALOG }), TypeError);
  });
});

describe("full-frame limits", () => {
  const run = (items, table, extra = {}) => planAnimations({
    animationPlan: plan(...items), resolveAnchor: resolver(table), catalog: CATALOG, masterSeconds: 60, ctaStartSeconds: 52, ...extra,
  });

  test("nothing in the first 3 s: a close anchor is nudged to 3 s, a far one is skipped", () => {
    const near = run([["a", "StepPath", 3]], { a: 2.8 });
    assert.strictEqual(near.items[0].start, 3);
    const far = run([["a", "StepPath", 3]], { a: 1 });
    assert.strictEqual(far.items.length, 0);
    assert.strictEqual(far.skipped[0].reason, "lead_in");
  });

  test("4 s of face between clips: a near clip is nudged later, a nearer one is skipped", () => {
    const r = run([["a", "StepPath", 3], ["b", "SoftPull", 3], ["c", "RatesRising", 3]], { a: 10, b: 17.2, c: 20 });
    // a ends at 13, so b may start at 17; 17.2 is already clear. c would start at 20 but b ends at 20.2 + 4.
    assert.deepStrictEqual(r.items.map((i) => i.template), ["StepPath", "SoftPull"]);
    assert.strictEqual(r.skipped[0].reason, "too_close");
    const nudged = run([["a", "StepPath", 3], ["b", "SoftPull", 3]], { a: 10, b: 16.9 });
    assert.strictEqual(nudged.items[1].start, 17);
  });

  test("no clip runs over the CTA: it is shortened to stop there, or skipped", () => {
    const shortened = run([["a", "StepPath", 3]], { a: 49.5 });
    assert.strictEqual(shortened.items[0].end, 52);
    assert.strictEqual(shortened.items[0].frames, 75);
    // 1.5 s left is under the template's 2 s minimum, so it is skipped, not squeezed.
    assert.strictEqual(run([["a", "StepPath", 3]], { a: 50.5 }).skipped[0].reason, "cta");
    const skipped = run([["a", "StepPath", 3]], { a: 51.5 });
    assert.strictEqual(skipped.skipped[0].reason, "cta");
    const inside = run([["a", "StepPath", 3]], { a: 55 });
    assert.strictEqual(inside.skipped[0].reason, "cta");
  });

  test("at most 35% of the runtime: the item latest in the writer's list goes first", () => {
    // 22 s ad: cap is 7.7 s. Three 3 s clips = 9 s.
    const r = planAnimations({
      animationPlan: plan(["a", "StepPath", 3], ["b", "SoftPull", 3], ["c", "RatesRising", 3]),
      resolveAnchor: resolver({ a: 3, b: 10, c: 17 }), catalog: CATALOG, masterSeconds: 22, ctaStartSeconds: 21,
    });
    assert.deepStrictEqual(r.items.map((i) => i.template), ["StepPath", "SoftPull"]);
    assert.deepStrictEqual(r.skipped, [{ index: 2, template: "RatesRising", reason: "over_share" }]);
    const total = r.items.reduce((s, i) => s + i.seconds, 0);
    assert.ok(total <= FULLFRAME.maxShare * 22 + 1e-6);
  });

  test("a lone clip longer than 35% is shortened to the cap, or dropped if it cannot be", () => {
    const shorten = planAnimations({
      animationPlan: plan(["a", "StepPath", 3]), resolveAnchor: resolver({ a: 3 }), catalog: CATALOG, masterSeconds: 8, ctaStartSeconds: 7.9,
    });
    assert.strictEqual(shorten.items[0].seconds, 2.8);
    const drop = planAnimations({
      animationPlan: plan(["a", "StepPath", 3]), resolveAnchor: resolver({ a: 3 }), catalog: CATALOG, masterSeconds: 5, ctaStartSeconds: 4.9,
    });
    assert.strictEqual(drop.items.length, 0);
    assert.ok(drop.flags.includes("no_animation"));
  });

  test("an unknown CTA start is flagged, never guessed", () => {
    const r = run([["a", "StepPath", 3]], { a: 10 }, { ctaStartSeconds: null });
    assert.ok(r.flags.includes("cta_unknown"));
    assert.strictEqual(r.items.length, 1);
  });

  test("every placed item is within 0.3 s of its anchor and on a frame", () => {
    const r = run([["a", "StepPath", 3], ["b", "SoftPull", 3], ["c", "RatesRising", 3]], { a: 2.9, b: 6.5, c: 20.04 });
    assert.ok(worstAnchorDrift(r.items) <= ANCHOR_TOLERANCE_SECONDS + 1e-6);
    for (const i of r.items) assert.ok(Math.abs(i.start * 30 - Math.round(i.start * 30)) < 1e-6);
  });

  test("items come back in time order with plan indexes kept", () => {
    const r = run([["late", "StepPath", 3], ["early", "SoftPull", 3]], { late: 30, early: 10 });
    assert.deepStrictEqual(r.items.map((i) => [i.index, i.start]), [[1, 10], [0, 30]]);
  });

  test("the same input gives the same output", () => {
    const a = run([["a", "StepPath", 3], ["b", "SoftPull", 3]], { a: 10, b: 20 });
    const b = run([["a", "StepPath", 3], ["b", "SoftPull", 3]], { a: 10, b: 20 });
    assert.deepStrictEqual(a, b);
  });
});

describe("overlay mode", () => {
  test("see-through clips may sit in the first 3 s and close together; they may not overlap", () => {
    const r = planAnimations({
      animationPlan: plan(["a", "StepPath", 3], ["b", "SoftPull", 3], ["c", "RatesRising", 3]),
      resolveAnchor: resolver({ a: 1, b: 3.5, c: 10 }), catalog: CATALOG, masterSeconds: 40, mode: "overlay",
    });
    // a: 1-4. b at 3.5 would overlap, and 4.0 is 0.5 s later, outside the 0.3 s window -> skipped.
    assert.deepStrictEqual(r.items.map((i) => [i.template, i.start]), [["StepPath", 1], ["RatesRising", 10]]);
    assert.strictEqual(r.skipped[0].reason, "overlap");
    assert.ok(!r.flags.includes("cta_unknown"));
  });

  test("ProofWall keeps its catalog length in overlay mode too", () => {
    const r = planAnimations({
      animationPlan: plan(["a", "ProofWall", 4]), resolveAnchor: resolver({ a: 10 }), catalog: CATALOG, masterSeconds: 40, mode: "overlay",
    });
    assert.strictEqual(r.items[0].seconds, 4);
  });

  test("a clip that would run past the end is shortened or dropped", () => {
    const r = planAnimations({
      animationPlan: plan(["a", "StepPath", 3], ["b", "SoftPull", 3]),
      resolveAnchor: resolver({ a: 27.5, b: 29.5 }), catalog: CATALOG, masterSeconds: 30, mode: "overlay",
    });
    assert.deepStrictEqual(r.items.map((i) => i.end), [30]);
    assert.strictEqual(r.skipped[0].reason, "overlap");
  });
});

describe("re-mapping against Submagic's words", () => {
  const words = (s, from = 0) => s.split(" ").map((w, i) => ({ word: w, start: from + i * 0.5, end: from + i * 0.5 + 0.4 }));
  const baseItems = () => planAnimations({
    animationPlan: plan(["approval email", "StepPath", 3], ["bank says no", "SoftPull", 3]),
    resolveAnchor: resolver({ "approval email": 10, "bank says no": 25 }), catalog: CATALOG, masterSeconds: 60, ctaStartSeconds: 55,
  }).items;
  const base = { catalog: CATALOG, mode: "fullframe", masterSeconds: 60, exportSeconds: 61 };

  // Stands in for normalizeText from align.mjs (9.2), which is passed in by the
  // worker: every way of saying 300,000 becomes the same spoken words.
  const spoken = (text) => String(text).toLowerCase()
    .replace(/\$?300,000|300k|300 grand|three hundred thousand( dollars)?/g, " three hundred thousand dollars ")
    .split(/[^a-z0-9]+/).filter(Boolean);

  test("within 0.1 s of the master the anchors are left alone", () => {
    const items = baseItems();
    const r = retimeAnimations({ ...base, items, words: [], exportSeconds: 60.08, ctaStartSeconds: 55 });
    assert.strictEqual(r.remapped, false);
    assert.strictEqual(r.ctaStartSeconds, 55);
    assert.deepStrictEqual(r.items, items);
  });

  test("beyond 0.1 s each item moves to where Submagic hears its words", () => {
    const items = baseItems();
    const w = [...words("filler filler the approval email lands", 11.5), ...words("and the bank says no again", 26.5), ...words("book now", 50)];
    const r = retimeAnimations({ ...base, items, words: w, ctaStartSeconds: 55, ctaPhrase: "book now" });
    assert.strictEqual(r.remapped, true);
    assert.deepStrictEqual(r.items.map((i) => i.cut_time), [13, 27.5]);
    assert.ok(r.flags.includes("retimed"));
  });

  test("when a phrase is heard twice, the occurrence nearest the old time wins", () => {
    const items = baseItems().slice(0, 1);
    const w = [...words("approval email", 2), ...words("approval email", 10.4)];
    const r = retimeAnimations({ ...base, items, words: w });
    assert.strictEqual(r.items[0].cut_time, 10.4);
  });

  test("an item whose words are not on the export is DROPPED and flagged, never kept at its old time", () => {
    const items = baseItems();
    const r = retimeAnimations({ ...base, items, words: words("nothing useful here", 0) });
    assert.deepStrictEqual(r.items, []);
    assert.deepStrictEqual(r.skipped.map((s) => [s.index, s.reason]), [[0, "retime_unmatched"], [1, "retime_unmatched"]]);
    assert.ok(r.flags.includes("retime_unmatched") && r.flags.includes("no_animation"));
  });

  test("an item with nothing to listen for is dropped too", () => {
    const items = baseItems().map((i) => ({ ...i, match_text: "" }));
    const r = retimeAnimations({ ...base, items, words: words("approval email", 10) });
    assert.strictEqual(r.items.length, 0);
  });

  test("numbers are normalized on both sides: '300 grand' on the export finds '$300,000' in the script", () => {
    const items = planAnimations({
      animationPlan: plan(["$300,000 today", "StepPath", 3]), resolveAnchor: resolver({ "$300,000 today": 10 }),
      catalog: CATALOG, masterSeconds: 60, ctaStartSeconds: 55,
    }).items;
    const w = [{ word: "you", start: 11 }, { word: "can", start: 11.3 }, { word: "get", start: 11.6 }, { word: "300", start: 12 }, { word: "grand", start: 12.4 }, { word: "today", start: 12.8 }];
    const withNormalizer = retimeAnimations({ ...base, items, words: w, normalize: spoken });
    assert.deepStrictEqual(withNormalizer.items.map((i) => i.cut_time), [12]);
    // Without a normalizer the same words are NOT found, and the item is dropped.
    const without = retimeAnimations({ ...base, items, words: w });
    assert.strictEqual(without.items.length, 0);
    assert.strictEqual(without.skipped[0].reason, "retime_unmatched");
  });

  test("tokenStream: a number spanning two words takes the time of the word it starts on", () => {
    const stream = tokenStream([{ word: "get", start: 1 }, { word: "300", start: 2 }, { word: "grand", start: 2.4 }], spoken);
    assert.deepStrictEqual(stream.map((t) => [t.token, t.start]), [["get", 1], ["three", 2], ["hundred", 2.4], ["thousand", 2.4], ["dollars", 2.4]]);
  });

  test("the CTA start is re-found on the export's timeline, not reused from the master", () => {
    // Master 60 s, CTA at 58. Export 62 s: Submagic hears the CTA at 55.
    const items = planAnimations({
      animationPlan: plan(["late word", "StepPath", 3]), resolveAnchor: resolver({ "late word": 54 }),
      catalog: CATALOG, masterSeconds: 60, ctaStartSeconds: 58,
    }).items;
    assert.strictEqual(items[0].end, 57); // fits before the master's CTA
    const w = [{ word: "late", start: 54 }, { word: "word", start: 54.3 }, { word: "book", start: 55 }, { word: "now", start: 55.3 }];
    const r = retimeAnimations({ ...base, items, words: w, exportSeconds: 62, ctaStartSeconds: 58, ctaPhrase: "book now" });
    assert.strictEqual(r.ctaStartSeconds, 55);
    // Only 1 s is left before the real CTA, under the template's 2 s minimum, so it is skipped.
    assert.deepStrictEqual(r.skipped.map((s) => s.reason), ["cta"]);
    assert.deepStrictEqual(r.items, []);
  });

  test("a CTA that cannot be found is unknown and flagged, never the master's old value", () => {
    const items = baseItems();
    const w = [...words("approval email", 10), ...words("bank says no", 25)];
    const r = retimeAnimations({ ...base, items, words: w, ctaStartSeconds: 55, ctaPhrase: "book now" });
    assert.strictEqual(r.ctaStartSeconds, null);
    assert.ok(r.flags.includes("cta_unknown"));
    const noPhrase = retimeAnimations({ ...base, items, words: w, ctaStartSeconds: 55 });
    assert.strictEqual(noPhrase.ctaStartSeconds, null);
  });

  test("mode is required: there is no default", () => {
    const items = baseItems();
    assert.throws(() => retimeAnimations({ items, words: [], masterSeconds: 60, exportSeconds: 61, catalog: CATALOG }), TypeError);
    assert.throws(() => retimeAnimations({ items, words: [], masterSeconds: 60, exportSeconds: 60.05, catalog: CATALOG }), TypeError);
    assert.throws(() => retimeAnimations({ items, words: [], masterSeconds: 60, exportSeconds: 61, catalog: CATALOG, mode: "x" }), TypeError);
  });

  test("the limits still apply on the new timeline", () => {
    const items = baseItems();
    const w = words("the approval email", 1); // heard at 1.5 s: inside the first 3 s, too far to nudge
    const r = retimeAnimations({ ...base, items, words: w });
    assert.ok(r.skipped.some((s) => s.template === "StepPath" && s.reason === "lead_in"));
  });

  test("digits and punctuation split into the same tokens", () => {
    assert.deepStrictEqual(tokenStream([{ word: "$300,000", start: 1 }]).map((t) => t.token), ["300", "000"]);
    assert.deepStrictEqual(tokenStream([{ text: "Hello", startTime: 2 }, { text: "no time" }]).length, 1);
  });
});

test("placeCandidates rejects a missing runtime", () => {
  assert.throws(() => placeCandidates({ candidates: [], catalog: CATALOG, masterSeconds: 0 }), RangeError);
});
