// ffmpeg plans for the ad master (spec 9.3) and the cut checks that guard it.
//
// PURE. Nothing here runs ffmpeg, reads a file, or calls the network. Every
// function takes plain data (an ffprobe JSON, the aligner's pieces, ffmpeg's
// stderr text) and returns plain data (argument arrays, numbers, verdicts).
// The video worker (`video-worker/`, spec 9.5) is a thin shell that spawns
// ffmpeg with these arrays and feeds the output back into the parsers here.
//
// THE ORDER NEVER CHANGES (spec 9, owner-set 2026-10-04):
//   cut -> Submagic captions -> animation overlays -> finalize.
// This file builds the CUT master. It never draws an animation into it.
//
// ADS ONLY. The master is 1080x1920 at 30 fps. That is allowed for paid ads
// and for nothing else (law: .claude/rules/video-4k-unless-ad.md). A VSL or
// any other non-ad video keeps 4K end to end, so planMaster() refuses any
// video_kind other than 'ad' instead of quietly shrinking it.
//
// ONE DECODE PER PIECE. Each piece is its own ffmpeg run with its own
// `-ss S -t D -i take`. The plan never splits one decoded input and trims it
// into several pieces (spec 9.3), because that holds every frame of the take
// in memory and drifts audio against video at the joins.

export const FPS = 30;
export const SAMPLE_RATE = 48000;
/** Audio samples in one video frame: 48000 / 30. */
export const SAMPLES_PER_FRAME = SAMPLE_RATE / FPS; // 1600
export const OUT_WIDTH = 1080;
export const OUT_HEIGHT = 1920;
/** 15 ms fade at each piece edge so a join never clicks. */
export const PIECE_FADE_SECONDS = 0.015;
/** No piece shorter than 8 frames (spec 9.3 cut checks). */
export const MIN_PIECE_FRAMES = 8;
/** Peaks at or below -1 dBTP before the join (spec 9.3 cut checks). */
export const MAX_PIECE_TRUE_PEAK = -1;
/**
 * How far apart two pieces' loudness may sit and still count as "matched".
 * The spec says matched but gives no number; 1 LU is the same tolerance the
 * finalize step uses for "fix loudness if more than 1 LU off" (spec 9.1 step 11).
 */
export const PIECE_LOUDNESS_TOLERANCE_LU = 1;
/** Below this, ffmpeg's integrated loudness is a gate floor, not a measurement. */
export const UNMEASURABLE_LUFS = -60;
/** Author-set: how far a take may sit from exactly 9:16 (width/height) and still be scaled. */
export const ASPECT_TOLERANCE = 0.01;
/** A silence this close to a join means the join should have snapped to it (spec 9.2 step 5). */
export const SNAP_WINDOW_SECONDS = 0.25;

/** The loudness target for the joined master (spec 9.3). */
export const LOUDNORM_TARGET = Object.freeze({ I: -14, TP: -1.5, LRA: 11 });

/** silencedetect settings used when a take is prepared (spec 9.1 step 3). */
export const SILENCE_NOISE = "-35dB";
export const SILENCE_MIN_SECONDS = 0.12;

/** blackdetect: one frame of near-black is enough to fail the master. */
export const BLACK_MIN_SECONDS = 0.033;
export const BLACK_PIXEL_THRESHOLD = 0.1;

/** iPhone HDR transfers that need the tonemap (spec 9.3). */
export const HDR_TRANSFERS = Object.freeze(["arib-std-b67", "smpte2084"]);

/** The tonemap chain, word for word from spec 9.3. */
export const HDR_TONEMAP_CHAIN =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0," +
  "zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

/** bt709 tags on every encode we write. */
const BT709_TAGS = Object.freeze([
  "-color_primaries", "bt709",
  "-color_trc", "bt709",
  "-colorspace", "bt709",
  "-color_range", "tv",
]);

/** Intermediate pieces: near-lossless x264 so the one final encode has clean input. */
export const PIECE_VIDEO_ARGS = Object.freeze([
  "-c:v", "libx264",
  "-crf", "12",
  "-preset", "veryfast",
  "-pix_fmt", "yuv420p",
  ...BT709_TAGS,
]);

