// The four jobs, driven with fakes. No real Drive, R2, ffmpeg or Remotion (spec 9.5).
// The fake `plan` has the SHAPE of src/ad-videos/ffmpeg-plan.mjs (9.3); the
// jobs only call what is listed here, so a shape change in 9.3 fails this file.

import test from "node:test";
import assert from "node:assert/strict";
import { runJob, runPrepare, runBuildCut, runCopyExport, runRenderAndOverlay, JobFailure, workPath } from "./worker-jobs.mjs";
import { clipKey, validateJobRequest } from "./worker-protocol.mjs";

const FACTS = { hasAudio: true, durationSeconds: 30, width: 1080, height: 1920, displayWidth: 1080, displayHeight: 1920, rotation: 0, colorTransfer: "bt709", isHdr: false, fps: 30, recordedAt: "2026-10-05T10:00:00Z" };

function fakePlan(over = {}) {
  return {
    probeArgs: (p) => ["probe", p],
    probeFacts: (text) => JSON.parse(text),
    audioExtractArgs: ({ inputPath, outputPath }) => ["audio", inputPath, outputPath],
    silencedetectArgs: ({ inputPath }) => ["silence", inputPath],
    parseSilences: (stderr) => JSON.parse(stderr || "[]"),
    planMaster: ({ videoKind, pieces, takes, workDir, outputPath }) => {
      if (videoKind !== "ad") { const e = new Error("not an ad"); e.code = "not_an_ad"; throw e; }
      const planned = pieces.map((p, i) => {
        if (!takes[p.take]) { const e = new Error(`unknown take ${p.take}`); e.code = "unknown_take"; throw e; }
        return {
          index: i, take: p.take, frames: 60, startFrame: 0, file: `${workDir}/piece-${i}.mkv`,
          measureArgs: ["measure", i], encodeArgs: (gain) => ["encode", i, gain], checkArgs: ["check", i],
        };
      });
      return {
        pieces: planned, concatListPath: `${workDir}/pieces.txt`, concatList: "file 'x'\n",
        pass1Args: ["pass1"], pass2Args: (m) => ["pass2", m.input_i, outputPath], blackdetectArgs: ["black"], outputPath, frames: 60 * planned.length,
      };
    },
    matchPieceGains: (ms) => ms.map((m) => -1 - m.input_i - 0),
    parseLoudnorm: (stderr) => JSON.parse(stderr),
    parseBlackdetect: (stderr) => JSON.parse(stderr || "[]"),
    frameCountArgs: ({ inputPath }) => ["frames", inputPath],
    parseFrameCount: (stdout) => { const m = String(stdout ?? "").match(/^\s*(\d+)\s*$/m); return m ? Number(m[1]) : null; },
    // Mirrors the REAL cutChecks from ffmpeg-plan.mjs (#34, a22198d): it needs the master's counted
    // frames, the planned frames, and pass 2's own loudnorm reading with normalization_type 'linear'.
    // A job that leaves any of them out fails here the way it fails there.
    cutChecks: (a) => {
      const failures = [];
      const planned = Number.isInteger(a.plannedFrames) ? a.plannedFrames : a.pieces.reduce((n, p) => n + p.frames, 0);
      if (!Number.isInteger(a.masterFrames)) failures.push({ check: "frames_uncounted" });
      else if (a.masterFrames !== planned) failures.push({ check: "frame_count_mismatch" });
      if (a.pass2?.normalization_type !== "linear") failures.push({ check: "loudnorm_not_linear" });
      if (!Array.isArray(a.pieceMeasures) || a.pieceMeasures.length !== a.pieces.length) failures.push({ check: "loudness_unmeasured" });
      return { ok: failures.length === 0, failures };
    },
    pieceLoudnessArgs: ({ piecePath }) => ["loud", piecePath],
    loudnormFilter: () => "loudnorm=I=-14",
    FINAL_VIDEO_ARGS: ["-c:v", "libx264"],
    FINAL_AUDIO_ARGS: ["-c:a", "aac"],
    FASTSTART_ARGS: ["-movflags", "+faststart"],
    ...over,
  };
}

