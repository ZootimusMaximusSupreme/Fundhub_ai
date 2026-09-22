// The ntfy provider. What is tested here is mostly what it REFUSES to do.

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

import * as ntfy from "./ntfy.mjs";

const TOPIC = "https://ntfy.sh/fundhub-ad-video-9f3c2a";
const ENV = { NTFY_TOPIC_URL: TOPIC };

/* A fetch that records the one call and answers the way ntfy does. */
function recorder(answer = { status: 200, body: { id: "xYz123" } }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      headers: new Map(),
      text: async () => JSON.stringify(answer.body ?? {})
    };
  };
  return { calls, fetchImpl };
}

const msg = (over = {}) => ({ title: "Ad 043 t02 — approve?", body: "Ready.", ...over });

describe("ntfyTarget — reading the one variable", () => {
  test("splits a topic URL into base and topic", () => {
    assert.deepEqual(ntfy.ntfyTarget(ENV), {
      ok: true, base: "https://ntfy.sh/", topic: "fundhub-ad-video-9f3c2a"
    });
  });

  test("unset is a clear refusal, not a crash", () => {
    const out = ntfy.ntfyTarget({});
    assert.equal(out.ok, false);
    assert.match(out.error, /NTFY_TOPIC_URL/);
    assert.equal(ntfy.isNtfyConfigured({}), false);
  });

  test("*** REFUSES http — a decision token may not travel in the clear ***", () => {
    const out = ntfy.ntfyTarget({ NTFY_TOPIC_URL: "http://ntfy.sh/some-topic" });
    assert.equal(out.ok, false);
    assert.match(out.error, /https/);
  });

  test("refuses credentials in the URL", () => {
    const out = ntfy.ntfyTarget({ NTFY_TOPIC_URL: "https://u:p@ntfy.sh/topic" });
    assert.equal(out.ok, false);
    assert.match(out.error, /username or password/);
  });

  test("refuses a URL with no topic, or with more than one segment", () => {
    assert.equal(ntfy.ntfyTarget({ NTFY_TOPIC_URL: "https://ntfy.sh/" }).ok, false);
    assert.equal(ntfy.ntfyTarget({ NTFY_TOPIC_URL: "https://ntfy.sh/a/b" }).ok, false);
  });

  test("refuses something that is not a URL at all", () => {
    assert.equal(ntfy.ntfyTarget({ NTFY_TOPIC_URL: "my-topic" }).ok, false);
  });

  test("a self-hosted ntfy is fine", () => {
    const out = ntfy.ntfyTarget({ NTFY_TOPIC_URL: "https://push.fundhub.ai/ops" });
    assert.deepEqual(out, { ok: true, base: "https://push.fundhub.ai/", topic: "ops" });
  });
});

describe("the provider contract", () => {
  test("declares every field the registry checks", () => {
    assert.equal(ntfy.PROVIDER, "ntfy");
    assert.ok(ntfy.CHANNELS instanceof Set);
    assert.ok(ntfy.CHANNELS.size > 0);
    assert.equal(typeof ntfy.ADDRESS_FIELD, "string");
    assert.ok(ntfy.ADDRESS_FIELD.length > 0);
    assert.equal(typeof ntfy.send, "function");
    assert.equal(typeof ntfy.ENABLED, "boolean");
    assert.equal(typeof ntfy.TRANSMITS, "boolean");
  });

  test("ships unrouted and says it transmits", () => {
    assert.equal(ntfy.ENABLED, false, "nothing in the message queue may reach it");
    assert.equal(ntfy.TRANSMITS, true, "it makes a real outbound request");
  });

  test("is NOT in the provider registry", async () => {
    // Same posture as web-push.mjs. If it were registered, `ops_push` would
    // have to be a real routing channel, and it is not.
    const registry = await import("./index.mjs");
    assert.equal(registry.all().some((p) => p.PROVIDER === "ntfy"), false);
  });
});

