// ntfy provider — the buzz on Chris's phone.
//
// NO NETWORK. `fetchImpl` is injected everywhere. MESSAGING_DRY_RUN is declared
// "0" wherever a send is expected, because the fence defaults to BLOCKED.
//
// The property that matters most here is the last describe block: a topic is a
// public address, so nothing about a client may ever go out on it.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROVIDER, CHANNELS, ADDRESS_FIELD, ENABLED, TRANSMITS,
  send, ntfyConfig, isNtfyConfigured, buildPayload,
  MAX_TITLE_CHARS, MAX_BODY_CHARS, DEFAULT_SERVER
} from "./ntfy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const LIVE = { MESSAGING_DRY_RUN: "0", NTFY_TOPIC: "fundhub-abc123-secret-topic" };

function fakeFetch(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const { status = 200, body = {} } = queue.length > 1 ? queue.shift() : queue[0];
    const text = JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, headers: { forEach() {} }, text: async () => text };
  };
  impl.calls = calls;
  return impl;
}

const buzz = { notification: { title: "Ad 43 take 2 is ready", body: "Watch it, then approve or reject." } };

describe("configuration", () => {
  test("no topic is reported by NAME", () => {
    const cfg = ntfyConfig({});
    assert.equal(cfg.ok, false);
    assert.deepEqual(cfg.missing, ["NTFY_TOPIC"]);
    assert.equal(isNtfyConfigured({}), false);
  });

  test("the public server is the default and a plain http server is refused", () => {
    assert.equal(ntfyConfig({ NTFY_TOPIC: "t" }).server, DEFAULT_SERVER);
    assert.equal(ntfyConfig({ NTFY_TOPIC: "t", NTFY_SERVER: "http://ntfy.test" }).ok, false);
  });

  test("an unconfigured notifier fails retryably and sends nothing", async () => {
    const impl = fakeFetch({ status: 200 });
    const res = await send(buzz, { env: { MESSAGING_DRY_RUN: "0" }, fetchImpl: impl });
    assert.equal(res.status, "failed");
    assert.equal(res.retryable, true, "the notification is fine; the configuration is not");
    assert.equal(impl.calls.length, 0);
  });
});

describe("the payload is built here, never accepted", () => {
  test("title and body are capped", () => {
    const p = buildPayload({ title: "t".repeat(500), body: "b".repeat(2000) }, { topic: "x" });
    assert.equal(p.title.length, MAX_TITLE_CHARS);
    assert.equal(p.message.length, MAX_BODY_CHARS);
  });

  test("an empty notification is refused rather than sent as nothing", () => {
    assert.throws(() => buildPayload({}, { topic: "x" }));
  });

  test("Approve and Reject become view actions, not blind POSTs from the phone", () => {
    const p = buildPayload({
      title: "ready",
      actions: [
        { label: "Approve", url: "https://fundhub.ai/a/abc" },
        { label: "Reject", url: "https://fundhub.ai/r/abc" }
      ]
    }, { topic: "x" });
    assert.equal(p.actions.length, 2);
    assert.ok(p.actions.every((a) => a.action === "view"),
      "an http action fires an unauthenticated POST from a phone; a view action goes through the signed door");
  });

  test("a non-https action link is dropped", () => {
    const p = buildPayload({ title: "x", actions: [{ label: "Approve", url: "http://evil.test" }] }, { topic: "x" });
    assert.equal(p.actions, undefined);
  });
});

describe("sending", () => {
  test("the fence holds it when MESSAGING_DRY_RUN is not set", async () => {
    const impl = fakeFetch({ status: 200 });
    const res = await send(buzz, { env: { NTFY_TOPIC: "t" }, fetchImpl: impl });
    assert.equal(res.status, "failed");
    assert.equal(impl.calls.length, 0);
  });

  test("a good buzz goes out once, as JSON, to the topic", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "msg1" } });
    const res = await send(buzz, { env: LIVE, fetchImpl: impl });
    assert.equal(res.status, "sent");
    assert.equal(impl.calls.length, 1);
    assert.equal(impl.calls[0].body.topic, LIVE.NTFY_TOPIC);
    assert.equal(impl.calls[0].body.title, "Ad 43 take 2 is ready");
  });

  test("a 5xx is retryable, a 400 is not", async () => {
    assert.equal((await send(buzz, { env: LIVE, fetchImpl: fakeFetch({ status: 503 }) })).retryable, true);
    assert.equal((await send(buzz, { env: LIVE, fetchImpl: fakeFetch({ status: 400 }) })).status, "rejected");
  });

  test("it never throws, whatever the transport does", async () => {
    const boom = async () => { throw new Error("socket exploded"); };
    const res = await send(buzz, { env: LIVE, fetchImpl: boom });
    assert.equal(res.status, "failed");
  });
});

describe("THE ONE THAT MATTERS — a topic is a public address", () => {
  /* Anyone who guesses the topic name reads everything published to it. So a
     client id, a client's name, or a dollar amount tied to a person must never
     reach it. The refusal is permanent, not retryable: a retry would refuse it
     again, and the caller has to fix the message. */
  test("a notification carrying a client id is refused outright", async () => {
    const impl = fakeFetch({ status: 200 });
    const res = await send({ clientId: "c-123", ...buzz }, { env: LIVE, fetchImpl: impl });
    assert.equal(res.status, "rejected");
    assert.equal(impl.calls.length, 0);
  });

  test("a client id hidden inside the notification is refused too", async () => {
    const impl = fakeFetch({ status: 200 });
    const res = await send({ notification: { ...buzz.notification, clientId: "c-123" } }, { env: LIVE, fetchImpl: impl });
    assert.equal(res.status, "rejected");
    assert.equal(impl.calls.length, 0);
  });

  test("the fence log line does not name the topic", () => {
    const src = fs.readFileSync(path.join(HERE, "ntfy.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(/what:\s*"staff notification"/.test(code),
      "the `what` string is printed by the fence on a hold — it must not carry the address");
  });
});

describe("the posture of this file", () => {
  test("it ships unrouted", () => {
    assert.equal(PROVIDER, "ntfy");
    assert.ok(CHANNELS instanceof Set && CHANNELS.size > 0);
    assert.equal(typeof ADDRESS_FIELD, "string");
    assert.equal(ENABLED, false);
    assert.equal(TRANSMITS, true);
  });

  test("it is NOT in the provider registry", () => {
    const index = fs.readFileSync(path.join(HERE, "index.mjs"), "utf8");
    assert.ok(!/ntfy/.test(index),
      "a staff notifier must not become a channel's default for client messages");
  });
});
