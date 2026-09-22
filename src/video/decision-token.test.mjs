// The one-time key. The properties tested here are the ones that make an open
// door safe to leave open.

import { test, describe } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";

import {
  mintDecisionToken,
  parseDecisionToken,
  verifierMatches,
  hashVerifier,
  expiresAt,
  SELECTOR_RE,
  DEFAULT_TTL_MINUTES
} from "./decision-token.mjs";

describe("minting", () => {
  test("produces the documented shape", () => {
    const { token, selector, verifierHash } = mintDecisionToken();
    assert.match(token, /^avd_[0-9a-f]{32}_[0-9a-f]{64}$/);
    assert.match(selector, SELECTOR_RE);
    assert.ok(Buffer.isBuffer(verifierHash));
    assert.equal(verifierHash.length, 32, "a sha256 digest is 32 bytes");
  });

  test("*** THE SECRET HALF IS NEVER IN WHAT IS STORED ***", () => {
    // The property that makes a dump of ad_video_decision_tokens useless to
    // whoever holds it: the verifier is not derivable from the stored hash.
    const { token, selector, verifierHash } = mintDecisionToken();
    const verifier = token.split("_")[2];
    assert.ok(!verifierHash.toString("hex").includes(verifier));
    assert.ok(!verifierHash.toString("hex").includes(selector));
    // And the stored value really is the hash of the secret, not the secret.
    assert.notEqual(verifierHash.toString("hex"), verifier);
    assert.equal(verifierHash.toString("hex"), hashVerifier(verifier).toString("hex"));
  });

  test("two tokens never collide", () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const { selector } = mintDecisionToken();
      assert.equal(seen.has(selector), false, "a selector repeated");
      seen.add(selector);
    }
  });
});

describe("parsing", () => {
  test("splits a real token into its two halves", () => {
    const { token, selector } = mintDecisionToken();
    const parsed = parseDecisionToken(token);
    assert.equal(parsed.selector, selector);
    assert.match(parsed.verifier, /^[0-9a-f]{64}$/);
  });

  test("forgives surrounding whitespace only", () => {
    const { token } = mintDecisionToken();
    assert.ok(parseDecisionToken(`  ${token}\n`));
  });

  test("refuses everything that is not exactly the shape", () => {
    const { token } = mintDecisionToken();
    const bad = [
      "",
      null,
      undefined,
      "avd_",
      token.toUpperCase(),                       // hex must be lower case
      token.slice(0, -1),                        // one character short
      `${token}0`,                               // one character long
      token.replace("avd_", "slo_"),             // another prefix in this repo
      token.replace(/^avd_./, "avd_g"),          // not hex
      `${token} OR 1=1`,
      "avd_" + "0".repeat(32) + "_" + "z".repeat(64),
      token.replace("_", "-")
    ];
    for (const b of bad) {
      assert.equal(parseDecisionToken(b), null, `should refuse: ${String(b).slice(0, 40)}`);
    }
  });

  test("a megabyte of text is refused on length before the pattern runs", () => {
    assert.equal(parseDecisionToken("a".repeat(1_000_000)), null);
  });
});

describe("verifying", () => {
  test("the right secret matches its own hash", () => {
    const { token, verifierHash } = mintDecisionToken();
    const { verifier } = parseDecisionToken(token);
    assert.equal(verifierMatches(verifier, verifierHash), true);
  });

  test("another token's secret does not", () => {
    const a = mintDecisionToken();
    const b = mintDecisionToken();
    const { verifier } = parseDecisionToken(b.token);
    assert.equal(verifierMatches(verifier, a.verifierHash), false);
  });

  test("a near miss does not", () => {
    const { token, verifierHash } = mintDecisionToken();
    const { verifier } = parseDecisionToken(token);
    // Change one character of the secret.
    const off = (verifier[0] === "a" ? "b" : "a") + verifier.slice(1);
    assert.equal(verifierMatches(off, verifierHash), false);
  });

  test("NEVER THROWS on a corrupt stored value", () => {
    // timingSafeEqual throws on a length mismatch. Unhandled, that would turn a
    // corrupt row into a 500, which tells a prober its guess was interesting.
    const { token } = mintDecisionToken();
    const { verifier } = parseDecisionToken(token);
    for (const stored of [null, undefined, Buffer.alloc(0), Buffer.alloc(31), "not hex", "", 42, {}]) {
      assert.equal(verifierMatches(verifier, stored), false);
    }
  });

  test("reads a bytea however node-postgres or a fixture hands it over", () => {
    const { token, verifierHash } = mintDecisionToken();
    const { verifier } = parseDecisionToken(token);
    const hex = verifierHash.toString("hex");
    assert.equal(verifierMatches(verifier, verifierHash), true, "Buffer");
    assert.equal(verifierMatches(verifier, new Uint8Array(verifierHash)), true, "Uint8Array");
    assert.equal(verifierMatches(verifier, hex), true, "hex string");
    assert.equal(verifierMatches(verifier, `\\x${hex}`), true, "postgres \\x hex");
    assert.equal(
      verifierMatches(verifier, { type: "Buffer", data: [...verifierHash] }), true, "JSON Buffer");
  });

  test("an empty secret never matches", () => {
    const { verifierHash } = mintDecisionToken();
    assert.equal(verifierMatches("", verifierHash), false);
    assert.equal(verifierMatches(null, verifierHash), false);
  });

  test("the compare is over two equal-length digests, which is what makes it constant time", () => {
    // Not a timing measurement — a timing test on a shared runner is noise.
    // This asserts the precondition that makes timingSafeEqual meaningful:
    // whatever the guess, both sides are always 32 bytes.
    for (const guess of ["", "a", "f".repeat(64), "f".repeat(500)]) {
      assert.equal(hashVerifier(guess).length, 32);
    }
    const stored = crypto.createHash("sha256").update("anything").digest();
    assert.equal(stored.length, 32);
  });
});

describe("expiry", () => {
  test("defaults to two days, so a Friday take survives the weekend", () => {
    assert.equal(DEFAULT_TTL_MINUTES, 60 * 48);
    const now = new Date("2026-09-22T18:00:00.000Z");
    assert.equal(expiresAt(now).toISOString(), "2026-09-24T18:00:00.000Z");
  });

  test("takes an override, and falls back on nonsense rather than producing an invalid date", () => {
    const now = new Date("2026-09-22T18:00:00.000Z");
    assert.equal(expiresAt(now, 60).toISOString(), "2026-09-22T19:00:00.000Z");
    assert.equal(expiresAt(now, "banana").toISOString(), expiresAt(now).toISOString());
  });
});
