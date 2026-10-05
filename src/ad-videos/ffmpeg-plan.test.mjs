// ffmpeg plans for the ad master (spec 9.3). Pure: no ffmpeg runs here.
//
// What these tests pin, in plain words:
//   - the master is 1080x1920 at 30 fps, and only for ads (a VSL keeps 4K)
//   - each piece is its own decode, cut on whole frames, with exact audio
//   - iPhone HDR is tonemapped and sideways video is read the right way up
//   - the final encode carries every setting in the spec's table
//   - every cut check fails the master when it should, and only then

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  FPS,
  SAMPLES_PER_FRAME,
  HDR_TONEMAP_CHAIN,
  FINAL_VIDEO_ARGS,
  FfmpegPlanError,
  numText,
  toFrame,
  parseRate,
  probeArgs,
  rotationOf,
  probeFacts,
  audioExtractArgs,
  silencedetectArgs,
  parseSilences,
  pieceVideoFilter,
  pieceAudioFilter,
  snapPiece,
  pieceEncodeArgs,
  spanLoudnessArgs,
  matchPieceGains,
  concatListText,
  loudnormPass1Args,
  parseLoudnorm,
  finalEncodeArgs,
  planMaster,
  blackdetectArgs,
  parseBlackdetect,
  edgeSnapped,
  cutChecks,
  checkFfmpegBuild,
} from "./ffmpeg-plan.mjs";

