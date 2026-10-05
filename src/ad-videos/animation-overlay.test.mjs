import { test, describe } from "node:test";
import assert from "node:assert";

import {
  overlayArgs, planOverlay, renderSpec, clipsToRender, stableStringify, numText, OverlayPlanError,
} from "./animation-overlay.mjs";

// Stands in for FINAL_VIDEO_ARGS from ffmpeg-plan.mjs (9.3). The real list is
// handed in by the worker; these tests only need to see it pass through whole.
const FINAL = Object.freeze(["-c:v", "libx264", "-crf", "18", "-r", "30", "-fps_mode", "cfr"]);

const item = (over = {}) => ({ template: "StepPath", props: { steps: 3 }, start: 10, end: 13, seconds: 3, frames: 90, ...over });

describe("render spec and cache key", () => {
  test("same template and props give the same key, whatever the key order", () => {
    const a = renderSpec(item({ props: { a: 1, b: { x: 1, y: 2 } } }));
    const b = renderSpec(item({ props: { b: { y: 2, x: 1 }, a: 1 } }));
    assert.strictEqual(a.cacheKey, b.cacheKey);
  });

  test("timing does not change the key, so moving a clip does not re-render it", () => {
    assert.strictEqual(renderSpec(item({ start: 10 })).cacheKey, renderSpec(item({ start: 25, end: 28 })).cacheKey);
  });

  test("props, length, mode and format each change the key", () => {
    const base = renderSpec(item()).cacheKey;
    assert.notStrictEqual(base, renderSpec(item({ props: { steps: 4 } })).cacheKey);
    assert.notStrictEqual(base, renderSpec(item({ frames: 75, seconds: 2.5 })).cacheKey);
    assert.notStrictEqual(base, renderSpec(item(), { mode: "overlay" }).cacheKey);
    assert.notStrictEqual(renderSpec(item(), { mode: "overlay", alphaFormat: "webm" }).cacheKey, renderSpec(item(), { mode: "overlay", alphaFormat: "mov" }).cacheKey);
  });

  test("full-frame renders opaque mp4; overlay renders transparent with alpha", () => {
    const full = renderSpec(item());
    assert.deepStrictEqual([full.container, full.alpha, full.props.transparent, full.props.durationInFrames], ["mp4", false, false, 90]);
    const over = renderSpec(item(), { mode: "overlay" });
    assert.deepStrictEqual([over.container, over.alpha, over.props.transparent], ["webm", true, true]);
    assert.throws(() => renderSpec(item(), { mode: "overlay", alphaFormat: "gif" }), OverlayPlanError);
  });

  test("clipsToRender dedupes and skips what is cached", () => {
    const items = [item({ start: 10 }), item({ start: 30, end: 33 }), item({ template: "SoftPull" })];
    assert.strictEqual(clipsToRender(items).length, 2);
    const cached = [renderSpec(item()).cacheKey];
    assert.deepStrictEqual(clipsToRender(items, { cachedKeys: cached }).map((s) => s.template), ["SoftPull"]);
  });

  test("a bad item throws a coded error", () => {
    assert.throws(() => renderSpec({}), (e) => e.code === "bad_item");
    assert.throws(() => renderSpec({ template: "StepPath", frames: 0 }), (e) => e.code === "bad_item");
  });

  test("stableStringify sorts keys and tolerates undefined", () => {
    assert.strictEqual(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"c":null,"d":1}],"b":1}');
  });
});

