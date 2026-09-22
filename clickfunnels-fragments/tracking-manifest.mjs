/**
 * Tracking inventory for ClickFunnels Custom HTML pushes.
 * Env overrides repo ground truth. Never commit secrets.
 *
 * Meta pixel ID ground truth: docs/workflows/archive/ads-revenue-model-2026-08-24.md
 * (also live on apply.fundhub.ai via CF site tracking — verify with view-source fbq init).
 */

/** @param {Record<string, string | undefined>} env */
export function metaPixelId(env = process.env) {
  for (const name of [
    "META_PIXEL_ID",
    "FACEBOOK_PIXEL_ID",
    "FB_PIXEL_ID",
    "PIXEL_ID",
    "META_PIXEL",
    "FB_PIXEL",
  ]) {
    const v = String(env[name] ?? "").trim();
    if (v) return { id: v, envName: name };
  }
  return { id: "2403674420141513", envName: "repo:ads-revenue-model-2026-08-24" };
}

/** Standard Meta base pixel + PageView (no CAPI). */
export function metaPixelHeadHtml(pixelId) {
  const id = String(pixelId).replace(/[^\d]/g, "");
  if (!id) return "";
  return `<!-- Meta Pixel (Fundhub) -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" alt=""
src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>`;
}

export const FH_ATTRIBUTION_SRC = "https://fundhub.ai/funnel/fh-attribution.js";
export const VSL_WATCH_BEACON_SRC = "https://fundhub.ai/funnel/vsl-watch-beacon.js";
/** Sorting Hat proof block under the first Get Started on /watch (public/funnel/watch-proof.js). */
export const WATCH_PROOF_SRC = "https://fundhub.ai/funnel/watch-proof.js";
/** /thank-you booking check + "What the call decides" + real approvals and texts (public/funnel/thankyou-sort.js). */
export const THANKYOU_SORT_SRC = "https://fundhub.ai/funnel/thankyou-sort.js";

/**
 * Footer script tags to append. Any src already in `existing` (the page's live
 * head + footer code) is skipped, so a push never loads the same script twice.
 * Append-only: tags already duplicated on a page stay as they are.
 */
export function trackingFooterScripts({
  includeVslBeacon,
  skipAttribution,
  extraSrcs = [],
  existing = "",
}) {
  const srcs = [];
  if (!skipAttribution) srcs.push(FH_ATTRIBUTION_SRC);
  if (includeVslBeacon) srcs.push(VSL_WATCH_BEACON_SRC);
  for (const src of extraSrcs) srcs.push(src);
  const seen = new Set();
  return srcs
    .filter((src) => {
      if (seen.has(src) || String(existing).includes(src)) return false;
      seen.add(src);
      return true;
    })
    .map((src) => `<script src="${src}"></script>`)
    .join("\n");
}

/**
 * Keep the first copy of each given footer script tag and drop the rest. Only the
 * srcs passed in are touched; every other tag in `code` stays exactly as it is.
 * Used on a builder page's footer_code for the row's own extraFooterScripts, which a
 * raced or double-applied append can leave there twice.
 */
export function dedupeFooterScripts(code, srcs = []) {
  let out = String(code ?? "");
  for (const src of srcs) {
    const tag = `<script src="${src}"></script>`;
    const first = out.indexOf(tag);
    if (first === -1) continue;
    let i;
    while ((i = out.indexOf(tag, first + tag.length)) !== -1) {
      const start = out[i - 1] === "\n" ? i - 1 : i;
      out = out.slice(0, start) + out.slice(i + tag.length);
    }
  }
  return out;
}

/**
 * True when `html` is a rendered ClickFunnels page. The builder-page push reads the
 * public page to learn which footer scripts are already there; a bot wall or an
 * error page would read as "none" and every tag would be appended again.
 */
export function isClickFunnelsPageHtml(html) {
  return typeof html === "string" && html.includes("data-page-element=");
}