/** An io with a script: `outputs` maps "<tag>" to a run result; `probes` maps path-suffix to facts. */
function fakeIo({ probes = {}, outputs = {}, failDownload = null, existing = [], frames = 120 } = {}) {
  const log = { runs: [], downloads: [], puts: [], gets: [], renders: [], texts: [] };
  const stored = new Set(existing);
  const io = {
    dir: "/w",
    path: (n) => `/w/${n}`,
    writeText: async (p, t) => { log.texts.push([p, t]); },
    run: async (bin, args) => {
      log.runs.push([bin, ...args]);
      if (bin === "ffprobe" && args[0] === "frames") return { code: 0, stdout: `${frames}\n`, stderr: "" };
      if (bin === "ffprobe") {
        const path = args[1];
        const key = Object.keys(probes).find((k) => path.endsWith(k));
        return { code: 0, stdout: JSON.stringify(key ? probes[key] : FACTS), stderr: "" };
      }
      const tag = args[0];
      const out = outputs[tag];
      if (typeof out === "function") return out(args);
      if (out) return out;
      if (tag === "loud" || tag === "check") return { code: 0, stdout: "", stderr: JSON.stringify({ input_i: -14, input_tp: -2, input_lra: 5, input_thresh: -24, target_offset: 0 }) };
      if (tag === "pass2") return { code: 0, stdout: "", stderr: JSON.stringify({ input_i: -16, input_tp: -3, input_lra: 5, input_thresh: -26, target_offset: 0, normalization_type: "linear" }) };
      if (tag === "measure" || tag === "pass1") return { code: 0, stdout: "", stderr: JSON.stringify({ input_i: -16, input_tp: -3, input_lra: 5, input_thresh: -26, target_offset: 0 }) };
      return { code: 0, stdout: "", stderr: "" };
    },
    download: async (req, path) => { log.downloads.push([req, path]); if (failDownload) throw new Error(failDownload); },
    putFile: async (key, path, type) => { stored.add(key); log.puts.push([key, path, type]); },
    getFile: async (key, path) => { log.gets.push([key, path]); },
    has: async (key) => stored.has(key),
    renderClip: async (args) => { log.renders.push(args); },
  };
  return { io, log, stored };
}

const drive = { access_token: "tok" };
const job = (type, payload, extra = {}) => ({ id: `v1:${type}:1`, type, adVideoId: "v1", orgId: "o1", cutVersion: 1, payload, ...extra });

// -- prepare ---------------------------------------------------------------

test("prepare: probes, extracts audio, finds silences, uploads ONLY the audio", async () => {
  const { io, log } = fakeIo({ outputs: { silence: { code: 0, stdout: "", stderr: JSON.stringify([{ start: 1, end: 1.4 }]) } } });
  const out = await runPrepare({
    job: job("prepare", { take_id: "t1", audio_key: "partners/p/ad-video/audio/v1.ogg", drive: { file_id: "F1", access_token: "tok" } }),
    io, plan: fakePlan(),
  });
  assert.equal(out.audio_storage_key, "partners/p/ad-video/audio/v1.ogg");
  assert.deepEqual(out.silences, [{ start: 1, end: 1.4 }]);
  assert.equal(out.recorded_at, "2026-10-05T10:00:00Z");
  assert.equal(out.facts.duration_seconds, 30);
  assert.equal(log.downloads.length, 1);
  assert.equal(log.downloads[0][0].headers.authorization, "Bearer tok", "the job's Drive token is what downloads the take");
  assert.deepEqual(log.puts.map((p) => p[0]), ["partners/p/ad-video/audio/v1.ogg"], "a raw take is never uploaded");
  assert.equal(log.puts[0][2], "audio/ogg");
});

test("prepare: a take with no audio fails with a code, and uploads nothing", async () => {
  const { io, log } = fakeIo({ probes: { "take.bin": { ...FACTS, hasAudio: false } } });
  const r = await runJob({ job: job("prepare", { take_id: "t", audio_key: "k", drive: { file_id: "F", access_token: "t" } }), io, plan: fakePlan() });
  assert.equal(r.status, "failed");
  assert.equal(r.error.code, "take_without_audio");
  assert.equal(log.puts.length, 0);
});

