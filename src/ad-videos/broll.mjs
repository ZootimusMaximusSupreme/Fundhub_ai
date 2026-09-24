// Where OUR clips go, and when.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS AT ALL — TWO REASONS, BOTH MEASURED IN THE RESEARCH.
//
// 1. AI B-roll costs 3 credits a clip and the plan carries 15 credits a MONTH.
//    That is five clips for a hundred ads. Our own clips cost nothing.
// 2. Reviewers report the automatic footage is often unrelated to the words.
//    An ad that shows a stock handshake while Chris says "approval email" is
//    worse than an ad with no B-roll at all.
//
// So the pipeline never asks for ai-broll — src/messaging/providers/submagic.mjs
// refuses the type outright — and this module decides the placements instead.
// ═══════════════════════════════════════════════════════════════════════════
//
// THE TIMES COME FROM SUBMAGIC'S OWN words[], AND THAT IS THE WHOLE TRICK.
// The API research could not confirm whether item times are measured on the
// original upload or on the shortened timeline after auto-cutting. Rather than
// guess, the pipeline creates the project with autoRender off, reads the real
// per-word timings back, and places against those. The question stops mattering.
// (Belt and braces: the project is also created with silence-cutting and
// bad-take removal off, so the timeline never shortens in the first place.)
//
// PURE. No network, no database, no clock. Same words in, same placements out —
// which is what makes a re-run safe: the sweeper can compute this twice and get
// the same answer, so a retry cannot shuffle the B-roll.

/** The three folders under `broll/` in the SLO Ads Drive folder. Kept in step
    with scripts/slo-broll-upload.mjs, which is what put them there.

    THE ORDER IS THE PRIORITY ORDER AND IT MATTERS. planBroll walks the clips in
    the order it is handed them and the cursor only moves forward, so the first
    clip that matches a word wins that moment and everything after it is pushed
    later or dropped. Measured 2026-09-23: with `approvals` first, the 62
    approval pictures — which all carry the same words now that they are tagged
    "approve" — took the early slots and the roadmap, the credit report and the
    bank list never placed at all. AD 1 fell to 2 clips out of 5.

    So the specific documents Chris names out loud go first, the portal screens
    next, and the approval pictures fill whatever is left. */
export const BROLL_FOLDERS = Object.freeze(["deliverables", "portal", "approvals"]);

/** Vendor ceiling. Mirrors MAX_ITEM_SECONDS in the Submagic provider — repeated
    here so this module can be reasoned about on its own, and asserted equal in
    the tests so the two cannot drift. */
export const MAX_ITEM_SECONDS = 12;

/** How long a clip sits on screen unless the caller says otherwise. Short on
    purpose: the face is the ad, the clip is punctuation. */
export const DEFAULT_CLIP_SECONDS = 3;

/** Nothing covers the hook. The first seconds decide whether anyone watches. */
export const DEFAULT_LEAD_IN_SECONDS = 3;

/** Clear air between clips, so an ad does not turn into a slideshow. */
export const DEFAULT_MIN_GAP_SECONDS = 4;

/** A 1–2 minute ad. More than this and the talking head has disappeared. */
export const DEFAULT_MAX_CLIPS = 5;

/** The layout for a STILL. `cover` fills the frame — and it is the only kind
    of layout Submagic gives a picture (cover, contain, rounded, square all fill
    it), so a still hides Chris for the seconds it is up. Nothing to be done. */
export const DEFAULT_LAYOUT = "cover";

/** The layout for a VIDEO clip. The face is the ad; the clip is punctuation.
    `split-35-65` keeps Chris on screen with the clip beside him, which is the
    whole reason moving clips are offered before stills. Measured 2026-09-24 on
    the first real take: every clip was going out `cover`, so the face vanished
    four times in 67 seconds. */
export const VIDEO_LAYOUT = "split-35-65";

/** A moving clip sits beside the face; a picture has to fill the frame. */
export function layoutFor(clip, fallback = DEFAULT_LAYOUT) {
  const mime = String(clip?.mimeType || "");
  const name = String(clip?.name || "");
  const isVideo = mime.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(name);
  return isVideo ? VIDEO_LAYOUT : fallback;
}

const strip = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* keywordsFromName — a clip's file name IS its tagging.

   No second source of truth, no sidecar JSON, no database table to keep in
   step. `approval-email-chase-45k.mp4` means the words approval, email, chase
   and 45k. Renaming a clip in Drive re-tags it, which is the only editing
   interface Chris will ever actually use.

   Pure digits are dropped — a clip called `broll-01.mp4` should not fire on the
   word "one". */
export function keywordsFromName(name) {
  const base = String(name || "").replace(/\.[a-z0-9]+$/i, "");
  return [...new Set(
    strip(base).split(" ").filter((w) => w.length >= 3 && !/^\d+$/.test(w))
  )];
}

