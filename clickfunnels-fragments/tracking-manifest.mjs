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
/** Funding paths demo under watch-proof on /watch (public/funnel/funding-paths.js). */
export const FUNDING_PATHS_SRC = "https://fundhub.ai/funnel/funding-paths.js";
/** Step opens and button presses to the Fundhub DB (public/funnel/fh-events.js). Every step of /watch and /roadmap. */
export const FH_EVENTS_SRC = "https://fundhub.ai/funnel/fh-events.js";
/** Microsoft Clarity loader (public/js/clarity.js). Same file the custom HTML pages load in <head>. */
export const CLARITY_SRC = "https://fundhub.ai/js/clarity.js";
/** Footer script tags that must carry `defer` (matches fragment inline tags). */
export const DEFER_FOOTER_SRCS = new Set([FUNDING_PATHS_SRC, CLARITY_SRC]);
/** /thank-you booking check + "What the call decides" + real approvals and texts (public/funnel/thankyou-sort.js). */
export const THANKYOU_SORT_SRC = "https://fundhub.ai/funnel/thankyou-sort.js";

export function footerScriptTag(src, { defer = false } = {}) {
  return `<script src="${src}"${defer ? " defer" : ""}></script>`;
}

/** True only for a real script tag. A comment that names the file does not count. */
export function hasScriptSrc(html, src) {
  const hay = String(html ?? "");
  const needle = String(src ?? "");
  if (!needle) return false;
  return hay.includes(`src="${needle}"`) || hay.includes(`src='${needle}'`);
}

function footerTagFormsForSrc(src) {
  const defer = DEFER_FOOTER_SRCS.has(src);
  return defer
    ? [footerScriptTag(src, { defer: true }), footerScriptTag(src, { defer: false })]
    : [footerScriptTag(src, { defer: false }), footerScriptTag(src, { defer: true })];
}

/**
 * Footer script tags to append. Any src already in `existing` (the page's live
 * head + footer code) is skipped, so a push never loads the same script twice.
 * nextFooterCode collapses extra copies of these tags down to one.
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
    .map((src) => footerScriptTag(src, { defer: DEFER_FOOTER_SRCS.has(src) }))
    .join("\n");
}

/**
 * Keep the first copy of each given footer script tag and drop the rest. Only the
 * srcs passed in are touched; every other tag in `code` stays exactly as it is.
 */
export function dedupeFooterScripts(code, srcs = []) {
  let out = String(code ?? "");
  for (const src of srcs) {
    const forms = footerTagFormsForSrc(src);
    let first = -1;
    let anchorLen = 0;
    for (const tag of forms) {
      const i = out.indexOf(tag);
      if (i !== -1 && (first === -1 || i < first)) {
        first = i;
        anchorLen = tag.length;
      }
    }
    if (first === -1) continue;
    for (const tag of forms) {
      let i;
      while ((i = out.indexOf(tag, first + anchorLen)) !== -1) {
        const start = out[i - 1] === "\n" ? i - 1 : i;
        out = out.slice(0, start) + out.slice(i + tag.length);
      }
    }
  }
  return out;
}

function stripSrcTags(code, src) {
  let out = String(code ?? "");
  for (const tag of footerTagFormsForSrc(src)) {
    out = out.split(`\n${tag}`).join("").split(tag).join("");
  }
  return out;
}

/** One Meta pixel block, or none when the funnel head already has the pixel. */
const META_PIXEL_BLOCK =
  /[ \t]*<!-- Meta Pixel \([^)\n]*\) -->[ \t]*\r?\n<script>[\s\S]*?<\/script>[ \t]*(?:\r?\n<noscript>[\s\S]*?<\/noscript>)?[ \t]*\r?\n?/g;

/** One Direct ROAS tag, or none when the funnel head already loads it. */
const DIRECT_ROAS_BLOCK =
  /[ \t]*<!-- Direct ROAS \([^)\n]*\) -->[ \t]*\r?\n<script async src="https:\/\/app\.directroas\.com\/[^"]+"><\/script>[ \t]*\r?\n?/g;

function applyBlockPolicy(code, pattern, dropAll) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const rx = new RegExp(pattern.source, flags);
  let seen = 0;
  return String(code ?? "").replace(rx, (match) => {
    seen += 1;
    if (dropAll || seen > 1) return "";
    return match;
  });
}