/** PCM in the pieces: AAC would add priming samples and break the sample-exact joins. */
export const PIECE_AUDIO_ARGS = Object.freeze([
  "-c:a", "pcm_s16le",
  "-ar", String(SAMPLE_RATE),
  "-ac", "2",
]);

/**
 * The final video settings (spec 9.3 table). The overlay step (9.4) re-encodes
 * the video once with these same settings and copies the audio, so it imports
 * this list rather than writing its own.
 */
export const FINAL_VIDEO_ARGS = Object.freeze([
  "-c:v", "libx264",
  "-profile:v", "high",
  "-crf", "18",
  "-maxrate", "12M",
  "-bufsize", "24M",
  "-pix_fmt", "yuv420p",
  ...BT709_TAGS,
  "-r", String(FPS),
  "-fps_mode", "cfr",
]);

/** The final audio settings (spec 9.3 table). */
export const FINAL_AUDIO_ARGS = Object.freeze([
  "-c:a", "aac",
  "-b:a", "192k",
  "-ar", String(SAMPLE_RATE),
  "-ac", "2",
]);

export const FASTSTART_ARGS = Object.freeze(["-movflags", "+faststart"]);

/** A plan that cannot be built. `code` is stable; the worker stores it as the reason. */
export class FfmpegPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FfmpegPlanError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** A number as ffmpeg text, with no float noise (0.30000000000000004 -> "0.3"). */
export function numText(seconds) {
  if (!Number.isFinite(seconds)) throw new FfmpegPlanError("bad_number", `not a number of seconds: ${seconds}`);
  const t = Number(seconds.toFixed(6));
  return String(Object.is(t, -0) ? 0 : t);
}

/** Snap a time to the nearest 1/30 s frame boundary; returns the frame index. */
export function toFrame(seconds) {
  if (!Number.isFinite(seconds)) throw new FfmpegPlanError("bad_number", `not a number of seconds: ${seconds}`);
  return Math.round(seconds * FPS);
}

/** Parse "30000/1001" or "30" into a number; 0 when ffprobe had nothing. */
export function parseRate(rate) {
  if (typeof rate === "number") return Number.isFinite(rate) ? rate : 0;
  if (typeof rate !== "string" || !rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  if (!Number.isFinite(n)) return 0;
  if (d === undefined) return n;
  return Number.isFinite(d) && d !== 0 ? n / d : 0;
}

// ---------------------------------------------------------------------------
// Probe (ffprobe) — what the take is
// ---------------------------------------------------------------------------

/** ffprobe arguments that print the JSON `probeFacts` reads. */
export function probeArgs(inputPath) {
  requirePath(inputPath, "inputPath");
  return ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath];
}

/**
 * Read rotation from the video stream: `side_data_list` (Display Matrix)
 * first, then the older `tags.rotate`. Normalized to 0, 90, 180 or 270.
 */
export function rotationOf(stream) {
  let raw = null;
  for (const sd of stream?.side_data_list ?? []) {
    if (sd && sd.rotation !== undefined && sd.rotation !== null && sd.rotation !== "") {
      raw = Number(sd.rotation);
      break;
    }
  }
  if (raw === null && stream?.tags?.rotate !== undefined) raw = Number(stream.tags.rotate);
  if (!Number.isFinite(raw)) return 0;
  const r = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return r;
}

/**
 * The facts the master plan needs, from `ffprobe -show_format -show_streams`
 * JSON (an object or its text). Width and height are as stored; displayWidth
 * and displayHeight are swapped at +/-90 degrees (spec 9.3), which is how the
 * picture looks after ffmpeg's default autorotate.
 */
export function probeFacts(probe) {
  const p = typeof probe === "string" ? JSON.parse(probe) : probe;
  const streams = Array.isArray(p?.streams) ? p.streams : [];
  const video = streams.find((s) => s?.codec_type === "video" && !s?.disposition?.attached_pic);
  const audio = streams.find((s) => s?.codec_type === "audio");
  if (!video) throw new FfmpegPlanError("no_video_stream", "the take has no video stream");

  const width = Number(video.width) || 0;
  const height = Number(video.height) || 0;
  const rotation = rotationOf(video);
  const sideways = rotation === 90 || rotation === 270;
  const colorTransfer = video.color_transfer || null;
  const durationSeconds =
    Number(p?.format?.duration) || Number(video.duration) || 0;
  const recordedAt =
    p?.format?.tags?.creation_time || video?.tags?.creation_time || null;

  return {
    width,
    height,
    rotation,
    displayWidth: sideways ? height : width,
    displayHeight: sideways ? width : height,
    colorTransfer,
    isHdr: HDR_TRANSFERS.includes(colorTransfer),
    fps: parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate),
    durationSeconds,
    hasAudio: Boolean(audio),
    audioChannels: audio ? Number(audio.channels) || 0 : 0,
    recordedAt,
  };
}

