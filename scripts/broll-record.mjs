#!/usr/bin/env node
/*
 * B-roll screen clips for the Fundhub SLO ads — 2026-09-23.
 *
 * WHY THIS EXISTS. ops/workflows/submagic-settings-lock-2026-09-23.md §W3 measured
 * that the whole B-roll library is still PICTURES. Submagic lays MOVING clips over
 * Chris's face, and a still frame reads as a broken video. These eight clips are the
 * moving cover for the beats W3's matrix found uncovered.
 *
 * THE FILE NAME IS THE ONLY TAG. src/ad-videos/broll.mjs lowercases the name, splits
 * on every non-letter-non-digit, drops words under 3 letters and bare numbers, then
 * does an EXACT word match against what Chris says. There is NO stemming: "bank" does
 * not fire on "banks", "approve" does not fire on "approval". So every name below
 * spells out every form of every word it needs to fire on, and carries no dollar
 * amounts, take numbers or dates — those never match a spoken word and are dead weight.
 *
 * PRIVACY — THE HARD RULE. These clips run in PAID ADS. Nothing here may show a real
 * client. Every screen below is either (a) the real Fundhub deliverable rendered for
 * the built-in sample file "Jordan Sample" from scripts/black-reports/fundhub_gen.py,
 * (b) a real product screen with its network answers stubbed with sample values, or
 * (c) the already-sanitized approval crops in marketing/landing-pages/slo/client-wins/
 * which carry no names. Nothing in this script ever opens the production database.
 *
 * 4K. Owner law .claude/rules/video-4k-unless-ad.md — some of these land in VSLs, not
 * only ads, and 1080p can never be upscaled later. MEASURED 2026-09-23: Playwright only
 * ever scales a page picture DOWN into the video frame, never up, and deviceScaleFactor
 * does not change what the recorder receives — a 1280x720 viewport asked to record at
 * 3840x2160 gave a 1280x720 picture sitting in the top-left corner of a grey 4K frame.
 * So the viewport itself is 3840x2160 and the page is zoomed 3x, which lays the document
 * out at the 1280px width it was designed for and paints every pixel of the 4K frame.
 *
 * FORMAT. Playwright records .webm (VP8). Turning that into .mp4 needs an H.264
 * encoder. Measured 2026-09-23: this Mac has no ffmpeg on the PATH and no Homebrew to
 * install one, and Playwright's own bundled ffmpeg is built with libvpx and png ONLY.
 * So the clips stay .webm, correctly named. The moment a real ffmpeg is on the PATH
 * this script writes .mp4 instead — nothing else has to change.
 *
 * THE HEAD OF EVERY CLIP IS CUT. The recorder starts the moment the tab opens, so the
 * first half second is the blank tab and the document's cover page snapping to the
 * section we want. Playwright's bundled ffmpeg can re-encode VP8, so that head is cut
 * off and every clip is trimmed to exactly 3.8 seconds.
 *
 *   node scripts/broll-record.mjs            # record all eight
 *   node scripts/broll-record.mjs --only 5   # one clip
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildLetterText } from "../src/metro2/letters/generate.mjs";
import { CURRENT_SOFT_PULL_VERSION, SOFT_PULL_DISCLOSURES } from "../src/consent/disclosures.mjs";
import { softPullPricingPublic } from "../src/finance/soft-pull-pricing.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, "ops/workflows/slo-broll-2026-09-23-evidence");
const STAGE = path.join(WORK, "stage");
const RAW = path.join(WORK, "raw");
const OUT = path.join(WORK, "clips");
const WINS = path.join(ROOT, "marketing/landing-pages/slo/client-wins");

/* The viewport IS the video frame. ZOOM puts the page back at its design width:
   3840 / 3 = 1280 CSS pixels of layout, painted three times as big. */
const VIEW = { width: 3840, height: 2160 };
const ZOOM = 3;
const VIDEO = { ...VIEW };

/* ── the eight clips ─────────────────────────────────────────────────────────
   `anchor` is the heading the scroll STARTS on. A missing anchor throws — a clip
   that silently starts on a cover page is a frozen frame, which is a failed clip. */
