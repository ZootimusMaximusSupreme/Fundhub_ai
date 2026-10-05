// Animation overlays, always last (spec 9.4). PURE.
//
//   cut -> Submagic captions -> animation overlays -> finalize
//
// This file decides which animations may go onto the Submagic export, builds
// the one ffmpeg run that lays them on, and judges the finished file. The
// encode settings are NOT repeated here: every builder takes `plan`, the
// module `src/ad-videos/ffmpeg-plan.mjs` (9.3), so the overlay re-encode uses
// the same FINAL_VIDEO_ARGS as the master and the two cannot drift.

export const FPS = 30;

/** Full-frame limits (spec 9.4), in force until see-through renders ship. */
export const FULLFRAME_LIMITS = Object.freeze({
  noClipBeforeSeconds: 3,
  minFaceGapSeconds: 4,
  maxClipSeconds: 3,
  maxClipSecondsByTemplate: Object.freeze({ ProofWall: 4, ProofFlood: 6 }),
  maxShareOfRuntime: 0.35,
});

export const OUT_WIDTH = 1080;
export const OUT_HEIGHT = 1920;
export const DURATION_TOLERANCE_SECONDS = 0.3;
export const LOUDNESS_TOLERANCE_LU = 1;
export const TARGET_LUFS = -14;

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Decide which animations are laid on.
 *
 * @param {object} a
 * @param {Array}  a.animations  [{id, template, props, time, frames}] — `time` is the anchor in
 *   master seconds (aligner `anchorTime`), or null when the anchor's line was cut.
 * @param {number} a.durationSeconds  the Submagic export's length
 * @param {string} a.mode        'fullframe' | 'overlay'
 * @param {object} [a.cta]       {start, end} of the CTA line, in master seconds
 * @returns {{ accepted: Array, skipped: Array }}  each accepted item gains start, end, seconds
 */
export function planAnimations({ animations, durationSeconds, mode = "fullframe", cta = null }) {
  const L = FULLFRAME_LIMITS;
  const fullframe = mode === "fullframe";
  const accepted = [];
  const skipped = [];
  const skip = (a, reason, detail) => skipped.push({ id: a.id, template: a.template, reason, detail });

  const list = [...(animations ?? [])].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
  const budget = fullframe ? durationSeconds * L.maxShareOfRuntime : Infinity;
  let used = 0;
  let lastEnd = -Infinity;

  for (const a of list) {
    if (a.time === null || a.time === undefined || !Number.isFinite(Number(a.time))) {
      skip(a, "anchor_cut", "the line this animation points at was cut");
      continue;
    }
    const seconds = Math.round(Number(a.frames) || 0) / FPS;
    if (!(seconds > 0)) {
      skip(a, "no_length", "the clip has no length");
      continue;
    }
    const start = round3(Number(a.time));
    const end = round3(start + seconds);
    if (end > durationSeconds + 1e-6) {
      skip(a, "past_end", `ends at ${end} s, after the video ends at ${round3(durationSeconds)} s`);
      continue;
    }
    if (fullframe) {
      const cap = L.maxClipSecondsByTemplate[a.template] ?? L.maxClipSeconds;
      if (seconds > cap + 1e-6) {
        skip(a, "too_long", `${seconds} s; the cap for ${a.template} is ${cap} s`);
        continue;
      }
      if (start < L.noClipBeforeSeconds) {
        skip(a, "first_3_seconds", "no animation in the first 3 seconds");
        continue;
      }
      if (cta && Number.isFinite(cta.start) && Number.isFinite(cta.end) && start < cta.end && end > cta.start) {
        skip(a, "during_cta", "no animation during the CTA line");
        continue;
      }
      if (start - lastEnd < L.minFaceGapSeconds - 1e-6) {
        skip(a, "too_close", `needs ${L.minFaceGapSeconds} s of Chris's face after the last clip`);
        continue;
      }
      if (used + seconds > budget + 1e-6) {
        skip(a, "over_budget", `clips may fill ${L.maxShareOfRuntime * 100}% of the runtime`);
        continue;
      }
      used += seconds;
    } else if (start < lastEnd - 1e-6) {
      // See-through clips may not stack on each other; one overlay at a time.
      skip(a, "overlaps", "another animation is on screen");
      continue;
    }
    lastEnd = end;
    accepted.push({ ...a, start, end, seconds });
  }
  return { accepted, skipped };
}