test("a failed download is a failed job with a code, never a throw", async () => {
  const { io } = fakeIo({ failDownload: "HTTP 401 from www.googleapis.com" });
  const r = await runJob({ job: job("prepare", { take_id: "t", audio_key: "k", drive: { file_id: "F", access_token: "t" } }), io, plan: fakePlan() });
  assert.deepEqual([r.status, r.error.code], ["failed", "download_failed"]);
  assert.match(r.error.message, /HTTP 401/);
});

// -- build_cut -------------------------------------------------------------

const cutPayload = (over = {}) => ({
  video_kind: "ad", pieces: [{ take: "t1" }, { take: "t2" }], takes: { t1: { drive_file_id: "F1" }, t2: { drive_file_id: "F2" } },
  drive, silences: { t1: [] }, cut_key: "partners/p/ad-video/cut/v1-v1.mp4", flip_horizontal: false, ...over,
});

test("build_cut: downloads each take once, runs the steps in order, uploads the master", async () => {
  const { io, log } = fakeIo({ probes: { "master.mp4": { ...FACTS, durationSeconds: 2 } } });
  const out = await runBuildCut({ job: job("build_cut", cutPayload()), io, plan: fakePlan() });
  assert.equal(log.downloads.length, 2);
  const tags = log.runs.filter(([b]) => b === "ffmpeg").map((r) => r[1]);
  assert.deepEqual(tags, ["measure", "measure", "encode", "check", "encode", "check", "pass1", "pass2", "black"]);
  // gains from matchPieceGains reach the encode of each piece
  assert.deepEqual(log.runs.filter((r) => r[1] === "encode").map((r) => r[3]), [-1 - -16, -1 - -16]);
  assert.deepEqual(log.puts, [["partners/p/ad-video/cut/v1-v1.mp4", "/w/master.mp4", "video/mp4"]]);
  assert.equal(out.cut_storage_key, "partners/p/ad-video/cut/v1-v1.mp4");
  assert.equal(out.master_duration_seconds, 2);
  assert.equal(log.texts[0][0], "/w/pieces.txt");
});

test("build_cut: a failed cut check blocks the master, and nothing is uploaded", async () => {
  const failures = [{ check: "black_frames", detail: "black from 1 s to 2 s" }];
  const { io, log } = fakeIo();
  const r = await runJob({ job: job("build_cut", cutPayload()), io, plan: fakePlan({ cutChecks: () => ({ ok: false, failures }) }) });
  assert.equal(r.status, "failed");
  assert.equal(r.error.code, "cut_checks");
  assert.deepEqual(r.error.detail.failures, failures);
  assert.equal(log.puts.length, 0, "no master reaches R2, so no Submagic spend");
});

test("build_cut: a plan the 9.3 module refuses comes back as that code", async () => {
  const { io } = fakeIo();
  const nonAd = await runJob({ job: job("build_cut", cutPayload({ video_kind: "vsl" })), io, plan: fakePlan() });
  assert.equal(nonAd.error.code, "not_an_ad");
  const noTake = await runJob({ job: job("build_cut", cutPayload({ pieces: [{ take: "zz" }] })), io, plan: fakePlan() });
  assert.equal(noTake.error.code, "unknown_take");
});

test("build_cut: an ffmpeg that exits non-zero fails the job with its last lines", async () => {
  const { io, log } = fakeIo({ outputs: { encode: { code: 1, stdout: "", stderr: "boom\nbad thing" } } });
  const r = await runJob({ job: job("build_cut", cutPayload()), io, plan: fakePlan() });
  assert.equal(r.error.code, "ffmpeg_failed");
  assert.match(r.error.detail.tail, /bad thing/);
  assert.equal(log.puts.length, 0);
});

