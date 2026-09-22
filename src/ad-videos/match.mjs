// Which script is this take?
//
// The ad number is the spine of the whole pipeline — the file name, Paul's
// folder, and `utm_content` on the landing link all come from it — and the only
// place it can be recovered from a filmed take is the words Chris said. The
// phone names the file something like `VID_20260923_101455.mp4`, which tells
// nobody anything.
//
// SO THIS IS A READING TASK, NOT A SEARCH. A take is a spoken performance of a
// written script: stumbles, restarts, a dropped clause, an ad-libbed line. Exact
// text matching fails on all four. A language model reads both and says which
// one it is, the same way a person would.
//
// IT CALLS src/agents/model.mjs AND NEVER fetch. That module is already the one
// allowed place a model question leaves the building
// (src/lib/no-unfenced-transmit.test.mjs), it already classifies a dead key from
// an empty wallet, and duplicating it here would be a second thing to keep right.
//
// ANTHROPIC, DELIBERATELY. callModel() prefers OpenAI when OPENAI_API_KEY is
// set. The owner's decision for this pipeline is Claude, so the env handed down
// carries ANTHROPIC_API_KEY and nothing else. The key is read by NAME and its
// value never leaves this function.
//
// ═══════════════════════════════════════════════════════════════════════════
// A LOW-CONFIDENCE MATCH IS NOT A MATCH.
//
// Guessing costs a whole ad: the wrong number goes on the file, Paul uploads it
// against the wrong creative, and the results for two ads mix. So below the
// floor the answer is "I do not know", the row stops, and a person looks. That
// is the cheap failure. CLAUDE.md: never invent — if information is missing,
// that absence is the finding.
// ═══════════════════════════════════════════════════════════════════════════

import { callModel } from "../agents/model.mjs";

/** Below this, the take is not matched and nothing downstream runs. 0–100. */
export const MATCH_CONFIDENCE_FLOOR = 80;

/** How much of a script the model is shown. A whole ad script is short; the cap
    is here so a pathological row cannot blow the request up. */
export const MAX_SCRIPT_CHARS = 4000;
export const MAX_TRANSCRIPT_CHARS = 8000;

/** How many candidate scripts are offered at once. More than this and the model
    is skimming rather than reading. */
export const MAX_CANDIDATES = 25;

const SYSTEM = [
  "You match a filmed take to the written script it was read from.",
  "The take is a spoken performance: stumbles, restarts, dropped words and small",
  "ad-libs are normal and are NOT evidence against a match. Meaning and running",
  "order are the evidence.",
  "",
  "Answer with one JSON object and nothing else:",
  '{"scriptId": "<id or null>", "confidence": <0-100>, "reason": "<one short sentence>"}',
  "",
  "confidence is how sure you are that this take is that script.",
  "If two scripts are close, or none of them fits, return scriptId null and a low",
  "confidence. Never pick the nearest one to be helpful."
].join("\n");

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** transcriptText — Submagic's words[] (or plain text) as one readable line. */
export function transcriptText(input) {
  if (typeof input === "string") return clip(input, MAX_TRANSCRIPT_CHARS);
  if (Array.isArray(input)) {
    return clip(input.map((w) => (typeof w === "string" ? w : w?.word ?? w?.text ?? "")).join(" "), MAX_TRANSCRIPT_CHARS);
  }
  return "";
}

/* readVerdict — pull the JSON object out of whatever the model said.

   Defensive on purpose. A model that wraps its answer in a code fence, or adds
   a sentence before it, is ordinary; treating that as a failure would stall a
   row for a formatting habit. A model that says something with no JSON in it at
   all is a real failure and is reported as one. */
export function readVerdict(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "the model returned no JSON object" };
  let parsed;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); }
  catch { return { ok: false, error: "the model's JSON could not be read" }; }

  const scriptId = parsed?.scriptId === null || parsed?.scriptId === undefined
    ? null
    : String(parsed.scriptId).trim() || null;
  const confidence = Number(parsed?.confidence);
  return {
    ok: true,
    scriptId,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
    reason: clip(parsed?.reason, 200)
  };
}

/**
 * matchTakeToScript({ transcript, candidates, env, fetchImpl, floor })
 *
 * candidates: [{ id, adId, title?, body }] — the locked scripts that have an ad
 * number and no finished video yet. The caller does that filtering; this
 * function only reads.
 *
 * → {
 *     ok:          true when a candidate cleared the floor
 *     scriptId:    the winner, or null
 *     adId:        that candidate's ad number, or null
 *     confidence:  0–100
 *     reason:      one sentence, for the row and for a person reading it later
 *     retryable:   true when the model could not be reached (try again later)
 *   }
 *
 * NEVER THROWS.
 */
export async function matchTakeToScript({
  transcript, candidates = [], env = process.env, fetchImpl, floor = MATCH_CONFIDENCE_FLOOR
} = {}) {
  const words = transcriptText(transcript);
  if (!words) {
    return { ok: false, retryable: false, scriptId: null, adId: null, confidence: 0,
      reason: "there is no transcript to read" };
  }

  const list = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && c.id)
    .slice(0, MAX_CANDIDATES);
  if (!list.length) {
    return { ok: false, retryable: false, scriptId: null, adId: null, confidence: 0,
      reason: "no scripts were offered to match against" };
  }

  const user = [
    "THE TAKE (what was said):",
    words,
    "",
    "THE SCRIPTS:",
    ...list.map((c, i) => [
      `--- script ${i + 1} ---`,
      `scriptId: ${c.id}`,
      c.title ? `title: ${clip(c.title, 160)}` : null,
      clip(c.body ?? c.text, MAX_SCRIPT_CHARS)
    ].filter(Boolean).join("\n"))
  ].join("\n");

  /* ANTHROPIC ONLY. callModel picks OpenAI first when it sees that key, and the
     owner's decision for this pipeline is Claude. Narrowing the env is how that
     is said without editing a shared module. */
  const res = await callModel({
    system: SYSTEM,
    user,
    env: { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
    fetchImpl,
    maxTokens: 300
  });

  if (res.mode === "shadow") {
    /* No key, so no call was made. Retryable: the take is fine and the match
       should happen once a key is set. The row waits rather than guessing. */
    return { ok: false, retryable: true, scriptId: null, adId: null, confidence: 0,
      reason: "ANTHROPIC_API_KEY is not set, so no match was attempted" };
  }
  if (res.error) {
    return { ok: false, retryable: true, scriptId: null, adId: null, confidence: 0,
      reason: String(res.error).slice(0, 200) };
  }

  const verdict = readVerdict(res.text);
  if (!verdict.ok) {
    return { ok: false, retryable: true, scriptId: null, adId: null, confidence: 0, reason: verdict.error };
  }

  const picked = verdict.scriptId ? list.find((c) => String(c.id) === verdict.scriptId) : null;
  if (!picked) {
    return { ok: false, retryable: false, scriptId: null, adId: null,
      confidence: verdict.confidence,
      reason: verdict.reason || "the model matched no script" };
  }
  if (verdict.confidence < floor) {
    return { ok: false, retryable: false, scriptId: null, adId: null,
      confidence: verdict.confidence,
      reason: `closest was ${picked.id} at ${verdict.confidence}, under the ${floor} floor — a person has to look` };
  }

  const adId = picked.adId === undefined || picked.adId === null ? null : String(picked.adId);
  return {
    ok: true, retryable: false,
    scriptId: String(picked.id),
    adId,
    confidence: verdict.confidence,
    reason: verdict.reason || "matched"
  };
}

export default matchTakeToScript;
