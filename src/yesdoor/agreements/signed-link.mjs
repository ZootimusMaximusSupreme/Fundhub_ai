// src/yesdoor/agreements/signed-link.mjs — the link a building or broker opens to sign.
//
// COPIED from src/contracts/signed-link.mjs (owner-set: Fundhub logic is copied
// into src/yesdoor, never imported). The approach is the same: the person signing
// is not signed in and never will be, so the HMAC and its expiry ARE the
// credential.
//
//   /yesdoor/agreement.html?id=<agreementId>&exp=<unix>&sig=<hex>
//
// What carries over:
//   - FAIL CLOSED with no secret. No secret, no links.
//   - Constant-time signature comparison.
//   - Signature is checked BEFORE expiry, so the failure reason cannot be used
//     to probe which part of a forged link was wrong.
//   - A bad signature, an expired link and an unknown id should all look the
//     same to the person at the other end (the endpoint answers one 404).
//
// What differs:
//   - Secret is YD_LINK_SECRET only, at least 32 characters. No fallback to a
//     Fundhub secret: Yesdoor must be able to move out with its own keys.
//   - SCHEME "y1" (domain separation): a Fundhub contract link ("c1") or document
//     link ("v1") can never verify as a Yesdoor agreement link, whatever secret
//     signed it.
//   - No per-signer variant. One Yesdoor agreement has one party.
//   - TTL is 30 days, like a contract link: it sits in an inbox over a weekend.

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;
export const MAX_TTL_SECONDS = 60 * 60 * 24 * 365;
const SCHEME = "y1";

/** Fail closed: no secret, no links. */
export function secretFromEnv(env = process.env) {
  const secret = env.YD_LINK_SECRET;
  if (!secret || String(secret).length < 32) {
    throw new Error(
      "YD_LINK_SECRET is missing or too short (need >= 32 chars): refusing to sign agreement links. " +
      "Generate one with: openssl rand -hex 32");
  }
  return secret;
}

/** An explicit secret is held to the same 32-character floor as the env one. */
function checkedSecret(secret) {
  if (secret === undefined) return secretFromEnv();
  if (!secret || String(secret).length < 32) {
    throw new Error("the signing secret is missing or too short (need >= 32 chars)");
  }
  return secret;
}

// Field order is fixed and "|" cannot appear in a uuid or a decimal timestamp.
const canonical = ({ agreementId, expiresAt }) => [SCHEME, agreementId, expiresAt].join("|");

export function signature({ agreementId, expiresAt, secret }) {
  return createHmac("sha256", secret).update(canonical({ agreementId, expiresAt })).digest("hex");
}

/**
 * Mint a link. `now` is injectable (a function returning epoch ms) so tests pin
 * the clock without sleeping. Returns { url, path, expiresAt, expiresAtIso }.
 */
export function signAgreementUrl({
  agreementId, ttlSeconds = DEFAULT_TTL_SECONDS, secret = undefined,
  basePath = "/yesdoor/agreement.html", baseUrl = null, now = Date.now
} = {}) {
  if (!agreementId) throw new Error("signAgreementUrl requires agreementId");
  const ttl = Number(ttlSeconds);
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("ttlSeconds must be a positive number");
  if (ttl > MAX_TTL_SECONDS) throw new Error(`ttlSeconds ${ttl} exceeds the ${MAX_TTL_SECONDS}s maximum`);

  const key = checkedSecret(secret);
  const expiresAt = Math.floor(now() / 1000) + Math.floor(ttl);
  const sig = signature({ agreementId, expiresAt, secret: key });

  const params = new URLSearchParams();
  params.set("id", String(agreementId));
  params.set("exp", String(expiresAt));
  params.set("sig", sig);

  const path = `${basePath}?${params}`;
  return {
    url: baseUrl ? `${String(baseUrl).replace(/\/$/, "")}${path}` : path,
    path,
    expiresAt,
    expiresAtIso: new Date(expiresAt * 1000).toISOString()
  };
}

/**
 * Verify before anything is looked up. Returns { valid, reason, agreementId, expiresAt }.
 * Never throws on bad input: a malformed link is an invalid link, not a 500.
 * reason: null | malformed | no_secret | bad_signature | expired
 */
export function verifyAgreementUrl({ agreementId, expiresAt, sig, secret = undefined, now = Date.now } = {}) {
  const fail = (reason) => ({ valid: false, reason, agreementId: null, expiresAt: null });
  if (!agreementId || !sig || expiresAt === undefined || expiresAt === null) return fail("malformed");
  const exp = Number(expiresAt);
  if (!Number.isFinite(exp)) return fail("malformed");

  let key;
  try { key = checkedSecret(secret); } catch { return fail("no_secret"); }

  const expected = signature({ agreementId, expiresAt: exp, secret: key });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(sig), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail("bad_signature");
  if (Math.floor(now() / 1000) > exp) return fail("expired");

  return { valid: true, reason: null, agreementId, expiresAt: exp };
}

/** Parse and verify straight from a request URL (query-string form). */
export function verifyAgreementRequest(urlLike, { secret = undefined, now = Date.now } = {}) {
  let parsed;
  try {
    parsed = new URL(String(urlLike), "http://internal.invalid");
  } catch {
    return { valid: false, reason: "malformed", agreementId: null, expiresAt: null };
  }
  return verifyAgreementUrl({
    agreementId: parsed.searchParams.get("id"),
    expiresAt: parsed.searchParams.get("exp"),
    sig: parsed.searchParams.get("sig"),
    secret,
    now
  });
}
