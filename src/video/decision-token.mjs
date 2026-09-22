// The one-time token that lets Chris's phone decide an ad video, and nothing
// else in the world.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS TOKEN IS, AND WHY IT IS BUILT IN TWO HALVES
//
// The approval door is open to the whole internet — a notification on a phone
// has no session and no cookie, so the token IS the credential. That means two
// things have to be true at once, and one obvious design gets only one of them:
//
//   * it must be found in the table by INDEX, not by scanning every row, and
//   * comparing it must not leak, one byte at a time, how close a guess was.
//
// Storing a hash and looking the row up by that hash gets the index and loses
// nothing measurable — but it also means the value in the WHERE clause is the
// value that authorises the write, and an index probe is not constant time.
// Storing the token in the clear gets neither.
//
// So the token is two halves, the way a well-built "remember me" cookie is:
//
//       avd_<32 hex SELECTOR>_<64 hex VERIFIER>
//            ↑ public, indexed     ↑ secret, never stored as sent
//
//   SELECTOR   16 random bytes. Stored in the clear, UNIQUE, and the only thing
//              the SELECT looks up by. Knowing it proves nothing.
//   VERIFIER   32 random bytes. Only its SHA-256 is stored. The comparison is
//              crypto.timingSafeEqual over the two 32-byte digests, so the time
//              it takes says nothing about how many leading bytes matched.
//
// A DATABASE READ IS NOT ENOUGH TO APPROVE ANYTHING. That is the property the
// split buys over a plain stored token: a dump of ad_video_decision_tokens
// contains no value that can be replayed at the door, because the verifier is
// not in it. Only Chris's notification ever held the whole string.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT IT IS NOT
//
// NOT single-use BY ITSELF. Nothing in this file can enforce that — a pure
// function has nothing to remember with. The one-use guarantee is a conditional
// UPDATE in src/video/decision-store.mjs (`WHERE used_at IS NULL`), which is
// where it has to be, because that is the only place two simultaneous taps can
// be made to disagree. This file's job is only that a guess cannot be made.
//
// NOT a login. It authorises exactly one decision on exactly one take. It
// carries no org, no role and no identity; the row it names supplies all three.

import crypto from "node:crypto";

/** Tells a token apart from every other reference in the repo at a glance
    (`slo_…` is api/public/slo-checkout.mjs's). */
export const TOKEN_PREFIX = "avd";

export const SELECTOR_BYTES = 16;
export const VERIFIER_BYTES = 32;

const SELECTOR_HEX = SELECTOR_BYTES * 2;
const VERIFIER_HEX = VERIFIER_BYTES * 2;

/* Anchored, exact lengths, lower-case hex only. A loose pattern here would let
   a caller put something of its own choosing into a database lookup. */
const TOKEN_RE = new RegExp(
  `^${TOKEN_PREFIX}_([0-9a-f]{${SELECTOR_HEX}})_([0-9a-f]{${VERIFIER_HEX}})$`
);

/** The selector on its own, for the store's shape guard before it opens a
    transaction. Same alphabet and same length as the pattern above. */
export const SELECTOR_RE = new RegExp(`^[0-9a-f]{${SELECTOR_HEX}}$`);

/** How long a decision link is good for. Two days: long enough that a take
    filmed on a Friday evening survives the weekend, short enough that a link
    sitting in an old notification is not a standing key to the door. */
export const DEFAULT_TTL_MINUTES = 60 * 48;

/**
 * mintDecisionToken() → { token, selector, verifierHash }
 *
 * `token` is the only place the whole string ever exists. It goes into the
 * notification and is never written down here. `verifierHash` is a 32-byte
 * Buffer bound for a bytea column.
 */
export function mintDecisionToken() {
  const selector = crypto.randomBytes(SELECTOR_BYTES).toString("hex");
  const verifier = crypto.randomBytes(VERIFIER_BYTES).toString("hex");
  return {
    token: `${TOKEN_PREFIX}_${selector}_${verifier}`,
    selector,
    verifierHash: hashVerifier(verifier)
  };
}

/** sha256 of the verifier half, as a Buffer. The stored form. */
export function hashVerifier(verifierHex) {
  return crypto.createHash("sha256").update(String(verifierHex), "utf8").digest();
}

/**
 * parseDecisionToken(raw) → { selector, verifier } | null
 *
 * Null for anything that is not exactly the shape above — wrong prefix, wrong
 * length, upper case, whitespace inside, a value carrying SQL. Refused, never
 * repaired: a token that had to be tidied up is not a token anybody minted.
 */
export function parseDecisionToken(raw) {
  // A cap before the regex so a megabyte of text is not handed to the matcher.
  const s = String(raw ?? "").trim();
  if (s.length !== TOKEN_PREFIX.length + 2 + SELECTOR_HEX + VERIFIER_HEX) return null;
  const m = TOKEN_RE.exec(s);
  if (!m) return null;
  return { selector: m[1], verifier: m[2] };
}

/**
 * verifierMatches(verifierHex, storedHash) → boolean
 *
 * CONSTANT TIME, and the length check in front of it does not undo that: both
 * sides are SHA-256 digests, so both are always 32 bytes and the early return
 * fires only on a malformed stored value, never on a wrong guess. A wrong guess
 * always reaches timingSafeEqual and always costs the same.
 *
 * Never throws. timingSafeEqual throws on a length mismatch, which — left
 * unhandled — would turn a corrupt row into a 500 that tells a prober its guess
 * was interesting.
 */
export function verifierMatches(verifierHex, storedHash) {
  const stored = toBuffer(storedHash);
  if (!stored || stored.length !== 32) return false;
  const given = hashVerifier(String(verifierHex ?? ""));
  try {
    return crypto.timingSafeEqual(given, stored);
  } catch {
    return false;
  }
}

/* toBuffer — a bytea column arrives as a Buffer from node-postgres, but the
   same value round-tripped through JSON (a fixture, a stub in a test) arrives
   as a hex string or as { type:"Buffer", data:[…] }. Accepting all three keeps
   the comparison honest in a test that does not hold a live connection. */
function toBuffer(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === "string") {
    const hex = v.startsWith("\\x") ? v.slice(2) : v;
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null;
    return Buffer.from(hex, "hex");
  }
  if (v && Array.isArray(v.data)) return Buffer.from(v.data);
  return null;
}

/** expiresAt(now, minutes) → Date. Kept here so the store and the tests agree
    on one definition of "two days". */
export function expiresAt(now = new Date(), minutes = DEFAULT_TTL_MINUTES) {
  const ms = Number.isFinite(minutes) ? minutes : DEFAULT_TTL_MINUTES;
  return new Date(now.getTime() + ms * 60_000);
}

export default {
  TOKEN_PREFIX,
  SELECTOR_RE,
  DEFAULT_TTL_MINUTES,
  mintDecisionToken,
  hashVerifier,
  parseDecisionToken,
  verifierMatches,
  expiresAt
};
