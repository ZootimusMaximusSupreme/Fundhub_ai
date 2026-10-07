import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS, secretFromEnv, signAgreementUrl, signature, verifyAgreementRequest, verifyAgreementUrl
} from "./signed-link.mjs";

const SECRET = "s".repeat(40);
const AGREEMENT = "11111111-2222-3333-4444-555555555555";
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms) => () => ms;

function mint(over = {}) {
  return signAgreementUrl({ agreementId: AGREEMENT, secret: SECRET, now: at(T0), ...over });
}
function verifyLink(link, over = {}) {
  return verifyAgreementRequest(link.path ?? link, { secret: SECRET, now: at(T0 + 1000), ...over });
}

describe("secret", () => {
  test("is YD_LINK_SECRET, at least 32 characters", () => {
    assert.equal(secretFromEnv({ YD_LINK_SECRET: SECRET }), SECRET);
  });
  test("fails closed when missing or short", () => {
    for (const env of [{}, { YD_LINK_SECRET: "" }, { YD_LINK_SECRET: "x".repeat(31) }]) {
      assert.throws(() => secretFromEnv(env), /YD_LINK_SECRET/);
    }
  });
  test("never falls back to a Fundhub secret", () => {
    const env = { CONTRACT_URL_SECRET: SECRET, DOCUMENT_URL_SECRET: SECRET };
    assert.throws(() => secretFromEnv(env), /YD_LINK_SECRET/);
  });
  test("signing with no secret throws, and verifying with no secret says no_secret", () => {
    const saved = process.env.YD_LINK_SECRET;
    delete process.env.YD_LINK_SECRET;
    try {
      assert.throws(() => signAgreementUrl({ agreementId: AGREEMENT }), /YD_LINK_SECRET/);
      const link = mint();
      assert.equal(verifyAgreementRequest(link.path, { now: at(T0) }).reason, "no_secret");
    } finally {
      if (saved !== undefined) process.env.YD_LINK_SECRET = saved;
    }
  });
  test("an explicit secret is held to the same 32-character floor", () => {
    assert.throws(() => mint({ secret: "short" }), /too short/);
    assert.throws(() => mint({ secret: "" }), /too short/);
    const link = mint();
    assert.equal(verifyAgreementRequest(link.path, { secret: "short", now: at(T0) }).reason, "no_secret");
  });
});

describe("minting", () => {
  test("a link carries the id, an expiry and a signature", () => {
    const link = mint();
    const url = new URL(link.path, "http://x.invalid");
    assert.equal(url.pathname, "/yesdoor/agreement.html");
    assert.equal(url.searchParams.get("id"), AGREEMENT);
    assert.equal(Number(url.searchParams.get("exp")), Math.floor(T0 / 1000) + DEFAULT_TTL_SECONDS);
    assert.match(url.searchParams.get("sig"), /^[0-9a-f]{64}$/);
    assert.equal(link.expiresAtIso, new Date((Math.floor(T0 / 1000) + DEFAULT_TTL_SECONDS) * 1000).toISOString());
  });
  test("is deterministic for the same inputs and clock", () => {
    assert.deepEqual(mint(), mint());
  });
  test("baseUrl is joined without a double slash", () => {
    assert.match(mint({ baseUrl: "https://yesdoor.example/" }).url, /^https:\/\/yesdoor\.example\/yesdoor\/agreement\.html\?/);
    assert.equal(mint().url, mint().path);
  });
  test("a custom base path is used", () => {
    assert.match(mint({ basePath: "/sign" }).path, /^\/sign\?/);
  });
  test("needs an agreement id and a sane ttl", () => {
    assert.throws(() => signAgreementUrl({ secret: SECRET }), /agreementId/);
    for (const ttlSeconds of [0, -5, NaN, "abc"]) assert.throws(() => mint({ ttlSeconds }), /positive number/);
    assert.throws(() => mint({ ttlSeconds: MAX_TTL_SECONDS + 1 }), /maximum/);
    assert.doesNotThrow(() => mint({ ttlSeconds: MAX_TTL_SECONDS }));
  });
});

