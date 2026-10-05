// Model call — OpenAI Chat Completions first, Anthropic Messages as fallback.
//
// Owner-set (2026-08-25): use OPENAI_API_KEY for now. COMPANY_BRAIN_OPENAI_API_KEY
// is accepted as the same key (embeddings already read it). ANTHROPIC_API_KEY
// still works when no OpenAI key is set. PDF/document media stays on Anthropic
// when that key is present, because that path already knows documents.
//
// With no key, callModel() returns a shadow result: nothing is sent, nothing
// throws, and the caller logs the would-be request.
//
// No new npm dependency — raw fetch, same posture as src/messaging/providers/*.

export const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_MAX_TOKENS = 600;

// ── WHY A FAILURE IS CLASSIFIED AND NOT JUST REPORTED ──────────────────────
//
// Measured 2026-09-16 on the live walk: eight document reads in a row came back
// `openai 429: {"error":{"message":"You have no credits remaining..."}}`. Every
// caller treated that exactly like "the model read the file and said nothing" —
// one error string, no verdict, done. An empty wallet is not a verdict and it is
// not permanent: it is "not right now". Something has to be able to tell those
// two apart before anything can try again on its own.
//
// Same shape as src/company-brain/transcribe.mjs isWhisperCreditsError, which
// has classified the identical 429 on the Whisper path since 2026-08. Kept here
// rather than imported from there because that module is about audio files and
// this one is about the chat/vision call — the two happen to share a vendor.
export const MODEL_NO_CREDIT = "no_credit";
export const MODEL_RATE_LIMITED = "rate_limited";
export const MODEL_SERVER_ERROR = "server_error";
export const MODEL_UNREACHABLE = "unreachable";

const NO_CREDIT_TEXT =
  /insufficient_quota|no credits remaining|exceeded your current quota|check your plan and billing|credit balance is too low|billing_hard_limit|quota_exceeded/;

/** The `openai 429: …` / `anthropic 400: …` prefix callOpenAI and callAnthropic write. */
function statusFromErrorText(text) {
  const m = /^\s*(?:openai|anthropic)\s+(\d{3})\s*:/i.exec(String(text || ""));
  return m ? Number(m[1]) : null;
}

/**
 * classifyModelFailure({ status, error }) → { temporary, reason, status }
 *
 * temporary:true means "try this again later and it may well work" — an empty
 * wallet, a rate limit, a vendor 5xx, or a call that never reached the vendor.
 * temporary:false means the answer will not change by waiting (a 401 on a bad
 * key, a 400 on a malformed request), or there was no failure at all.
 *
 * NEVER guesses on behalf of the caller. A caller that cannot wait is free to
 * treat a temporary failure as final; what it must not do is treat a temporary
 * failure as an ANSWER.
 */
export function classifyModelFailure({ status = null, error = null } = {}) {
  const text = String(error == null ? "" : error);
  if (!text && status == null) return { temporary: false, reason: null, status: null };

  const code = Number(status) || statusFromErrorText(text) || null;
  const lower = text.toLowerCase();

  if (NO_CREDIT_TEXT.test(lower)) {
    return { temporary: true, reason: MODEL_NO_CREDIT, status: code };
  }
  if (code === 429) return { temporary: true, reason: MODEL_RATE_LIMITED, status: 429 };
  if (code != null && code >= 500) return { temporary: true, reason: MODEL_SERVER_ERROR, status: code };
  // No HTTP status at all means the request never got an answer — fetch threw,
  // DNS failed, the socket timed out. Bounded retries are the right response;
  // the caller's attempt ceiling is what stops a genuine code fault looping.
  if (code == null) return { temporary: true, reason: MODEL_UNREACHABLE, status: null };
  return { temporary: false, reason: null, status: code };
}

// A MASKED KEY IS NOT A KEY. Measured 2026-09-17: the live OPENAI_API_KEY was the
// blanked-out form of one — sixteen asterisks and four characters, i.e. what the
// screen shows when a password is hidden. Someone copied the mask instead of the
// value. OpenAI answered it with 401. That alone would be a small fault, but because
// SOMETHING was set, liveModelProvider() below returned "openai" and the valid
// Anthropic key was never reached — so Social Studio's "Write 3 posts for me" wrote
// nothing, and Company Brain took the same 401s silently.
//
// A real OpenAI key never contains an asterisk, so a value carrying one is a mask and
// is treated here as not set. The stored value is left exactly where it is: owner rule,
// CLAUDE.md §11 "Never remove a key" — we route around a bad credential, we never
// delete one.
function isMasked(value) {
  return String(value).includes("*");
}

function openaiKeyOf(env) {
  if (!env) return null;
  const key = env.OPENAI_API_KEY || env.COMPANY_BRAIN_OPENAI_API_KEY || null;
  if (!key || isMasked(key)) return null;
  return key;
}

/**
 * Which live vendor callModel will use for a text turn.
 * OpenAI wins when its key is set (owner: use OpenAI for now).
 */
