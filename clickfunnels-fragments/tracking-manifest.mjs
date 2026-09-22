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

export function clarityHeadHtml(env = process.env) {
  const projectId = String(env.CLARITY_PROJECT_ID ?? "").trim();
  if (!projectId) return "";
  return `<!-- Microsoft Clarity (FundHub) -->
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

/** Pages we never full-replace (native CF calendar / checkout). */
export const DO_NOT_FULL_REPLACE_PATHS = new Set([
  "/funding-book-call",
  "/schedule/phonecall",
]);

export const PUSH_MANIFEST = [
  {
    key: "apply-watch",
    liveUrl: "https://apply.fundhub.ai/watch",
    path: "/watch",
    fragment: "clickfunnels-fragments/01-vsl.html",
    vslBeacon: true,
    strategy: "custom_html_or_head_append",
  },
  {
    key: "apply-survey",
    liveUrl: "https://apply.fundhub.ai/apply",
    path: "/apply",
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
    path: "/funding-book-call",
    fragments: [
      "clickfunnels-fragments/04a-book-top.html",
      "clickfunnels-fragments/04b-book-bottom.html",
    ],
    vslBeacon: false,
    strategy: "head_footer_append_only",
    note: "Native calendar — never POST custom_html full page replace",
  },
  {
    key: "apply-thank-you",
    liveUrl: "https://apply.fundhub.ai/thank-you",
    path: "/thank-you",
    fragment: "clickfunnels-fragments/05-thank-you.html",
    vslBeacon: false,
    strategy: "custom_html_or_head_append",
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