const CLIPS = [
  {
    n: 1,
    file: "list-banks-bank-approve-approval-approved.webm",
    page: "lender_match_list.html",
    anchor: "After Optimization",
    travel: 1500,
    what: "Bank & lender match list — scrolling the matched lenders",
    data: "demo (Jordan Sample, the sample file built into fundhub_gen.py)"
  },
  {
    n: 2,
    file: "roadmap-document-documents.webm",
    page: "optimization_roadmap.html",
    anchor: "Month 1",
    travel: 1500,
    what: "Funding roadmap document — scrolling the month-by-month plan",
    data: "demo (Jordan Sample)"
  },
  {
    n: 3,
    file: "credit-score-scores-bureaus-bureau.webm",
    page: "credit_analysis_report.html",
    anchor: "Bureau Health Summary",
    travel: 1400,
    what: "Credit analysis report — the three bureaus and the scores",
    data: "demo (Jordan Sample)"
  },
  {
    n: 4,
    file: "funding-qualify-qualified.webm",
    page: "funding_snapshot.html",
    anchor: "Your Numbers Right Now",
    travel: 1300,
    what: "Funding snapshot — the amounts now and after optimization",
    data: "demo (Jordan Sample)"
  },
  {
    n: 5,
    file: "inquiry-inquiries-soft.webm",
    page: "soft-pull-approve.html?org=demo&client=demo&exp=9999999999&sig=demo",
    anchor: null,
    travel: 1100,
    stub: "softpull",
    what: "The live soft-pull approval screen — 'It is a soft inquiry'",
    data: "demo (stubbed answer, sample first name, nothing typed into any field)"
  },
  {
    n: 6,
    file: "declined-decline-why.webm",
    page: "credit_analysis_report.html",
    anchor: "Negative Items",
    travel: 1400,
    what: "Why the banks say no — the negative items table and its WHY IT MATTERS column",
    data: "demo (Jordan Sample)"
  },
  {
    n: 7,
    file: "approval-approved-approvals.webm",
    page: "approvals.html",
    anchor: null,
    travel: 1900,
    what: "Four real approval emails scrolling one after another",
    data: "real client approvals, already sanitized — every name blacked out at source"
  },
  {
    n: 8,
    file: "letter-letters-accounts-account.webm",
    page: "dispute-letter.html",
    anchor: null,
    travel: 1500,
    what: "A dispute letter, scrolling",
    data: "demo (Jordan Sample, letter text from the real generator)"
  }
];

/* ── stage ───────────────────────────────────────────────────────────────── */

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

/** An ffmpeg, and what it can encode. A real one on the PATH wins, because only a real
 *  one can write H.264. Playwright ships its own, which can re-encode VP8 and is enough
 *  to cut the head off a clip. */
function findFfmpeg() {
  const tryIt = (bin) => {
    try {
      const enc = sh(bin, ["-hide_banner", "-encoders"], { stdio: ["ignore", "pipe", "ignore"] });
      return { bin, h264: /\blibx264\b/.test(enc), vp8: /\blibvpx\b/.test(enc) };
    } catch { return null; }
  };
  const onPath = tryIt("ffmpeg");
  if (onPath && onPath.h264) return onPath;
  const cache = path.join(process.env.HOME || "", "Library/Caches/ms-playwright");
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).filter((x) => x.startsWith("ffmpeg-"))) {
      for (const name of ["ffmpeg-mac", "ffmpeg-mac-arm64", "ffmpeg-linux"]) {
        const bin = path.join(cache, d, name);
        if (fs.existsSync(bin)) {
          const got = tryIt(bin);
          if (got) return got;
        }
      }
    }
  }
  return onPath || null;
}

/** The four UnderwriteIQ deliverables, as HTML instead of PDF.
 *  fundhub_gen.py renders through WeasyPrint, which is not installed and needs
 *  system libraries we are not adding. It builds a complete HTML string first and
 *  only hands it to WeasyPrint at the very end, so a stand-in module that writes
 *  that string to a file gives the same document with no new dependency. */
