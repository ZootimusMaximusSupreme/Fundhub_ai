// /api/public/ad-video-decision — where Chris approves or rejects an ad video.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
//
// docs/video-pipeline-plan.md §1: Chris films (step 3) and Chris approves
// (step 13). Those two are his whole job. Owner decision 2026-09-22: he
// approves by tapping a phone notification, not by opening a screen in the app.
//
// A notification has no session and no cookie, so the one-time token in the
// link IS the credential. src/video/decision-token.mjs explains its two halves;
// this file is the door it opens.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** OPEN TO THE INTERNET, BY NECESSITY. THE SECOND ONE IN THIS REPO. ***
//
// The first is api/public/vsl-watch.mjs and this file follows its discipline
// point for point, because the reasoning carries over exactly:
//
//   1. A GET NEVER DECIDES ANYTHING. It renders a page and writes nothing.
//      This is the load-bearing one. A GET that decided would be fired by every
//      link-preview bot, mail prefetcher and corporate URL scanner that ever
//      touched the notification — and each of those would approve a video that
//      nobody watched. That is precisely the failure the approval step exists
//      to prevent, so the decision is a POST and only a POST.
//
//   2. HARD SIZE CAP — 2 KB, counted in bytes, refused not truncated. The body
//      is a token and a word; nothing legitimate is larger.
//
//   3. THE TOKEN IS SHAPE-CHECKED BEFORE IT REACHES THE DATABASE. Exact
//      length, exact alphabet, anchored. A malformed one never becomes a query
//      parameter, never opens a transaction.
//
//   4. NOTHING THE CALLER SAYS ABOUT IDENTITY IS BELIEVED. There is no field
//      for who is deciding. The approver is recorded as the owner because the
//      token was sent to the owner's phone and to nowhere else; a caller
//      claiming to be someone is ignored.
//
//   5. IT NEVER BECOMES STAFF. src/video/decision-store.mjs opens its
//      transaction scoped to the one token selector, so 390's policies put one
//      token row and one video row in reach and nothing else in the database.
//      fundhub.actor is never set; fundhub_is_staff() is false throughout.
//
//   6. ONE TAP, ONCE. The spend is a conditional UPDATE, not a read followed
//      by a write. Two taps in the same millisecond cannot both win.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** NOTHING IS LEARNED WITHOUT A VALID TOKEN ***
//
// Every refusal — a token that never existed, one used an hour ago, one that
// expired, one naming a take a worker has since failed — produces THE SAME
// STATUS AND THE SAME BYTES. 404 and the same short page for a GET; 404 and
// `{ ok:false, error:"invalid" }` for a POST.
//
// The code below knows exactly which of those it is. That reason goes to the
// server log and stops there. If the answers differed, this endpoint would tell
// anyone who asked whether a guessed token named a real video, one guess at a
// time, and a valid token is permission to approve an ad.
//
// The verifier comparison is constant time for the same reason
// (src/video/decision-token.mjs).
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** THIS IS NOT REACHABLE UNTIL THE ROUTE KEY IS ADDED. ***
//
// netlify/functions/api.mjs holds a hand-written ROUTES map and a handler that
// is not in it returns "no such page" both locally and deployed (CLAUDE.md §12,
// src/http/routes.test.mjs). The key is:
//
//       "public/ad-video-decision": publicAdVideoDecision

import { db as defaultDb } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import { sloCorsHeaders } from "../../src/slo/cors.mjs";
import { parseDecisionToken, verifierMatches } from "../../src/video/decision-token.mjs";
import { decisionTransition, normaliseDecision, DECISIONS } from "../../src/video/ad-video.mjs";
import {
  withDecisionScope as defaultWithDecisionScope,
  loadDecisionTarget,
  spendDecision
} from "../../src/video/decision-store.mjs";
import { renderDecisionPage, renderGonePage } from "../../src/video/decision-page.mjs";
import { padAdId, runtimeLabel, sizeLabel, notFourK } from "../../src/video/approval-notice.mjs";

const METHODS = "GET, POST, OPTIONS";

/** A token and a word. Anything bigger is not from us. */
export const MAX_BODY_BYTES = 2048;

/** Why a reason is refused storage. A rejection note is for Chris's own memory
    ("stumbled at 0:12"), not a free-text field on an open endpoint. */
export const MAX_REASON_CHARS = 280;

