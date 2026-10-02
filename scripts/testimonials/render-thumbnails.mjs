#!/usr/bin/env node
/**
 * Render testimonial thumbnails from marketing/testimonials/testimonials.json.
 *
 *   node scripts/testimonials/render-thumbnails.mjs            # all records
 *   node scripts/testimonials/render-thumbnails.mjs colin      # just one
 *
 * Each record supplies the words. The picture is the frame already pulled to
 * marketing/testimonials/frames/<id>.jpg. The look lives in thumbnail.html, which
 * also opens straight in a browser if you want to nudge the design by hand.
 *
 * Output: public/testimonials/thumbnails/<id>.png, at the frame's own size, so
 * nothing is ever upscaled.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const DATA = path.join(repo, "marketing/testimonials/testimonials.json");
const OUT = path.join(repo, "public/testimonials/thumbnails");
const FFMPEG = path.join(process.env.HOME, ".local/bin/ffmpeg");

/** Read a jpg/png's pixel size with ffmpeg. There is no ffprobe on this Mac. */
function sizeOf(file) {
  // ffmpeg -i with no output always exits 1 and prints the stream line to
  // stderr. That is the read, not a failure.
  let out = "";
  try {
    out = execFileSync(FFMPEG, ["-hide_banner", "-i", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
  } catch (e) {
    out = String(e.stderr || "");
  }
  const m = out.match(/,\s(\d+)x(\d+)[\s,]/);
  if (!m) throw new Error(`could not read size of ${file}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

const only = process.argv[2];
const records = JSON.parse(readFileSync(DATA, "utf8")).filter(
  (r) => !only || r.id === only,
);
if (!records.length) {
  console.error(only ? `no record with id "${only}"` : "no records");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// Chromium refuses to load a file:// image from a file:// page without this.
const browser = await chromium.launch({
  args: ["--allow-file-access-from-files"],
});
const results = [];

for (const r of records) {
  const framePath = path.join(repo, `marketing/testimonials/frames/${r.id}.jpg`);
  if (!existsSync(framePath)) {
    console.error(`SKIP ${r.id} — no frame at ${framePath}`);
    continue;
  }

  const { width, height } = sizeOf(framePath);

  const payload = {
    frame: pathToFileURL(framePath).href,
    headline: r.thumbnail_headline,
    accent: r.thumbnail_accent_words,
    kicker: r.business_type,
    who: r.client_name,
    bandTop: r.thumbnail_band_top || "64%",
    bandBottom: r.thumbnail_band_bottom || "100%",
    playTop: r.thumbnail_play_top || "46%",
    footTop: r.thumbnail_foot_top || "80%",
  };

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  const url =
    pathToFileURL(path.join(here, "thumbnail.html")).href +
    "?data=" +
    encodeURIComponent(JSON.stringify(payload));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  // Fail loudly rather than shipping a thumbnail in the wrong typeface.
  const usedInter = await page.evaluate(() =>
    document.fonts.check("800 100px Inter"),
  );
  if (!usedInter) {
    throw new Error(
      `${r.id}: Inter did not load, so the headline would render in a fallback font. ` +
        `Check network access to fonts.googleapis.com and re-run.`,
    );
  }

  // The frame must actually be on the picture. A broken file:// load renders a
  // black card that still looks "fine" at a glance.
  const framePainted = await page.evaluate(() => {
    const img = document.getElementById("frame");
    return img.complete && img.naturalWidth > 0;
  });
  if (!framePainted) {
    throw new Error(`${r.id}: the video frame did not load \u2014 thumbnail would be blank.`);
  }

  const out = path.join(OUT, `${r.id}.png`);
  await page.screenshot({ path: out, type: "png" });
  await page.close();

  results.push({ id: r.id, out, width, height });
  console.log(`${r.id}  ${width}x${height}  ->  ${path.relative(repo, out)}`);
}

await browser.close();

// Write thumbnail_path back into the data file so the page wiring has it.
const all = JSON.parse(readFileSync(DATA, "utf8"));
for (const res of results) {
  const rec = all.find((r) => r.id === res.id);
  if (rec) rec.thumbnail_path = path.relative(repo, res.out);
}
writeFileSync(DATA, JSON.stringify(all, null, 2) + "\n");
console.log(`\nwrote thumbnail_path for ${results.length} record(s) into ${path.relative(repo, DATA)}`);
