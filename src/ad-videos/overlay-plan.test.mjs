import test from "node:test";
import assert from "node:assert/strict";
import { planAnimations, overlayArgs, loudnessFixArgs, remuxArgs, finalizeVerdict } from "./overlay-plan.mjs";

// The same shape as ffmpeg-plan.mjs's exports (9.3); passed in, never copied.
const plan = {
  FINAL_VIDEO_ARGS: ["-c:v", "libx264", "-crf", "18"],
  FINAL_AUDIO_ARGS: ["-c:a", "aac"],
  FASTSTART_ARGS: ["-movflags", "+faststart"],
  loudnormFilter: () => "loudnorm=I=-14:TP=-1.5:LRA=11",
};
const A = (id, time, frames = 75, template = "QualifyToday") => ({ id, template, time, frames });
const ids = (r) => r.accepted.map((a) => a.id);
const reasons = (r) => Object.fromEntries(r.skipped.map((s) => [s.id, s.reason]));

test("full-frame: nothing in the first 3 seconds, nothing during the CTA", () => {
  const r = planAnimations({
    animations: [A("a", 1), A("b", 10), A("c", 50)], durationSeconds: 60, cta: { start: 49, end: 58 },
  });
  assert.deepEqual(ids(r), ["b"]);
  assert.deepEqual(reasons(r), { a: "first_3_seconds", c: "during_cta" });
});

test("full-frame: at least 4 s of Chris's face between clips", () => {
  const r = planAnimations({ animations: [A("a", 10), A("b", 14), A("c", 15)], durationSeconds: 100 });
  // a runs 10 - 12.5; b at 14 leaves 1.5 s, c at 15 leaves 2.5 s: both too close
  assert.deepEqual(ids(r), ["a"]);
  assert.deepEqual(reasons(r), { b: "too_close", c: "too_close" });
  const ok = planAnimations({ animations: [A("a", 10), A("b", 16.5)], durationSeconds: 100 });
  assert.deepEqual(ids(ok), ["a", "b"]);
});

test("full-frame: 3 s cap, with the ProofWall 4 s and ProofFlood 6 s exceptions", () => {
  const r = planAnimations({
    animations: [A("long", 10, 100), A("wall", 20, 120, "ProofWall"), A("wall5", 30, 130, "ProofWall"), A("flood", 40, 180, "ProofFlood")],
    durationSeconds: 200,
  });
  assert.deepEqual(ids(r), ["wall", "flood"]);
  assert.deepEqual(reasons(r), { long: "too_long", wall5: "too_long" });
});

test("full-frame: clips may fill at most 35% of the runtime", () => {
  // 20 s video -> 7 s budget; three 2.5 s clips = 7.5 s, so the third is over
  const r = planAnimations({ animations: [A("a", 4), A("b", 10.5), A("c", 17)], durationSeconds: 20 });
  assert.deepEqual(ids(r), ["a", "b"]);
  assert.deepEqual(reasons(r), { c: "over_budget" });
});

test("a cut anchor skips the animation and says so", () => {
  const r = planAnimations({ animations: [A("a", null), { id: "b", template: "T", time: undefined, frames: 60 }], durationSeconds: 60 });
  assert.equal(r.accepted.length, 0);
  assert.deepEqual(reasons(r), { a: "anchor_cut", b: "anchor_cut" });
});

test("a clip that would run past the end is skipped", () => {
  const r = planAnimations({ animations: [A("a", 29)], durationSeconds: 30 });
  assert.deepEqual(reasons(r), { a: "past_end" });
});

test("see-through mode drops the full-frame limits but never stacks two clips", () => {
  const r = planAnimations({ animations: [A("a", 1), A("b", 2), A("c", 5)], durationSeconds: 60, mode: "overlay" });
  assert.deepEqual(ids(r), ["a", "c"]);
  assert.deepEqual(reasons(r), { b: "overlaps" });
});

test("accepted clips come back in time order with start, end and seconds", () => {
  const r = planAnimations({ animations: [A("b", 20), A("a", 5)], durationSeconds: 100 });
  assert.deepEqual(r.accepted.map((a) => [a.id, a.start, a.end, a.seconds]), [["a", 5, 7.5, 2.5], ["b", 20, 22.5, 2.5]]);
});

test("the overlay is one run: re-encode video with the master's args, copy the audio", () => {
  const args = overlayArgs({
    basePath: "/w/s.mp4", outputPath: "/w/o.mp4", plan,
    clips: [{ path: "/w/c1.mp4", start: 5, seconds: 2.5 }, { path: "/w/c2.mp4", start: 20, seconds: 3 }],
  });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /\[1:v\]setpts=PTS-STARTPTS\+5\/TB\[c1\]/);
  assert.match(fc, /\[0:v\]\[c1\]overlay=0:0:format=auto:eof_action=pass:enable='between\(t,5,7\.5\)'\[v1\]/);
  assert.match(fc, /\[v1\]\[c2\]overlay=0:0:format=auto:eof_action=pass:enable='between\(t,20,23\)'\[v2\]/);
  assert.deepEqual(args.slice(args.indexOf("-map")), [
    "-map", "[v2]", "-map", "0:a:0", "-c:v", "libx264", "-crf", "18", "-c:a", "copy", "-movflags", "+faststart", "/w/o.mp4",
  ]);
  assert.equal(args.filter((a) => a === "-i").length, 3);
  assert.throws(() => overlayArgs({ basePath: "a", outputPath: "b", clips: [], plan }), /at least one clip/);
});

test("finalize: size and length are failures, loudness is a fix", () => {
  const facts = { displayWidth: 1080, displayHeight: 1920, durationSeconds: 30.2, hasAudio: true };
  const good = finalizeVerdict({ facts, masterDurationSeconds: 30, loudness: { input_i: -14.4 } });
  assert.deepEqual(good, { ok: true, problems: [], fixLoudness: false });

  const loud = finalizeVerdict({ facts, masterDurationSeconds: 30, loudness: { input_i: -12.5 } });
  assert.equal(loud.ok, true);
  assert.equal(loud.fixLoudness, true);

  const bad = finalizeVerdict({
    facts: { ...facts, displayWidth: 720, durationSeconds: 31 }, masterDurationSeconds: 30, loudness: { input_i: -14 },
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.problems.map((p) => p.check), ["size", "duration"]);
  assert.equal(finalizeVerdict({ facts: { ...facts, hasAudio: false }, masterDurationSeconds: 30, loudness: {} }).ok, false);
});

test("the loudness fix copies video and re-encodes audio from measured values", () => {
  const measured = { input_i: -12, input_tp: -1, input_lra: 5, input_thresh: -22, target_offset: 0.3 };
  const args = loudnessFixArgs({ inputPath: "/w/a.mp4", outputPath: "/w/b.mp4", measured, plan });
  assert.ok(args.includes("copy"));
  assert.match(args[args.indexOf("-af") + 1], /measured_I=-12:measured_TP=-1.*linear=true.*aresample=48000/);
  assert.throws(() => loudnessFixArgs({ inputPath: "a", outputPath: "b", measured: {}, plan }), /measured/);
  assert.deepEqual(remuxArgs({ inputPath: "a", outputPath: "b", plan }).slice(-3), ["-movflags", "+faststart", "b"]);
});
