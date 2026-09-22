// The notification Chris actually sees, built from a take and its one-time key.
//
// Pure. No network, no database, no clock. src/messaging/providers/ntfy.mjs
// carries whatever this returns and does not invent any of it — the split is
// deliberate, because everything in this file is a product decision (what the
// buzz says, how many taps it costs) and everything in that one is transport.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THE BUTTONS POST AND THE NOTIFICATION BODY LINKS
//
// The plan's step 13 is "Chris taps approve or reject". One tap, not a tap
// followed by a page followed by another tap. ntfy's `http` action does exactly
// that: the button itself makes the request, from the phone, and the
// notification clears.
//
// It has to be a POST, and that is not a formality. A GET that decides would be
// fired by anything that follows links on Chris's behalf — a link preview in a
// messaging app, a mail client prefetching, a corporate URL scanner. Any one of
// those would approve a video nobody had watched, which is the exact failure
// this approval step exists to prevent. So the decision endpoint answers a GET
// with a page and changes nothing, and only a POST decides. This file's actions
// are POSTs; the `click` target is the read-only page, for when Chris wants to
// watch the thing before deciding.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE TOKEN IS IN THE BODY, NOT THE QUERY STRING, FOR THE TWO BUTTONS
//
// A one-time approval key in a URL is written to every proxy log and every
// server access log it passes. The buttons put it in the POST body instead. The
// `click` link has to carry it in the query string — a tapped link has no other
// way to say who it is — which is the one place it is exposed, and is why the
// key expires and is single-use.

import { DECISIONS } from "./ad-video.mjs";

/** Where the decision door lives. One place, so the page and the two buttons
    cannot drift apart. */
export const DECISION_PATH = "/api/public/ad-video-decision";

/**
 * publicBaseUrl(env) → string with no trailing slash.
 *
 * Same order src/ops/hire-closer.mjs uses, so a deploy that sets one of these
 * gets consistent links everywhere rather than a different host per feature.
 */
export function publicBaseUrl(env = process.env) {
  const raw = String(env.PUBLIC_BASE_URL || env.APP_BASE_URL || "https://fundhub.ai").trim();
  return raw.replace(/\/+$/, "");
}

/** padAdId(adId) → "043". THE FOLDER NAME ONLY.
 *
 *  ⚠️ NEVER let this near a link. fundhub_ad_id() returns TEXT
 *  (286_client_ad_attribution.sql:81-84), so utm_content=043 and utm_content=43
 *  are two different ads and one ad's results split in half. The plan's §4
 *  carries the same warning. This is for the words on a notification, where
 *  three digits sort and read better, and for nothing else. */
export function padAdId(adId) {
  const s = String(adId ?? "").trim();
  return /^\d+$/.test(s) ? s.padStart(3, "0") : s;
}

/** Seconds → "1:42". Undefined or nonsense → null, never "0:00", because a
    length nobody measured and a one-second video must not read the same. */
export function runtimeLabel(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const whole = Math.round(n);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** "3840x2160" → the size, when it was recorded. */
export function sizeLabel(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return `${w}x${h}`;
}

/**
 * buildApprovalNotice(spec) → the object src/messaging/providers/ntfy.mjs sends
 *
 * spec: {
 *   token       the whole one-time key. Never logged by anything downstream.
 *   adId        the ad number as text, unpadded, exactly as stored
 *   takeNo
 *   videoKind   "ad" | "not_ad"
 *   durationSeconds?, width?, height?
 *   videoUrl?   the finished file, for the "Watch" button
 *   env?
 * }
 *
 * Throws on a missing token or ad number. This is called by a worker, not by a
 * request, and a notification built without its key is a buzz Chris cannot act
 * on — louder to fail here than to send something useless.
 */
export function buildApprovalNotice({
  token,
  adId,
  takeNo,
  videoKind = "ad",
  durationSeconds = null,
  width = null,
  height = null,
  videoUrl = null,
  env = process.env
} = {}) {
  const tok = String(token || "").trim();
  if (!tok) throw new Error("buildApprovalNotice: a token is required");
  const ad = String(adId ?? "").trim();
  if (!ad) throw new Error("buildApprovalNotice: an ad number is required");

  const base = publicBaseUrl(env);
  const decisionUrl = `${base}${DECISION_PATH}`;
  const pageUrl = `${decisionUrl}?t=${encodeURIComponent(tok)}`;

  const take = Number.isFinite(Number(takeNo)) ? `t${String(Number(takeNo)).padStart(2, "0")}` : "t??";
  const facts = [
    runtimeLabel(durationSeconds),
    sizeLabel(width, height),
    /* THE 4K LAW, SURFACED WHERE A PERSON CAN ACT ON IT.
       .claude/rules/video-4k-unless-ad.md: 4K for anything that is not a paid
       ad. The database refuses to store a short not-ad as finished, but a
       notification that just said nothing would leave Chris approving a take
       without knowing it is under size. So it is said, in the words he uses. */
    notFourK({ videoKind, height }) ? "NOT 4K — this is not an ad" : null
  ].filter(Boolean);

  const body = [
    `Ad ${padAdId(ad)}, take ${Number(takeNo) || "?"} is ready.`,
    facts.length ? facts.join("  ·  ") : null,
    "Approve or reject below."
  ].filter(Boolean).join("\n");

  const actions = [
    decisionAction("Approve", "approve", decisionUrl, tok),
    decisionAction("Reject", "reject", decisionUrl, tok)
  ];

  /* The watch button only exists when there is something to watch. An action
     pointing at "null" is a button that fails in Chris's hand. */
  if (videoUrl && /^https:\/\//i.test(String(videoUrl))) {
    actions.push({ action: "view", label: "Watch", url: String(videoUrl), clear: false });
  }

  return {
    title: `Ad ${padAdId(ad)} ${take} — approve?`,
    body,
    priority: 4,
    tags: ["clapper"],
    // Tapping the notification itself opens the read-only page. It decides
    // nothing; see the header.
    click: pageUrl,
    actions
  };
}

/* One decision button. `clear: true` makes the notification disappear once the
   request is made, so a second, stale copy is not left sitting on the phone
   inviting a tap that the door would only refuse. */
function decisionAction(label, decision, url, token) {
  if (!Object.prototype.hasOwnProperty.call(DECISIONS, decision)) {
    throw new Error(`decisionAction: "${decision}" is not a decision word`);
  }
  return {
    action: "http",
    label,
    url,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, decision }),
    clear: true
  };
}

/** True when the 4K law applies to this take and the take does not meet it.
    A height nobody recorded is NOT reported as a failure — unknown and wrong
    are different things, and saying "not 4K" about an unmeasured take would
    teach Chris to ignore the line. */
export function notFourK({ videoKind, height } = {}) {
  if (String(videoKind) === "ad") return false;
  const h = Number(height);
  if (!Number.isFinite(h) || h <= 0) return false;
  return h < 2160;
}

export default {
  DECISION_PATH,
  publicBaseUrl,
  padAdId,
  runtimeLabel,
  sizeLabel,
  notFourK,
  buildApprovalNotice
};
