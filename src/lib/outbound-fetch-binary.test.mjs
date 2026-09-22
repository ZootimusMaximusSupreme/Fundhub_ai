// The binary path through the fence.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS IS IN THE CHOKEPOINT AND NOT IN A PROVIDER
//
// Until 2026-09-22 this repo could not move a video in either direction, for
// one reason: transmit() reads every response with res.text(), which mangles
// binary. The tempting fix is one raw fetch in one provider "just for video" —
// and that is precisely the hole src/lib/no-unfenced-transmit.test.mjs exists
// to close. So the missing half was built inside the fence instead, and this
// file proves the fence still holds for it.
//
// THE FOUR PROPERTIES THAT MATTER:
//
//   1. A caller must still name a fence. No fence, nothing leaves.
//   2. The dry-run flag still holds it. A binary call is not a way around
//      ADAPTERS_DRY_RUN.
//   3. THE SIZE CAP BITES WHILE READING, not after. A vendor that lies about
//      content-length cannot fill the heap — the read stops on the chunk that
//      crosses the line.
//   4. An upload too big is refused BEFORE it is sent, so a vendor is never
//      left holding a half-made record.
// ═══════════════════════════════════════════════════════════════════════════

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  transmitBinary, postBinaryTo, ADAPTERS, MESSAGING, INTERNAL,
  DEFAULT_MAX_BINARY_BYTES, HARD_MAX_BINARY_BYTES, DEFAULT_BINARY_TIMEOUT_MS
} from "./outbound-fetch.mjs";

const SEND = { ADAPTERS_DRY_RUN: "0", MESSAGING_DRY_RUN: "0" };

/** A Response stand-in whose body arrives in chunks, like a real download. */
function streamed(chunks, { status = 200, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { forEach(fn) { for (const [k, v] of Object.entries(lower)) fn(v, k); } },
    text: async () => "",
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
        cancel: async () => { i = chunks.length; }
      })
    }
  };
}

/** A Response stand-in with no stream at all — the arrayBuffer fallback. */
function buffered(bytes, { status = 200, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { forEach(fn) { for (const [k, v] of Object.entries(lower)) fn(v, k); } },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => "an error body"
  };
}

const MP4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);

describe("the fence still decides", () => {
  test("no fence named, nothing leaves", async () => {
    let called = false;
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      env: SEND, fetchImpl: async () => { called = true; return streamed([MP4]); }
    });
    assert.equal(called, false);
    assert.equal(res.blocked, true);
    assert.equal(res.transmitted, false);
    assert.equal(res.bytes, null);
    assert.match(res.error, /no fence declared/);
  });

  test("an invented fence name is refused, not treated as internal", async () => {
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: "video", env: SEND, fetchImpl: async () => streamed([MP4])
    });
    assert.equal(res.blocked, true);
    assert.match(res.error, /got "video"/);
  });

  test("ADAPTERS_DRY_RUN unset holds a download the same as it holds a POST", async () => {
    let called = false;
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: {}, fetchImpl: async () => { called = true; return streamed([MP4]); }
    });
    assert.equal(called, false);
    assert.equal(res.blocked, true);
    assert.equal(res.transmitted, false);
  });

  test("MESSAGING and INTERNAL are still the other two names it knows", async () => {
    const held = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: MESSAGING, env: {}, fetchImpl: async () => streamed([MP4])
    });
    assert.equal(held.blocked, true);

    /* INTERNAL has no flag, so it goes — which is why the set of modules
       allowed to say it is pinned in no-unfenced-transmit.test.mjs. */
    const went = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: INTERNAL, env: {}, fetchImpl: async () => streamed([MP4])
    });
    assert.equal(went.ok, true);
  });
});