// ---------------------------------------------------------------------------
// Prepare (spec 9.1 step 3): the audio file for Whisper, and the silences
// ---------------------------------------------------------------------------

/** Mono 16 kHz Opus 32 kbps .ogg for transcription (spec 9.1 step 3). */
export function audioExtractArgs({ inputPath, outputPath }) {
  requirePath(inputPath, "inputPath");
  requirePath(outputPath, "outputPath");
  return [
    "-hide_banner", "-nostdin", "-y",
    "-i", inputPath,
    "-map", "0:a:0", "-vn",
    "-ac", "1", "-ar", "16000",
    "-c:a", "libopus", "-b:a", "32k",
    outputPath,
  ];
}

/** silencedetect over the take's audio (spec 9.1 step 3). Output goes to stderr. */
export function silencedetectArgs({ inputPath }) {
  requirePath(inputPath, "inputPath");
  return [
    "-hide_banner", "-nostdin",
    "-i", inputPath,
    "-map", "0:a:0", "-vn",
    "-af", `silencedetect=noise=${SILENCE_NOISE}:d=${SILENCE_MIN_SECONDS}`,
    "-f", "null", "-",
  ];
}

/**
 * Parse silencedetect's stderr into [{start, end}] in seconds. A silence still
 * open when the file ends closes at `durationSeconds` when given.
 */