test("build_cut hands cutChecks everything #34 requires: counted frames, planned frames, pass 2's reading", async () => {
  let seen;
  const base = fakePlan();
  const plan = fakePlan({ cutChecks: (a) => { seen = a; return base.cutChecks(a); } });
  const { io, log } = fakeIo({ frames: 120 });
  const r = await runJob({ job: job("build_cut", cutPayload()), io, plan });
  assert.equal(r.status, "done");
  assert.equal(seen.masterFrames, 120, "parseFrameCount of the ffprobe count over the master");
  assert.equal(seen.plannedFrames, 120, "plan.frames");
  assert.equal(seen.pass2.normalization_type, "linear", "parseLoudnorm of pass 2's stderr, not pass 1's");
  assert.equal(seen.pieceMeasures.length, 2);
  assert.ok(log.runs.some((x) => x[0] === "ffprobe" && x[1] === "frames" && x[2] === "/w/master.mp4"));
});

test("build_cut: dropped or repeated frames block the master", async () => {
  const { io, log } = fakeIo({ frames: 121 });
  const r = await runJob({ job: job("build_cut", cutPayload()), io, plan: fakePlan() });
  assert.equal(r.error.code, "cut_checks");
  assert.equal(r.error.detail.failures[0].check, "frame_count_mismatch");
  assert.equal(log.puts.length, 0);
});

test("build_cut: a loudnorm that fell back to dynamic blocks the master", async () => {
  const dyn = { code: 0, stdout: "", stderr: JSON.stringify({ input_i: -16, input_tp: -3, input_lra: 5, input_thresh: -26, target_offset: 0, normalization_type: "dynamic" }) };
  const { io, log } = fakeIo({ outputs: { pass2: dyn } });
  const r = await runJob({ job: job("build_cut", cutPayload()), io, plan: fakePlan() });
  assert.equal(r.error.detail.failures[0].check, "loudnorm_not_linear");
  assert.equal(log.puts.length, 0);
});

test("build_cut: a job that forgets pass 2 or the frame count cannot pass the (real-shaped) fake", async () => {
  const strict = fakePlan();
  const out = strict.cutChecks({ pieces: [{ frames: 60 }], pieceMeasures: [{}], black: [], silences: {} });
  assert.deepEqual(out.failures.map((f) => f.check).sort(), ["frames_uncounted", "loudnorm_not_linear"]);
});

// -- ids and paths ----------------------------------------------------------

test("a take id that could climb out of the work dir is refused before any download", async () => {
  const { io, log } = fakeIo();
  const r = await runJob({ job: job("build_cut", cutPayload({ takes: { "../../etc/x": { drive_file_id: "F" } }, pieces: [{ take: "../../etc/x" }] })), io, plan: fakePlan() });
  assert.deepEqual([r.status, r.error.code], ["failed", "bad_id"]);
  assert.equal(log.downloads.length, 0);
});

test("an animation id that could climb out of the work dir is refused before any render", async () => {
  const { io, log } = fakeIo();
  const p = ovPayload();
  p.animations[0].id = "../../../tmp/x";
  const r = await runJob({ job: job("render_and_overlay", p), io, plan: fakePlan() });
  assert.deepEqual([r.status, r.error.code], ["failed", "bad_id"]);
  assert.equal(log.renders.length, 0);
});

test("a template that is not a plain id never reaches Remotion", async () => {
  const { io, log } = fakeIo();
  const p = ovPayload();
  p.animations[0].template = "../x";
  const r = await runJob({ job: job("render_and_overlay", p), io, plan: fakePlan() });
  assert.equal(r.error.code, "bad_id");
  assert.equal(log.renders.length, 0);
});

test("every path the jobs use stays inside the work dir", async () => {
  const { io, log } = fakeIo({ probes: { "master.mp4": { ...FACTS, durationSeconds: 2 } } });
  await runJob({ job: job("build_cut", cutPayload()), io, plan: fakePlan() });
  await runJob({ job: job("render_and_overlay", ovPayload()), io, plan: fakePlan() });
  const local = [...log.downloads.map((d) => d[1]), ...log.gets.map((g) => g[1]), ...log.renders.map((r) => r.outPath), ...log.puts.map((p) => p[1])];
  assert.ok(local.length > 4);
  for (const p of local) assert.ok(p.startsWith("/w/") && !p.includes(".."), p);
  assert.throws(() => workPath({ dir: "/w", path: (n) => `/w/${n}` }, "../escape"), /outside the work directory/);
  assert.equal(workPath({ dir: "/w", path: (n) => `/w/${n}` }, "ok.bin"), "/w/ok.bin");
});

