// Submagic provider — the properties that cost money or wreck an ad when they
// are wrong.
//
// NO NETWORK. Every case injects `fetchImpl`, the seam the provider contract
// requires. ADAPTERS_DRY_RUN is declared "0" wherever a real send is expected,
// because src/lib/dry-run.mjs defaults to BLOCKED and a test that did not say so
// would transmit nothing and pass for the wrong reason.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROVIDER, CHANNELS, ADDRESS_FIELD, ENABLED, TRANSMITS,
  submagicConfig, isSubmagicConfigured,
  createProject, getProject, uploadUserMedia, updateProject, exportProject,
  parseWebhook, buildItems, buildDictionary,
  MAX_ITEM_SECONDS, MAX_DICTIONARY_TERMS, MAX_DICTIONARY_TERM_CHARS, RATE_LIMITS
} from "./submagic.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const KEY = "sk-submagic-test-0123456789";
const LIVE = { ADAPTERS_DRY_RUN: "0", SUBMAGIC_API_KEY: KEY, SUBMAGIC_API_BASE: "https://submagic.test" };

/** A fetch stand-in. Records every call, answers from a queue. */
function fakeFetch(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const { status = 200, body = {} } = next || {};
    const text = JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { forEach() {} },
      text: async () => text,
      json: async () => body
    };
  };
  impl.calls = calls;
  return impl;
}

describe("configuration", () => {
  test("a missing key is reported by NAME and the value is never echoed", () => {
    const cfg = submagicConfig({});
    assert.equal(cfg.ok, false);
    assert.deepEqual(cfg.missing, ["SUBMAGIC_API_KEY"]);
    assert.equal(isSubmagicConfigured({}), false);
  });

  test("the host, the auth header and the export path are all overridable", () => {
    const cfg = submagicConfig({
      SUBMAGIC_API_KEY: KEY,
      SUBMAGIC_API_BASE: "https://elsewhere.test/",
      SUBMAGIC_API_AUTH_HEADER: "authorization",
      SUBMAGIC_EXPORT_PATH: "/v2/render/{id}"
    });
    // Three things the API research does not record. They are configuration for
    // that reason — a wrong guess must be fixable without a deploy.
    assert.equal(cfg.apiBase, "https://elsewhere.test");
    assert.equal(cfg.authHeader, "authorization");
    assert.equal(cfg.exportPath, "/v2/render/{id}");
  });

  test("with no key nothing is sent at all", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "p1" } });
    const res = await createProject({ title: "t", videoUrl: "https://x.test/a.mp4", env: { ADAPTERS_DRY_RUN: "0" }, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(impl.calls.length, 0, "a call was made without a key");
  });
});

describe("create project", () => {
  test("THE FOUR SWITCHES ARE FORCED, and a caller cannot turn them back on", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "proj_1" } });
    await createProject({
      title: "Ad 43 take 2", videoUrl: "https://cdn.test/043_t02.mp4",
      env: LIVE, fetchImpl: impl,
      // A caller trying to ask for the expensive, risky options.
      autoRender: true, magicBrolls: true, removeSilencePace: "fast", removeBadTakes: true
    });
    const body = impl.calls[0].body;
    assert.equal(body.autoRender, false, "autoRender must stay off — the words are read before anything is placed");
    assert.equal(body.magicBrolls, false, "AI b-roll is 3 credits a clip against 15 a month");
    assert.equal(body.removeBadTakes, false);
    assert.equal(body.removeSilencePace, undefined,
      "silence cutting must not be sent — a shortened timeline is what makes item times ambiguous");
  });

  test("the brand spelling is always in the dictionary", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "proj_1" } });
    await createProject({ title: "t", videoUrl: "https://cdn.test/a.mp4", env: LIVE, fetchImpl: impl });
    assert.ok(impl.calls[0].body.dictionary.includes("Fundhub"),
      "captions that write the company name wrong are a defect on a hundred ads a month");
  });

  test("a Google Drive share link is refused before anything is sent", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "p" } });
    const res = await createProject({
      title: "t", videoUrl: "drive://folder/abc", env: LIVE, fetchImpl: impl
    });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, false);
    assert.match(res.error, /Drive/);
    assert.equal(impl.calls.length, 0);
  });

  test("a project with no id back is a failure, not a success with nothing to find", async () => {
    const impl = fakeFetch({ status: 200, body: { ok: true } });
    const res = await createProject({ title: "t", videoUrl: "https://cdn.test/a.mp4", env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, false);
  });

  test("a 401 names the two things nobody could verify", async () => {
    const impl = fakeFetch({ status: 401, body: { error: "unauthorized" } });
    const res = await createProject({ title: "t", videoUrl: "https://cdn.test/a.mp4", env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.match(res.error, /SUBMAGIC_API_BASE/);
    assert.match(res.error, /SUBMAGIC_API_AUTH_HEADER/);
  });

  test("the fence holds it when ADAPTERS_DRY_RUN is not set", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "p" } });
    const res = await createProject({
      title: "t", videoUrl: "https://cdn.test/a.mp4",
      env: { SUBMAGIC_API_KEY: KEY }, fetchImpl: impl
    });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true);
    assert.equal(impl.calls.length, 0, "the fence let a paid call through");
  });
});

