// Matching a take to its script.
//
// NO NETWORK — `fetchImpl` is injected into callModel.
//
// The property this file exists for is the last block: a low-confidence answer
// is NOT a match. Getting that wrong puts the wrong ad number on a file, Paul
// uploads it against the wrong creative, and two ads' results mix. Nobody finds
// out from looking at the video.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  matchTakeToScript, readVerdict, transcriptText,
  MATCH_CONFIDENCE_FLOOR, MAX_CANDIDATES
} from "./match.mjs";

const LIVE = { ANTHROPIC_API_KEY: "sk-ant-test" };

/** An Anthropic stand-in: whatever text you give it comes back as the reply. */
function modelSaying(text, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const body = status === 200
      ? { content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } }
      : { error: { message: text } };
    return { ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  impl.calls = calls;
  return impl;
}

const CANDIDATES = [
  { id: "s1", adId: "43", title: "wrong order", body: "Most people apply in the wrong order and the bank says no." },
  { id: "s2", adId: "44", title: "inquiries", body: "Every inquiry on your file is a reason to decline you." }
];

const TAKE = "most people apply in the the wrong order uh and the bank just says no";

describe("reading the transcript", () => {
  test("Submagic words[] and plain text both work", () => {
    assert.equal(transcriptText([{ word: "a" }, { word: "b" }]), "a b");
    assert.equal(transcriptText("a b"), "a b");
    assert.equal(transcriptText(null), "");
  });
});

describe("reading the model's answer", () => {
  test("a fenced or chatty answer is still read", () => {
    const out = readVerdict('Sure!\n```json\n{"scriptId":"s1","confidence":95,"reason":"same order"}\n```');
    assert.equal(out.ok, true);
    assert.equal(out.scriptId, "s1");
    assert.equal(out.confidence, 95);
  });

  test("no JSON at all is a failure, not an empty match", () => {
    assert.equal(readVerdict("I think it is the first one").ok, false);
    assert.equal(readVerdict("").ok, false);
  });

  test("confidence is clamped to 0-100", () => {
    assert.equal(readVerdict('{"scriptId":"s1","confidence":900}').confidence, 100);
    assert.equal(readVerdict('{"scriptId":"s1","confidence":"nonsense"}').confidence, 0);
  });
});

describe("the call", () => {
  test("IT GOES TO ANTHROPIC, even when an OpenAI key is sitting there", async () => {
    const impl = modelSaying('{"scriptId":"s1","confidence":96,"reason":"same order"}');
    await matchTakeToScript({
      transcript: TAKE, candidates: CANDIDATES,
      env: { ...LIVE, OPENAI_API_KEY: "sk-openai-should-not-be-used" },
      fetchImpl: impl
    });
    assert.match(impl.calls[0].url, /api\.anthropic\.com/,
      "the owner's decision for this pipeline is Claude; callModel prefers OpenAI unless the env says otherwise");
  });

  test("a clear match comes back with its ad number", async () => {
    const impl = modelSaying('{"scriptId":"s1","confidence":96,"reason":"same order, same close"}');
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, true);
    assert.equal(res.scriptId, "s1");
    assert.equal(res.adId, "43");
    assert.equal(res.confidence, 96);
  });

  test("the take and every candidate reach the prompt", async () => {
    const impl = modelSaying('{"scriptId":"s1","confidence":96}');
    await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    const sent = impl.calls[0].body.messages[0].content;
    assert.match(sent, /wrong order/);
    assert.match(sent, /scriptId: s1/);
    assert.match(sent, /scriptId: s2/);
  });

  test("the candidate list is capped", async () => {
    const impl = modelSaying('{"scriptId":null,"confidence":0}');
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, adId: String(i), body: "words" }));
    await matchTakeToScript({ transcript: TAKE, candidates: many, env: LIVE, fetchImpl: impl });
    const sent = impl.calls[0].body.messages[0].content;
    assert.equal(sent.split("--- script ").length - 1, MAX_CANDIDATES);
  });
});

describe("when it cannot answer", () => {
  test("no key means no call and a RETRYABLE wait, not a guess", async () => {
    const impl = modelSaying("never reached");
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: {}, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true);
    assert.match(res.reason, /ANTHROPIC_API_KEY/);
    assert.equal(impl.calls.length, 0);
  });

  test("a vendor error is retryable — the take is fine, the vendor is not", async () => {
    const impl = modelSaying("no credits remaining", { status: 429 });
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true);
  });

  test("no transcript and no candidates are both refused without a call", async () => {
    const impl = modelSaying("never reached");
    assert.equal((await matchTakeToScript({ transcript: "", candidates: CANDIDATES, env: LIVE, fetchImpl: impl })).ok, false);
    assert.equal((await matchTakeToScript({ transcript: TAKE, candidates: [], env: LIVE, fetchImpl: impl })).ok, false);
    assert.equal(impl.calls.length, 0);
  });
});

describe("THE ONE THAT MATTERS — a low-confidence match is not a match", () => {
  test("under the floor, nothing is matched and a person is named as the next step", async () => {
    const impl = modelSaying(`{"scriptId":"s1","confidence":${MATCH_CONFIDENCE_FLOOR - 1},"reason":"could be either"}`);
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.scriptId, null, "a near-miss must not become a fact downstream");
    assert.equal(res.retryable, false, "trying the same question again gives the same answer");
    assert.match(res.reason, /person/);
  });

  test("exactly at the floor is a match", async () => {
    const impl = modelSaying(`{"scriptId":"s1","confidence":${MATCH_CONFIDENCE_FLOOR}}`);
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, true);
  });

  test("a script id the model invented is not accepted", async () => {
    const impl = modelSaying('{"scriptId":"s999","confidence":99,"reason":"made it up"}');
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.scriptId, null);
  });

  test("an explicit null is honoured rather than nudged to the nearest", async () => {
    const impl = modelSaying('{"scriptId":null,"confidence":20,"reason":"none of these"}');
    const res = await matchTakeToScript({ transcript: TAKE, candidates: CANDIDATES, env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.adId, null);
  });
});