/* The approver. NOT taken from the request — see point 4 in the header. The
   token went to one phone; whoever held it is the owner. */
const APPROVER = "chris";

export function overBodyCap(raw, cap = MAX_BODY_BYTES) {
  return Buffer.byteLength(String(raw ?? ""), "utf8") > cap;
}

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return null; }
  }
  if (typeof req.rawBody === "string") {
    try { return JSON.parse(req.rawBody || "{}"); } catch { return null; }
  }
  return null;
}

function rawOf(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") {
    try { return JSON.stringify(req.body); } catch { return ""; }
  }
  return "";
}

/* Cross-site headers, reusing the allow-list the other public doors share
   (src/slo/cors.mjs). The two notification buttons POST with no Origin at all,
   which needs no header; this is here so the page's own fetch still works if
   the page is ever framed from apply.fundhub.ai. Never "*". */
function applyCors(req, res) {
  const h = req?.headers || {};
  for (const [k, v] of Object.entries(sloCorsHeaders(h.origin || h.Origin, METHODS))) {
    res.setHeader(k, v);
  }
}

/* A live approval key sits in this page's URL. These three headers keep it
   from travelling any further than the browser that was handed it. */
function applyPrivacyHeaders(res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

/* netlify/functions/api.mjs's response shim implements send() alongside json()
   (its header says so at line 6). This is the only handler under api/ that
   answers with HTML, so it is the only one that uses it. */
function sendHtml(res, status, html) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(status).send(html);
}

/* THE ONE REFUSAL. Identical for every reason. `why` is for the log only. */
function refuse(res, wantsHtml, why) {
  if (why) console.warn("ad-video-decision: refused —", why);
  if (wantsHtml) return sendHtml(res, 404, renderGonePage());
  return res.status(404).json({ ok: false, error: "invalid" });
}

/**
 * checkToken(parsed, target, now) → { ok:true } | { ok:false, why }
 *
 * The four things that make a loaded row usable, in one place so the GET and
 * the POST cannot come to different conclusions about the same token. Pure.
 *
 * ORDER MATTERS. The verifier is compared BEFORE anything else about the row is
 * read, so a caller that guessed a selector but not the secret cannot get as
 * far as learning whether that selector named a spent token, an expired one, or
 * a real video.
 */
export function checkToken(parsed, target, now = Date.now()) {
  if (!target) return { ok: false, why: "no such token" };
  /* CONSTANT TIME. src/video/decision-token.mjs explains why that matters on a
     value that is, by itself, permission to approve an ad. */
  if (!verifierMatches(parsed.verifier, target.verifier_sha256)) {
    return { ok: false, why: "verifier mismatch" };
  }
  if (target.used_at) return { ok: false, why: "token already spent" };
  if (new Date(target.expires_at).getTime() <= now) return { ok: false, why: "token expired" };
  return { ok: true };
}

export default async function handler(req, res, deps = {}) {
  applyCors(req, res);
  applyPrivacyHeaders(res);

  const method = String(req.method || "").toUpperCase();

  if (method === "OPTIONS") {
    res.setHeader("Allow", METHODS);
    return res.status(200).json({ ok: true });
  }

  const withScope = deps.withDecisionScope || defaultWithDecisionScope;
  const dbh = deps.db || defaultDb;

  if (method === "GET") return handleGet(req, res, { withScope, dbh });
  if (method === "POST") return handlePost(req, res, { withScope, dbh });

  res.setHeader("Allow", METHODS);
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}