describe("b-roll items", () => {
  test("ai-broll is refused, always", () => {
    const out = buildItems([{ type: "ai-broll", startTime: 1, endTime: 4, prompt: "office" }]);
    assert.equal(out.ok, false);
    assert.match(out.errors[0], /refused/);
    assert.equal(out.items.length, 0);
  });

  test("a clip longer than the vendor limit is refused, not trimmed", () => {
    const out = buildItems([{ startTime: 0, endTime: MAX_ITEM_SECONDS + 0.5, userMediaId: "m1" }]);
    assert.equal(out.ok, false);
    assert.match(out.errors[0], /12s clip limit/);
  });

  test("overlapping clips are caught", () => {
    const out = buildItems([
      { startTime: 0, endTime: 5, userMediaId: "a" },
      { startTime: 4, endTime: 8, userMediaId: "b" }
    ]);
    assert.equal(out.ok, false);
    assert.ok(out.errors.some((e) => /overlap/.test(e)));
  });

  test("endTime must be after startTime", () => {
    const out = buildItems([{ startTime: 5, endTime: 5, userMediaId: "a" }]);
    assert.equal(out.ok, false);
  });

  test("a good set comes back sorted and clean", () => {
    const out = buildItems([
      { startTime: 20, endTime: 23, userMediaId: "b", layout: "cover" },
      { startTime: 5, endTime: 8, userMediaId: "a" }
    ]);
    assert.equal(out.ok, true);
    assert.deepEqual(out.items.map((i) => i.userMediaId), ["a", "b"]);
    assert.equal(out.items[0].type, "user-media");
  });

  test("an update with a bad placement never reaches the vendor", async () => {
    const impl = fakeFetch({ status: 200, body: {} });
    const res = await updateProject("p1", {
      placements: [{ type: "ai-broll", startTime: 1, endTime: 3, prompt: "x" }],
      env: LIVE, fetchImpl: impl
    });
    assert.equal(res.ok, false);
    assert.equal(impl.calls.length, 0, "a refused placement still cost a re-export");
  });
});

describe("the dictionary", () => {
  test("it is capped and de-duplicated", () => {
    const many = Array.from({ length: 200 }, (_, i) => `term${i}`);
    const out = buildDictionary([...many, "Fundhub", "fundhub"]);
    assert.ok(out.length <= MAX_DICTIONARY_TERMS);
    assert.equal(new Set(out.map((t) => t.toLowerCase())).size, out.length);
  });

  test("a long term is cut to the vendor's limit", () => {
    const out = buildDictionary(["x".repeat(200)]);
    assert.ok(out.every((t) => t.length <= MAX_DICTIONARY_TERM_CHARS));
  });
});

