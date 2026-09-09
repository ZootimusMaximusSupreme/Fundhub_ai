// POST /api/public/vsl-watch — the beacon door for our own video player.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
//
// The VSL is a plain file on our own server playing in a bare <video> tag on a
// ClickFunnels page, and nothing measures it. Measured 2026-09-08 against the
// live page and written up in docs/specs/marketing-e2e/vsl-measurement-truth.md:
// zero watch data exists. No platform can fix that for us, because the file is
// ours and the page is ours. This endpoint is where the player's own report
// arrives, and 379_vsl_watch.sql is where it lands.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** THE ONE OPEN DOOR IN THIS BATCH. UNAUTHENTICATED, BY NECESSITY. ***
//
// Somebody watching a sales video has no account and never will until they
// apply. There is nobody to authenticate. So this endpoint is open to the
// whole internet, and everything below is about keeping that from mattering:
//
//   1. POST ONLY. Nothing here answers a GET, so it can never be triggered by
//      an <img> tag, a link, or somebody's crawler.
//   2. HARD SIZE CAP — 8 KB, counted in bytes, refused not truncated.
//   3. HARD SAMPLE CAP — 240 position samples per call.
//   4. RATE LIMITED TWICE, from real rows and not from memory: per visitor id,
//      and — because a visitor id is a string the caller makes up for free — a
//      site-wide ceiling on NEW viewings that a flood across thousands of
//      invented ids still runs into. src/vsl/watch-beacon.mjs's WATCH_LIMITS
//      holds both numbers and says plainly what each one is worth.
//   5. EVERY FIELD VALIDATED, and junk REFUSED rather than stored.
//   6. NOTHING THE CALLER SAYS ABOUT IDENTITY IS BELIEVED. There is no join
//      from a watch row to a person, and no column for an address or a user
//      agent — not even hashed (379's header).
//   7. IT NEVER BECOMES STAFF. src/vsl/watch-store.mjs opens its transaction
//      as the one anonymous visitor it is writing for, so a bug in this file
//      has one browser's watch rows in reach and nothing else in the database.
//   8. THE ANSWER IS ALWAYS THE SAME AND ALWAYS BORING.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** WRITE-ONLY. NOTHING CAN BE LEARNED FROM THIS ENDPOINT. ***
//
// A success is `{ ok: true }` and nothing else. Not the row id, not whether a
// viewing already existed, not whether the video key matched a real file, not
// whether the ad number resolved to a real ad. Same body, same status, every
// time. If any of those differed, the endpoint would answer questions about our
// ads and our funnels to anyone who asked.
//
// Every refusal is the single word "invalid". The validator knows exactly which
// field was wrong — src/vsl/watch-beacon.mjs returns a reason and its tests
// assert on it — and that reason is deliberately not sent back. A caller
// probing the door learns nothing about its shape.
//
// A FAILURE IS ONE WORD TOO. A 500 answers "error" and nothing more. It would be
// easy to hand back a scrubbed database message here — api/public/affiliate-click.mjs
// does exactly that — but the claim at the top of this section is bigger than
// that, and on the one endpoint the whole internet can post to the claim is
// worth keeping true. The real message is not lost: it is written to the server
// log, which only we can read.
//
// Same rule, same reasons, as api/public/affiliate-click.mjs.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** CROSS-SITE, DESIGNED IN RATHER THAN DISCOVERED LATER ***
//
// The page is at https://apply.fundhub.ai/watch — ClickFunnels on a custom
// domain, confirmed live 2026-09-08 by the x-clickfunnels-version header on its
// response. This endpoint is on fundhub.ai. Different origins, so the browser
// applies its cross-site rules and a beacon that ignored them would be blocked
// with no visible error at all — which looks exactly like "nobody watches the
// video".
//
// Two halves, and both are needed:
//
//   THE ALLOW-LIST. Access-Control-Allow-Origin is echoed back ONLY for an
//   origin on the list below, and the header is omitted entirely for anything
//   else. Never "*": a wildcard would let any page on the internet post watch
//   rows into our table, and the whole value of this data is that it describes
//   our funnel.
//
//   THE PREFLIGHT. A cross-site POST carrying application/json makes the
//   browser ask permission first, with an OPTIONS request. Answering it is not
//   a write and stores nothing. navigator.sendBeacon with a text/plain Blob
//   skips the question entirely, which is why the body reader below accepts a
//   plain string as well as a parsed object — that is the shape the page-hide
//   beacon actually arrives in.
//
// VSL_BEACON_ORIGINS adds origins by environment variable, comma separated, for
// the day a funnel page moves. No deploy needed to add one; the default list
// covers where the page lives today.
//
//
// ═══════════════════════════════════════════════════════════════════════════
// *** THIS IS NOT REACHABLE UNTIL THE ROUTE KEY IS ADDED. ***
//
// netlify/functions/api.mjs holds a hand-written ROUTES map and a handler that
// is not in it returns "no such page" both locally and deployed. That has
// shipped broken twice (CLAUDE.md §12, src/http/routes.test.mjs). This file
// does not edit that map. The key it needs is:
//
//       "public/vsl-watch": publicVslWatch
//
// Until that line lands, src/http/routes.test.mjs FAILS on this file, which is
// the correct behaviour — the test exists so an unreachable handler cannot be
// quietly shipped.

