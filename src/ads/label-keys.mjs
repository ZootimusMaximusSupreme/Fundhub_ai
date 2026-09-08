// src/ads/label-keys.mjs — one place that decides what a label key looks like.
//
// WHY THIS FILE EXISTS, IN THE MIGRATION'S OWN WORDS. 377's header (Part 3,
// "THE COST, WRITTEN DOWN RATHER THAN HIDDEN") says the database CHECK forces
// one SHAPE, not one SPELLING: nothing at the engine stops 'denial_angle' and
// 'denialangle' both existing and splitting one angle's numbers across two
// groups. The agreed mitigation is normalising on write, in JavaScript, in ONE
// place. This is that place.
//
// A SECOND COPY OF THIS RULE IS THE BUG IT PREVENTS. If the writer normalises
// one way and the checker another, the two disagree quietly and the split this
// module exists to stop happens anyway. So every writer and every checker
// imports from here rather than inlining a .replace() chain.
//
// THIS IS NOT AN ALLOW-LIST AND MUST NEVER BECOME ONE. The owner rule of
// 2026-09-06 forbids making naming a blocker: a brand-new angle nobody has ever
// written down has to save the first time it is typed. So there is no list of
// known angles here, and nothing in this file can refuse a value for being
// unfamiliar. It only fixes the SPELLING of whatever it is handed.
//
// LANE IS THE ONE EXCEPTION, AND IT IS NOT AN EXCEPTION TO THAT RULE. lane is a
// typed column (ad_lane, from 286:62), so an unknown lane is not "new
// vocabulary" — it is a value the database will reject with an error nobody can
// read. LANES is imported from ./registry.mjs rather than re-typed here, because
// a hand-copied second list of the five lanes is exactly the drift this file is
// about.

import { LANES } from "./registry.mjs";

/* The shape the database enforces, copied verbatim from 377's four label CHECKs
   (ad_scripts_type_ck, _angle_ck, _hook_ck, _offer_ck) and ad_labels_key_ck.
   Lower case, digits and underscores, starting with a letter, 2 to 49
   characters. Kept identical on purpose: this regex existing so a caller gets a
   plain refusal instead of a Postgres constraint error is only worth anything
   while the two agree. */
export const LABEL_KEY_RE = /^[a-z][a-z0-9_]{1,48}$/;

/* normaliseLabelKey — free text in, one settled key out. NULL survives as null.

   "Denial Angle", "denial-angle", "  DENIAL_ANGLE  " and "Denial — Angle" all
   come out as denial_angle. Anything that is not a letter or a digit becomes a
   single underscore, so spaces, dashes, apostrophes and punctuation all collapse
   the same way instead of each needing its own rule.

   NULL MEANS UNKNOWN AND MUST SURVIVE (CLAUDE.md §12). null, undefined, "" and
   "   " all return null — never "" and never a placeholder. An unlabelled script
   is a normal script nobody has sorted yet, not a broken one. */
export function normaliseLabelKey(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || null;
}

/* isLabelKey — would the database accept this exact string?

   Normalising cannot always produce a legal key and it does not pretend to.
   "3 second hook" normalises to "3_second_hook", which the CHECK refuses because
   a key must start with a letter, and a single letter is too short. The writer
   asks this question after normalising so the caller gets a sentence explaining
   the shape rather than a constraint violation out of Postgres. */
export function isLabelKey(value) {
  return typeof value === "string" && LABEL_KEY_RE.test(value);
}

/* friendlyName — the display name a key gets when nobody has written one.

   denial_angle → "Denial Angle". Underscores back to spaces, first letter of
   each word capitalised. It is a starting point for the dictionary, never an
   overwrite: a name a human typed always wins, and the writer's upsert only
   fills a name that is NULL. */
export function friendlyName(key) {
  const k = normaliseLabelKey(key);
  if (!k) return null;
  return k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* normaliseLane — trim and lower case only.

   Deliberately NOT run through normaliseLabelKey: the lane values are
   funding600, premium, sorting, uwiq and wl, none of which contains a separator,
   and pushing them through the underscore rule would only create a way for them
   to come out different from the enum members they have to match exactly. */
export function normaliseLane(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  return s || null;
}

/* isLane — is this one of the five real lanes?

   'unknown' is a member of the ad_lane type and is NOT accepted here, and that
   is deliberate. 377's comment on ad_scripts.lane says NULL means "this script
   is not lane-specific" while 'unknown' on client_ad_attribution means "a value
   arrived on the wire and it was garbage". A person typing a lane into a form is
   neither of those, so a lane we do not recognise is refused rather than stored
   as 'unknown'. */
export function isLane(value) {
  return LANES.includes(value);
}

export default normaliseLabelKey;