function buildDeliverables() {
  const shim = path.join(STAGE, "_shim");
  fs.mkdirSync(shim, { recursive: true });
  fs.writeFileSync(path.join(shim, "weasyprint.py"), [
    "import os",
    "class CSS:",
    "    def __init__(self, string=None, **kw): self.string = string or ''",
    "class HTML:",
    "    def __init__(self, string=None, **kw): self.string = string or ''",
    "    def write_pdf(self, outpath, stylesheets=None, **kw):",
    "        css = '\\n'.join(getattr(s, 'string', '') for s in (stylesheets or []))",
    "        doc = self.string.replace('</head>', '<style>%s</style></head>' % css)",
    "        out = os.path.splitext(outpath)[0] + '.html'",
    "        open(out, 'w', encoding='utf-8').write(doc)",
    ""
  ].join("\n"));
  /* THE STREET ADDRESS IS SWAPPED FOR A PLAINLY MADE-UP ONE. The sample file carries
     a full street address, and the roadmap prints it in the "form your LLC" step. A
     real street address has no business on a paid ad even with a made-up name on it,
     so it is replaced before a single frame is drawn. */
  fs.writeFileSync(path.join(shim, "driver.py"), [
    "import sys",
    "import fundhub_gen as g",
    "g.CLIENT['applicant'] = 'Jordan Sample'",
    "g.CLIENT['address'] = '1200 Sample Street, San Antonio, TX 78242'",
    `sys.argv = ['fundhub_gen.py', '--out', ${JSON.stringify(STAGE)}]`,
    "g.main()",
    ""
  ].join("\n"));
  sh("python3", [path.join(shim, "driver.py")], {
    cwd: path.join(ROOT, "scripts/black-reports"),
    env: { ...process.env, PYTHONPATH: `${shim}:${path.join(ROOT, "scripts/black-reports")}` }
  });
  for (const f of fs.readdirSync(STAGE)) {
    if (f.endsWith(".pdf")) fs.rmSync(path.join(STAGE, f)); // the shim leaves 0-byte stubs
  }
}

/** Four real approval emails in a column. The crops come from
 *  marketing/landing-pages/slo/client-wins/, which is the sanitized set — the names
 *  are blacked out in the source images, not by anything this script does. */
function buildApprovals() {
  const picks = ["proof-crop-04.png", "proof-crop-09.png", "proof-crop-01.png", "proof-crop-12.png"];
  for (const p of picks) fs.copyFileSync(path.join(WINS, p), path.join(STAGE, p));
  fs.writeFileSync(path.join(STAGE, "approvals.html"), `<!doctype html>
<html><head><meta charset="utf-8"><title>Approvals</title>
<style>
  html,body{margin:0;background:#0d0d0d}
  .col{width:900px;margin:0 auto;padding:40px 0 120px}
  .shot{width:100%;display:block;margin:0 0 34px;border-radius:14px;
        box-shadow:0 18px 50px rgba(0,0,0,.55)}
</style></head>
<body><div class="col">${picks.map((p) => `<img class="shot" src="${p}" alt="">`).join("")}</div></body></html>`);
}

/** One dispute letter on a page. The words come from the real letter engine
 *  (src/metro2/letters/generate.mjs), which refuses to write a claim that has no
 *  rule behind it — so the letter is the product's own output, for a sample file. */
function buildLetter() {
  const identity = {
    fullName: "Jordan Sample",
    addressLine1: "1200 Sample Street",
    city: "San Antonio",
    state: "TX",
    zip: "78242"
  };
  const violations = [
    {
      ruleId: "M2-007",
      severity: "deletion",
      field: "25",
      observed: "2015-01-01",
      expected: "deleted",
      reason: "Date of first delinquency plus seven years and 180 days is already past",
      citations: ["15 U.S.C. § 1681c(a)", "15 U.S.C. § 1681i(a)(5)(A)"],
      metro2Ref: "Field 25",
      creditor: "SIGNET BANK/VIRGINIA",
      account_last4: "4412"
    },
    {
      ruleId: "M2-011",
      severity: "strong",
      field: "21",
      observed: 2100,
      expected: 0,
      reason: "Account status 13 reported with a balance that is not zero",
      citations: ["15 U.S.C. § 1681e(b)", "Saunders v. Branch Banking & Trust Co."],
      metro2Ref: "Exhibit 4, Status 13",
      creditor: "SYNCB/LEVITZ",
      account_last4: "8664"
    },
    {
      ruleId: "M2-005",
      severity: "strong",
      field: "24",
      observed: "2019-06-01",
      expected: "current",
      reason: "Date of account information has not moved in years while the account still reports",
      citations: ["15 U.S.C. § 1681e(b)"],
      metro2Ref: "Field 24",
      creditor: "CITIBANK SD NA",
      account_last4: "2207"
    }
  ];
  const text = buildLetterText({
    violations,
    identity,
    bureau: "EX",
    date: "September 23, 2026",
    seed: "broll-demo-ex-r1"
  });
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  fs.writeFileSync(path.join(STAGE, "dispute-letter.html"), `<!doctype html>
<html><head><meta charset="utf-8"><title>Dispute letter</title>
<style>
  html{background:#3a3a3d}
  body{margin:0;padding:48px 0 140px;font:14px/1.75 "Times New Roman",Times,serif;color:#111}
  .sheet{width:760px;margin:0 auto;background:#fff;padding:78px 86px;
         box-shadow:0 22px 60px rgba(0,0,0,.45)}
  pre{margin:0;white-space:pre-wrap;font:inherit}
</style></head>
<body><div class="sheet"><pre>${esc(text)}</pre></div></body></html>`);
}

