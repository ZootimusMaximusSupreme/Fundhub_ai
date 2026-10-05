// The overlay step (spec 9.4, last stage before finalize). Pure argument
// builders: they return arrays for the video worker to hand to ffmpeg. Nothing
// here runs ffmpeg or renders Remotion.
//
// WHAT THE STEP DOES. ffmpeg lays each clip over the Submagic export at its
// start time, copies the audio as is, and re-encodes the video ONCE with the
// same settings as the master (9.3). The one source of those settings is
// FINAL_VIDEO_ARGS in ffmpeg-plan.mjs (9.3, PR #34). It is passed in as
// `finalVideoArgs` rather than imported, so this file stands alone until that PR
// merges and the worker (9.5) has exactly one place to import it from.
//
// TWO MODES (setting `animation_mode`, M0 step 3).
//   fullframe  opaque 1080x1920 clips that cover the frame, captions included.
//              Rendered as H.264 .mp4 and laid over at 100%.
//   overlay    see-through clips (the `transparent` switch on every template,
//              alpha) rendered as VP9 .webm or ProRes 4444 .mov. Needs the
//              see-through renders to have shipped.

import { createHash } from "node:crypto";
import { FPS } from "./animation-plan.mjs";

export const OUT_WIDTH = 1080;
export const OUT_HEIGHT = 1920;

/** Bump when a template's look changes, so cached clips in R2 re-render. The
    cache key is a hash of template + props (spec 9.1 step 11), plus these. */
export const CLIP_CACHE_REV = 1;
export const KIT_VERSION = "remotion-4.0.532";

export class OverlayPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OverlayPlanError";
    this.code = code;
  }
}

/** Seconds as ffmpeg wants them: fixed six places, trailing zeros trimmed. */
export function numText(seconds) {
  return Number(seconds).toFixed(6).replace(/\.?0+$/, "") || "0";
}

/** JSON with object keys sorted, so equal props always hash equal. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * renderSpec — what the worker renders for one item, and the key it caches the
 * clip under. A clip that has not changed never re-renders, so an edit that
 * changes one animation renders one clip (spec 9.6).
 *
 * `alphaFormat` is 'webm' (VP9, small) or 'mov' (ProRes 4444, big, decodes in
 * any ffmpeg). Ignored in fullframe mode, which is always opaque .mp4.
 */
export function renderSpec(item, { mode = "fullframe", alphaFormat = "webm" } = {}) {
  if (!item || typeof item.template !== "string" || !item.template) {
    throw new OverlayPlanError("bad_item", "an animation item needs a template");
  }
  const frames = Math.round(Number(item.frames ?? item.seconds * FPS));
  if (!Number.isInteger(frames) || frames <= 0) throw new OverlayPlanError("bad_item", `${item.template} has no length`);
  const transparent = mode === "overlay";
  if (transparent && alphaFormat !== "webm" && alphaFormat !== "mov") {
    throw new OverlayPlanError("bad_format", "alphaFormat must be 'webm' or 'mov'");
  }
  const container = transparent ? alphaFormat : "mp4";
  const props = { ...(item.props || {}), durationInFrames: frames, transparent };
  const cacheKey = createHash("sha256")
    .update(stableStringify({ rev: CLIP_CACHE_REV, kit: KIT_VERSION, template: item.template, props, container }))
    .digest("hex");
  return { template: item.template, props, frames, transparent, container, alpha: transparent, cacheKey };
}

/** The distinct clips to render for these items, skipping any already cached. */
export function clipsToRender(items, { mode = "fullframe", alphaFormat = "webm", cachedKeys = [] } = {}) {
  const have = new Set(cachedKeys);
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const spec = renderSpec(item, { mode, alphaFormat });
    if (have.has(spec.cacheKey) || seen.has(spec.cacheKey)) continue;
    seen.add(spec.cacheKey);
    out.push(spec);
  }
  return out;
}

