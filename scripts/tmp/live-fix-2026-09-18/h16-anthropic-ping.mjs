// HOLE 16 — does the second reader (Anthropic) answer with the key production
// holds? One tiny text call through the app's own callModel. The OpenAI key is
// left out of THIS PROCESS's copy of env only, so the call goes to Anthropic.
// Nothing is stored or removed anywhere. Never prints the key.
import { callModel } from "../../../src/agents/model.mjs";

const env = { ...process.env };
delete env.OPENAI_API_KEY;
delete env.COMPANY_BRAIN_OPENAI_API_KEY;
const r = await callModel({ system: "You are a test.", user: "Reply with the single word OK.", env, maxTokens: 10 });
console.log(JSON.stringify({
  provider: r.request?.provider, model: r.request?.model, mode: r.mode,
  status: r.status ?? null, error: r.error ? String(r.error).slice(0, 200) : null, text: r.text
}));