export function parseSilences(stderr, { durationSeconds } = {}) {
  const out = [];
  let open = null;
  for (const line of String(stderr ?? "").split(/\r?\n/)) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) {
      open = Math.max(0, Number(s[1]));
      continue;
    }
    const e = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (e && open !== null) {
      out.push({ start: open, end: Number(e[1]) });
      open = null;
    }
  }
  if (open !== null && Number.isFinite(durationSeconds) && durationSeconds > open) {
    out.push({ start: open, end: durationSeconds });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The master, one piece at a time
// ---------------------------------------------------------------------------

/**
 * The video filter for one piece, in the spec's order:
 * tonemap if needed, scale=1080:1920:flags=lanczos, fps=30, then hflip if on.
 * setpts=N/30/TB sits right after fps so every piece's frames start at 0.
 * setsar=1 goes last so every piece concatenates with the same shape.
 */
export function pieceVideoFilter({ facts, flipHorizontal = false }) {
  const parts = [];
  if (facts?.isHdr) parts.push(HDR_TONEMAP_CHAIN);
  parts.push(`scale=${OUT_WIDTH}:${OUT_HEIGHT}:flags=lanczos`);
  parts.push(`fps=${FPS}`);
  // Restamp frames from zero, like asetpts on the audio. Without it, fps=30
  // after -ss on a 29.97 source starts ~40% of pieces at 0.033 s, the concat
  // shifts them, and the final cfr encode inserts repeated (freeze) frames.
  parts.push(`setpts=N/${FPS}/TB`);
  if (flipHorizontal) parts.push("hflip");
  parts.push("setsar=1");
  return parts.join(",");
}

/**
 * The audio filter for one piece: 48 kHz stereo, the matching gain, a 15 ms
 * fade in, padded or trimmed to exactly frames x 1600 samples, a 15 ms fade out.
 */
export function pieceAudioFilter({ frames, gainDb = 0 }) {
  if (!Number.isInteger(frames) || frames <= 0) {
    throw new FfmpegPlanError("bad_frames", `frames must be a positive whole number, got ${frames}`);
  }
  const samples = frames * SAMPLES_PER_FRAME;
  const seconds = samples / SAMPLE_RATE;
  const fadeOutAt = Math.max(0, seconds - PIECE_FADE_SECONDS);
  const parts = [`aresample=${SAMPLE_RATE}`, "aformat=sample_fmts=fltp:channel_layouts=stereo"];
  if (gainDb) parts.push(`volume=${numText(gainDb)}dB`);
  parts.push(`afade=t=in:st=0:d=${PIECE_FADE_SECONDS}`);
  parts.push(`apad=whole_len=${samples}`);
  parts.push(`atrim=end_sample=${samples}`);
  parts.push("asetpts=N/SR/TB");
  parts.push(`afade=t=out:st=${numText(fadeOutAt)}:d=${PIECE_FADE_SECONDS}`);
  return parts.join(",");
}

/**
 * Snap one aligner piece to frames. Input `{take|take_id, start, end, line}`
 * in take seconds. Returns S, D and N (spec 9.3) plus the exact sample count.
 */
export function snapPiece(piece) {
  const take = piece?.take_id ?? piece?.take;
  if (take === undefined || take === null || take === "") {
    throw new FfmpegPlanError("piece_without_take", "a piece names no take");
  }
  const startFrame = toFrame(Number(piece.start));
  const endFrame = toFrame(Number(piece.end));
  if (startFrame < 0) throw new FfmpegPlanError("piece_before_zero", `piece starts before 0 s in take ${take}`);
  const frames = endFrame - startFrame;
  return {
    take: String(take),
    line: piece.line ?? null,
    startFrame,
    frames,
    start: startFrame / FPS,
    duration: frames / FPS,
    samples: frames * SAMPLES_PER_FRAME,
  };
}

/** Measure one source span's loudness before encoding it, so pieces can be matched. */
export function spanLoudnessArgs({ inputPath, start, duration }) {
  requirePath(inputPath, "inputPath");
  return [
    "-hide_banner", "-nostdin",
    "-ss", numText(start), "-t", numText(duration),
    "-i", inputPath,
    "-map", "0:a:0", "-vn",
    "-af", `aresample=${SAMPLE_RATE},${loudnormFilter()}:print_format=json`,
    "-f", "null", "-",
  ];
}

/** Measure an encoded piece's loudness and true peak (the cut check reads this). */
export function pieceLoudnessArgs({ piecePath }) {
  requirePath(piecePath, "piecePath");
  return [
    "-hide_banner", "-nostdin",
    "-i", piecePath,
    "-map", "0:a:0", "-vn",
    "-af", `${loudnormFilter()}:print_format=json`,
    "-f", "null", "-",
  ];
}

/** The ffmpeg arguments that encode one piece. */
export function pieceEncodeArgs({ inputPath, outputPath, piece, facts, flipHorizontal = false, gainDb = 0 }) {
  requirePath(inputPath, "inputPath");
  requirePath(outputPath, "outputPath");
  const p = piece?.frames !== undefined && piece?.startFrame !== undefined ? piece : snapPiece(piece);
  return [
    "-hide_banner", "-nostdin", "-y",
    "-ss", numText(p.start), "-t", numText(p.duration),
    "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-vf", pieceVideoFilter({ facts, flipHorizontal }),
    "-af", pieceAudioFilter({ frames: p.frames, gainDb }),
    "-frames:v", String(p.frames),
    ...PIECE_VIDEO_ARGS,
    ...PIECE_AUDIO_ARGS,
    outputPath,
  ];
}

/**
 * The per-piece gain that matches pieces to each other before the join.
 * Target is the median measured loudness, so the cut stays near the source
 * level and the two-pass loudnorm does the rest. Gain is capped so a piece's
 * true peak never rises above -1 dBTP. A piece too short or quiet to measure
 * gets no gain.
 *
 * `measures` is [{ input_i, input_tp }] in piece order (parseLoudnorm output).
 * Returns gains in dB, one per piece.
 */
export function matchPieceGains(measures) {
  const list = Array.isArray(measures) ? measures : [];
  const usable = list
    .map((m) => Number(m?.input_i))
    .filter((i) => Number.isFinite(i) && i > UNMEASURABLE_LUFS);
  if (usable.length === 0) return list.map(() => 0);
  const target = median(usable);
  return list.map((m) => {
    const i = Number(m?.input_i);
    if (!Number.isFinite(i) || i <= UNMEASURABLE_LUFS) return 0;
    let gain = target - i;
    const tp = Number(m?.input_tp);
    if (Number.isFinite(tp)) gain = Math.min(gain, MAX_PIECE_TRUE_PEAK - tp);
    return Number(gain.toFixed(2));
  });
}

// ---------------------------------------------------------------------------
// Join, then encode once
// ---------------------------------------------------------------------------

/** A concat-demuxer list. Single quotes in a path are escaped the way ffmpeg reads them. */
export function concatListText(piecePaths) {
  if (!Array.isArray(piecePaths) || piecePaths.length === 0) {
    throw new FfmpegPlanError("no_pieces", "nothing to join");
  }
  return piecePaths
    .map((p) => {
      requirePath(p, "piece path");
      if (/[\r\n]/.test(p)) {
        throw new FfmpegPlanError("bad_path", "a piece path holds a line break, which would forge a concat entry");
      }
      return `file '${String(p).replace(/'/g, "'\\''")}'`;
    })
    .join("\n") + "\n";
}

/** The loudnorm target as a filter, without measured values. */
export function loudnormFilter() {
  return `loudnorm=I=${LOUDNORM_TARGET.I}:TP=${LOUDNORM_TARGET.TP}:LRA=${LOUDNORM_TARGET.LRA}`;
}

/** Loudnorm pass 1 over the joined pieces: measure only, print JSON to stderr. */
export function loudnormPass1Args({ concatListPath }) {
  requirePath(concatListPath, "concatListPath");
  return [
    "-hide_banner", "-nostdin",
    "-f", "concat", "-safe", "0", "-i", concatListPath,
    "-map", "0:a:0", "-vn",
    "-af", `${loudnormFilter()}:print_format=json`,
    "-f", "null", "-",
  ];
}

/**
 * Read loudnorm's JSON block from ffmpeg stderr (the last one when there are
 * several). Returns numbers: input_i, input_tp, input_lra, input_thresh,
 * target_offset, plus normalization_type ("linear" or "dynamic", lowercased).
 * Throws when the block is missing or not numeric.
 */
export function parseLoudnorm(stderr) {
  const text = String(stderr ?? "");
  const blocks = text.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!blocks) throw new FfmpegPlanError("loudnorm_missing", "no loudnorm measurement in ffmpeg output");
  const raw = JSON.parse(blocks[blocks.length - 1]);
  const out = {};
  for (const k of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) {
    const v = Number(raw[k]);
    out[k] = Number.isFinite(v) ? v : raw[k] === "-inf" ? -Infinity : NaN;
  }
  out.normalization_type = typeof raw.normalization_type === "string" ? raw.normalization_type.toLowerCase() : null;
  if (!Number.isFinite(out.input_i) && out.input_i !== -Infinity) {
    throw new FfmpegPlanError("loudnorm_unreadable", "loudnorm measurement is not a number");
  }
  return out;
}

