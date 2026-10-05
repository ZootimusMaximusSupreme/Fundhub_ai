#!/usr/bin/env node
/**
 * Render the quiet testimonial posters (K1 round 2, owner pick 2026-10-05): the same
 * words as the loud ones, on one small line at the bottom of the picture.
 *
 *   node scripts/testimonials/render-small-thumbnails.mjs
 *
 * Words come from marketing/testimonials/testimonials.json (read only, never written).
 * Pictures come from marketing/testimonials/frames/. The look lives in thumbnail-small.html.
 * thumbnail.html, render-thumbnails.mjs, the old posters and the data file are not touched.
 *
 * Output: marketing/testimonials/posters-v2/slo-testimonial-<id>-poster-v2.jpg at the frame's
 * own size, so nothing is upscaled. Nothing here is served. At push time the three files are
 * copied to public/funnel/ under those names and shipped before the ClickFunnels push.
 *
 * Each bar sits on the caption burned into that frame, measured on the frame itself
 * (white/green/red/yellow fill, full height with its black stroke). A caption that shows
 * through is a defect, so the bar's solid part has to cover [capTop, capBottom].
 * "Sarah" uses frames/sarah-small.jpg (13.25 s of the video): every frame of her video has a
 * caption, and this one has a single line, so the bar is as slim as it can be.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const OUT = path.join(repo, "marketing/testimonials/posters-v2");

/* capTop/capBottom: where the burned-in caption sits on that frame, % of height, stroke included.
   barTop/barBottom: the bar; its solid part is the middle 86% of it. */
const POSTERS = [
  { id: "colin2", frame: "colin2.jpg", size: [1080, 1920], capTop: 83.4, capBottom: 91.8, barTop: 81.0, barBottom: 94.2 },
  { id: "gene", frame: "gene.jpg", size: [720, 1280], capTop: 83.3, capBottom: 87.6, barTop: 81.6, barBottom: 90.0 },
  { id: "sarah", frame: "sarah-small.jpg", size: [720, 1280], capTop: 64.6, capBottom: 69.1, barTop: 62.0, barBottom: 72.0 },
];

const records = JSON.parse(readFileSync(path.join(repo, "marketing/testimonials/testimonials.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

// CHROMIUM_PATH lets a cloud session use the Chromium it already has instead of downloading one.
const browser = await chromium.launch({
  args: ["--allow-file-access-from-files"],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
for (const p of POSTERS) {
  const r = records.find((x) => x.id === p.id);
  if (!r || r.status !== "approved") throw new Error(`${p.id}: no approved record in testimonials.json`);
  const solidTop = p.barTop + (p.barBottom - p.barTop) * 0.07;
  const solidBottom = p.barBottom - (p.barBottom - p.barTop) * 0.07;
  if (solidTop > p.capTop || solidBottom < p.capBottom) {
    throw new Error(`${p.id}: the bar's solid part ${solidTop.toFixed(1)}-${solidBottom.toFixed(1)}% does not cover the caption ${p.capTop}-${p.capBottom}%`);
  }
  const framePath = path.join(repo, "marketing/testimonials/frames", p.frame);
  if (!existsSync(framePath)) throw new Error(`${p.id}: no frame at ${framePath}`);

  const payload = {
    frame: pathToFileURL(framePath).href,
    headline: r.thumbnail_headline,
    accent: r.thumbnail_accent_words,
    kicker: `${r.client_name} · ${r.business_type}`,
    barTop: `${p.barTop}%`,
    barBottom: `${p.barBottom}%`,
  };
  const page = await browser.newPage({ viewport: { width: p.size[0], height: p.size[1] }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(here, "thumbnail-small.html")).href + "?data=" + encodeURIComponent(JSON.stringify(payload)));
  await page.waitForFunction(() => document.body.dataset.ready === "1");

  const checks = await page.evaluate(() => {
    const img = document.getElementById("frame");
    return {
      frameOk: img.complete && img.naturalWidth > 0,
      interOk: [...document.fonts].some((f) => f.family.replace(/['"]/g, "") === "Inter" && f.weight === "800" && f.status === "loaded"),
      monoOk: [...document.fonts].some((f) => f.family.replace(/['"]/g, "") === "JetBrains Mono" && f.status === "loaded"),
      fs: Number(document.body.dataset.fs),
      fits: document.body.dataset.fits === "true",
    };
  });
  if (!checks.frameOk) throw new Error(`${p.id}: the video frame did not load, the poster would be blank`);
  if (!checks.interOk || !checks.monoOk) throw new Error(`${p.id}: Inter 800 or JetBrains Mono did not load, the text would be in a fallback font`);
  if (!checks.fits || checks.fs < 3.3) throw new Error(`${p.id}: the headline does not fit on one line at a readable size (${checks.fs}rem)`);

  const out = path.join(OUT, `slo-testimonial-${p.id}-poster-v2.jpg`);
  await page.screenshot({ path: out, type: "jpeg", quality: 86 });
  await page.close();
  console.log(`${p.id}  ${p.size.join("x")}  headline ${checks.fs}rem  ${(statSync(out).size / 1024).toFixed(0)} KB  ->  ${path.relative(repo, out)}`);
}
await browser.close();
