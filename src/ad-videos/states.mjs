// src/ad-videos/states.mjs — the nineteen states a filmed take moves through,
// and which moves between them are legal.
//
// Pure. No database, no network, no clock. That is the point: every transition
// in the pipeline can be proved by a unit test that runs on a laptop with no
// Postgres.
//
// REBUILT 2026-10-05 for the marketing machine. Ground truth:
// docs/specs/marketing-machine-2026-10-04.md §9.1 "The state machine".
// db/migrations/416_ad_video_states_v2.sql carries the same nineteen names in
// ad_videos_status_ck, and STATES below is the list that must match it.
//
// THE ORDER CHANGED. The cut is now made from the script BEFORE Submagic sees
// the film (owner decision 10), and our animations go on LAST (owner decision
// 9). So the transcript comes from our own Whisper call, not from Submagic, and
// the old order (staged → editing → transcribed → matched) is gone:
//
//   raw_landed → prepared → transcribed → matched → cut → staged → editing
//     → rendered → animated → awaiting_approval → approved → delivered → loaded
//
// ═══════════════════════════════════════════════════════════════════════════
// TWO RULES WORTH KNOWING
//
// 1. FAILED IS REACHABLE FROM EVERY STATE A WORKER ACTS ON, and Retry goes back
//    to the state the take failed FROM (ad_videos.last_good_status), not to the
//    start. store.retryFailed() picks the state and clears only the marks from
//    that step on. That is why `failed` may move to any FAILABLE state here:
//    the machine allows the family, the row's own column picks the one.
//
// 2. REJECTED IS A DEAD END ON ITS OWN ROW. A re-film is a NEW ROW at the next
//    take number: one row is one take and is never renumbered (389's header).
//    store.nextTake() is that arrow, and transition() refuses the in-place move.

/* The nineteen, in pipeline order. This array IS the order the queue screen
   sorts by and the order a reader should think in — it is not alphabetical and
   must not be sorted. The four endings come last. */
export const STATES = Object.freeze([
  "scripted",
  "filming",
  "raw_landed",
  "prepared",
  "transcribed",
  "matched",
  "cut",
  "staged",
  "editing",
  "rendered",
  "animated",
  "awaiting_approval",
  "approved",
  "delivered",
  "loaded",
  "rejected",
  "failed",
  "merged",
  "superseded"
]);

const STATE_SET = new Set(STATES);

/* What each state means in plain words, and what fires the move INTO it. The
   queue screen renders `meaning`; nothing reads `firedBy` but a person, which
   is exactly what it is for. */
export const STATE_MEANING = Object.freeze({
  scripted:          { meaning: "words exist, ad number assigned", firedBy: "the script row gets an ad number" },
  filming:           { meaning: "script is in the teleprompter",   firedBy: "pushed or pasted" },
  raw_landed:        { meaning: "a video showed up in SLO Ads",    firedBy: "the Drive poll sees a new video file, size above zero" },
  prepared:          { meaning: "the worker has the sound and the pauses", firedBy: "the video worker probes the take and pulls its audio" },
  transcribed:       { meaning: "we have the words",               firedBy: "the transcript comes back with word times" },
  matched:           { meaning: "we know which ad and which take", firedBy: "the match names a script" },
  cut:               { meaning: "the cut plan is made",            firedBy: "the aligner lines the takes up against the script" },
  staged:            { meaning: "the cut master is saved, ready for captions", firedBy: "the worker builds the master with no animations" },
  editing:           { meaning: "Submagic has it",                 firedBy: "Create Project returns a project id" },
  rendered:          { meaning: "captions are on",                 firedBy: "Submagic's export comes back" },
  animated:          { meaning: "animations are on and the final file exists", firedBy: "the worker lays the animations on last and finalizes" },
  awaiting_approval: { meaning: "waiting on Chris",                firedBy: "the approval link is minted and the buzz goes out" },
  approved:          { meaning: "Chris said yes",                  firedBy: "Chris. Only a person may do this." },
  delivered:         { meaning: "the file is in the finished-ads folder", firedBy: "the upload finishes" },
  loaded:            { meaning: "a paused ad is in Meta",          firedBy: "Load all approved" },
  rejected:          { meaning: "Chris said no — the script goes back to Shoot Day", firedBy: "Chris" },
  failed:            { meaning: "a step broke, reason stored",     firedBy: "any worker error" },
  merged:            { meaning: "this take was folded into its ad's master", firedBy: "a later take of an ad that already has a master" },
  superseded:        { meaning: "a newer cut of this ad was approved", firedBy: "Chris approves a recut" }
});

/* The states a worker acts on, and can therefore break in. Must equal the keys
   of NEXT_STEP in src/ad-videos/pipeline.mjs (seam.test.mjs checks it). */
export const WORKING_STATES = Object.freeze([
  "raw_landed", "prepared", "transcribed", "matched", "cut", "staged",
  "editing", "rendered", "animated", "approved"
]);

/* Every state a take may fail from — and so every state Retry may return it to
   (failed → last_good_status). Migration 416's ad_videos_last_good_status_ck
   holds the same list. */