/**
 * overlayArgs — the ffmpeg arguments that lay clips over the base video.
 *
 *   basePath        the Submagic export
 *   clips           [{ path, start, seconds, alpha, container }] in start order
 *   outputPath      where the overlaid video goes
 *   finalVideoArgs  FINAL_VIDEO_ARGS from ffmpeg-plan.mjs (9.3)
 *
 * Each clip is shifted to its start time with setpts and drawn only between its
 * start and end. Audio is mapped from the base and copied. The output ends when
 * the base ends.
 */
export function overlayArgs({ basePath, clips, outputPath, finalVideoArgs }) {
  if (!basePath || !outputPath) throw new OverlayPlanError("bad_paths", "basePath and outputPath are required");
  if (!Array.isArray(finalVideoArgs) || !finalVideoArgs.includes("-c:v")) {
    throw new OverlayPlanError("no_encode_args", "finalVideoArgs (FINAL_VIDEO_ARGS from ffmpeg-plan) is required");
  }
  if (!Array.isArray(clips) || !clips.length) {
    throw new OverlayPlanError("no_clips", "nothing to overlay; the caller keeps the base video instead");
  }
  let lastEnd = -Infinity;
  clips.forEach((c, i) => {
    if (!c?.path) throw new OverlayPlanError("bad_clip", `clip ${i} has no path`);
    if (!Number.isFinite(c.start) || c.start < 0) throw new OverlayPlanError("bad_clip", `clip ${i} has a bad start`);
    if (!Number.isFinite(c.seconds) || c.seconds <= 0) throw new OverlayPlanError("bad_clip", `clip ${i} has a bad length`);
    if (c.start < lastEnd - 1e-6) throw new OverlayPlanError("overlap", `clip ${i} starts before the last clip ends`);
    lastEnd = c.start + c.seconds;
  });

  const args = ["-y", "-hide_banner", "-i", basePath];
  const chains = [];
  let last = "0:v";
  clips.forEach((c, i) => {
    // ffmpeg's built-in VP9 decoder drops alpha; libvpx-vp9 keeps it.
    if (c.alpha && c.container === "webm") args.push("-c:v", "libvpx-vp9");
    args.push("-t", numText(c.seconds), "-i", c.path);
    const end = c.start + c.seconds;
    const pix = c.alpha ? "yuva420p" : "yuv420p";
    chains.push(
      `[${i + 1}:v]format=${pix},scale=${OUT_WIDTH}:${OUT_HEIGHT}:flags=lanczos,fps=${FPS},setpts=PTS-STARTPTS+${numText(c.start)}/TB[o${i}]`
    );
    const next = i === clips.length - 1 ? "vout" : `v${i}`;
    chains.push(
      `[${last}][o${i}]overlay=x=0:y=0:eof_action=pass:format=auto:enable='between(t,${numText(c.start)},${numText(end)})'[${next}]`
    );
    last = next;
  });

  return [
    ...args,
    "-filter_complex", chains.join(";"),
    "-map", "[vout]",
    "-map", "0:a?",
    ...finalVideoArgs,
    "-c:a", "copy",
    outputPath,
  ];
}

/**
 * planOverlay — items + the clip files the worker holds, to one ffmpeg call.
 *
 *   clipPaths   { [cacheKey]: localPath }  (downloaded from R2 or just rendered)
 *
 * Throws 'clip_missing' naming the template when a clip is not there, so the
 * worker never overlays a partial set and calls it done.
 */
export function planOverlay({ items, mode = "fullframe", alphaFormat = "webm", clipPaths, basePath, outputPath, finalVideoArgs }) {
  const ordered = [...(items || [])].sort((a, b) => a.start - b.start);
  const clips = ordered.map((item) => {
    const spec = renderSpec(item, { mode, alphaFormat });
    const path = clipPaths?.[spec.cacheKey];
    if (!path) throw new OverlayPlanError("clip_missing", `no rendered clip for ${item.template} (${spec.cacheKey.slice(0, 12)})`);
    return { path, start: item.start, seconds: item.frames / FPS, alpha: spec.alpha, container: spec.container };
  });
  return overlayArgs({ basePath, clips, outputPath, finalVideoArgs });
}