/**
 * The one final encode: concat the pieces, loudnorm pass 2 (linear, from the
 * pass-1 numbers), aresample 48 kHz, H.264 High, bt709, constant 30, AAC 192k,
 * +faststart (spec 9.3).
 */
export function finalEncodeArgs({ concatListPath, outputPath, measured }) {
  requirePath(concatListPath, "concatListPath");
  requirePath(outputPath, "outputPath");
  const m = measured ?? {};
  for (const k of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) {
    if (!Number.isFinite(Number(m[k]))) {
      throw new FfmpegPlanError("loudnorm_unmeasured", `pass 2 needs a measured ${k}; got ${m[k]}`);
    }
  }
  const pass2 =
    `${loudnormFilter()}` +
    `:measured_I=${numText(Number(m.input_i))}` +
    `:measured_TP=${numText(Number(m.input_tp))}` +
    `:measured_LRA=${numText(Number(m.input_lra))}` +
    `:measured_thresh=${numText(Number(m.input_thresh))}` +
    `:offset=${numText(Number(m.target_offset))}` +
    `:linear=true:print_format=json,aresample=${SAMPLE_RATE}`;
  return [
    "-hide_banner", "-nostdin", "-y",
    "-f", "concat", "-safe", "0", "-i", concatListPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-af", pass2,
    ...FINAL_VIDEO_ARGS,
    ...FINAL_AUDIO_ARGS,
    ...FASTSTART_ARGS,
    outputPath,
  ];
}

// ---------------------------------------------------------------------------
// The whole master plan
// ---------------------------------------------------------------------------