/* normaliseWords — Submagic words[] in the one shape the rest of this file uses.

   Accepts start/end or startTime/endTime, because the research names the field
   both ways in different places and a silent undefined would place every clip
   at zero. A word with no usable times is dropped rather than defaulted. */
export function normaliseWords(words = []) {
  const out = [];
  for (const w of Array.isArray(words) ? words : []) {
    const text = typeof w === "string" ? w : (w?.word ?? w?.text ?? "");
    const start = Number(w?.startTime ?? w?.start);
    const end = Number(w?.endTime ?? w?.end);
    if (!String(text).trim()) continue;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    out.push({ text: strip(text), start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* findHit — the earliest moment at or after `from` where a clip's subject is
   actually being talked about.

   Multi-word keywords are matched across consecutive words ("funding round"),
   so a two-word tag in a file name is not silently dead. */
function findHit(words, keywords, from) {
  for (let i = 0; i < words.length; i += 1) {
    if (words[i].start < from) continue;
    for (const kw of keywords) {
      const parts = strip(kw).split(" ").filter(Boolean);
      if (!parts.length) continue;
      let ok = true;
      for (let p = 0; p < parts.length; p += 1) {
        if (words[i + p]?.text !== parts[p]) { ok = false; break; }
      }
      if (ok) return { index: i, word: words[i], keyword: kw };
    }
  }
  return null;
}

/**
 * planBroll({ words, clips, ... }) → { placements, skipped, reason }
 *
 * clips: [{ id, name, userMediaId?, url?, category?, keywords?, seconds? }]
 *        `keywords` wins when it is given; otherwise the file name is the tag
 *        list. `userMediaId` is Submagic's id for the clip once it has been
 *        uploaded to the project — a clip without one cannot be placed and is
 *        reported in `skipped`, never quietly dropped.
 *
 * placements are already sorted, non-overlapping, inside the clip-length limit,
 * and ready for buildItems() in the Submagic provider, which validates them
 * again before anything is sent. Two checks rather than one, because a bad
 * placement costs a re-export and export is capped at 50 an hour.
 *
 * NEVER THROWS. An empty plan is a valid answer: an ad with no B-roll is an ad.
 */
export function planBroll({
  words = [],
  clips = [],
  clipSeconds = DEFAULT_CLIP_SECONDS,
  leadInSeconds = DEFAULT_LEAD_IN_SECONDS,
  minGapSeconds = DEFAULT_MIN_GAP_SECONDS,
  maxClips = DEFAULT_MAX_CLIPS,
  layout = DEFAULT_LAYOUT
} = {}) {
  const w = normaliseWords(words);
  const placements = [];
  const skipped = [];

  if (!w.length) return { placements, skipped, reason: "no word timings — nothing can be placed" };

  const lastEnd = w[w.length - 1].end;
  let cursor = Math.max(0, Number(leadInSeconds) || 0);

  for (const clip of Array.isArray(clips) ? clips : []) {
    if (placements.length >= maxClips) {
      skipped.push({ clip: clip?.name || clip?.id, why: `already placed ${maxClips} clips` });
      continue;
    }
    if (!clip?.userMediaId) {
      skipped.push({ clip: clip?.name || clip?.id, why: "not uploaded to the project yet (no userMediaId)" });
      continue;
    }

    const keywords = (Array.isArray(clip.keywords) && clip.keywords.length)
      ? clip.keywords
      : keywordsFromName(clip.name);
    if (!keywords.length) {
      skipped.push({ clip: clip.name || clip.id, why: "the file name carries no words to match on" });
      continue;
    }

    const hit = findHit(w, keywords, cursor);
    if (!hit) {
      skipped.push({ clip: clip.name || clip.id, why: "nothing in the take is about this clip" });
      continue;
    }

    const wanted = Math.min(Number(clip.seconds) || Number(clipSeconds) || DEFAULT_CLIP_SECONDS, MAX_ITEM_SECONDS);
    const startTime = hit.word.start;
    const endTime = Math.min(startTime + wanted, lastEnd);

    /* A clip with no room left at the end of the take is dropped, not squeezed.
       Submagic refuses endTime <= startTime, and a refused update costs the
       whole project a re-export. */
    if (endTime <= startTime) {
      skipped.push({ clip: clip.name || clip.id, why: "the take ends before this clip could run" });
      continue;
    }

    placements.push({
      type: "user-media",
      startTime,
      endTime,
      userMediaId: String(clip.userMediaId),
      layout: layoutFor(clip, layout),
      clipName: clip.name || null,
      matchedWord: hit.word.text,
      matchedKeyword: hit.keyword
    });

    cursor = endTime + (Number(minGapSeconds) || 0);
  }

  return {
    placements,
    skipped,
    reason: placements.length ? null : "no clip matched anything said in this take"
  };
}

export default planBroll;