export const FAILABLE_STATES = Object.freeze(
  STATES.filter((s) => s === "scripted" || s === "filming" || s === "awaiting_approval" ||
    WORKING_STATES.includes(s))
);

/* Nothing leaves these. `rejected` is the end of THIS take — the re-film is a
   new row (rule 2). `merged` lives on inside its master. `superseded` was
   replaced by a newer approved cut. `loaded` is not here: it still moves to
   superseded, but only inside a recut approval. */
export const TERMINAL_STATES = Object.freeze(["rejected", "merged", "superseded"]);

/* Only a person may cause these moves. A worker that tries one is a bug worth
   failing loudly on: approving Chris's own unwatched video automatically is the
   one failure nobody would notice until the ad was running. `superseded` only
   ever happens inside his approval of a recut. */
export const HUMAN_ONLY = Object.freeze(["approved", "rejected", "superseded"]);

/* TRANSITIONS — from → the states it may move to. Spec §9.1:

   forward    raw_landed → prepared → transcribed → matched → cut → staged →
              editing → rendered → animated → awaiting_approval → approved →
              delivered → loaded
   merged     matched → merged (a later take of an ad that already has a master)
   failed     every FAILABLE state → failed; failed → last_good_status (Retry)
   late take  staged, editing, rendered, animated, awaiting_approval → cut
   rematch    cut → transcribed (coverage under 50%)
   re-film    cut → rejected
   recut      approved, delivered, loaded → superseded
   edits      awaiting_approval → cut (strike or restore a line)
              awaiting_approval → editing (caption word)
              awaiting_approval → rendered (animation) */
const F = "failed";
export const TRANSITIONS = Object.freeze({
  scripted:          Object.freeze(["filming", F]),
  filming:           Object.freeze(["raw_landed", F]),
  raw_landed:        Object.freeze(["prepared", F]),
  prepared:          Object.freeze(["transcribed", F]),
  transcribed:       Object.freeze(["matched", F]),
  matched:           Object.freeze(["cut", "merged", F]),
  cut:               Object.freeze(["staged", "transcribed", "rejected", F]),
  staged:            Object.freeze(["editing", "cut", F]),
  editing:           Object.freeze(["rendered", "cut", F]),
  rendered:          Object.freeze(["animated", "cut", F]),
  animated:          Object.freeze(["awaiting_approval", "cut", F]),
  awaiting_approval: Object.freeze(["approved", "rejected", "cut", "editing", "rendered", F]),
  approved:          Object.freeze(["delivered", "superseded", F]),
  delivered:         Object.freeze(["loaded", "superseded"]),
  loaded:            Object.freeze(["superseded"]),
  failed:            FAILABLE_STATES,
  rejected:          Object.freeze([]),
  merged:            Object.freeze([]),
  superseded:        Object.freeze([])
});

export function isState(value) {
  return STATE_SET.has(value);
}

export function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

export function isHumanOnly(state) {
  return HUMAN_ONLY.includes(state);
}

/** Every state reachable from `from`, in one move. Unknown state → []. */
export function nextStates(from) {
  return TRANSITIONS[from] ? [...TRANSITIONS[from]] : [];
}

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

/* AdVideoStateError — thrown by transition(). Carries `code` so a caller can
   tell "you asked for a state that does not exist" from "that move is not
   allowed from here" without matching on a message string. Messages get
   rewritten; codes do not. */
export class AdVideoStateError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "AdVideoStateError";
    this.code = code;
    Object.assign(this, detail);
  }
}

/**
 * transition(from, to, opts) → to
 *
 * Refuses an illegal move by throwing. It never returns a "no" that a caller
 * could forget to check, because the one thing this function exists to stop is
 * a row being written into a state it cannot legally be in.
 *
 * opts.by — "worker" (the default) or "human". A worker may not cause a move
 * into a HUMAN_ONLY state.
 */
export function transition(from, to, { by = "worker" } = {}) {
  if (!isState(from)) {
    throw new AdVideoStateError("unknown_state",
      `"${from}" is not a state — expected one of ${STATES.join(", ")}`, { from, to });
  }
  if (!isState(to)) {
    throw new AdVideoStateError("unknown_state",
      `"${to}" is not a state — expected one of ${STATES.join(", ")}`, { from, to });
  }
  if (from === to) {
    // Not an error a caller should paper over. A worker re-running its own step
    // should read the row, see it is already there, and stop — not write the
    // same state again and have the row's updated_at say something happened.
    throw new AdVideoStateError("already_there",
      `already ${to}; a repeated step should stop, not rewrite the row`, { from, to });
  }
  if (!canTransition(from, to)) {
    const allowed = nextStates(from);
    throw new AdVideoStateError("illegal_transition",
      allowed.length
        ? `cannot go ${from} → ${to}; from ${from} the only moves are ${allowed.join(", ")}`
        : `cannot go ${from} → ${to}; ${from} is the end of the line for this take` +
          (from === "rejected" ? " — a re-film is a new row at the next take number" : ""),
      { from, to, allowed });
  }
  if (isHumanOnly(to) && by !== "human") {
    throw new AdVideoStateError("human_only",
      `only a person may move a take to ${to}`, { from, to, by });
  }
  return to;
}

export default transition;