describe("the bytes arrive intact", () => {
  test("a streamed body comes back byte for byte", async () => {
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND,
      fetchImpl: async () => streamed([MP4.slice(0, 4), MP4.slice(4)], { headers: { "content-type": "video/mp4" } })
    });
    assert.equal(res.ok, true);
    assert.equal(res.transmitted, true);
    assert.equal(res.byteLength, MP4.byteLength);
    assert.deepEqual([...res.bytes], [...MP4]);
    assert.equal(res.contentType, "video/mp4");
  });

  test("a response with no stream falls back to arrayBuffer", async () => {
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND, fetchImpl: async () => buffered(MP4)
    });
    assert.equal(res.ok, true);
    assert.deepEqual([...res.bytes], [...MP4]);
  });

  test("an error status returns the reason and NO bytes", async () => {
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND, fetchImpl: async () => buffered(MP4, { status: 404 })
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    assert.equal(res.bytes, null);
    assert.equal(res.transmitted, true, "the request was made — a caller retrying must know that");
  });

  test("a credential echoed back in an error is redacted", async () => {
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND,
      fetchImpl: async () => ({
        ok: false, status: 401,
        headers: { forEach() {} },
        text: async () => 'sent authorization: Bearer sk-live-abc123def456'
      })
    });
    assert.ok(!res.error.includes("sk-live-abc123def456"), "a key must never reach a log or a database column");
    assert.match(res.error, /redacted/);
  });
});

describe("the size cap", () => {
  test("content-length over the cap means not one byte is pulled", async () => {
    let read = false;
    const res = await transmitBinary("https://x.test/big.mp4", {}, {
      fence: ADAPTERS, env: SEND, maxBytes: 10,
      fetchImpl: async () => ({
        ok: true, status: 200,
        headers: { forEach(fn) { fn("999999999", "content-length"); } },
        text: async () => "",
        body: { getReader: () => ({ read: async () => { read = true; return { done: true }; }, cancel: async () => {} }) }
      })
    });
    assert.equal(res.ok, false);
    assert.equal(read, false, "the cheap check has to happen before the body is pulled");
    assert.match(res.error, /over the 10-byte cap/);
    assert.equal(res.bytes, null);
  });

  test("A VENDOR THAT LIES ABOUT ITS LENGTH STILL CANNOT FILL THE HEAP", async () => {
    /* No content-length at all, and far more data than the cap. The read must
       stop on the chunk that crosses the line, not after buffering it all. */
    let chunksPulled = 0;
    const res = await transmitBinary("https://x.test/lying.mp4", {}, {
      fence: ADAPTERS, env: SEND, maxBytes: 8,
      fetchImpl: async () => ({
        ok: true, status: 200,
        headers: { forEach() {} },
        text: async () => "",
        body: {
          getReader: () => ({
            read: async () => { chunksPulled += 1; return { done: false, value: new Uint8Array(4) }; },
            cancel: async () => {}
          })
        }
      })
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /more than the 8-byte cap/);
    assert.equal(chunksPulled, 3, "it stopped on the chunk that crossed the cap, not at the end of an endless body");
    assert.equal(res.bytes, null);
  });

  test("a body exactly at the cap is fine", async () => {
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND, maxBytes: MP4.byteLength,
      fetchImpl: async () => streamed([MP4])
    });
    assert.equal(res.ok, true);
    assert.equal(res.byteLength, MP4.byteLength);
  });

  test("a caller cannot raise the cap past the hard ceiling", async () => {
    let seen = 0;
    await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND, maxBytes: HARD_MAX_BINARY_BYTES * 10,
      fetchImpl: async () => ({
        ok: true, status: 200,
        headers: { forEach(fn) { fn(String(HARD_MAX_BINARY_BYTES + 1), "content-length"); } },
        text: async () => "", body: { getReader: () => ({ read: async () => { seen += 1; return { done: true }; }, cancel: async () => {} }) }
      })
    });
    assert.equal(seen, 0, "past the hard ceiling the transfer is refused whatever the caller asked for");
  });

  test("a cap of zero or nonsense refuses rather than defaulting to unlimited", async () => {
    let called = false;
    const res = await transmitBinary("https://x.test/a.mp4", {}, {
      fence: ADAPTERS, env: SEND, maxBytes: 0,
      fetchImpl: async () => { called = true; return streamed([MP4]); }
    });
    assert.equal(called, false);
    assert.match(res.error, /positive number of bytes/);
  });

  test("the defaults are a real ceiling, not a formality", () => {
    assert.equal(DEFAULT_MAX_BINARY_BYTES, 512 * 1024 * 1024);
    assert.equal(HARD_MAX_BINARY_BYTES, 2 * 1024 * 1024 * 1024);
    assert.ok(DEFAULT_BINARY_TIMEOUT_MS >= 60_000, "a few hundred megabytes does not move in ten seconds");
  });
});