/**
 * Page head_code after a tracking cleanup.
 * Drop every page pixel / Direct ROAS block when `funnelHead` already has that
 * tag (the funnel head is on every builder step). Otherwise keep the first
 * copy and drop the rest. Marked blocks (fh-framed, fh-book-fit) stay.
 * @returns {{ next: string, changed: boolean }}
 */
export function nextHeadCode(live, { funnelHead = "" } = {}) {
  const funnel = String(funnelHead ?? "");
  const original = String(live ?? "");
  let next = applyBlockPolicy(original, META_PIXEL_BLOCK, funnel.includes("fbq('init'"));
  next = applyBlockPolicy(next, DIRECT_ROAS_BLOCK, funnel.includes("directroas.com"));
  if (next !== original) next = next.replace(/^\n+/, "").replace(/\n+$/, "");
  return { next, changed: next !== original };
}

/**
 * The footer code a builder-page push leaves behind, sent whole with
 * footer_code_mode "replace". Extra copies of attribution, the video beacon,
 * and each extra src collapse to one. A step with no film loses the beacon.
 * @returns {{ next: string, changed: boolean, added: string[], collapsed: string[] }}
 */
export function nextFooterCode(live, { includeVslBeacon = false, extraSrcs = [], dropSrcs = [], existing = "" } = {}) {
  let code = String(live ?? "");
  const collapsed = [];
  // Scripts this step no longer loads come out of the footer.
  for (const src of dropSrcs) {
    const stripped = stripSrcTags(code, src);
    if (stripped !== code) collapsed.push(src);
    code = stripped;
  }
  // A step with no film must not keep a video beacon another push left behind.
  if (!includeVslBeacon) {
    const stripped = stripSrcTags(code, VSL_WATCH_BEACON_SRC);
    if (stripped !== code) collapsed.push(VSL_WATCH_BEACON_SRC);
    code = stripped;
  }
  const collapseSrcs = [FH_ATTRIBUTION_SRC, ...extraSrcs];
  if (includeVslBeacon) collapseSrcs.push(VSL_WATCH_BEACON_SRC);
  for (const src of [...new Set(collapseSrcs)]) {
    const forms = footerTagFormsForSrc(src);
    let first = -1;
    let anchorLen = 0;
    for (const t of forms) {
      const i = code.indexOf(t);
      if (i !== -1 && (first === -1 || i < first)) {
        first = i;
        anchorLen = t.length;
      }
    }
    if (first === -1) continue;
    const head = code.slice(0, first + anchorLen);
    let tail = code.slice(first + anchorLen);
    let kept = tail;
    for (const t of forms) {
      kept = kept.split(`\n${t}`).join("").split(t).join("");
    }
    if (kept !== tail) collapsed.push(src);
    code = head + kept;
  }
  const seen = `${code}\n${existing}`;
  const add = trackingFooterScripts({
    includeVslBeacon,
    skipAttribution: hasScriptSrc(seen, FH_ATTRIBUTION_SRC),
    extraSrcs,
    existing: seen,
  });
  const next = add ? (code.trim() ? `${code.replace(/\s+$/, "")}\n${add}` : add) : code;
  const added = [...add.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  return { next, changed: next !== String(live ?? ""), added, collapsed };
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
<script src="${CLARITY_SRC}" defer></script>`;
}

/** GA4 measurement id, or "" when unset. Never invent one. */
export function ga4MeasurementId(env = process.env) {
  const id = String(env.GA_MEASUREMENT_ID || env.GA4_MEASUREMENT_ID || "").trim();
  return /^G-[A-Z0-9]+$/.test(id) ? id : "";
}

/** GA4 base tag. Empty when no measurement id is set, same rule as Clarity. */
export function ga4HeadHtml(env = process.env) {
  const id = ga4MeasurementId(env);
  if (!id) return "";
  return `<!-- GA4 (Fundhub) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');
</script>`;
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
    ga4HeadHtml(env),
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
  if (!hasScriptSrc(body, FH_ATTRIBUTION_SRC)) {
    body += `\n<script src="${FH_ATTRIBUTION_SRC}"></script>`;
  }
  if (includeVslBeacon && !hasScriptSrc(body, VSL_WATCH_BEACON_SRC)) {
    body += `\n<script src="${VSL_WATCH_BEACON_SRC}"></script>`;
  }
  if (!hasScriptSrc(body, FH_EVENTS_SRC)) {
    body += `\n<script src="${FH_EVENTS_SRC}"></script>`;
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
    funnelId: "968281",
    liveUrl: "https://apply.fundhub.ai/watch",
    path: "/vsl-page",
    pageId: "25061160",
    fragment: "clickfunnels-fragments/01-vsl.html",
    vslBeacon: true,
    extraFooterScripts: [WATCH_PROOF_SRC, FH_EVENTS_SRC, CLARITY_SRC],
    // Graphics moved to /thank-you (owner, 2026-10-01).
    dropFooterScripts: [FUNDING_PATHS_SRC],
    strategy: "custom_html_or_head_append",
    note: "Builder page — the body cannot be replaced by API; new sections ride in on footer scripts",
  },
  {
    key: "apply-survey",
    funnelId: "968281",
    liveUrl: "https://apply.fundhub.ai/apply",
    path: "/apply",
    pageId: "25068989",
    showPageStepId: "KmKBGB",
    fragment: "clickfunnels-fragments/apply-survey.html",
    vslBeacon: false,
    strategy: "apply_survey_replace",
    note: "Custom survey replaces native Survey/V1 on the /apply step. Ingest secret is injected at push, never stored in the fragment.",
  },
  {
    key: "apply-book",
    funnelId: "968281",
    liveUrl: "https://apply.fundhub.ai/funding-book-call",
    path: "/funding-book-call-page",
    pageId: "25062844",
    fragments: [
      "clickfunnels-fragments/04a-book-top.html",
      "clickfunnels-fragments/04b-book-bottom.html",
    ],
    vslBeacon: false,
    extraFooterScripts: [FH_EVENTS_SRC, CLARITY_SRC],
    strategy: "head_footer_append_only",
    note: "Native calendar — never POST custom_html full page replace",
  },
  {
    key: "apply-book-framed",
    funnelId: "968281",
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
    key: "apply-book-fit",
    funnelId: "968281",
    liveUrl: "https://apply.fundhub.ai/funding-book-call",
    path: "/funding-book-call-page",
    pageId: "25062844",
    fragment: "clickfunnels-fragments/04d-book-fit.html",
    codeSlot: "head_code",
    marker: "fh-book-fit",
    vslBeacon: false,
    strategy: "code_block_upsert",
    note: "Standalone-only layer: the scheduler's logo stays in its panel at every width, and on phones the card runs full width minus 16px gutters. One marked block in the same head_code; every rule is html:not(.fh-framed), so the framed view is untouched.",
  },
  {
    key: "apply-thank-you",
    funnelId: "968281",
    liveUrl: "https://apply.fundhub.ai/thank-you",
    path: "/thank-you-page",
    pageId: "25063539",
    fragment: "clickfunnels-fragments/05-thank-you.html",
    vslBeacon: false,
    extraFooterScripts: [THANKYOU_SORT_SRC, FUNDING_PATHS_SRC, FH_EVENTS_SRC, CLARITY_SRC],
    strategy: "custom_html_or_head_append",
    note: "Builder page — the body cannot be replaced by API; new sections ride in on footer scripts",
  },
  {
    key: "slo-297-sales",
    liveUrl: "https://apply.fundhub.ai/roadmap",
    funnelId: "984178",
    path: "/fundhub-297-roadmap-sales",
    pageId: "25516164",
    fragment: "clickfunnels-fragments/slo/slo-01-sales.html",
    vslBeacon: true,
    strategy: "custom_html_put",
    note: "Live step path /roadmap, in its own funnel (Fundhub $297 Roadmap, 984178) since 2026-10-01. Replace custom_html with the full sales page fragment.",
  },
  {
    key: "slo-297-booking",
    liveUrl: "https://apply.fundhub.ai/roadmap-book",
    funnelId: "984178",
    path: "/fundhub-297-roadmap-book--5df25",
    pageId: "25516165",
    fragment: "clickfunnels-fragments/slo/slo-02-booking.html",
    vslBeacon: true,
    strategy: "custom_html_put",
    note: "Post-$297 book step — embeds live /funding-book-call calendar (no CALCOM_* in env)",
  },
  {
    key: "slo-297-thank-you",
    liveUrl: "https://apply.fundhub.ai/roadmap-thank-you",
    funnelId: "984178",
    path: "/fundhub-297-roadmap-thank-you--adc9d",
    pageId: "25516166",
    fragment: "clickfunnels-fragments/slo/slo-03-thank-you.html",
    vslBeacon: false,
    strategy: "custom_html_put",
    note: "Step path /roadmap-thank-you. Booking page sends booked buyers here. In the roadmap funnel (984178) since 2026-10-01.",
  },
];
