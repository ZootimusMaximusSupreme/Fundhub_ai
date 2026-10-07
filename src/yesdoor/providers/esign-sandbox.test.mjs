import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER, SANDBOX, completeSigning, createSigningLink } from "./esign-sandbox.mjs";
import { verifyAgreementRequest } from "../agreements/signed-link.mjs";

const SECRET = "e".repeat(40);
const AGREEMENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const at = (ms) => () => ms;

const link = (over = {}) => createSigningLink({ agreementId: AGREEMENT, secret: SECRET, now: at(T0), ...over });

test("it is a sandbox provider", () => {
  assert.equal(PROVIDER, "esign_sandbox");
  assert.equal(SANDBOX, true);
});

describe("createSigningLink", () => {
  test("mints an HMAC link that verifies", () => {
    const l = link({ baseUrl: "https://yesdoor.example" });
    assert.equal(l.provider, "esign_sandbox");
    assert.equal(l.sandbox, true);
    assert.equal(verifyAgreementRequest(l.url, { secret: SECRET, now: at(T0) }).agreementId, AGREEMENT);
  });
  test("needs an agreement id", () => {
    assert.throws(() => createSigningLink({ secret: SECRET }), /agreementId/);
  });
});

describe("completeSigning", () => {
  test("a good link and a name produce the fields B4 writes", () => {
    const out = completeSigning({ url: link().url, signerName: "  Dana Whitaker ", signerIp: "203.0.113.9", secret: SECRET, now: at(T0 + 5000) });
    assert.deepEqual(out, {
      ok: true,
      status: "signed",
      agreementId: AGREEMENT,
      signed_at: new Date(T0 + 5000).toISOString(),
      signer_name: "Dana Whitaker",
      signer_ip: "203.0.113.9"
    });
  });
  test("the signer's IP is optional", () => {
    assert.equal(completeSigning({ url: link().url, signerName: "Dana", secret: SECRET, now: at(T0) }).signer_ip, null);
  });
  test("a name is required", () => {
    for (const signerName of [undefined, "", "   ", null, 42]) {
      assert.deepEqual(completeSigning({ url: link().url, signerName, secret: SECRET, now: at(T0) }), { ok: false, reason: "missing_signer_name" });
    }
  });
  test("a tampered, expired or malformed link all give the same answer", () => {
    const good = link({ ttlSeconds: 60 });
    const tampered = good.url.replace(AGREEMENT, "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee");
    const answers = [
      completeSigning({ url: tampered, signerName: "Dana", secret: SECRET, now: at(T0) }),
      completeSigning({ url: good.url, signerName: "Dana", secret: SECRET, now: at(T0 + 3_600_000) }),
      completeSigning({ url: "/yesdoor/agreement.html", signerName: "Dana", secret: SECRET, now: at(T0) }),
      completeSigning({ url: undefined, signerName: "Dana", secret: SECRET, now: at(T0) }),
      completeSigning({ url: good.url, signerName: "Dana", secret: "x".repeat(40), now: at(T0) })
    ];
    for (const a of answers) assert.deepEqual(a, { ok: false, reason: "invalid_link" });
  });
  test("a bad link is reported before a missing name", () => {
    assert.equal(completeSigning({ url: "/nope", signerName: "", secret: SECRET, now: at(T0) }).reason, "invalid_link");
  });
});