describe("the timeout", () => {
  test("a stalled download is aborted and reported as transmitted", async () => {
    const res = await transmitBinary("https://x.test/slow.mp4", {}, {
      fence: ADAPTERS, env: SEND, timeoutMs: 10,
      fetchImpl: (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted"); e.name = "AbortError"; reject(e);
        });
      })
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    assert.equal(res.transmitted, true, "the vendor may have started work — a caller must not assume it did not");
    assert.match(res.error, /timed out after 10ms/);
  });
});

describe("sending bytes", () => {
  test("a body over the cap is refused BEFORE anything is sent", async () => {
    let called = false;
    const res = await postBinaryTo("https://x.test/upload", {
      body: new Uint8Array(100), maxBytes: 10,
      fence: ADAPTERS, env: SEND, fetchImpl: async () => { called = true; return buffered(MP4); }
    });
    assert.equal(called, false);
    assert.equal(res.transmitted, false);
    assert.equal(res.blocked, false, "this is a refusal, not the dry-run fence — a caller must be able to tell them apart");
    assert.match(res.error, /over the 10-byte cap/);
  });

  test("a FormData body is measured by the byteLength the caller declares", async () => {
    let called = false;
    const res = await postBinaryTo("https://x.test/upload", {
      body: new FormData(), byteLength: 5000, maxBytes: 100,
      fence: ADAPTERS, env: SEND, fetchImpl: async () => { called = true; return buffered(MP4); }
    });
    assert.equal(called, false);
    assert.match(res.error, /5000 bytes/);
  });

  test("a body inside the cap goes, and the JSON answer comes back parsed", async () => {
    let sent = null;
    const res = await postBinaryTo("https://x.test/upload", {
      body: new Uint8Array(10),
      headers: { "x-api-key": "k" },
      fence: ADAPTERS, env: SEND,
      fetchImpl: async (url, init) => {
        sent = init;
        return { ok: true, status: 200, headers: { forEach() {} }, text: async () => JSON.stringify({ id: "proj1" }) };
      }
    });
    assert.equal(res.ok, true);
    assert.equal(res.body.id, "proj1");
    assert.equal(sent.method, "POST");
    assert.equal(sent.headers["Content-Type"], undefined,
      "no Content-Type unless the caller asks — FormData writes its own boundary");
  });

  test("the dry-run fence holds an upload too", async () => {
    let called = false;
    const res = await postBinaryTo("https://x.test/upload", {
      body: new Uint8Array(10), fence: ADAPTERS, env: {},
      fetchImpl: async () => { called = true; return buffered(MP4); }
    });
    assert.equal(called, false);
    assert.equal(res.blocked, true);
  });

  test("a method other than POST is allowed, for a resumable PUT", async () => {
    let sent = null;
    await postBinaryTo("https://upload.test/session", {
      method: "PUT", body: new Uint8Array(4), contentType: "video/mp4",
      fence: ADAPTERS, env: SEND,
      fetchImpl: async (url, init) => { sent = init; return { ok: true, status: 200, headers: { forEach() {} }, text: async () => "{}" }; }
    });
    assert.equal(sent.method, "PUT");
    assert.equal(sent.headers["Content-Type"], "video/mp4");
  });
});