function buildStage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });
  buildDeliverables();
  buildApprovals();
  buildLetter();
  for (const f of ["soft-pull-approve.html", "fundhub-brand.css"]) {
    fs.copyFileSync(path.join(ROOT, "public/app", f), path.join(STAGE, f));
  }
}

/* ── the little server ───────────────────────────────────────────────────── */

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    const file = path.join(STAGE, rel);
    if (!file.startsWith(STAGE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("no");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/* ── recording ───────────────────────────────────────────────────────────── */

/** The soft-pull screen asks the server who the client is before it draws anything.
 *  Nothing real answers here: this is the shape api/soft-pull-approve.mjs returns on
 *  GET, filled with the product's own disclosure text and a sample first name. */
function softPullAnswer() {
  const disclosure = SOFT_PULL_DISCLOSURES[CURRENT_SOFT_PULL_VERSION];
  return {
    ok: true,
    kind: "soft_pull",
    version: CURRENT_SOFT_PULL_VERSION,
    disclosure: {
      version: disclosure.version,
      text: disclosure.text,
      bullets: disclosure.bullets || null
    },
    consent: { valid: false, reason: null },
    pricing: softPullPricingPublic(),
    contact: { first_name: "Jordan", last_name: "Sample" }
  };
}

/* Find the bottom, place the start, and report both — all inside ONE evaluate, so the
   browser never paints the probe. A visible jump at the head of a 4-second clip is a
   defect; doing this across two calls is what would cause one. */
const PREPARE = (a) => {
  const here = window.scrollY;
  window.scrollTo(0, 1e7);
  const max = window.scrollY;
  window.scrollTo(0, here);
  if (!a.anchor) {
    window.scrollTo(0, 0);
    return { ok: true, max, start: 0 };
  }
  const el = [...document.querySelectorAll("h1,h2,h3")]
    .find((e) => e.textContent.trim().toLowerCase().startsWith(a.anchor.toLowerCase()));
  if (!el) return { ok: false, max, start: here };
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40);
  return { ok: true, max, start: window.scrollY };
};

const SCROLL = (a) => new Promise((done) => {
  const start = window.scrollY;
  const go = Math.max(0, Math.min(a.travel, a.max - start));
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / a.ms);
    const e = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; // ease in, ease out
    window.scrollTo(0, start + go * e);
    if (k < 1) requestAnimationFrame(step);
    else done(window.scrollY);
  })(performance.now());
});