describe("sending", () => {
  test("POSTs JSON to the BASE url with the topic inside the body", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await ntfy.send(msg(), { env: ENV, fetchImpl });

    assert.equal(out.status, "sent");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://ntfy.sh/", "the JSON shape posts to the base, not the topic");
    assert.equal(calls[0].init.method, "POST");

    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.topic, "fundhub-ad-video-9f3c2a");
    assert.equal(sent.message, "Ready.");
    assert.equal(sent.title, "Ad 043 t02 — approve?");
    assert.equal(sent.priority, 4, "high, so it buzzes a locked phone");
  });

  test("carries action buttons through untouched", async () => {
    const actions = [{
      action: "http", label: "Approve", url: "https://fundhub.ai/api/public/ad-video-decision",
      method: "POST", headers: { "Content-Type": "application/json" },
      body: '{"token":"avd_x","decision":"approve"}', clear: true
    }];
    const { calls, fetchImpl } = recorder();
    await ntfy.send(msg({ actions }), { env: ENV, fetchImpl });
    assert.deepEqual(JSON.parse(calls[0].init.body).actions, actions);
  });

  test("keeps ntfy's own message id as the handle", async () => {
    const { fetchImpl } = recorder({ status: 200, body: { id: "abc999" } });
    const out = await ntfy.send(msg(), { env: ENV, fetchImpl });
    assert.equal(out.providerMessageId, "abc999");
  });

  test("leaves out the fields that were not given, rather than sending nulls", async () => {
    const { calls, fetchImpl } = recorder();
    await ntfy.send({ body: "bare" }, { env: ENV, fetchImpl });
    const sent = JSON.parse(calls[0].init.body);
    assert.equal("title" in sent, false);
    assert.equal("click" in sent, false);
    assert.equal("actions" in sent, false);
    assert.equal("tags" in sent, false);
  });

  test("priority is clamped into ntfy's 1–5", async () => {
    const { calls, fetchImpl } = recorder();
    await ntfy.send(msg({ priority: 99 }), { env: ENV, fetchImpl });
    assert.equal(JSON.parse(calls[0].init.body).priority, 5);
    await ntfy.send(msg({ priority: -4 }), { env: ENV, fetchImpl });
    assert.equal(JSON.parse(calls[1].init.body).priority, 1);
    await ntfy.send(msg({ priority: "nonsense" }), { env: ENV, fetchImpl });
    assert.equal(JSON.parse(calls[2].init.body).priority, 4);
  });
});

describe("refusing and failing", () => {
  test("an unconfigured topic is a FAILURE, not a rejection — it should go once it is set", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await ntfy.send(msg(), { env: {}, fetchImpl });
    assert.equal(out.status, "failed");
    assert.equal(calls.length, 0, "nothing left the process");
  });

  test("an empty body is a rejection — a retry sends the same nothing", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await ntfy.send({ title: "x", body: "   " }, { env: ENV, fetchImpl });
    assert.equal(out.status, "rejected");
    assert.equal(calls.length, 0);
  });

  test("an oversized body is refused here, not by the vendor", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await ntfy.send(msg({ body: "x".repeat(ntfy.MAX_MESSAGE_CHARS + 1) }),
      { env: ENV, fetchImpl });
    assert.equal(out.status, "rejected");
    assert.equal(calls.length, 0);
  });

  test("a 500 is retryable, a 400 is not", async () => {
    const five = recorder({ status: 500, body: {} });
    assert.equal((await ntfy.send(msg(), { env: ENV, fetchImpl: five.fetchImpl })).status, "failed");
    const four = recorder({ status: 400, body: {} });
    assert.equal((await ntfy.send(msg(), { env: ENV, fetchImpl: four.fetchImpl })).status, "rejected");
  });

  test("NEVER THROWS, even when the transport does", async () => {
    const out = await ntfy.send(msg(), {
      env: ENV,
      fetchImpl: async () => { throw new Error("socket died"); }
    });
    assert.equal(out.status, "failed");
    assert.ok(out.error);
  });

  test("*** THE ERROR NEVER ECHOES THE BODY BACK ***", async () => {
    // The body holds the decision URLs, and a decision URL is permission to
    // approve an ad. It must not reach messages.last_error or a log line.
    const token = "avd_" + "a".repeat(32) + "_" + "b".repeat(64);
    const { fetchImpl } = recorder({ status: 500, body: { error: `rejected ${token}` } });
    const out = await ntfy.send(msg({
      actions: [{ action: "http", label: "Approve", url: "https://x/y", body: `{"token":"${token}"}` }]
    }), { env: ENV, fetchImpl });
    assert.equal(out.status, "failed");
    assert.ok(!String(out.error).includes(token), "a token reached the error string");
  });
});

describe("the fence", () => {
  test("names INTERNAL, so MESSAGING_DRY_RUN does not hold a buzz to the owner's own phone", async () => {
    const { calls, fetchImpl } = recorder();
    const out = await ntfy.send(msg(), {
      env: { ...ENV, MESSAGING_DRY_RUN: "1", ADAPTERS_DRY_RUN: "1" },
      fetchImpl
    });
    assert.equal(out.status, "sent");
    assert.equal(calls.length, 1, "the messaging dry-run flag must not hold this");
  });

  test("*** THE DESTINATION CANNOT BE REDIRECTED BY A CALLER ***", () => {
    /* The whole argument for INTERNAL is that this provider has ONE
       destination and it comes from the environment. The moment it can be
       pointed somewhere by its caller it can reach a person who is not Chris,
       and it belongs behind MESSAGING instead.

       Read from the FILE, not from send.toString(): the message is unpacked
       inside a helper that toString() on the export would not show, so a
       function-source check here would pass while being blind to the thing it
       claims to check. */
    const src = readFileSync(new URL("./ntfy.mjs", import.meta.url), "utf8");
    const code = src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, "");

    for (const field of ["to", "topic", "url", "endpoint", "recipient", "address"]) {
      assert.ok(
        !new RegExp(`message\\.${field}\\b`).test(code),
        `ntfy.mjs reads message.${field} — the destination must come from the environment only`
      );
    }
    // And the URL it does post to is derived from the env, nowhere else.
    assert.ok(/target\.base/.test(code));
    assert.ok(/env\.NTFY_TOPIC_URL/.test(code));
  });
});
