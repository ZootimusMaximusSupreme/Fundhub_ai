// Gate the abandon coupon on the first reply only.
// Hostile / brush-off → no coupon. A real answer → coupon templates.
// Tiny local check first; short model only when the leftover is ambiguous.

import { declinesRoadmap } from "./discount-197.mjs";
import { callModel, DEFAULT_OPENAI_MODEL } from "../agents/model.mjs";

const HOSTILE_RE = [
  /\bfuck\s*(off|you|yourself)\b/i,
  /\bgo\s+fuck\b/i,
  /\b(piss|bugger)\s+off\b/i,
  /\b(shut\s+up|get\s+lost|eat\s+shit)\b/i,
  /\b(asshole|bitch|bastard)\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\b(don'?t|do\s+not)\s+(text|message|contact|email|call|bother)\b/i,
  /\bstop\s+(texting|messaging|emailing|calling|contacting|bothering)\b/i,
  /\btake\s+me\s+off\b/i,
  /\blose\s+my\s+(number|email)\b/i,
  /\bnever\s+(text|contact|message|email|call)\b/i
];

/** One-word / low-effort brush-offs that are not a real answer. */
const LOW_EFFORT_RE =
  /^(k|kk|ok|okay|cool|whatever|sure|fine|idc|idgaf|lol|lmao|nah|nope|no|pass)\.?$/i;

const CONCERN_RE =
  /\b(price|cost|worried|concern|burned|trust|scam|afraid|scared|risk|how|what|why|money|pay|fee|expensive|cheap)\b/i;

/**
 * Pure local check. True when the reply is hostile, abusive, dismissive,
 * a decline, or a one-word brush-off — not a real answer about the offer.
 */
export function looksHostileOrBrushOff(body) {
  const text = String(body || "").trim();
  if (!text) return true;
  if (declinesRoadmap(text)) return true;
  if (LOW_EFFORT_RE.test(text)) return true;
  for (const re of HOSTILE_RE) {
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * True when this first reply earns the coupon templates.
 * Hostile / brush-off → false. Real answers → true.
 * Ambiguous short leftovers get one tiny model call (injectable).
 */
export async function earnsCoupon(body, {
  callModelFn = callModel,
  env = process.env
} = {}) {
  if (looksHostileOrBrushOff(body)) return false;

  const text = String(body || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (/\?/.test(text) || CONCERN_RE.test(text)) return true;

  const res = await callModelFn({
    system:
      "Reply with only BLOCK or ALLOW. BLOCK = hostile, abusive, dismissive, or brush-off. ALLOW = a real answer about their concerns or the offer.",
    user: text.slice(0, 280),
    env,
    model: DEFAULT_OPENAI_MODEL,
    maxTokens: 8
  });
  if (res.mode === "shadow" || !res.text) {
    // No model: short leftovers without concern words do not earn the coupon.
    return false;
  }
  return /^\s*ALLOW\b/i.test(String(res.text));
}