/** The value right after a flag in an argv array. */
function after(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

const SDR_PORTRAIT = {
  width: 1080, height: 1920, rotation: 0, displayWidth: 1080, displayHeight: 1920,
  colorTransfer: "bt709", isHdr: false, fps: 30, durationSeconds: 60,
  hasAudio: true, audioChannels: 2, recordedAt: null,
};

const IPHONE_HDR_SIDEWAYS_PROBE = {
  streams: [
    {
      codec_type: "video", codec_name: "hevc", width: 3840, height: 2160,
      color_transfer: "arib-std-b67", avg_frame_rate: "30000/1001", r_frame_rate: "30/1",
      side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
      tags: { creation_time: "2026-10-05T17:01:02.000000Z" },
    },
    { codec_type: "audio", codec_name: "aac", channels: 1 },
  ],
  format: { duration: "42.500000", tags: { creation_time: "2026-10-05T17:01:00.000000Z" } },
};

const LOUDNORM_STDERR = `
[Parsed_loudnorm_0 @ 0x55]
{
	"input_i" : "-23.54",
	"input_tp" : "-7.12",
	"input_lra" : "5.60",
	"input_thresh" : "-33.91",
	"output_i" : "-14.02",
	"output_tp" : "-1.50",
	"output_lra" : "4.90",
	"output_thresh" : "-24.30",
	"normalization_type" : "dynamic",
	"target_offset" : "0.02"
}
`;

describe("small helpers", () => {
  test("numText drops float noise and negative zero", () => {
    assert.equal(numText(0.1 + 0.2), "0.3");
    assert.equal(numText(-0), "0");
    assert.equal(numText(1 / 30), "0.033333");
    assert.throws(() => numText(NaN), FfmpegPlanError);
  });

  test("toFrame snaps to the nearest 1/30 s", () => {
    assert.equal(toFrame(1.0), 30);
    assert.equal(toFrame(1.016), 30);
    assert.equal(toFrame(1.017), 31);
  });

  test("parseRate reads ffprobe rates", () => {
    assert.ok(Math.abs(parseRate("30000/1001") - 29.97) < 0.01);
    assert.equal(parseRate("60/1"), 60);
    assert.equal(parseRate("0/0"), 0);
    assert.equal(parseRate(""), 0);
    assert.equal(parseRate(undefined), 0);
  });
});

describe("probe", () => {
  test("probeArgs asks for format and streams as JSON", () => {
    const a = probeArgs("/w/take.mov");
    assert.equal(after(a, "-print_format"), "json");
    assert.ok(a.includes("-show_streams") && a.includes("-show_format"));
    assert.equal(a.at(-1), "/w/take.mov");
  });

  test("rotation comes from side_data_list first, then tags.rotate", () => {
    assert.equal(rotationOf({ side_data_list: [{ rotation: -90 }] }), 270);
    assert.equal(rotationOf({ side_data_list: [{ rotation: 90 }], tags: { rotate: "180" } }), 90);
    assert.equal(rotationOf({ tags: { rotate: "180" } }), 180);
    assert.equal(rotationOf({ side_data_list: [{ side_data_type: "x" }] }), 0);
    assert.equal(rotationOf({}), 0);
  });

  test("an iPhone HDR take filmed upright reads as portrait, HDR, with its creation_time", () => {
    const f = probeFacts(IPHONE_HDR_SIDEWAYS_PROBE);
    assert.equal(f.rotation, 270);
    assert.equal(f.displayWidth, 2160);
    assert.equal(f.displayHeight, 3840);
    assert.equal(f.isHdr, true);
    assert.equal(f.colorTransfer, "arib-std-b67");
    assert.ok(Math.abs(f.fps - 29.97) < 0.01);
    assert.equal(f.durationSeconds, 42.5);
    assert.equal(f.hasAudio, true);
    assert.equal(f.audioChannels, 1);
    assert.equal(f.recordedAt, "2026-10-05T17:01:00.000000Z");
  });

  test("probeFacts takes JSON text too, and PQ (smpte2084) is HDR", () => {
    const text = JSON.stringify({
      streams: [{ codec_type: "video", width: 1080, height: 1920, color_transfer: "smpte2084" }],
      format: {},
    });
    const f = probeFacts(text);
    assert.equal(f.isHdr, true);
    assert.equal(f.hasAudio, false);
    assert.equal(f.rotation, 0);
  });

  test("a cover-art image is not the video stream", () => {
    assert.throws(
      () => probeFacts({ streams: [{ codec_type: "video", disposition: { attached_pic: 1 } }] }),
      (e) => e.code === "no_video_stream",
    );
  });
});

describe("prepare (spec 9.1 step 3)", () => {
  test("audio for Whisper is mono 16 kHz Opus 32 kbps", () => {
    const a = audioExtractArgs({ inputPath: "/w/t.mov", outputPath: "/w/t.ogg" });
    assert.equal(after(a, "-ac"), "1");
    assert.equal(after(a, "-ar"), "16000");
    assert.equal(after(a, "-c:a"), "libopus");
    assert.equal(after(a, "-b:a"), "32k");
    assert.ok(a.includes("-vn"));
    assert.equal(a.at(-1), "/w/t.ogg");
  });

  test("silencedetect uses -35 dB and 0.12 s", () => {
    const a = silencedetectArgs({ inputPath: "/w/t.mov" });
    assert.equal(after(a, "-af"), "silencedetect=noise=-35dB:d=0.12");
  });

  test("parseSilences pairs starts and ends, and closes an open silence at the end", () => {
    const err = [
      "[silencedetect @ 0x1] silence_start: 0",
      "[silencedetect @ 0x1] silence_end: 0.84 | silence_duration: 0.84",
      "[silencedetect @ 0x1] silence_start: 3.2",
      "[silencedetect @ 0x1] silence_end: 3.5 | silence_duration: 0.3",
      "[silencedetect @ 0x1] silence_start: 9.9",
    ].join("\n");
    assert.deepEqual(parseSilences(err, { durationSeconds: 10.4 }), [
      { start: 0, end: 0.84 },
      { start: 3.2, end: 3.5 },
      { start: 9.9, end: 10.4 },
    ]);
    assert.equal(parseSilences(err).length, 2);
    assert.deepEqual(parseSilences(""), []);
  });
});

describe("one piece", () => {
  test("filters run in the spec's order: tonemap, scale, fps, hflip", () => {
    const vf = pieceVideoFilter({ facts: { isHdr: true }, flipHorizontal: true });
    const iTone = vf.indexOf(HDR_TONEMAP_CHAIN);
    const iScale = vf.indexOf("scale=1080:1920:flags=lanczos");
    const iFps = vf.indexOf("fps=30");
    const iFlip = vf.indexOf("hflip");
    assert.equal(iTone, 0);
    assert.ok(iTone < iScale && iScale < iFps && iFps < iFlip);
  });

  test("the tonemap chain is the spec's, word for word", () => {
    assert.equal(
      HDR_TONEMAP_CHAIN,
      "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p",
    );
  });

  test("SDR has no tonemap, and no hflip unless the setting is on", () => {
    const vf = pieceVideoFilter({ facts: SDR_PORTRAIT });
    assert.ok(!vf.includes("zscale"));
    assert.ok(!vf.includes("tonemap"));
    assert.ok(!vf.includes("hflip"));
    assert.ok(vf.startsWith("scale=1080:1920:flags=lanczos,fps=30"));
  });

  test("snapPiece puts S, D and N on whole frames", () => {
    const p = snapPiece({ take: "t1", start: 1.01, end: 3.49, line: 2 });
    assert.equal(p.startFrame, 30);
    assert.equal(p.frames, 75); // 3.49 -> frame 105
    assert.equal(p.start, 1);
    assert.equal(p.duration, 2.5);
    assert.equal(p.samples, 75 * SAMPLES_PER_FRAME);
    assert.equal(p.take, "t1");
    assert.equal(p.line, 2);
    assert.equal(snapPiece({ take_id: 7, start: 0, end: 1 }).take, "7");
    assert.throws(() => snapPiece({ start: 0, end: 1 }), (e) => e.code === "piece_without_take");
  });

  test("audio is padded or trimmed to exactly N x 1600 samples with 15 ms fades", () => {
    const af = pieceAudioFilter({ frames: 75 });
    assert.ok(af.includes("aresample=48000"));
    assert.ok(af.includes("channel_layouts=stereo"));
    assert.ok(af.includes("apad=whole_len=120000"));
    assert.ok(af.includes("atrim=end_sample=120000"));
    assert.ok(af.includes("afade=t=in:st=0:d=0.015"));
    assert.ok(af.includes("afade=t=out:st=2.485:d=0.015"));
    assert.ok(af.indexOf("apad") < af.indexOf("atrim"));
    assert.ok(af.indexOf("atrim") < af.indexOf("afade=t=out"));
    assert.ok(!af.includes("volume="), "no gain unless asked");
    assert.ok(pieceAudioFilter({ frames: 75, gainDb: -2.5 }).includes("volume=-2.5dB"));
    assert.throws(() => pieceAudioFilter({ frames: 0 }), (e) => e.code === "bad_frames");
  });

  test("the encode is -ss S -t D -i take, -frames:v N, x264 crf 12 veryfast", () => {
    const a = pieceEncodeArgs({
      inputPath: "/w/take.mov",
      outputPath: "/w/piece-001.mkv",
      piece: { take: "t1", start: 1.01, end: 3.49 },
      facts: SDR_PORTRAIT,
    });
    const iSs = a.indexOf("-ss");
    const iT = a.indexOf("-t");
    const iI = a.indexOf("-i");
    assert.ok(iSs < iI && iT < iI, "-ss and -t are input options, before -i");
    assert.equal(after(a, "-ss"), "1");
    assert.equal(after(a, "-t"), "2.5");
    assert.equal(after(a, "-i"), "/w/take.mov");
    assert.equal(after(a, "-frames:v"), "75");
    assert.equal(after(a, "-c:v"), "libx264");
    assert.equal(after(a, "-crf"), "12");
    assert.equal(after(a, "-preset"), "veryfast");
    assert.equal(after(a, "-ar"), "48000");
    assert.equal(after(a, "-c:a"), "pcm_s16le");
    assert.equal(a.at(-1), "/w/piece-001.mkv");
  });

  test("a piece never splits or trims one decoded video input", () => {
    const a = pieceEncodeArgs({
      inputPath: "/w/take.mov",
      outputPath: "/w/p.mkv",
      piece: { take: "t1", start: 0, end: 2 },
      facts: { ...SDR_PORTRAIT, isHdr: true },
      flipHorizontal: true,
    });
    const vf = after(a, "-vf");
    assert.ok(!/\bsplit\b/.test(vf));
    assert.ok(!/\btrim\b/.test(vf));
    assert.ok(!a.includes("-filter_complex"));
    assert.equal(a.filter((x) => x === "-i").length, 1, "one input per piece");
  });

  test("span loudness is measured on the same S and D before the encode", () => {
    const a = spanLoudnessArgs({ inputPath: "/w/t.mov", start: 1, duration: 2.5 });
    assert.equal(after(a, "-ss"), "1");
    assert.equal(after(a, "-t"), "2.5");
    assert.ok(after(a, "-af").includes("loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json"));
  });
});

describe("matching pieces before the join", () => {
  test("gains bring each piece to the median loudness", () => {
    const g = matchPieceGains([
      { input_i: -20, input_tp: -10 },
      { input_i: -18, input_tp: -10 },
      { input_i: -24, input_tp: -10 },
    ]);
    assert.deepEqual(g, [0, -2, 4]);
  });

  test("a gain never pushes a true peak above -1 dBTP", () => {
    const g = matchPieceGains([
      { input_i: -18, input_tp: -6 },
      { input_i: -24, input_tp: -3 },
    ]);
    // median -21: piece 2 wants +3 but its peak allows +2 only.
    assert.deepEqual(g, [-3, 2]);
  });

  test("a piece too short or quiet to measure gets no gain", () => {
    assert.deepEqual(
      matchPieceGains([{ input_i: -70, input_tp: -40 }, { input_i: -20, input_tp: -9 }, { input_i: -Infinity }]),
      [0, 0, 0],
    );
    assert.deepEqual(matchPieceGains([]), []);
  });
});

describe("join, then encode once", () => {
  test("the concat list escapes single quotes", () => {
    assert.equal(concatListText(["/w/a.mkv", "/w/it's.mkv"]), "file '/w/a.mkv'\nfile '/w/it'\\''s.mkv'\n");
    assert.throws(() => concatListText([]), (e) => e.code === "no_pieces");
  });

  test("pass 1 measures the joined audio only", () => {
    const a = loudnormPass1Args({ concatListPath: "/w/pieces.txt" });
    assert.equal(after(a, "-f"), "concat");
    assert.equal(after(a, "-af"), "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json");
    assert.ok(a.includes("-vn"));
    assert.equal(a.at(-1), "-");
  });

  test("parseLoudnorm reads the numbers, last block wins", () => {
    const m = parseLoudnorm(LOUDNORM_STDERR);
    assert.deepEqual(m, { input_i: -23.54, input_tp: -7.12, input_lra: 5.6, input_thresh: -33.91, target_offset: 0.02 });
    const two = LOUDNORM_STDERR + LOUDNORM_STDERR.replace('"-23.54"', '"-19.00"');
    assert.equal(parseLoudnorm(two).input_i, -19);
    assert.equal(parseLoudnorm(LOUDNORM_STDERR.replace('"-7.12"', '"-inf"')).input_tp, -Infinity);
    assert.throws(() => parseLoudnorm("nothing here"), (e) => e.code === "loudnorm_missing");
  });

  test("the final encode carries every setting in the spec's table", () => {
    const a = finalEncodeArgs({
      concatListPath: "/w/pieces.txt",
      outputPath: "/w/master.mp4",
      measured: parseLoudnorm(LOUDNORM_STDERR),
    });
    const af = after(a, "-af");
    assert.ok(af.startsWith("loudnorm=I=-14:TP=-1.5:LRA=11:"));
    assert.ok(af.includes("measured_I=-23.54"));
    assert.ok(af.includes("measured_TP=-7.12"));
    assert.ok(af.includes("measured_LRA=5.6"));
    assert.ok(af.includes("measured_thresh=-33.91"));
    assert.ok(af.includes("offset=0.02"));
    assert.ok(af.includes("linear=true"));
    assert.ok(af.endsWith(",aresample=48000"));

    assert.equal(after(a, "-c:v"), "libx264");
    assert.equal(after(a, "-profile:v"), "high");
    assert.equal(after(a, "-crf"), "18");
    assert.equal(after(a, "-maxrate"), "12M");
    assert.equal(after(a, "-bufsize"), "24M");
    assert.equal(after(a, "-pix_fmt"), "yuv420p");
    assert.equal(after(a, "-color_primaries"), "bt709");
    assert.equal(after(a, "-color_trc"), "bt709");
    assert.equal(after(a, "-colorspace"), "bt709");
    assert.equal(after(a, "-r"), "30");
    assert.equal(after(a, "-fps_mode"), "cfr");
    assert.equal(after(a, "-c:a"), "aac");
    assert.equal(after(a, "-b:a"), "192k");
    assert.equal(after(a, "-ar"), "48000");
    assert.equal(after(a, "-ac"), "2");
    assert.equal(after(a, "-movflags"), "+faststart");
    assert.equal(a.filter((x) => x === "-i").length, 1, "one join, one encode");
    assert.equal(a.at(-1), "/w/master.mp4");
  });

  test("pass 2 refuses to run without pass 1's numbers", () => {
    assert.throws(
      () => finalEncodeArgs({ concatListPath: "/w/l.txt", outputPath: "/w/m.mp4", measured: { input_i: -20 } }),
      (e) => e.code === "loudnorm_unmeasured",
    );
  });

  test("the overlay step can reuse the same video settings", () => {
    assert.ok(Object.isFrozen(FINAL_VIDEO_ARGS));
    assert.equal(after([...FINAL_VIDEO_ARGS], "-crf"), "18");
  });
});

describe("planMaster", () => {
  const takes = {
    a: { path: "/w/a.mov", facts: SDR_PORTRAIT },
    b: { path: "/w/b.mov", facts: probeFacts(IPHONE_HDR_SIDEWAYS_PROBE) },
  };
  const pieces = [
    { take: "a", start: 0.5, end: 2.0, line: 1 },
    { take: "b", start: 4.0, end: 7.2, line: 2 },
    { take: "a", start: 10.0, end: 12.0, line: 3 },
  ];

  test("refuses anything that is not an ad (VSLs keep 4K)", () => {
    for (const kind of ["vsl", "welcome", undefined]) {
      assert.throws(
        () => planMaster({ videoKind: kind, pieces, takes, workDir: "/w", outputPath: "/w/m.mp4" }),
        (e) => e.code === "not_an_ad",
      );
    }
  });

  test("plans one decode per piece, in script order, and adds up the frames", () => {
    const plan = planMaster({ videoKind: "ad", pieces, takes, flipHorizontal: true, workDir: "/w/", outputPath: "/w/m.mp4" });
    assert.equal(plan.pieces.length, 3);
    assert.deepEqual(plan.pieces.map((p) => p.file), ["/w/piece-001.mkv", "/w/piece-002.mkv", "/w/piece-003.mkv"]);
    assert.deepEqual(plan.pieces.map((p) => p.frames), [45, 96, 60]);
    assert.equal(plan.frames, 201);
    assert.equal(plan.durationSeconds, 201 / FPS);
    assert.equal(plan.concatListPath, "/w/pieces.txt");
    assert.equal(plan.concatList, "file '/w/piece-001.mkv'\nfile '/w/piece-002.mkv'\nfile '/w/piece-003.mkv'\n");

    const enc2 = plan.pieces[1].encodeArgs(1.5);
    assert.equal(after(enc2, "-i"), "/w/b.mov");
    assert.ok(after(enc2, "-vf").startsWith(HDR_TONEMAP_CHAIN), "the HDR take is tonemapped");
    assert.ok(after(enc2, "-vf").includes("hflip"));
    assert.ok(after(enc2, "-af").includes("volume=1.5dB"));
    const enc1 = plan.pieces[0].encodeArgs();
    assert.ok(!after(enc1, "-vf").includes("tonemap"), "the SDR take is not");

    assert.equal(after(plan.pass1Args, "-i"), "/w/pieces.txt");
    assert.equal(plan.pass2Args(parseLoudnorm(LOUDNORM_STDERR)).at(-1), "/w/m.mp4");
    assert.equal(after(plan.blackdetectArgs, "-i"), "/w/m.mp4");
    assert.equal(after(plan.pieces[2].checkArgs, "-i"), "/w/piece-003.mkv");
  });

  test("a landscape take is refused instead of squashed", () => {
    const wide = { ...SDR_PORTRAIT, width: 1920, height: 1080, displayWidth: 1920, displayHeight: 1080 };
    assert.throws(
      () => planMaster({ videoKind: "ad", pieces: [{ take: "w", start: 0, end: 1 }], takes: { w: { path: "/w/w.mov", facts: wide } }, workDir: "/w", outputPath: "/w/m.mp4" }),
      (e) => e.code === "take_not_portrait",
    );
  });

  test("unknown takes, silent takes, empty pieces and pieces past the end are refused", () => {
    const base = { videoKind: "ad", workDir: "/w", outputPath: "/w/m.mp4" };
    assert.throws(() => planMaster({ ...base, pieces: [{ take: "zz", start: 0, end: 1 }], takes }), (e) => e.code === "unknown_take");
    assert.throws(
      () => planMaster({ ...base, pieces: [{ take: "s", start: 0, end: 1 }], takes: { s: { path: "/w/s.mov", facts: { ...SDR_PORTRAIT, hasAudio: false } } } }),
      (e) => e.code === "take_without_audio",
    );
    assert.throws(() => planMaster({ ...base, pieces: [{ take: "a", start: 1, end: 1.01 }], takes }), (e) => e.code === "empty_piece");
    assert.throws(() => planMaster({ ...base, pieces: [{ take: "a", start: 59, end: 61 }], takes }), (e) => e.code === "piece_past_end");
    assert.throws(() => planMaster({ ...base, pieces: [], takes }), (e) => e.code === "no_pieces");
  });
});

describe("cut checks (best-of-clips law)", () => {
  const plan = planMaster({
    videoKind: "ad",
    pieces: [
      { take: "a", start: 0.5, end: 2.0 },
      { take: "b", start: 4.0, end: 7.2 },
    ],
    takes: {
      a: { path: "/w/a.mov", facts: SDR_PORTRAIT },
      b: { path: "/w/b.mov", facts: SDR_PORTRAIT },
    },
    workDir: "/w",
    outputPath: "/w/m.mp4",
  });
  const silences = { a: [{ start: 1.95, end: 2.4 }], b: [{ start: 3.6, end: 4.05 }] };
  const good = [
    { input_i: -18.2, input_tp: -4 },
    { input_i: -18.6, input_tp: -3.5 },
  ];

  test("a clean cut passes", () => {
    assert.deepEqual(cutChecks({ pieces: plan.pieces, pieceMeasures: good, black: [], silences }), { ok: true, failures: [] });
  });

  test("a piece under 8 frames fails", () => {
    const short = [{ ...plan.pieces[0], frames: 7 }, plan.pieces[1]];
    const r = cutChecks({ pieces: short, pieceMeasures: good, black: [], silences: { a: [{ start: 0.7, end: 1 }], b: silences.b } });
    assert.equal(r.ok, false);
    assert.deepEqual(r.failures.map((f) => f.check), ["piece_too_short"]);
  });

  test("pieces more than 1 LU apart fail", () => {
    const r = cutChecks({ pieces: plan.pieces, pieceMeasures: [{ input_i: -16, input_tp: -4 }, { input_i: -17.5, input_tp: -4 }], black: [], silences });
    assert.deepEqual(r.failures.map((f) => f.check), ["loudness_unmatched"]);
  });

  test("a peak above -1 dBTP fails", () => {
    const r = cutChecks({ pieces: plan.pieces, pieceMeasures: [{ input_i: -18, input_tp: -0.4 }, good[1]], black: [], silences });
    assert.deepEqual(r.failures.map((f) => f.check), ["peak_too_hot"]);
  });

  test("missing loudness readings fail instead of passing quietly", () => {
    const r = cutChecks({ pieces: plan.pieces, pieceMeasures: [good[0]], black: [], silences });
    assert.deepEqual(r.failures.map((f) => f.check), ["loudness_unmeasured"]);
  });

  test("any black frame fails", () => {
    const black = parseBlackdetect("[blackdetect @ 0x1] black_start:3.2 black_end:3.233333 black_duration:0.033333");
    assert.deepEqual(black, [{ start: 3.2, end: 3.233333, duration: 0.033333 }]);
    const r = cutChecks({ pieces: plan.pieces, pieceMeasures: good, black, silences });
    assert.deepEqual(r.failures.map((f) => f.check), ["black_frames"]);
  });

  test("a join that missed a silence in reach fails (a breath was left in)", () => {
    const r = cutChecks({ pieces: plan.pieces, pieceMeasures: good, black: [], silences: { a: [{ start: 2.1, end: 2.4 }], b: silences.b } });
    assert.equal(r.ok, false);
    assert.equal(r.failures[0].check, "join_not_snapped");
    assert.equal(r.failures[0].piece, 1);
  });

  test("edgeSnapped: inside a silence passes, nothing in reach passes, a near miss fails", () => {
    assert.equal(edgeSnapped(2.0, [{ start: 1.95, end: 2.4 }]), true);
    assert.equal(edgeSnapped(2.0, [{ start: 2.02, end: 2.4 }]), true, "within one frame");
    assert.equal(edgeSnapped(2.0, [{ start: 2.5, end: 3 }]), true, "nothing within 250 ms");
    assert.equal(edgeSnapped(2.0, []), true);
    assert.equal(edgeSnapped(2.0, undefined), true);
    assert.equal(edgeSnapped(2.0, [{ start: 2.2, end: 2.6 }]), false);
    assert.equal(edgeSnapped(2.0, [{ start: 1.5, end: 1.8 }]), false);
  });

  test("blackdetect looks for a single frame of black", () => {
    const a = blackdetectArgs({ inputPath: "/w/m.mp4" });
    assert.equal(after(a, "-vf"), "blackdetect=d=0.033:pix_th=0.1");
    assert.ok(a.includes("-an"));
  });
});

describe("the worker's ffmpeg build", () => {
  const ok = "ffmpeg version 6.1.1 Copyright (c) 2000-2023\nconfiguration: --enable-gpl --enable-libzimg --enable-libx264";
  test("6.1 with libzimg passes", () => {
    assert.deepEqual(checkFfmpegBuild(ok), { ok: true, version: "6.1", problems: [] });
    assert.equal(checkFfmpegBuild("ffmpeg version n7.0 --enable-libzimg").ok, true);
  });
  test("older ffmpeg or no libzimg fails, by name", () => {
    assert.deepEqual(checkFfmpegBuild("ffmpeg version 6.0 --enable-libzimg").problems, ["version_below_6_1"]);
    assert.deepEqual(checkFfmpegBuild("ffmpeg version 5.1.4 --enable-gpl").problems, ["version_below_6_1", "no_libzimg"]);
    assert.deepEqual(checkFfmpegBuild("").problems, ["version_unreadable", "no_libzimg"]);
  });
});

describe("arguments are paths, never empty", () => {
  test("empty paths are refused", () => {
    assert.throws(() => probeArgs(""), (e) => e.code === "bad_path");
    assert.throws(() => blackdetectArgs({ inputPath: " " }), (e) => e.code === "bad_path");
    assert.throws(() => planMaster({ videoKind: "ad", pieces: [{ take: "a", start: 0, end: 1 }], takes: {}, workDir: "", outputPath: "/m" }), (e) => e.code === "bad_path");
  });
});
