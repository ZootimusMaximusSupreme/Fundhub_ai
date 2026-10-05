// Remotion rendering for the worker (spec 9.5: `gl: 'swangle'`, concurrency 1,
// the bundle is built once at image build time by scripts/bundle.mjs).
//
// 'overlay' mode renders with alpha as ProRes 4444 (see-through renders, spec
// 9.4); 'fullframe' renders an opaque H.264 clip. The template's own
// `transparent` switch is the kit's job (marketing/broll), so this passes
// `transparent: true` in the props for overlay mode and nothing else.

import { renderMedia, selectComposition } from "@remotion/renderer";

const SERVE_URL = process.env.REMOTION_BUNDLE_DIR || "/app/bundle";

export const RENDER_SETTINGS = Object.freeze({ gl: "swangle", concurrency: 1 });

export async function renderClip({ template, props = {}, frames, mode = "fullframe", outPath }) {
  const inputProps = mode === "overlay" ? { ...props, transparent: true } : props;
  const composition = await selectComposition({ serveUrl: SERVE_URL, id: template, inputProps });
  const durationInFrames = Number.isFinite(frames) && frames > 0 ? Math.round(frames) : composition.durationInFrames;

  const common = {
    composition: { ...composition, durationInFrames },
    serveUrl: SERVE_URL,
    inputProps,
    outputLocation: outPath,
    concurrency: RENDER_SETTINGS.concurrency,
    chromiumOptions: { gl: RENDER_SETTINGS.gl },
    logLevel: "warn",
  };
  if (mode === "overlay") {
    await renderMedia({ ...common, codec: "prores", proResProfile: "4444", imageFormat: "png", pixelFormat: "yuva444p10le" });
  } else {
    await renderMedia({ ...common, codec: "h264", crf: 12 });
  }
}