/**
 * Plan the master from the aligner's cut plan.
 *
 * @param {object} args
 * @param {string} args.videoKind   must be 'ad' (law: video-4k-unless-ad)
 * @param {Array}  args.pieces      the aligner's pieces [{take|take_id, start, end, line}], in script order
 * @param {object} args.takes       { [takeId]: { path, facts } } where facts = probeFacts(...)
 * @param {boolean} [args.flipHorizontal]  marketing_settings.flip_horizontal
 * @param {string} args.workDir     where piece files and the concat list go
 * @param {string} args.outputPath  the master .mp4
 * @returns a plan: pieces (with their measure and encode args), the concat
 *   list, pass 1, a pass2(measured) builder, and the master's frame count.
 */
export function planMaster({ videoKind, pieces, takes, flipHorizontal = false, workDir, outputPath }) {
  if (videoKind !== "ad") {
    throw new FfmpegPlanError(
      "not_an_ad",
      `the 1080x1920 master is for ads only; video_kind '${videoKind}' keeps its source resolution`,
    );
  }
  requirePath(workDir, "workDir");
  requirePath(outputPath, "outputPath");
  if (!Array.isArray(pieces) || pieces.length === 0) {
    throw new FfmpegPlanError("no_pieces", "the cut plan has no pieces");
  }
  const dir = String(workDir).replace(/\/+$/, "");

  const planned = pieces.map((raw, index) => {
    const p = snapPiece(raw);
    const take = takes?.[p.take];
    if (!take || !take.path || !take.facts) {
      throw new FfmpegPlanError("unknown_take", `piece ${index + 1} names take ${p.take}, which has no file or probe`);
    }
    const facts = take.facts;
    if (!facts.hasAudio) {
      throw new FfmpegPlanError("take_without_audio", `take ${p.take} has no audio`);
    }
    if (!isNineBySixteen(facts)) {
      throw new FfmpegPlanError(
        "take_not_9x16",
        `take ${p.take} is ${facts.displayWidth}x${facts.displayHeight}; only 9:16 scales to 1080x1920 without stretching`,
      );
    }
    if (p.frames <= 0) {
      throw new FfmpegPlanError("empty_piece", `piece ${index + 1} has no frames`);
    }
    const endFrame = p.startFrame + p.frames;
    const lastFrame = Math.floor((facts.durationSeconds || 0) * FPS + 1e-6);
    if (facts.durationSeconds && endFrame > lastFrame + 1) {
      throw new FfmpegPlanError(
        "piece_past_end",
        `piece ${index + 1} ends at ${numText(endFrame / FPS)} s, after take ${p.take} ends at ${numText(facts.durationSeconds)} s`,
      );
    }
    const file = `${dir}/piece-${String(index + 1).padStart(3, "0")}.mkv`;
    return {
      index,
      ...p,
      file,
      measureArgs: spanLoudnessArgs({ inputPath: take.path, start: p.start, duration: p.duration }),
      encodeArgs: (gainDb = 0) =>
        pieceEncodeArgs({ inputPath: take.path, outputPath: file, piece: p, facts, flipHorizontal, gainDb }),
      checkArgs: pieceLoudnessArgs({ piecePath: file }),
    };
  });

  const concatListPath = `${dir}/pieces.txt`;
  const frames = planned.reduce((n, p) => n + p.frames, 0);
  return {
    pieces: planned,
    concatListPath,
    // The concat demuxer reads entries relative to the list's own folder, and
    // the pieces sit beside the list, so the entries are bare file names.
    concatList: concatListText(planned.map((p) => p.file.slice(dir.length + 1))),
    pass1Args: loudnormPass1Args({ concatListPath }),
    pass2Args: (measured) => finalEncodeArgs({ concatListPath, outputPath, measured }),
    blackdetectArgs: blackdetectArgs({ inputPath: outputPath }),
    frameCountArgs: frameCountArgs({ inputPath: outputPath }),
    outputPath,
    frames,
    durationSeconds: frames / FPS,
  };
}

// ---------------------------------------------------------------------------
// Cut checks (best-of-clips law). Any failure blocks the master.
// ---------------------------------------------------------------------------