/* ── GET — SHOWS. CHANGES NOTHING. ────────────────────────────────────────── */
async function handleGet(req, res, { withScope }) {
  const token = (req.query && (req.query.t || req.query.token)) || "";

  const parsed = parseDecisionToken(token);
  if (!parsed) return refuse(res, true, "malformed token");

  try {
    const v = await withScope(parsed.selector, (tx) => loadDecisionTarget(tx, parsed.selector));

    const check = checkToken(parsed, v);
    if (!check.ok) return refuse(res, true, check.why);

    /* A take that is no longer waiting on a person gets the same blank page as
       a bad token. It is not a secret that a video was approved, but this page
       is reached by a URL a stranger could guess at, and "this one exists but
       is already done" is more than a guesser should be able to establish. */
    if (v.status !== "awaiting_approval") {
      return refuse(res, true, `take is in "${v.status}", not awaiting a decision`);
    }

    const facts = [
      ["Ad number", padAdId(v.ad_id)],
      ["Take", v.take_no],
      ["Runs for", runtimeLabel(v.duration_seconds)],
      ["Picture", sizeLabel(v.width, v.height)],
      ["Kind", v.video_kind === "ad" ? "Paid ad" : "Not an ad"],
      ["Cut", v.finished_version ? `v${v.finished_version}` : null]
    ];

    return sendHtml(res, 200, renderDecisionPage({
      token: String(token),
      adIdPadded: padAdId(v.ad_id),
      takeNo: v.take_no,
      videoUrl: v.submagic_download_url,
      facts,
      warn: notFourK({ videoKind: v.video_kind, height: v.height })
        ? "This is not a paid ad and it is not 4K. The rule says 4K for anything that is not an ad."
        : null
    }));
  } catch (err) {
    /* ONE PAGE, the same as every refusal above. The real message goes to the
       server log, where only we can read it — the same rule
       api/public/vsl-watch.mjs holds itself to. */
    console.error("ad-video-decision: GET failed —", safeError(err));
    return sendHtml(res, 500, renderGonePage("Something went wrong. Try the link again."));
  }
}

/* ── POST — DECIDES. ONCE. ────────────────────────────────────────────────── */
async function handlePost(req, res, { withScope }) {
  // Size first, before anything is parsed.
  if (overBodyCap(rawOf(req))) {
    return res.status(413).json({ ok: false, error: "too_large" });
  }

  const body = readBody(req);
  if (!body || typeof body !== "object") return refuse(res, false, "unparseable body");

  const decision = normaliseDecision(body.decision);
  if (!decision) return refuse(res, false, "not a decision word");

  /* The note is optional, trimmed, capped, and only kept for a rejection —
     an approval has nothing to explain. */
  const reason = decision === "reject"
    ? (String(body.reason ?? "").trim().slice(0, MAX_REASON_CHARS) || null)
    : null;

  try {
    const out = await runDecision({
      token: body.token,
      decision,
      reason,
      withScope
    });

    if (!out.ok) return refuse(res, false, out.why);

    /* WHAT A SUCCESS SAYS, AND WHAT IT DOES NOT. The ad number and take are
       echoed so the page can say something true back to Chris, and because by
       this point the caller has proved it holds the key to that exact row —
       there is nothing here it did not already have. Nothing else: not the
       video URL, not the org, not the row id. */
    return res.status(200).json({
      ok: true,
      decision,
      status: out.video.status,
      ad_id: out.video.adId,
      take_no: out.video.takeNo
    });
  } catch (err) {
    console.error("ad-video-decision: POST failed —", safeError(err));
    return res.status(500).json({ ok: false, error: "error" });
  }
}

/**
 * runDecision — the whole write, inside one scoped transaction.
 *
 * Exported for src/http/ad-video-decision.test.mjs, which drives it with a
 * stub transaction. The state check happens in JavaScript AND again in SQL
 * (`AND v.status = 'awaiting_approval'` in spendDecision) AND a third time in
 * 390's policy. That is not redundancy for its own sake: the first gives a
 * clear answer, the second makes it atomic, the third makes it true even if
 * this file is bypassed.
 */
export async function runDecision({ token, decision, reason, withScope }) {
  const parsed = parseDecisionToken(token);
  if (!parsed) return { ok: false, why: "malformed token" };

  return withScope(parsed.selector, async (tx) => {
    const target = await loadDecisionTarget(tx, parsed.selector);

    const check = checkToken(parsed, target);
    if (!check.ok) return { ok: false, why: check.why };

    const move = decisionTransition(target.status, decision);
    if (!move.ok) return { ok: false, why: move.reason };

    const spent = await spendDecision(tx, {
      tokenId: target.token_id,
      decision,
      nextStatus: move.next,
      decidedBy: APPROVER,
      reason
    });

    /* Zero rows means somebody else got there first — another tap, or a worker
       moving the take in the same instant. Either way this decision did not
       happen and must not be reported as though it had. */
    if (!spent.spent) return { ok: false, why: "already decided, or the take moved" };

    return { ok: true, video: spent.video };
  });
}

/** The words this endpoint accepts, for tests and for the page. */
export const ACCEPTED_DECISIONS = Object.freeze(Object.keys(DECISIONS));
