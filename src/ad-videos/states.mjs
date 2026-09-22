// src/ad-videos/states.mjs — the thirteen states a filmed take moves through,
// and which moves between them are legal.
//
// Pure. No database, no network, no clock. That is the point: every transition
// in the pipeline can be proved by a unit test that runs on a laptop with no
// Postgres, which is the only kind of proof available here today.
//
// Ground truth: docs/video-pipeline-plan.md §2 (the state table) and §5 (the
// diagram). db/migrations/389_ad_videos.sql carries the same thirteen names in
// ad_videos_status_ck, and STATES below is the list that must match it.
//
// ═══════════════════════════════════════════════════════════════════════════
// TWO PLACES THIS DELIBERATELY DIFFERS FROM THE PLAN'S DIAGRAM, AND WHY
//
// Both are recorded here rather than quietly reconciled (CLAUDE.md §4: a gap
// between intended and actual is a finding).
//
// 1. FAILED IS REACHABLE FROM EVERY WORKING STATE, not only from `transcribed`
//    and `editing` as the diagram draws it. The plan's own state TABLE says
//    what fires `failed`: "any worker error". Six states have a worker acting
//    on them and any of the six can throw. Drawing only two arrows would mean a
//    Drive copy that dies has nowhere legal to go, and the row would either sit
//    in `staged` forever or be forced into a state the machine refuses.
//
// 2. REJECTED IS A DEAD END ON ITS OWN ROW. The diagram draws rejected → filming
//    ("re-film as the next take"). That arrow is real, but it is a NEW ROW at
//    take_no + 1, not this row moving backwards: 389's header and the plan's §2
//    both say one row is one take and is never overwritten. Moving the same row
//    back to `filming` would have to renumber take_no, which is the one thing
//    the table forbids. So nextTake() in store.mjs is that arrow, and
//    transition() refuses the in-place move.

/* The thirteen, in pipeline order. This array IS the order the queue screen
   sorts by and the order a reader should think in — it is not alphabetical and
   must not be sorted. */
export const STATES = Object.freeze([
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

const STATE_SET = new Set(STATES);

/* What each state means in plain words, and what fires the move INTO it.
   Straight from the plan's table. The queue screen renders `meaning`; nothing
   reads `firedBy` but a person, which is exactly what it is for. */
export const STATE_MEANING = Object.freeze({
  scripted:          { meaning: "words exist, ad number assigned", firedBy: "the script row gets an ad number" },
  filming:           { meaning: "script is in the teleprompter",   firedBy: "pushed or pasted" },
  raw_landed:        { meaning: "a video showed up in Raw",        firedBy: "the Drive poll sees a new video file, size above zero" },
  staged:            { meaning: "copied to our storage, link ready", firedBy: "the copy finishes" },
  transcribed:       { meaning: "we have the words",               firedBy: "the transcript comes back" },
  matched:           { meaning: "we know which ad and which take", firedBy: "Claude matches above the confidence line" },
  editing:           { meaning: "Submagic has it",                 firedBy: "Create Project returns a project id" },
  rendered:          { meaning: "the finished file exists",        firedBy: "the Submagic webhook says done" },
  awaiting_approval: { meaning: "waiting on Chris",                firedBy: "we saved the finished file" },
  approved:          { meaning: "Chris said yes",                  firedBy: "Chris. Only a person may do this." },
  delivered:         { meaning: "video and brief are in Paul's folder", firedBy: "both uploads finish" },
  rejected:          { meaning: "Chris said no — re-film as the next take", firedBy: "Chris" },
  failed:            { meaning: "a step broke, reason stored",     firedBy: "any worker error" }
});

/* The states a worker is acting on, and can therefore break in. Every one of
   these may move to `failed`. See note 1 in the header. */
export const WORKING_STATES = Object.freeze([
  "raw_landed", "staged", "transcribed", "matched", "editing", "rendered"
]);

/* Nothing leaves these. `delivered` is the end of the line. `rejected` is the
   end of THIS take — the re-film is a new row (note 2). */
export const TERMINAL_STATES = Object.freeze(["delivered", "rejected"]);

/* Only a person may cause these moves. A worker that tries one is a bug worth
   failing loudly on, not a step to allow "just in case": the whole pipeline
   exists so that Chris touches exactly two things, and approving his own
   unwatched video automatically would be the one failure nobody would notice
   until Paul had already run it. */
export const HUMAN_ONLY = Object.freeze(["approved", "rejected"]);

/* TRANSITIONS — from → the states it may move to.

   Read it as the plan's diagram. The `failed` entry on each working state is
   note 1; the absence of `rejected → filming` is note 2. */
export const TRANSITIONS = Object.freeze({
  scripted:          Object.freeze(["filming", "failed"]),
  filming:           Object.freeze(["raw_landed", "failed"]),
  raw_landed:        Object.freeze(["staged", "failed"]),
  staged:            Object.freeze(["transcribed", "failed"]),
  transcribed:       Object.freeze(["matched", "failed"]),
  matched:           Object.freeze(["editing", "failed"]),
  editing:           Object.freeze(["rendered", "failed"]),
  rendered:          Object.freeze(["awaiting_approval", "failed"]),
  awaiting_approval: Object.freeze(["approved", "rejected", "failed"]),
  approved:          Object.freeze(["delivered", "failed"]),
  // "retry the broken step" in the diagram. Back to `staged`, because that is
  // the first step whose input (the raw file in Drive) still exists after any
  // later step died — re-staging is cheap and every step after it is derived.
  failed:            Object.freeze(["staged"]),
  delivered:         Object.freeze([]),
  rejected:          Object.freeze([])
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
 * into `approved` or `rejected`; see HUMAN_ONLY.
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