describe("get project", () => {
  test("the words come back, and so does the length that gets billed", async () => {
    const impl = fakeFetch({ status: 200, body: {
      status: "processing", duration: 102,
      words: [{ word: "most", startTime: 0, endTime: 0.3 }]
    } });
    const res = await getProject("p1", { env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, true);
    assert.equal(res.words.length, 1);
    assert.equal(res.durationSeconds, 102);
    assert.match(impl.calls[0].init.method, /GET/);
  });
});

describe("upload user media", () => {
  test("bytes are never accepted — a clip goes over as a link", async () => {
    const impl = fakeFetch({ status: 200, body: { id: "um1" } });
    const bad = await uploadUserMedia("p1", { url: "not-a-url", env: LIVE, fetchImpl: impl });
    assert.equal(bad.ok, false);
    assert.equal(impl.calls.length, 0);

    const good = await uploadUserMedia("p1", { url: "https://cdn.test/clip.mp4", name: "approval", env: LIVE, fetchImpl: impl });
    assert.equal(good.ok, true);
    assert.equal(good.userMediaId, "um1");
  });
});

describe("export", () => {
  test("a 404 says the path was inferred rather than documented", async () => {
    const impl = fakeFetch({ status: 404, body: { error: "not found" } });
    const res = await exportProject("p1", { env: LIVE, fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.match(res.error, /SUBMAGIC_EXPORT_PATH/);
  });

  test("the limits from the research are recorded, and export is the tight one", () => {
    assert.equal(RATE_LIMITS.export, 50);
    assert.ok(RATE_LIMITS.export < RATE_LIMITS.create);
  });
});

describe("the webhook payload", () => {
  test("a body with no project id is refused", () => {
    assert.equal(parseWebhook('{"status":"completed"}').ok, false);
    assert.equal(parseWebhook("not json").ok, false);
    assert.equal(parseWebhook(null).ok, false);
  });

  test("the five documented fields are read", () => {
    const out = parseWebhook(JSON.stringify({
      projectId: "p1", status: "completed",
      downloadUrl: "https://cdn.test/out.mp4",
      directUrl: "https://d.cloudfront.test/out.mp4",
      timestamp: "2026-09-23T10:00:00Z"
    }));
    assert.equal(out.ok, true);
    assert.equal(out.projectId, "p1");
    assert.equal(out.finished, true);
    assert.equal(out.downloadUrl, "https://cdn.test/out.mp4");
  });

  test("a plain http link is not treated as a finished render", () => {
    const out = parseWebhook(JSON.stringify({ projectId: "p1", status: "completed", downloadUrl: "http://evil.test/x.mp4" }));
    assert.equal(out.downloadUrl, null,
      "this door is open to the internet — only https counts as a link worth following");
  });

  test("a failed render is read as failed", () => {
    const out = parseWebhook(JSON.stringify({ projectId: "p1", status: "failed" }));
    assert.equal(out.failed, true);
    assert.equal(out.finished, false);
  });
});

describe("the posture of this file", () => {
  test("it ships unrouted, exactly like web-push", () => {
    assert.equal(PROVIDER, "submagic");
    assert.ok(CHANNELS instanceof Set && CHANNELS.size > 0);
    assert.equal(typeof ADDRESS_FIELD, "string");
    assert.equal(ENABLED, false, "a video editor must never become a message channel's default");
    assert.equal(TRANSMITS, true);
  });

  test("it is NOT in the provider registry", () => {
    const index = fs.readFileSync(path.join(HERE, "index.mjs"), "utf8");
    assert.ok(!/submagic/.test(index),
      "registering this would put a video vendor in the client message dispatcher");
  });

  test("the source never names ai-broll as something it would send", () => {
    const src = fs.readFileSync(path.join(HERE, "submagic.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/["']ai-broll["']\s*[,)]/.test(code.replace(/type\s*!==\s*"user-media"/g, "")),
      "the only mention of ai-broll may be the check that refuses it");
  });
});