describe("verifying", () => {
  test("a fresh link verifies and returns the agreement id", () => {
    const v = verifyLink(mint());
    assert.equal(v.valid, true);
    assert.equal(v.reason, null);
    assert.equal(v.agreementId, AGREEMENT);
  });
  test("works on a full URL as well as a path", () => {
    assert.equal(verifyLink(mint({ baseUrl: "https://yesdoor.example" }).url).valid, true);
  });
  test("a changed id is a bad signature", () => {
    const url = new URL(mint().path, "http://x.invalid");
    url.searchParams.set("id", "99999999-2222-3333-4444-555555555555");
    assert.equal(verifyLink(url.pathname + url.search).reason, "bad_signature");
  });
  test("a changed expiry is a bad signature (no extending a link)", () => {
    const url = new URL(mint().path, "http://x.invalid");
    url.searchParams.set("exp", String(Number(url.searchParams.get("exp")) + 86400));
    assert.equal(verifyLink(url.pathname + url.search).reason, "bad_signature");
  });
  test("a changed or truncated signature fails", () => {
    const link = mint();
    const url = new URL(link.path, "http://x.invalid");
    const sig = url.searchParams.get("sig");
    url.searchParams.set("sig", (sig[0] === "a" ? "b" : "a") + sig.slice(1));
    assert.equal(verifyLink(url.pathname + url.search).reason, "bad_signature");
    url.searchParams.set("sig", sig.slice(0, 10));
    assert.equal(verifyLink(url.pathname + url.search).reason, "bad_signature");
  });
  test("a link signed with a different secret fails", () => {
    assert.equal(verifyLink(mint({ secret: "z".repeat(40) })).reason, "bad_signature");
  });
  test("expiry: valid through the expiry second, expired one second after", () => {
    const link = mint({ ttlSeconds: 100 });
    assert.equal(verifyLink(link, { now: at(T0 + 100 * 1000) }).valid, true);
    const late = verifyLink(link, { now: at(T0 + 101 * 1000) });
    assert.equal(late.valid, false);
    assert.equal(late.reason, "expired");
  });
  test("a forged link with an expired timestamp reports bad_signature, not expired (no probing)", () => {
    const url = new URL(mint().path, "http://x.invalid");
    url.searchParams.set("exp", "1");
    assert.equal(verifyLink(url.pathname + url.search).reason, "bad_signature");
  });
  test("a missing or malformed field is malformed, never a throw", () => {
    for (const bad of [
      "/yesdoor/agreement.html",
      `/yesdoor/agreement.html?id=${AGREEMENT}`,
      `/yesdoor/agreement.html?id=${AGREEMENT}&exp=abc&sig=zz`,
      `/yesdoor/agreement.html?exp=1&sig=zz`,
      "http://[bad"
    ]) {
      const v = verifyLink(bad);
      assert.equal(v.valid, false);
      assert.equal(v.reason, "malformed", bad);
    }
    assert.equal(verifyAgreementUrl({}).reason, "malformed");
    assert.equal(verifyAgreementUrl().reason, "malformed");
  });
  test("an invalid result carries no agreement id", () => {
    const v = verifyLink("/yesdoor/agreement.html?id=x&exp=1&sig=y");
    assert.equal(v.agreementId, null);
    assert.equal(v.expiresAt, null);
  });
});

describe("domain separation", () => {
  test("a Fundhub contract link (scheme c1) signed with the same secret does not verify", () => {
    const exp = Math.floor(T0 / 1000) + 1000;
    const sig = createHmac("sha256", SECRET).update(["c1", AGREEMENT, exp].join("|")).digest("hex");
    const v = verifyAgreementUrl({ agreementId: AGREEMENT, expiresAt: exp, sig, secret: SECRET, now: at(T0) });
    assert.equal(v.reason, "bad_signature");
  });
  test("a Fundhub document link (scheme v1) does not verify either", () => {
    const exp = Math.floor(T0 / 1000) + 1000;
    const sig = createHmac("sha256", SECRET).update(["v1", AGREEMENT, exp].join("|")).digest("hex");
    assert.equal(verifyAgreementUrl({ agreementId: AGREEMENT, expiresAt: exp, sig, secret: SECRET, now: at(T0) }).valid, false);
  });
  test("signature() is the y1 scheme", () => {
    const exp = 1234567890;
    assert.equal(
      signature({ agreementId: AGREEMENT, expiresAt: exp, secret: SECRET }),
      createHmac("sha256", SECRET).update(`y1|${AGREEMENT}|${exp}`).digest("hex")
    );
  });
});