/** ffprobe that decodes and counts the master's real video frames (stdout). */
export function frameCountArgs({ inputPath }) {
  requirePath(inputPath, "inputPath");
  return [
    "-v", "error",
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries", "stream=nb_read_frames",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ];
}

/** Read frameCountArgs' stdout into a whole number; null when unreadable. */
export function parseFrameCount(stdout) {
  const m = String(stdout ?? "").match(/^\s*(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
}

/** blackdetect over the master. Output goes to stderr. */
export function blackdetectArgs({ inputPath }) {
  requirePath(inputPath, "inputPath");
  return [
    "-hide_banner", "-nostdin",
    "-i", inputPath,
    "-map", "0:v:0", "-an",
    "-vf", `blackdetect=d=${BLACK_MIN_SECONDS}:pix_th=${BLACK_PIXEL_THRESHOLD}`,
    "-f", "null", "-",
  ];
}

/** Parse blackdetect's stderr into [{start, end, duration}]. */
export function parseBlackdetect(stderr) {
  const out = [];
  const re = /black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)\s+black_duration:\s*(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(String(stderr ?? "")))) {
    out.push({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) });
  }
  return out;
}

/**
 * Did this cut edge snap to a nearby silence? It passes when it sits inside
 * a silence (within one frame), or when no silence lies within 250 ms (there
 * was nothing to snap to, so there is no breath to trim). It fails when a
 * silence was in reach and the edge missed it.
 */
