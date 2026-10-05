// callModel extensions for the marketing machine (spec M0 step 4):
// provider 'anthropic', timeoutMs, cache, tools, toolChoice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { callModel, classifyModelFailure } from "./model.mjs";

const okAnthropic = (usage = { input_tokens: 5, output_tokens: 7 }) => async () => ({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: "text", text: "claude says hi" }], usage })
});

test("provider anthropic with BOTH keys set calls only api.anthropic.com", async () => {
  const urls = [];
  const res = await callModel({
    system: "sys", user: "hi", provider: "anthropic", model: "claude-sonnet-5-5", maxTokens: 900,
    env: { OPENAI_API_KEY: "sk-openai", ANTHROPIC_API_KEY: "sk-ant" },
    fetchImpl: async (url, opts) => { urls.push(url); return okAnthropic()(url, opts); }
  });
  assert.deepEqual(urls, ["https://api.anthropic.com/v1/messages"]);
  assert.equal(res.text, "claude says hi");
  assert.equal(res.request.provider, "anthropic");
  assert.equal(res.request.model, "claude-sonnet-5-5");
});

test("provider anthropic never swaps the model name for an OpenAI one", async () => {
  let body;
  await callModel({
    system: "s", user: "u", provider: "anthropic", model: "claude-opus-5-5",
    env: { OPENAI_API_KEY: "sk-openai", ANTHROPIC_API_KEY: "sk-ant" },
    fetchImpl: async (u, o) => { body = JSON.parse(o.body); return okAnthropic()(); }
  });
  assert.equal(body.model, "claude-opus-5-5");
});

test("provider anthropic with a missing or masked key is an error and sends nothing", async () => {
  for (const env of [{}, { OPENAI_API_KEY: "sk-openai" }, { ANTHROPIC_API_KEY: "****************abcd" }]) {
    let fetched = 0;
    const res = await callModel({
      system: "s", user: "u", provider: "anthropic", env,
      fetchImpl: async () => { fetched++; return okAnthropic()(); }
    });
    assert.equal(fetched, 0);
    assert.equal(res.text, null);
    assert.match(res.error, /ANTHROPIC_API_KEY is missing or masked/);
    assert.equal(res.status, 401);
    assert.equal(classifyModelFailure({ status: res.status, error: res.error }).temporary, false);
  }
});

test("an unknown provider value is refused", async () => {
  const res = await callModel({
    system: "s", user: "u", provider: "gemini", env: { ANTHROPIC_API_KEY: "k" },
    fetchImpl: async () => { throw new Error("must not be called"); }
  });
  assert.match(res.error, /provider must be 'anthropic'/);
});

test("cache sends the system block with cache_control ephemeral; off sends a plain string", async () => {
  const bodies = [];
  const fetchImpl = async (u, o) => { bodies.push(JSON.parse(o.body)); return okAnthropic()(); };
  const env = { ANTHROPIC_API_KEY: "sk-ant" };
  await callModel({ system: "RULES", user: "u", provider: "anthropic", cache: true, env, fetchImpl });
  await callModel({ system: "RULES", user: "u", provider: "anthropic", env, fetchImpl });
  assert.deepEqual(bodies[0].system, [{ type: "text", text: "RULES", cache_control: { type: "ephemeral" } }]);
  assert.equal(bodies[1].system, "RULES");
});

test("tools and toolChoice go through, and tool_use blocks come back as toolCalls", async () => {
  let body;
  const tool = { name: "save", description: "d", input_schema: { type: "object", properties: {} } };
  const res = await callModel({
    system: "s", user: "u", provider: "anthropic", env: { ANTHROPIC_API_KEY: "k" },
    tools: [tool], toolChoice: "auto",
    fetchImpl: async (u, o) => {
      body = JSON.parse(o.body);
      return { ok: true, status: 200, json: async () => ({
        content: [{ type: "tool_use", id: "t1", name: "save", input: { a: 1 } }],
        usage: { input_tokens: 1, output_tokens: 1 }
      }) };
    }
  });
  assert.deepEqual(body.tools, [tool]);
  assert.deepEqual(body.tool_choice, { type: "auto" });
  assert.deepEqual(res.toolCalls, [{ type: "tool_use", id: "t1", name: "save", input: { a: 1 } }]);
  assert.equal(res.error, null);
});

test("cache token counts are reported when Anthropic sends them", async () => {
  const res = await callModel({
    system: "s", user: "u", provider: "anthropic", env: { ANTHROPIC_API_KEY: "k" },
    fetchImpl: okAnthropic({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 })
  });
  assert.deepEqual(res.usage, { input_tokens: 10, output_tokens: 20, cache_read_tokens: 300, cache_creation_tokens: 40 });
});

test("timeoutMs aborts a call that never answers, as a temporary failure", async () => {
  const res = await callModel({
    system: "s", user: "u", provider: "anthropic", env: { ANTHROPIC_API_KEY: "k" }, timeoutMs: 20,
    fetchImpl: (u, o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new Error("aborted"))))
  });
  assert.match(res.error, /timed out after 20 ms/);
  assert.equal(res.text, null);
  assert.equal(classifyModelFailure({ status: res.status, error: res.error }).temporary, true);
});

test("without the new options the request body is exactly what it was", async () => {
  let body;
  await callModel({
    system: "sys", user: "hi", env: { ANTHROPIC_API_KEY: "k" },
    fetchImpl: async (u, o) => { body = JSON.parse(o.body); return okAnthropic()(); }
  });
  assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "messages", "model", "system"]);
  assert.equal(body.system, "sys");
});