async function recordClip(browser, base, clip, seconds) {
  const ctx = await browser.newContext({
    viewport: VIEW,
    recordVideo: { dir: RAW, size: VIDEO }
  });
  const page = await ctx.newPage();
  if (clip.stub === "softpull") {
    const body = JSON.stringify(softPullAnswer());
    await page.route("**/api/soft-pull-approve*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body }));
  }
  /* Google Fonts is the only outside call any of these pages makes. Let it fail fast
     rather than hold the first frame white while it waits. */
  await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
  await page.route("https://fonts.gstatic.com/**", (r) => r.abort());

  await page.goto(`${base}/${clip.page}`, { waitUntil: "load" });
  await page.addStyleTag({ content: `html{zoom:${ZOOM}}` });
  await page.waitForTimeout(400);

  const prep = await page.evaluate(PREPARE, { anchor: clip.anchor || null });
  if (!prep.ok) throw new Error(`clip ${clip.n}: no heading starts with "${clip.anchor}" — refusing to record a frozen frame`);
  await page.waitForTimeout(250);

  const before = prep.start;
  const after = await page.evaluate(SCROLL, { travel: clip.travel, max: prep.max, ms: seconds * 1000 });
  await page.waitForTimeout(200);
  if (after - before < 200) throw new Error(`clip ${clip.n}: the page barely moved (${after - before}px). A still frame is a failed clip.`);

  const video = page.video();
  await ctx.close();
  return { src: await video.path(), moved: Math.round(after - before) };
}

/** Cuts the blank head off and fixes the length. Without an ffmpeg the raw recording
 *  is kept as it is, head and all, and the run says so out loud. */
const HEAD = 0.75;
const KEEP = 3.8;

function finish(ff, src, clip) {
  const ext = ff && ff.h264 ? ".mp4" : ".webm";
  const dst = path.join(OUT, clip.file.replace(/\.webm$/, ext));
  if (!ff || !(ff.h264 || ff.vp8)) {
    fs.renameSync(src, dst);
    return { dst, trimmed: false };
  }
  const codec = ff.h264
    ? ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    : ["-c:v", "libvpx", "-b:v", "12M", "-deadline", "good", "-cpu-used", "2"];
  sh(ff.bin, ["-y", "-hide_banner", "-loglevel", "error",
    "-ss", String(HEAD), "-i", src, "-t", String(KEEP), ...codec, "-an", dst]);
  fs.rmSync(src, { force: true });
  return { dst, trimmed: true };
}

/** Reads the finished file back the only way this Mac can: Chromium plays it and
 *  reports its own numbers. No ffprobe here either. */
async function measure(browser, file) {
  const page = await browser.newPage();
  /* A page on about:blank may not read a file:// video. Stand the page in the same
     folder as the clip first. */
  await page.goto(`file://${path.dirname(file)}/`);
  const out = await page.evaluate((src) => new Promise((done) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => done({ w: v.videoWidth, h: v.videoHeight, secs: v.duration });
    v.onerror = () => done({ w: 0, h: 0, secs: 0 });
    v.src = src;
  }), `file://${file}`);
  await page.close();
  return out;
}

/* ── main ────────────────────────────────────────────────────────────────── */

const only = process.argv.includes("--only")
  ? Number(process.argv[process.argv.indexOf("--only") + 1])
  : null;
const SECONDS = 3.0;

console.log("Building the stage (no database, no live site, sample data only)…");
buildStage();
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const ff = findFfmpeg();
console.log(ff
  ? `ffmpeg: ${ff.bin} (h264 ${ff.h264 ? "yes" : "NO"}, vp8 ${ff.vp8 ? "yes" : "no"})`
  : "ffmpeg: none found — clips stay raw, with the blank head still on them");

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const report = [];

for (const clip of CLIPS) {
  if (only && clip.n !== only) continue;
  process.stdout.write(`clip ${clip.n} → ${clip.file} … `);
  const { src, moved } = await recordClip(browser, base, clip, SECONDS);
  const { dst, trimmed } = finish(ff, src, clip);
  const m = await measure(browser, dst);
  report.push({ ...clip, path: dst, name: path.basename(dst), moved, trimmed, ...m });
  console.log(`${m.w}x${m.h}, ${m.secs.toFixed(2)}s, scrolled ${moved}px${trimmed ? "" : " (NOT trimmed)"}`);
}

await browser.close();
server.close();
fs.rmSync(RAW, { recursive: true, force: true });

console.log("\n| # | what it shows | file | size | length | data on screen |");
console.log("|---|---|---|---|---|---|");
for (const r of report) {
  console.log(`| ${r.n} | ${r.what} | \`${r.name}\` | ${r.w}x${r.h} | ${r.secs.toFixed(1)}s | ${r.data} |`);
}
console.log(`\nFolder: ${OUT}`);
