#!/usr/bin/env node
/**
 * Look at the testimonial slots in clickfunnels-fragments/slo/slo-01-sales.html
 * before they go live.
 *
 *   node scripts/testimonials/proof-slots.mjs
 *
 * Serves https://fundhub.ai/funnel/* from the local public/funnel/ folder, so
 * this shows the files about to ship rather than whatever is live right now.
 * Shots land in docs/workflows/testimonial-thumbnails-2026-09-27-evidence/.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const PAGE = path.join(repo, "clickfunnels-fragments/slo/slo-01-sales.html");
const SHOTS = path.join(
  repo,
  "docs/workflows/testimonial-thumbnails-2026-09-27-evidence",
);

const TYPES = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

mkdirSync(SHOTS, { recursive: true });

// Video elements composite on their own GPU layer, and on a page this tall
// they screenshot at stale positions. Software rendering captures them where
// they actually sit.
const browser = await chromium.launch({
  args: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-accelerated-video-decode",
    "--disable-features=VizDisplayCompositor",
  ],
});
const results = [];

for (const [name, width, height] of [
  ["desktop-1280", 1280, 1100],
  ["phone-390", 390, 2400],   // tall enough to hold all three stacked cards
]) {
  const page = await browser.newPage({ viewport: { width, height } });

  // Serve the about-to-ship files instead of what is on fundhub.ai today.
  await page.route("https://fundhub.ai/funnel/**", async (route) => {
    const file = path.join(repo, "public/funnel", path.basename(new URL(route.request().url()).pathname));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "missing" });
    await route.fulfill({
      status: 200,
      contentType: TYPES[path.extname(file)] || "application/octet-stream",
      body: readFileSync(file),
    });
  });

  await page.setContent(readFileSync(PAGE, "utf8"), { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);

  // The marquee animates forever and the VSL plays, which smears an element
  // screenshot. Freeze both before shooting.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.removeAttribute("autoplay");
    });
  });

  // This page is over 8000px tall. An element screenshot that far down gets
  // stitched from strips and smears. Park the grid at the top of the viewport
  // and take one plain viewport shot instead.
  const grid = page.locator(".fh-b .proofgrid");
  await grid.evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24);
  });
  await page.waitForTimeout(1200);

  const checks = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".fh-b .proofgrid .tcard")];
    return {
      cards: cards.length,
      pills: document.querySelectorAll(".fh-b .tplay-pill").length,
      captions: document.querySelectorAll(".fh-b .tcap").length,
      postersLoaded: cards.filter((c) => {
        const v = c.querySelector("video");
        return v && v.getAttribute("poster");
      }).length,
      autoplaying: cards.filter((c) => {
        const v = c.querySelector("video");
        return v && v.hasAttribute("autoplay");
      }).length,
      pillColour: getComputedStyle(document.querySelector(".fh-b .tplay-pill"))
        .backgroundColor,
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
      // A .vslot that is not inside the grid is an orphan left behind by a bad
      // rewrite. It renders at the video's full native size and spills across
      // the page.
      strayVslots:
        document.querySelectorAll(".fh-b .vslot").length -
        document.querySelectorAll(".fh-b .proofgrid .vslot").length,
      // Every player must sit inside its own card.
      slotsOutsideTheirCard: cards.filter((c) => {
        const cr = c.getBoundingClientRect();
        const vr = c.querySelector(".vslot").getBoundingClientRect();
        return vr.left < cr.left - 1 || vr.right > cr.right + 1;
      }).length,
    };
  });

  // Does clicking actually play it, and does it stop the others? This is the
  // part that matters; the screenshot only shows the layout.
  const pills = page.locator(".fh-b .proofgrid .tplay");
  await pills.nth(0).click();
  await page.waitForTimeout(700);
  await pills.nth(1).click();
  await page.waitForTimeout(700);
  const behaviour = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".fh-b .proofgrid .tcard")];
    const v = (i) => cards[i].querySelector("video");
    return {
      secondIsPlaying: !v(1).paused,
      firstWasStopped: v(0).paused,
      secondGotControls: v(1).controls,
      secondPillHidden: cards[1]
        .querySelector(".tplay")
        .classList.contains("hidden"),
      thirdStillIdle: v(2).paused,
    };
  });
  Object.assign(checks, behaviour);

  // Chromium paints <video> on its own layer and, on a page this tall, that
  // layer screenshots at a stale position. Swap in the poster as a plain <img>
  // over the same box so the shot shows where things really sit. The video
  // element keeps its space, so the layout in the shot is the real layout.
  await page.evaluate(() => {
    document.querySelectorAll(".fh-b .proofgrid .vslot").forEach((slot) => {
      const v = slot.querySelector("video");
      v.pause();
      v.controls = false;
      const img = document.createElement("img");
      img.src = v.getAttribute("poster");
      img.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:11px;z-index:1";
      slot.appendChild(img);
      v.style.visibility = "hidden";
      const pill = slot.querySelector(".tplay");
      if (pill) pill.classList.remove("hidden");
    });
  });
  await page.waitForTimeout(600);

  const shot = path.join(SHOTS, `slots-${name}.png`);
  const box = await grid.boundingBox();
  await page.screenshot({
    path: shot,
    clip: {
      x: Math.max(0, box.x - 12),
      y: Math.max(0, box.y - 12),
      width: Math.min(width - Math.max(0, box.x - 12), box.width + 24),
      height: Math.min(height - Math.max(0, box.y - 12), box.height + 24),
    },
  });
  results.push({ name, width, ...checks, shot: path.relative(repo, shot) });
  await page.close();
}

await browser.close();

let bad = 0;
for (const r of results) {
  const problems = [];
  if (r.cards !== 3) problems.push(`expected 3 cards, found ${r.cards}`);
  if (r.pills !== 3) problems.push(`expected 3 play pills, found ${r.pills}`);
  if (r.captions !== 3) problems.push(`expected 3 captions, found ${r.captions}`);
  if (r.postersLoaded !== 3) problems.push(`${3 - r.postersLoaded} card(s) have no poster`);
  if (r.autoplaying !== 0) problems.push(`${r.autoplaying} testimonial(s) autoplay — they must not`);
  if (r.pillColour !== "rgb(24, 139, 246)")
    problems.push(`play pill is ${r.pillColour}, the VSL's blue is rgb(24, 139, 246)`);
  if (r.horizontalOverflow) problems.push("page scrolls sideways");
  if (r.strayVslots !== 0)
    problems.push(`${r.strayVslots} leftover player(s) sitting outside the grid`);
  if (r.slotsOutsideTheirCard !== 0)
    problems.push(`${r.slotsOutsideTheirCard} player(s) spill outside their card`);
  if (!r.secondIsPlaying) problems.push("clicking Play did not start the video");
  if (!r.firstWasStopped) problems.push("starting one did not stop the one already playing");
  if (!r.secondGotControls) problems.push("no player controls after pressing Play");
  if (!r.secondPillHidden) problems.push("the Play pill stayed up after pressing it");
  if (!r.thirdStillIdle) problems.push("a testimonial nobody pressed is playing");

  console.log(
    `${problems.length ? "FAIL" : "PASS"}  ${r.name}  (${r.width}px)  ${r.shot}`,
  );
  for (const p of problems) console.log(`      - ${p}`);
  if (problems.length) bad++;
}

process.exit(bad ? 1 : 0);