/** Direct ROAS hub script (override with DIRECT_ROAS_HUB_URL in env). */
export function directRoasScriptSrc(env = process.env) {
  const fromEnv = String(env.DIRECT_ROAS_HUB_URL ?? "").trim();
  if (fromEnv) return fromEnv;
  return "https://app.directroas.com/api/hub/v1/cmsdutl8e00mukv041vwuo39w";
}

export function directRoasHeadHtml(env = process.env) {
  const src = directRoasScriptSrc(env);
  return `<!-- Direct ROAS (Fundhub) -->\n<script async src="${src}"></script>`;
}

export function clarityHeadHtml(env = process.env) {
  const projectId = String(env.CLARITY_PROJECT_ID ?? "").trim();
  if (!projectId) return "";
  return `<!-- Microsoft Clarity (Fundhub) -->
<script src="https://fundhub.ai/js/clarity.js" defer></script>`;
}

/**
 * @param {object} opts
 * @param {string} opts.bodyHtml fragment or full inner HTML
 * @param {string} [opts.pageToken] cfp_ token from CF create response
 * @param {string} opts.pixelId
 * @param {boolean} opts.includeVslBeacon
 * @param {Record<string, string | undefined>} [opts.env]
 */
export function wrapCustomHtmlDocument({
  bodyHtml,
  pageToken,
  pixelId,
  includeVslBeacon,
  env = process.env,
}) {
  const headBits = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    metaPixelHeadHtml(pixelId),
    clarityHeadHtml(env),
  ];
  if (pageToken) {
    headBits.push(
      `<meta name="cf-page-token" content="${String(pageToken).replace(/"/g, "&quot;")}">`,
    );
  }
  headBits.push(
    '<script src="https://sdk.myclickfunnels.com/sdk.js" defer></script>',
  );

  let body = bodyHtml;
  if (!body.includes("fh-attribution.js")) {
    body += `\n<script src="${FH_ATTRIBUTION_SRC}"></script>`;
  }
  if (includeVslBeacon && !body.includes("vsl-watch-beacon.js")) {
    body += `\n<script src="${VSL_WATCH_BEACON_SRC}"></script>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<title>Fundhub</title>
${headBits.join("\n")}
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Put one marked block into a page's head_code / footer_code without touching
 * anything else in it. The block must start with `<!-- ${marker}:start` and end
 * with `<!-- ${marker}:end -->`.
 *   no block live yet   -> mode "append" (send just the block; CF appends it)
 *   block live, differs -> mode "replace" (send the live code with only the block swapped)
 *   block live, same    -> changed false (send nothing)
 * @param {string} live current head_code / footer_code ("" when empty)
 * @param {string} block the full marked block from the fragment file
 * @param {string} marker e.g. "fh-framed"
 */
export function upsertMarkedBlock(live, block, marker) {
  const start = `<!-- ${marker}:start`;
  const end = `<!-- ${marker}:end -->`;
  const b = String(block).trim();
  if (!b.startsWith(start) || !b.endsWith(end)) {
    throw new Error(`block must start with "${start}" and end with "${end}"`);
  }
  if (b.indexOf(start, 1) !== -1) throw new Error(`block holds "${start}" twice`);
  const code = String(live ?? "");
  const i = code.indexOf(start);
  if (i === -1) return { changed: true, mode: "append", send: b, next: code ? `${code}\n${b}` : b };
  if (code.indexOf(start, i + 1) !== -1) throw new Error(`live code holds "${start}" twice — fix by hand`);
  const j = code.indexOf(end, i);
  if (j === -1) throw new Error(`live code has "${start}" but no "${end}"`);
  const current = code.slice(i, j + end.length);
  if (current === b) return { changed: false, mode: "none", send: "", next: code };
  const next = code.slice(0, i) + b + code.slice(j + end.length);
  return { changed: true, mode: "replace", send: next, next };
}

/** Pages we never full-replace (native CF calendar / checkout). */
export const DO_NOT_FULL_REPLACE_PATHS = new Set([
  "/funding-book-call",
  "/funding-book-call-page",
  "/schedule/phonecall",
]);

export const PUSH_MANIFEST = [
  {
    key: "apply-watch",
    liveUrl: "https://apply.fundhub.ai/watch",
    path: "/vsl-page",
    pageId: "25061160",
    fragment: "clickfunnels-fragments/01-vsl.html",
    vslBeacon: true,
    extraFooterScripts: [WATCH_PROOF_SRC],
    strategy: "custom_html_or_head_append",
    note: "Builder page — the body cannot be replaced by API; new sections ride in on footer scripts",
  },
  {
    key: "apply-survey",
    liveUrl: "https://apply.fundhub.ai/apply",
    path: "/apply-page",
    pageId: "25068989",
    fragments: [
      "clickfunnels-fragments/02a-apply-top.html",
      "clickfunnels-fragments/02b-apply-bottom.html",
    ],
    vslBeacon: false,
    strategy: "head_footer_append_only",
  },
  {
    key: "apply-book",
    liveUrl: "https://apply.fundhub.ai/funding-book-call",
    path: "/funding-book-call-page",
    pageId: "25062844",
    fragments: [
      "clickfunnels-fragments/04a-book-top.html",
      "clickfunnels-fragments/04b-book-bottom.html",
    ],
    vslBeacon: false,
    strategy: "head_footer_append_only",
    note: "Native calendar — never POST custom_html full page replace",
  },
  {
    key: "apply-book-framed",
    liveUrl: "https://apply.fundhub.ai/funding-book-call",
    path: "/funding-book-call-page",
    pageId: "25062844",
    fragment: "clickfunnels-fragments/04c-book-framed.html",
    codeSlot: "head_code",
    marker: "fh-framed",
    vslBeacon: false,
    strategy: "code_block_upsert",
    note: "Framed-only layer so the calendar sits clean inside /roadmap-book. One marked block in the native page's head_code; body and calendar untouched; does nothing when the page is not in a frame.",
  },
  {
    key: "apply-thank-you",
    liveUrl: "https://apply.fundhub.ai/thank-you",
    path: "/thank-you-page",
    pageId: "25063539",
    fragment: "clickfunnels-fragments/05-thank-you.html",
    vslBeacon: false,
    extraFooterScripts: [THANKYOU_SORT_SRC],
    strategy: "custom_html_or_head_append",
    note: "Builder page — the body cannot be replaced by API; new sections ride in on footer scripts",
  },
  {
    key: "slo-297-sales",
    liveUrl: "https://apply.fundhub.ai/roadmap",
    path: "/fundhub-297-roadmap-sales--c8e0a",
    pageId: "25426320",
    fragment: "clickfunnels-fragments/slo/slo-01-sales.html",
    vslBeacon: false,
    strategy: "custom_html_put",
    note: "Live alias /roadmap — replace custom_html with the full sales page fragment",
  },
  {
    key: "slo-297-booking",
    liveUrl: "https://apply.fundhub.ai/fundhub-297-roadmap-book--c8e0b",
    path: "/fundhub-297-roadmap-book--c8fbd",
    pageId: "25426722",
    fragment: "clickfunnels-fragments/slo/slo-02-booking.html",
    vslBeacon: false,
    strategy: "custom_html_put",
    note: "Post-$297 book step — embeds live /funding-book-call calendar (no CALCOM_* in env)",
  },
  {
    key: "slo-297-thank-you",
    liveUrl: "https://apply.fundhub.ai/roadmap-thank-you",
    path: "/fundhub-297-roadmap-thank-you--d488d",
    pageId: "25428615",
    fragment: "clickfunnels-fragments/slo/slo-03-thank-you.html",
    vslBeacon: false,
    strategy: "custom_html_put",
    note: "Created 2026-09-22 by API right after the book step (step 3123089, /roadmap-thank-you). Booking page sends booked buyers here.",
  },
];