// -- copy_export -----------------------------------------------------------

test("copy_export: downloads Submagic's export and stores it in R2", async () => {
  const { io, log } = fakeIo();
  const out = await runCopyExport({
    job: job("copy_export", { export_url: "https://cdn.test/e.mp4", submagic_key: "partners/p/ad-video/submagic/v1-v1.mp4" }),
    io, plan: fakePlan(),
  });
  assert.equal(log.downloads[0][0].url, "https://cdn.test/e.mp4");
  assert.deepEqual(log.puts.map((p) => p[0]), ["partners/p/ad-video/submagic/v1-v1.mp4"]);
  assert.equal(out.submagic_storage_key, "partners/p/ad-video/submagic/v1-v1.mp4");
  assert.equal(out.width, 1080);
});

// -- render_and_overlay ----------------------------------------------------

const ovPayload = (over = {}) => ({
  submagic_key: "partners/p/ad-video/submagic/v1-v1.mp4", final_key: "partners/p/ad-video/final/91-r1.mp4", master_duration_seconds: 30, animation_mode: "fullframe",
  animations: [
    { id: "a1", template: "QualifyToday", props: { amount: 199000 }, time: 8, frames: 75 },
    { id: "a2", template: "SoftPull", props: {}, time: 20, frames: 75 },
  ],
  ...over,
});

test("render_and_overlay: renders each new clip once, overlays once, finalizes, uploads the final", async () => {
  const { io, log } = fakeIo();
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", ovPayload()), io, plan: fakePlan() });
  assert.equal(log.renders.length, 2);
  assert.equal(log.renders[0].template, "QualifyToday");
  assert.equal(log.runs.filter((r) => r[0] === "ffmpeg" && r.includes("-filter_complex")).length, 1, "one overlay run");
  const finalPut = log.puts.at(-1);
  assert.deepEqual([finalPut[0], finalPut[2]], ["partners/p/ad-video/final/91-r1.mp4", "video/mp4"]);
  assert.equal(out.storage_final_key, "partners/p/ad-video/final/91-r1.mp4");
  assert.deepEqual(out.rendered_clip_ids, ["a1", "a2"]);
  assert.equal(out.animation_items.accepted.length, 2);
  assert.equal(out.loudness_fixed, false);
  assert.equal(out.anchors_need_remap, false);
});

test("render_and_overlay: a clip already in R2 is reused, not re-rendered", async () => {
  const cached = clipKey({ template: "QualifyToday", props: { amount: 199000 }, frames: 75, mode: "fullframe" });
  const { io, log } = fakeIo({ existing: [cached] });
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", ovPayload()), io, plan: fakePlan() });
  assert.deepEqual(out.reused_clip_ids, ["a1"]);
  assert.deepEqual(out.rendered_clip_ids, ["a2"]);
  assert.equal(log.renders.length, 1);
  assert.ok(log.gets.some(([k]) => k === cached));
});

test("render_and_overlay: an edit that changes one animation re-renders only that one", async () => {
  const { io: first, stored } = fakeIo();
  await runRenderAndOverlay({ job: job("render_and_overlay", ovPayload()), io: first, plan: fakePlan() });
  const edited = ovPayload();
  edited.animations[1] = { ...edited.animations[1], props: { changed: true } };
  const { io: second, log } = fakeIo({ existing: [...stored] });
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", edited), io: second, plan: fakePlan() });
  assert.deepEqual(out.reused_clip_ids, ["a1"]);
  assert.deepEqual(out.rendered_clip_ids, ["a2"]);
  assert.equal(log.renders.length, 1);
});

