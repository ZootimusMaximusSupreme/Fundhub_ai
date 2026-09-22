// The ad video state machine. Pure — no database, no network, no clock beyond
// what a caller hands in.
//
// WHY IT IS A SEPARATE FILE. docs/video-pipeline-plan.md §2 lists thirteen
// states and what fires each move. That list is the product, and it was about
// to exist in three places at once: the migration's CHECK constraint, the
// worker that moves a row forward, and the approval door that ends it. Three
// copies of a thirteen-state list drift within a week. This is the one copy the
// JavaScript side reads, and db/migrations/390_ad_video_decision_tokens.sql
// pins the same names on the database side.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ONE RULE THIS FILE EXISTS TO ENFORCE
//
// `approved` and `rejected` may ONLY be reached from `awaiting_approval`, and
// only by a person. Every other transition in the table is a worker moving a
// row along a conveyor belt; these two are Chris deciding. The plan says so in
// bold — "Chris. Only a person may do this." — and a state machine that let a
// worker write `approved` would make that sentence false without anyone
// noticing, because nothing downstream re-checks it. Paul would simply receive
// a video nobody watched.
//
// So decisionTransition() below is deliberately NOT a general-purpose
// transition function with the decision states passed in. It takes a decision
// word and nothing else, and it refuses every `from` state but one.

/** Every state a take can be in. Order is the order it travels in, with the
    three endings last. Same names as the plan's table and as the database's
    CHECK constraint. */
export const AD_VIDEO_STATES = Object.freeze([
  "scripted",
  "filming",
  "raw_landed",
  "staged",
  "transcribed",
  "matched",
  "editing",
  "rendered",
  "awaiting_approval",
  "approved",
  "delivered",
  "rejected",
  "failed"
]);

const STATE_SET = new Set(AD_VIDEO_STATES);

/** The only state a person may decide from. Named once, used everywhere. */
export const DECIDABLE_STATE = "awaiting_approval";

/** The two words the approval door accepts, and the state each one lands on.
    `approve`/`reject` are what a caller sends; `approved`/`rejected` are what
    the row stores. Keeping them different is not fussiness — it is what stops a
    caller posting `decision=delivered` and having it written straight through. */
export const DECISIONS = Object.freeze({
  approve: "approved",
  reject: "rejected"
});

/** States from which nothing further happens on its own. */
export const TERMINAL_STATES = Object.freeze(["delivered", "rejected"]);

/* The conveyor belt. Worker moves only — the two decision moves are NOT in
   here, on purpose, so that a caller reaching for canTransition() cannot find a
   way to write `approved`. See the header. */
const WORKER_TRANSITIONS = Object.freeze({
  scripted: ["filming", "failed"],
  filming: ["raw_landed", "failed"],
  raw_landed: ["staged", "failed"],
  staged: ["transcribed", "failed"],
  transcribed: ["matched", "failed"],
  matched: ["editing", "failed"],
  editing: ["rendered", "failed"],
  rendered: ["awaiting_approval", "failed"],
  // A take waiting on Chris may still break (the finished file vanishes), but
  // no worker may decide it.
  awaiting_approval: ["failed"],
  // Approved is the worker's cue to deliver. This is the handoff the approval
  // door creates and src/workflows picks up.
  approved: ["delivered", "failed"],
  delivered: [],
  // A rejected take is re-filmed as a NEW take row, never revived in place —
  // the plan's §4 naming depends on take numbers never being reused.
  rejected: [],
  // The plan's diagram retries a broken step from `staged`.
  failed: ["staged", "failed"]
});

/** isAdVideoState(s) → boolean. */
export function isAdVideoState(s) {
  return STATE_SET.has(String(s ?? ""));
}

/**
 * canTransition(from, to) → boolean — for WORKERS only.
 *
 * Always false for `approved` and `rejected`: those are decisionTransition()'s,
 * and a worker asking this question must get "no". See the header.
 */
export function canTransition(from, to) {
  const f = String(from ?? "");
  const t = String(to ?? "");
  if (!STATE_SET.has(f) || !STATE_SET.has(t)) return false;
  return (WORKER_TRANSITIONS[f] || []).includes(t);
}

/** normaliseDecision(raw) → "approve" | "reject" | null. Case and padding are
    forgiven; anything else is refused rather than guessed at. */
export function normaliseDecision(raw) {
  const d = String(raw ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DECISIONS, d) ? d : null;
}

/**
 * decisionTransition(fromStatus, decision) → { ok, next } | { ok:false, reason }
 *
 * The whole of the person-only half of the machine.
 *
 * `reason` is for the server log and for tests. It is NOT what the door answers
 * a caller with — api/public/ad-video-decision.mjs collapses every refusal to
 * one word, the way api/public/vsl-watch.mjs does, so that a stranger holding a
 * guessed token cannot learn whether it named a real video.
 */
export function decisionTransition(fromStatus, decision) {
  const d = normaliseDecision(decision);
  if (!d) return { ok: false, reason: "not a decision word" };

  const from = String(fromStatus ?? "");
  if (!STATE_SET.has(from)) return { ok: false, reason: "unknown state" };

  if (from !== DECIDABLE_STATE) {
    /* Already decided, or not yet ready. Both are refusals and the caller is
       told neither of them apart. Naming the state here is safe: it goes to the
       log, never to the wire. */
    return { ok: false, reason: `a take in "${from}" is not waiting on a decision` };
  }

  return { ok: true, next: DECISIONS[d] };
}

/** True when this state means "a person still has to look at it". */
export function isAwaitingPerson(status) {
  return String(status ?? "") === DECIDABLE_STATE;
}

export default {
  AD_VIDEO_STATES,
  DECIDABLE_STATE,
  DECISIONS,
  TERMINAL_STATES,
  isAdVideoState,
  canTransition,
  normaliseDecision,
  decisionTransition,
  isAwaitingPerson
};