import { db } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import {
  parseWatchBeacon,
  overBodyCap,
  MAX_BODY_BYTES,
  WATCH_LIMITS
} from "../../src/vsl/watch-beacon.mjs";
import { recordWatchBeacon } from "../../src/vsl/watch-store.mjs";

/* Where the player is allowed to live. apply.fundhub.ai is the ClickFunnels
   page confirmed live on 2026-09-08; the other two are our own site, for
   whenever a page moves in-house. */
const DEFAULT_ORIGINS = [
  "https://apply.fundhub.ai",
  "https://fundhub.ai",
  "https://www.fundhub.ai"
];

export function allowedOrigins(env = process.env) {
  const extra = String(env.VSL_BEACON_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

/* corsHeaders — echo the origin back only when it is on the list.

   No header at all for anything else, which is what makes the browser refuse
   the request. A wildcard is never returned; see the header. */
export function corsHeaders(origin, env = process.env) {
  const o = String(origin || "").trim();
  if (!o || !allowedOrigins(env).has(o)) return {};
  return {
    "Access-Control-Allow-Origin": o,
    // So a cache does not serve one funnel's answer to another origin.
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400"
  };
}

function applyCors(req, res) {
  const headers = req.headers || {};
  const cors = corsHeaders(headers.origin || headers.Origin);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
}

/* readBody — the same hand-rolled reader as the other public endpoints, with
   one addition that matters here.

   netlify/functions/api.mjs:1196-1199 parses the body only when the content
   type says application/json; anything else stays a string. A page-hide beacon
   is sent as text/plain on purpose, to skip the browser's preflight question,
   so the string branch is the ORDINARY path here and not a fallback. */
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

/* rawOf — the bytes as they arrived, for the size gate.

   The adapter has already read them by the time this runs, so the cap does not
   save the reading. It saves the parse, the validation and the write, and it
   makes "how big may a beacon be" one number that a test can hold this file to
   rather than an unwritten assumption. Stated plainly because a cap that is
   described as more than it is becomes a false comfort later. */
function rawOf(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") {
    try { return JSON.stringify(req.body); } catch { return ""; }
  }
  return "";
}

export default async function handler(req, res, deps = {}) {
  applyCors(req, res);

  /* The browser's permission question. It writes nothing and reads nothing —
     the headers set above are the entire answer. Without it a cross-site POST
     carrying application/json never happens at all. */
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // Size first, before anything is parsed. Refused, never truncated: half a
  // beacon is a row that says something that did not happen.
  if (overBodyCap(rawOf(req), MAX_BODY_BYTES)) {
    return res.status(413).json({ ok: false, error: "too_large" });
  }

  const parsed = parseWatchBeacon(readBody(req));
  if (!parsed.ok) {
    // ONE WORD. The reason is in parsed.error and stays here. See the header.
    return res.status(400).json({ ok: false, error: "invalid" });
  }

  try {
    const out = await recordWatchBeacon(parsed.value, {
      db: deps.db || db,
      ...(deps.withVslVisitor ? { withVslVisitor: deps.withVslVisitor } : {}),
      ...(deps.resolveDefaultOrg ? { resolveDefaultOrg: deps.resolveDefaultOrg } : {}),
      ...(deps.limits ? { limits: deps.limits } : {})
    });

    if (out && out.limited) {
      /* The wait comes from whichever guard actually fired — the per-visitor one
         and the site-wide one have different windows — and falls back to the
         built-in number only if the store did not say. Using WATCH_LIMITS here
         unconditionally would ignore any limits a caller or a test passed in and
         tell somebody to come back at the wrong time. */
      const minutes = Number(out.retryAfterMinutes) > 0
        ? Number(out.retryAfterMinutes)
        : (deps.limits || WATCH_LIMITS).windowMinutes;
      res.setHeader("Retry-After", String(Math.round(minutes * 60)));
      return res.status(429).json({ ok: false, error: "too_many_requests" });
    }

    // Nothing about the row. Not its id, not whether it was new. See the header.
    return res.status(200).json({ ok: true });
  } catch (err) {
    /* ONE WORD, the same as every refusal above. The header of this file says
       nothing can be learned from this endpoint, and handing back a database
       error message — even one scrubbed of the server address — is more than
       that claim allows. The real message is not thrown away: it goes to the
       server log, where only we can read it. */
    console.error("vsl-watch: beacon failed —", safeError(err));
    return res.status(500).json({ ok: false, error: "error" });
  }
}