describe("overlay arguments", () => {
  const clip = (over = {}) => ({ path: "/w/a.mp4", start: 10, seconds: 3, alpha: false, container: "mp4", ...over });
  const run = (clips) => overlayArgs({ basePath: "/w/base.mp4", clips, outputPath: "/w/out.mp4", finalVideoArgs: FINAL });

  test("one re-encode with the final settings, audio copied as is", () => {
    const a = run([clip()]);
    assert.ok(a.join(" ").includes(FINAL.join(" ")));
    assert.strictEqual(a.filter((x) => x === "-c:v").length, 1);
    assert.deepStrictEqual(a.slice(a.indexOf("-c:a")), ["-c:a", "copy", "/w/out.mp4"]);
    assert.deepStrictEqual(a.slice(a.indexOf("-map"), a.indexOf("-map") + 4), ["-map", "[vout]", "-map", "0:a?"]);
  });

  test("each clip is shifted to its start and drawn only between start and end", () => {
    const g = run([clip({ start: 10 }), clip({ start: 20.5, seconds: 2, path: "/w/b.mp4" })]);
    const graph = g[g.indexOf("-filter_complex") + 1];
    assert.ok(graph.includes("setpts=PTS-STARTPTS+10/TB[o0]"));
    assert.ok(graph.includes("setpts=PTS-STARTPTS+20.5/TB[o1]"));
    assert.ok(graph.includes("[0:v][o0]overlay=x=0:y=0:eof_action=pass:format=auto:enable='between(t,10,13)'[v0]"));
    assert.ok(graph.includes("[v0][o1]overlay=x=0:y=0:eof_action=pass:format=auto:enable='between(t,20.5,22.5)'[vout]"));
  });

  test("clip inputs are capped to their length", () => {
    const a = run([clip({ seconds: 2.5 })]);
    const i = a.indexOf("/w/a.mp4");
    assert.deepStrictEqual(a.slice(i - 3, i + 1), ["-t", "2.5", "-i", "/w/a.mp4"]);
  });

  test("a see-through webm is decoded with libvpx-vp9 so its alpha survives; mov and mp4 are not", () => {
    const webm = run([clip({ path: "/w/a.webm", alpha: true, container: "webm" })]);
    assert.ok(webm.join(" ").includes("-c:v libvpx-vp9 -t 3 -i /w/a.webm"));
    assert.ok(webm[webm.indexOf("-filter_complex") + 1].includes("format=yuva420p"));
    const mov = run([clip({ path: "/w/a.mov", alpha: true, container: "mov" })]);
    assert.ok(!mov.includes("libvpx-vp9"));
    const mp4 = run([clip()]);
    assert.ok(mp4[mp4.indexOf("-filter_complex") + 1].includes("format=yuv420p,"));
  });

  test("bad input is refused with a code", () => {
    const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
    assert.strictEqual(code(() => run([])), "no_clips");
    assert.strictEqual(code(() => overlayArgs({ basePath: "a", clips: [clip()], outputPath: "b", finalVideoArgs: [] })), "no_encode_args");
    assert.strictEqual(code(() => overlayArgs({ clips: [clip()], finalVideoArgs: FINAL })), "bad_paths");
    assert.strictEqual(code(() => run([clip({ start: -1 })])), "bad_clip");
    assert.strictEqual(code(() => run([clip({ seconds: 0 })])), "bad_clip");
    assert.strictEqual(code(() => run([clip({ path: "" })])), "bad_clip");
    assert.strictEqual(code(() => run([clip({ start: 10 }), clip({ start: 12 })])), "overlap");
  });

  test("numText trims trailing zeros", () => {
    assert.deepStrictEqual([numText(3), numText(2.5), numText(0.333333333)], ["3", "2.5", "0.333333"]);
  });
});

describe("planOverlay", () => {
  test("builds the call from items and the clip files the worker holds, in start order", () => {
    const late = item({ template: "SoftPull", start: 30, end: 33 });
    const early = item();
    const clipPaths = { [renderSpec(early).cacheKey]: "/w/early.mp4", [renderSpec(late).cacheKey]: "/w/late.mp4" };
    const a = planOverlay({ items: [late, early], clipPaths, basePath: "/w/base.mp4", outputPath: "/w/out.mp4", finalVideoArgs: FINAL });
    assert.ok(a.indexOf("/w/early.mp4") < a.indexOf("/w/late.mp4"));
  });

  test("a missing clip stops the overlay instead of finishing with a partial set", () => {
    assert.throws(
      () => planOverlay({ items: [item()], clipPaths: {}, basePath: "b", outputPath: "o", finalVideoArgs: FINAL }),
      (e) => e instanceof OverlayPlanError && e.code === "clip_missing" && /StepPath/.test(e.message),
    );
  });

  test("overlay mode asks for alpha clips", () => {
    const it = item();
    const spec = renderSpec(it, { mode: "overlay" });
    const a = planOverlay({ items: [it], mode: "overlay", clipPaths: { [spec.cacheKey]: "/w/c.webm" }, basePath: "b", outputPath: "o", finalVideoArgs: FINAL });
    assert.ok(a.includes("libvpx-vp9"));
  });
});