export function liveModelProvider(env = process.env) {
  if (openaiKeyOf(env)) return "openai";
  if (env && env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function openaiModelName(requested, env) {
  const override = env && env.OPENAI_MODEL;
  if (override) return String(override);
  const m = String(requested || "");
  if (/^gpt-|^o[1-9]|^chatgpt-/i.test(m)) return m;
  return DEFAULT_OPENAI_MODEL;
}

function openaiBaseUrl(env) {
  return String((env && env.OPENAI_API_BASE) || "https://api.openai.com").replace(/\/+$/, "");
}

function hasDocumentMedia(mediaParts) {
  return (mediaParts || []).some((m) => {
    const mediaType = (m && (m.mediaType || m.media_type)) || "";
    return (m && m.type === "document") || mediaType === "application/pdf";
  });
}

function pickProvider(env, mediaParts) {
  const openai = openaiKeyOf(env);
  const anthropic = env && env.ANTHROPIC_API_KEY;
  if (hasDocumentMedia(mediaParts) && anthropic) return "anthropic";
  if (openai) return "openai";
  if (anthropic) return "anthropic";
  return null;
}

/**
 * callModel({ system, user, env?, fetchImpl?, model?, maxTokens?, provider?, timeoutMs?, cache?, tools?, toolChoice? })
 * → {
 *     mode: 'live' | 'shadow',
 *     text: string | null,          // assistant reply (synthetic marker when keyless)
 *     raw: object | null,
 *     request: { model, system, user, max_tokens },
 *     error: string | null
 *   }
 */
export async function callModel({
  system, user, env = process.env, fetchImpl = globalThis.fetch,
  model = DEFAULT_MODEL, maxTokens = DEFAULT_MAX_TOKENS,
  media = [],
  // Marketing machine (spec M0 step 4). All optional; none change the default path.
  //   provider  'anthropic' forces Claude: no OpenAI fallback, and a missing or
  //             masked ANTHROPIC_API_KEY is an error, never a silent switch.
  //   timeoutMs aborts the vendor call after this long (no timeout when unset).
  //   cache     sends the system prompt as one block marked cache_control ephemeral.
  //   tools / toolChoice  passed to Anthropic as tools / tool_choice.
  provider: forcedProvider = null, timeoutMs = null, cache = false,
  tools = null, toolChoice = null
} = {}) {
  const mediaParts = Array.isArray(media) ? media.filter(Boolean) : [];
  if (forcedProvider && forcedProvider !== "anthropic") {
    return failedBeforeSend({ system, user, model, maxTokens, provider: String(forcedProvider) },
      `provider must be 'anthropic' when set (got ${JSON.stringify(forcedProvider)})`);
  }
  if (forcedProvider === "anthropic") {
    const key = env && env.ANTHROPIC_API_KEY;
    if (!key || isMasked(key)) {
      return failedBeforeSend({ system, user, model, maxTokens, provider: "anthropic" },
        "anthropic 401: ANTHROPIC_API_KEY is missing or masked, so nothing was sent");
    }
  }
  const provider = forcedProvider === "anthropic" ? "anthropic" : pickProvider(env, mediaParts);
  const request = {
    model: provider === "openai" ? openaiModelName(model, env) : model,
    system: String(system || ""),
    user: String(user || ""),
    max_tokens: maxTokens,
    media_count: mediaParts.length,
    provider: provider || null
  };

  if (!provider) {
    // Intended reply is unavailable without a key — still return a non-empty
    // shadow body so agent_shadow_log is inspectable (empty log = unverifiable).
    const inbound = String(user || "").slice(0, 280);
    return {
      mode: "shadow",
      text: `[SHADOW — no API key] Model was not called. Inbound: ${inbound || "(empty)"}`,
      raw: null,
      request,
      error: null,
      detail: "no live model key — shadow mode, no model call",
      usage: { input_tokens: 0, output_tokens: 0 }
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      mode: "shadow",
      text: null,
      raw: null,
      request,
      error: "fetch unavailable",
      detail: "no fetch implementation",
      usage: { input_tokens: 0, output_tokens: 0 }
    };
  }

  try {
    if (provider === "openai") {
      return await callOpenAI({ env, fetchImpl: withTimeout(fetchImpl, timeoutMs), request, mediaParts });
    }
    return await callAnthropic({
      env, fetchImpl: withTimeout(fetchImpl, timeoutMs), request, mediaParts, cache, tools, toolChoice
    });
  } catch (err) {
    return {
      mode: "live",
      text: null,
      raw: null,
      request,
      // No status: the call never reached the vendor. classifyModelFailure
      // reads that as temporary, which is what a dropped socket is.
      status: null,
      error: String((err && err.message) || err).slice(0, 300),
      usage: { input_tokens: 0, output_tokens: 0 }
    };
  }
}

// An answer that is an error and was never sent. status 401 keeps
// classifyModelFailure from calling a missing key "temporary": waiting will not fix it.
function failedBeforeSend({ system, user, model, maxTokens, provider }, error) {
  return {
    mode: "live",
    text: null,
    raw: null,
    request: { model, system: String(system || ""), user: String(user || ""), max_tokens: maxTokens, media_count: 0, provider },
    status: provider === "anthropic" ? 401 : 400,
    error,
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

// Aborts the call after timeoutMs. The thrown error carries no status, so
// classifyModelFailure treats it as temporary (the call never got an answer).
function withTimeout(fetchImpl, timeoutMs) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return fetchImpl;
  return async (url, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) throw new Error(`model call timed out after ${ms} ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function callOpenAI({ env, fetchImpl, request, mediaParts }) {
  const key = openaiKeyOf(env);
  const userContent = buildOpenAIUserContent(request.user, mediaParts);
  const messages = [];
  if (request.system) messages.push({ role: "system", content: request.system });
  messages.push({ role: "user", content: userContent });

  const res = await fetchImpl(`${openaiBaseUrl(env)}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.max_tokens,
      messages
    })
  });

  const raw = await res.json().catch(() => null);
  const usage = usageOf(raw);
  if (!res.ok) {
    return {
      mode: "live",
      text: null,
      raw,
      request,
      // The status travels with the error. Reading "429" back out of a message
      // string works until the message changes; the number does not.
      status: res.status,
      error: `openai ${res.status}: ${JSON.stringify(raw).slice(0, 300)}`,
      usage
    };
  }

  const text = extractText(raw);
  return { mode: "live", text, raw, request, error: null, usage };
}