/**
 * The ONE overlay run: Submagic export in, finished video out, video
 * re-encoded once with the master's settings, audio copied as is (spec 9.3).
 *
 * @param {object} a
 * @param {string} a.basePath
 * @param {Array}  a.clips  [{path, start, seconds}] (planAnimations output with a local `path`)
 * @param {string} a.outputPath
 * @param {object} a.plan   ffmpeg-plan.mjs (FINAL_VIDEO_ARGS, FASTSTART_ARGS)
 */
export function overlayArgs({ basePath, clips, outputPath, plan }) {
  if (!basePath || !outputPath) throw new Error("overlayArgs needs basePath and outputPath");
  if (!Array.isArray(clips) || clips.length === 0) throw new Error("overlayArgs needs at least one clip");
  const inputs = ["-i", basePath];
  const chain = [];
  let prev = "0:v";
  clips.forEach((c, i) => {
    inputs.push("-i", c.path);
    const idx = i + 1;
    const label = `v${idx}`;
    // Shift the clip's own timeline to its anchor, then show it only in its window.
    chain.push(`[${idx}:v]setpts=PTS-STARTPTS+${c.start}/TB[c${idx}]`);
    chain.push(
      `[${prev}][c${idx}]overlay=0:0:format=auto:eof_action=pass:enable='between(t,${c.start},${round3(c.start + c.seconds)})'[${label}]`,
    );
    prev = label;
  });
  return [
    "-hide_banner", "-nostdin", "-y",
    ...inputs,
    "-filter_complex", chain.join(";"),
    "-map", `[${prev}]`, "-map", "0:a:0",
    ...plan.FINAL_VIDEO_ARGS,
    "-c:a", "copy",
    ...plan.FASTSTART_ARGS,
    outputPath,
  ];
}

/** Loudness fix when `cleanAudio` moved the level more than 1 LU: audio re-encoded, video copied. */
export function loudnessFixArgs({ inputPath, outputPath, measured, plan }) {
  for (const k of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) {
    if (!Number.isFinite(Number(measured?.[k]))) throw new Error(`loudnessFixArgs needs a measured ${k}`);
  }
  const m = measured;
  const pass2 =
    `${plan.loudnormFilter()}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary,aresample=48000`;
  return [
    "-hide_banner", "-nostdin", "-y",
    "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-c:v", "copy",
    "-af", pass2,
    ...plan.FINAL_AUDIO_ARGS,
    ...plan.FASTSTART_ARGS,
    outputPath,
  ];
}

/** Re-attach the moov atom without touching a stream (the last step of finalize). */
export function remuxArgs({ inputPath, outputPath, plan }) {
  return [
    "-hide_banner", "-nostdin", "-y",
    "-i", inputPath,
    "-map", "0", "-c", "copy",
    ...plan.FASTSTART_ARGS,
    outputPath,
  ];
}

/**
 * Finalize checks (spec 9.1 step 11): 1080x1920, duration within 0.3 s of the
 * master, loudness within 1 LU of -14. Size and length are failures; a loudness
 * miss is a fix (`fixLoudness`), not a failure.
 *
 * @param {object} a  facts = probeFacts(finished), masterDurationSeconds, loudness = parseLoudnorm(finished)
 */
export function finalizeVerdict({ facts, masterDurationSeconds, loudness }) {
  const problems = [];
  if (facts.displayWidth !== OUT_WIDTH || facts.displayHeight !== OUT_HEIGHT) {
    problems.push({ check: "size", detail: `${facts.displayWidth}x${facts.displayHeight}; must be ${OUT_WIDTH}x${OUT_HEIGHT}` });
  }
  const off = Math.abs(Number(facts.durationSeconds) - Number(masterDurationSeconds));
  if (!(off <= DURATION_TOLERANCE_SECONDS)) {
    problems.push({ check: "duration", detail: `${round3(facts.durationSeconds)} s against the master's ${round3(masterDurationSeconds)} s` });
  }
  if (!facts.hasAudio) problems.push({ check: "audio", detail: "the finished video has no audio" });
  const lufs = Number(loudness?.input_i);
  const fixLoudness = Number.isFinite(lufs) && Math.abs(lufs - TARGET_LUFS) > LOUDNESS_TOLERANCE_LU;
  return { ok: problems.length === 0, problems, fixLoudness };
}