export function edgeSnapped(edgeSeconds, silences) {
  const tol = 1 / FPS;
  let near = false;
  for (const s of silences ?? []) {
    const start = Number(s.start);
    const end = Number(s.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (edgeSeconds >= start - tol && edgeSeconds <= end + tol) return true;
    const gap = edgeSeconds < start ? start - edgeSeconds : edgeSeconds - end;
    if (gap <= SNAP_WINDOW_SECONDS) near = true;
  }
  return !near;
}

/**
 * Run every cut check. Returns { ok, failures: [{check, piece?, detail}] }.
 *
 * @param {object} args
 * @param {Array}  args.pieces        planMaster().pieces (or snapPiece results with index)
 * @param {Array}  args.pieceMeasures parseLoudnorm() of each ENCODED piece, in order
 * @param {Array}  args.black         parseBlackdetect() of the master
 * @param {object} args.silences      { [takeId]: [{start, end}] } from prepare
 * @param {number} args.masterFrames  parseFrameCount() of the master (required; missing fails)
 * @param {number} [args.plannedFrames] planMaster().frames; defaults to the pieces' sum
 * @param {object} args.pass2         parseLoudnorm() of the pass-2 (final encode) stderr; must be linear
 */
export function cutChecks({ pieces, pieceMeasures, black, silences, masterFrames, plannedFrames, pass2 }) {
  const failures = [];
  const list = Array.isArray(pieces) ? pieces : [];

  // No piece shorter than 8 frames.
  list.forEach((p, i) => {
    if (!(p.frames >= MIN_PIECE_FRAMES)) {
      failures.push({ check: "piece_too_short", piece: i + 1, detail: `${p.frames} frames; the floor is ${MIN_PIECE_FRAMES}` });
    }
  });

  // Loudness matched across pieces, peaks at -1 dBTP or lower.
  const measures = Array.isArray(pieceMeasures) ? pieceMeasures : [];
  if (measures.length !== list.length) {
    failures.push({
      check: "loudness_unmeasured",
      detail: `${measures.length} loudness readings for ${list.length} pieces`,
    });
  } else {
    const levels = [];
    measures.forEach((m, i) => {
      const tp = Number(m?.input_tp);
      if (Number.isFinite(tp) && tp > MAX_PIECE_TRUE_PEAK) {
        failures.push({ check: "peak_too_hot", piece: i + 1, detail: `true peak ${tp} dBTP; the ceiling is ${MAX_PIECE_TRUE_PEAK}` });
      }
      const li = Number(m?.input_i);
      if (!Number.isFinite(tp) || !Number.isFinite(li) || li <= UNMEASURABLE_LUFS) {
        // Dead air or a missing reading: a silent piece is a defect, not a skip.
        failures.push({ check: "piece_silent", piece: i + 1, detail: `loudness ${m?.input_i} LUFS, peak ${m?.input_tp} dBTP; the floor is above ${UNMEASURABLE_LUFS} LUFS` });
      } else {
        levels.push({ i: li, piece: i + 1 });
      }
    });
    if (levels.length > 1) {
      const lo = levels.reduce((a, b) => (b.i < a.i ? b : a));
      const hi = levels.reduce((a, b) => (b.i > a.i ? b : a));
      const spread = Number((hi.i - lo.i).toFixed(2));
      if (spread > PIECE_LOUDNESS_TOLERANCE_LU) {
        failures.push({
          check: "loudness_unmatched",
          detail: `piece ${hi.piece} is ${hi.i} LUFS and piece ${lo.piece} is ${lo.i} LUFS (${spread} LU apart; the limit is ${PIECE_LOUDNESS_TOLERANCE_LU})`,
        });
      }
    }
  }

  // The master holds exactly the planned frames. A difference means frames
  // were dropped or repeated (freeze frames), so lips drift from the voice.
  const planned = Number.isInteger(plannedFrames)
    ? plannedFrames
    : list.reduce((n, p) => n + (Number(p.frames) || 0), 0);
  if (!Number.isInteger(masterFrames)) {
    failures.push({ check: "frames_uncounted", detail: `the master's frames were not counted (got ${masterFrames})` });
  } else if (masterFrames !== planned) {
    failures.push({
      check: "frame_count_mismatch",
      detail: `the master has ${masterFrames} frames; the plan has ${planned} (${masterFrames - planned > 0 ? "+" : ""}${masterFrames - planned})`,
    });
  }

  // Pass 2 must stay linear. loudnorm falls back to dynamic (it rides the
  // gain inside the ad) when the linear target cannot be met.
  if (pass2?.normalization_type !== "linear") {
    failures.push({ check: "loudnorm_not_linear", detail: `pass 2 normalization was ${pass2?.normalization_type ?? "not read"}` });
  }

  // blackdetect finds nothing.
  for (const b of Array.isArray(black) ? black : []) {
    failures.push({ check: "black_frames", detail: `black from ${b.start} s to ${b.end} s` });
  }

  // Breaths at the joins are trimmed by the silence snap. A join is every edge
  // between two pieces: the end of one and the start of the next.
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    const aEnd = (a.startFrame + a.frames) / FPS;
    const bStart = b.startFrame / FPS;
    if (!edgeSnapped(aEnd, silences?.[a.take])) {
      failures.push({ check: "join_not_snapped", piece: i + 1, detail: `end at ${numText(aEnd)} s in take ${a.take} missed a silence within ${SNAP_WINDOW_SECONDS * 1000} ms` });
    }
    if (!edgeSnapped(bStart, silences?.[b.take])) {
      failures.push({ check: "join_not_snapped", piece: i + 2, detail: `start at ${numText(bStart)} s in take ${b.take} missed a silence within ${SNAP_WINDOW_SECONDS * 1000} ms` });
    }
  }

  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// The worker's ffmpeg build (spec 9.3 / 9.5: ffmpeg 6.1+ with libzimg)
// ---------------------------------------------------------------------------

/**
 * Check `ffmpeg -version` text: 6.1 or newer, built with libzimg (zscale is
 * what the HDR tonemap needs). Returns { ok, version, problems }.
 */
export function checkFfmpegBuild(versionText) {
  const text = String(versionText ?? "");
  const problems = [];
  const m = text.match(/ffmpeg version n?(\d+)\.(\d+)/i);
  const version = m ? `${m[1]}.${m[2]}` : null;
  if (!m) problems.push("version_unreadable");
  else if (Number(m[1]) < 6 || (Number(m[1]) === 6 && Number(m[2]) < 1)) problems.push("version_below_6_1");
  if (!/--enable-libzimg/.test(text)) problems.push("no_libzimg");
  return { ok: problems.length === 0, version, problems };
}

// ---------------------------------------------------------------------------

/** True when the take, the right way up, is 9:16 within ASPECT_TOLERANCE. Never stretch. */
export function isNineBySixteen(facts) {
  const w = Number(facts?.displayWidth);
  const h = Number(facts?.displayHeight);
  if (!(w > 0) || !(h > 0)) return false;
  return Math.abs(w / h / (OUT_WIDTH / OUT_HEIGHT) - 1) <= ASPECT_TOLERANCE;
}

function requirePath(p, name) {
  if (typeof p !== "string" || p.trim() === "") {
    throw new FfmpegPlanError("bad_path", `${name} must be a non-empty path`);
  }
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
