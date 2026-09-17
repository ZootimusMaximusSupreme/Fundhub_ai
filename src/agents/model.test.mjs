import { test } from "node:test";
import assert from "node:assert/strict";
import { callModel, liveModelProvider, DEFAULT_OPENAI_MODEL } from "./model.mjs";

test("liveModelProvider prefers OpenAI when that key is set", () => {
  assert.equal(liveModelProvider({}), null);
  assert.equal(liveModelProvider({ OPENAI_API_KEY: "sk-openai" }), "openai");
  assert.equal(liveModelProvider({ COMPANY_BRAIN_OPENAI_API_KEY: "sk-brain" }), "openai");
  assert.equal(liveModelProvider({ ANTHROPIC_API_KEY: "sk-ant" }), "anthropic");
  assert.equal(liveModelProvider({
    OPENAI_API_KEY: "sk-openai",
    ANTHROPIC_API_KEY: "sk-ant"
  }), "openai");
});

test("callModel with no key stays shadow and fetches nothing", async () => {
  let fetched = 0;
  const res = await callModel({
    system: "sys",
    user: "hi",
    env: {},
    fetchImpl: async () => { fetched += 1; throw new Error("should not fetch"); }
  });
  assert.equal(res.mode, "shadow");
  assert.match(res.text, /\[SHADOW — no API key\]/);
  assert.match(res.text, /hi/);
  assert.equal(fetched, 0);
});

test("callModel with only OPENAI_API_KEY posts to OpenAI chat completions", async () => {
  const res = await callModel({
    system: "sys",
    user: "hi",
    env: { OPENAI_API_KEY: "sk-openai" },
    fetchImpl: async (url, opts) => {
      assert.match(url, /api\.openai\.com\/v1\/chat\/completions/);
      assert.equal(opts.headers.authorization, "Bearer sk-openai");
      const body = JSON.parse(opts.body);
      assert.equal(body.model, DEFAULT_OPENAI_MODEL);
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.messages[1].role, "user");
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Why $32?" } }],
          usage: { prompt_tokens: 5, completion_tokens: 7 }
        })
      };
    }
  });
  assert.equal(res.mode, "live");
  assert.equal(res.text, "Why $32?");
  assert.equal(res.request.provider, "openai");
  assert.equal(res.usage.input_tokens, 5);
  assert.equal(res.usage.output_tokens, 7);
});

test("callModel with only ANTHROPIC_API_KEY still posts to Anthropic", async () => {
  const res = await callModel({
    system: "sys",
    user: "hi",
    env: { ANTHROPIC_API_KEY: "test-key" },
    fetchImpl: async (url, opts) => {
      assert.match(url, /anthropic\.com/);
      assert.equal(opts.headers["x-api-key"], "test-key");
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Book Thursday at 2?" }],
          usage: { input_tokens: 3, output_tokens: 9 }
        })
      };
    }
  });
  assert.equal(res.mode, "live");
  assert.equal(res.text, "Book Thursday at 2?");
  assert.equal(res.request.provider, "anthropic");
  assert.equal(res.usage.input_tokens, 3);
  assert.equal(res.usage.output_tokens, 9);
});

test("callModel with both keys uses OpenAI, not Anthropic", async () => {
  const res = await callModel({
    system: "sys",
    user: "drill",
    env: { OPENAI_API_KEY: "sk-openai", ANTHROPIC_API_KEY: "sk-ant" },
    fetchImpl: async (url) => {
      assert.match(url, /api\.openai\.com/);
      assert.doesNotMatch(url, /anthropic/);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "I am the buyer." } }]
        })
      };
    }
  });
  assert.equal(res.mode, "live");
  assert.equal(res.text, "I am the buyer.");
  assert.equal(res.request.provider, "openai");
});

// A MASKED KEY IS NOT A KEY. These guard the 2026-09-17 fault: the live
// OPENAI_API_KEY was the blanked-out form of one (asterisks), OpenAI answered 401,
// and because SOMETHING was set the valid Anthropic key was never reached — so
// Social Studio's "Write 3 posts for me" wrote nothing at all. The stored value is
// never removed (CLAUDE.md §11 "Never remove a key"); it is routed around here.
test("a masked OpenAI key counts as not set, so Anthropic is reached", () => {
  const MASK = "****************Ab3d";

  // The exact live shape: sixteen asterisks then four characters.
  assert.equal(liveModelProvider({ OPENAI_API_KEY: MASK }), null);
  assert.equal(liveModelProvider({
    OPENAI_API_KEY: MASK,
    ANTHROPIC_API_KEY: "sk-ant"
  }), "anthropic", "a mask must not shadow a working Anthropic key");

  // The Company Brain variable is the same door and must behave the same way.
  assert.equal(liveModelProvider({
    COMPANY_BRAIN_OPENAI_API_KEY: MASK,
    ANTHROPIC_API_KEY: "sk-ant"
  }), "anthropic");

  // Any asterisk marks a mask — a real OpenAI key never carries one.
  assert.equal(liveModelProvider({ OPENAI_API_KEY: "sk-proj-abc*def" }), null);

  // A genuine key is untouched by this. If this line ever fails, the check has
  // grown too wide and is refusing real credentials.
  assert.equal(liveModelProvider({ OPENAI_API_KEY: "sk-proj-abcDEF123" }), "openai");
});

test("a masked OpenAI key sends the request to Anthropic, not OpenAI", async () => {
  const res = await callModel({
    system: "sys",
    user: "write me three posts",
    env: { OPENAI_API_KEY: "****************Ab3d", ANTHROPIC_API_KEY: "sk-ant" },
    fetchImpl: async (url) => {
      assert.match(url, /anthropic/, "a mask must not route the call to OpenAI");
      assert.doesNotMatch(url, /api\.openai\.com/);
      return { ok: true, json: async () => ({ content: [{ type: "text", text: "Post one." }] }) };
    }
  });
  assert.equal(res.mode, "live");
  assert.equal(res.text, "Post one.");
  assert.equal(res.request.provider, "anthropic");
});