async function callAnthropic({ env, fetchImpl, request, mediaParts, cache = false, tools = null, toolChoice = null }) {
  const key = env.ANTHROPIC_API_KEY;
  const userContent = buildUserContent(request.user, mediaParts);
  const body = {
    model: request.model,
    max_tokens: request.max_tokens,
    system: cache && request.system
      ? [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }]
      : request.system,
    messages: [{ role: "user", content: userContent }]
  };
  if (Array.isArray(tools) && tools.length) body.tools = tools;
  if (toolChoice) body.tool_choice = typeof toolChoice === "string" ? { type: toolChoice } : toolChoice;
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  const raw = await res.json().catch(() => null);
  const usage = usageOf(raw);
  if (!res.ok) {
    return {
      mode: "live",
      text: null,
      raw,
      request,
      status: res.status,
      error: `anthropic ${res.status}: ${JSON.stringify(raw).slice(0, 300)}`,
      usage
    };
  }

  const text = extractText(raw);
  const toolCalls = Array.isArray(raw && raw.content)
    ? raw.content.filter((b) => b && b.type === "tool_use")
    : [];
  return { mode: "live", text, raw, request, error: null, usage, ...(toolCalls.length ? { toolCalls } : {}) };
}

function buildUserContent(userText, mediaParts = []) {
  if (!mediaParts.length) return String(userText || "");
  const parts = [];
  for (const m of mediaParts) {
    const data = m.dataBase64 || m.data;
    const mediaType = m.mediaType || m.media_type || "image/jpeg";
    if (!data) continue;
    if (m.type === "document" || mediaType === "application/pdf") {
      parts.push({ type: "document", source: { type: "base64", media_type: mediaType, data } });
    } else {
      parts.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    }
  }
  parts.push({ type: "text", text: String(userText || "") });
  return parts;
}

function buildOpenAIUserContent(userText, mediaParts = []) {
  if (!mediaParts.length) return String(userText || "");
  const parts = [];
  for (const m of mediaParts) {
    const data = m.dataBase64 || m.data;
    const mediaType = m.mediaType || m.media_type || "image/jpeg";
    if (!data) continue;
    if (m.type === "document" || mediaType === "application/pdf") continue;
    parts.push({
      type: "image_url",
      image_url: { url: `data:${mediaType};base64,${data}` }
    });
  }
  parts.push({ type: "text", text: String(userText || "") });
  return parts.length === 1 ? String(userText || "") : parts;
}

function extractText(raw) {
  if (!raw) return null;
  if (Array.isArray(raw.content)) {
    const parts = raw.content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text);
    const joined = parts.join("\n").trim();
    if (joined) return joined;
  }
  const choice = raw.choices && raw.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const parts = content
      .filter((b) => b && (b.type === "text" || typeof b.text === "string") && typeof b.text === "string")
      .map((b) => b.text);
    const joined = parts.join("\n").trim();
    if (joined) return joined;
  }
  return null;
}

function usageOf(raw) {
  const u = raw && raw.usage;
  const out = {
    input_tokens: Math.max(0, Number(u && (u.input_tokens || u.prompt_tokens)) || 0),
    output_tokens: Math.max(0, Number(u && (u.output_tokens || u.completion_tokens)) || 0)
  };
  // Prompt-cache counts, only when the vendor reports them (Anthropic does).
  if (u && (u.cache_read_input_tokens != null || u.cache_creation_input_tokens != null)) {
    out.cache_read_tokens = Math.max(0, Number(u.cache_read_input_tokens) || 0);
    out.cache_creation_tokens = Math.max(0, Number(u.cache_creation_input_tokens) || 0);
  }
  return out;
}

export default callModel;