test("render_and_overlay: nothing to lay on still finalizes the Submagic export", async () => {
  const { io, log } = fakeIo();
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", ovPayload({ animations: [] })), io, plan: fakePlan() });
  assert.equal(log.renders.length, 0);
  assert.equal(log.runs.filter((r) => r.includes("-filter_complex")).length, 0);
  assert.equal(out.animation_items.accepted.length, 0);
  assert.ok(log.puts.at(-1)[0].endsWith("91-r1.mp4"));
});

test("render_and_overlay: a skipped anchor is reported, not dropped silently", async () => {
  const { io } = fakeIo();
  const p = ovPayload();
  p.animations[1].time = null;
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", p), io, plan: fakePlan() });
  assert.deepEqual(out.animation_items.skipped.map((s) => [s.id, s.reason]), [["a2", "anchor_cut"]]);
});

test("render_and_overlay: a wrong-size finish fails the job and uploads nothing", async () => {
  const { io, log } = fakeIo({ probes: { "overlaid.mp4": { ...FACTS, displayWidth: 720 } } });
  const r = await runJob({ job: job("render_and_overlay", ovPayload()), io, plan: fakePlan() });
  assert.equal(r.error.code, "finalize_checks");
  assert.equal(r.error.detail.problems[0].check, "size");
  assert.ok(!log.puts.some(([k]) => k.includes("final")), "no final file reaches R2");
});

test("render_and_overlay: loudness more than 1 LU off is fixed, not failed", async () => {
  const { io, log } = fakeIo({ outputs: { loud: { code: 0, stdout: "", stderr: JSON.stringify({ input_i: -11, input_tp: -1, input_lra: 5, input_thresh: -21, target_offset: 0 }) } } });
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", ovPayload()), io, plan: fakePlan() });
  assert.equal(out.loudness_fixed, true);
  assert.ok(log.runs.some((r) => r.includes("-c:v") && r.includes("copy")), "video copied in the loudness fix");
});

test("render_and_overlay: a Submagic export that drifts past 0.1 s asks Netlify to re-map anchors", async () => {
  const { io } = fakeIo({ probes: { "submagic.mp4": { ...FACTS, durationSeconds: 30.2 }, "final.mp4": FACTS } });
  const out = await runRenderAndOverlay({ job: job("render_and_overlay", ovPayload({ animations: [] })), io, plan: fakePlan() });
  assert.equal(out.anchors_need_remap, true);
  assert.equal(out.anchor_drift_seconds, 0.2);
});

test("render_and_overlay: a Remotion failure is a failed job naming the clip", async () => {
  const { io } = fakeIo();
  io.renderClip = async () => { throw new Error("chrome died"); };
  const r = await runJob({ job: job("render_and_overlay", ovPayload()), io, plan: fakePlan() });
  assert.equal(r.error.code, "render_failed");
  assert.match(r.error.message, /QualifyToday \(a1\).*chrome died/);
});

// -- runJob ----------------------------------------------------------------

test("runJob never throws: an unexpected error becomes a failed outcome", async () => {
  const { io } = fakeIo();
  io.run = async () => { throw new Error("spawn ENOENT"); };
  const r = await runJob({ job: job("prepare", { take_id: "t", audio_key: "k", drive: { file_id: "F", access_token: "t" } }), io, plan: fakePlan() });
  assert.deepEqual([r.status, r.error.code], ["failed", "unexpected"]);
  assert.equal((await runJob({ job: { type: "nope" }, io, plan: fakePlan() })).error.code, "unknown_type");
  assert.ok(new JobFailure("c", "m") instanceof Error);
});

test("a validated request feeds runJob without reshaping", async () => {
  const j = validateJobRequest({ type: "copy_export", ad_video_id: "v9", org_id: "o", cut_version: 4, payload: { export_url: "https://cdn.submagic.co/e", submagic_key: "partners/p/ad-video/submagic/v9-v4.mp4" } });
  const { io } = fakeIo();
  const r = await runJob({ job: j, io, plan: fakePlan() });
  assert.equal(r.status, "done");
});
