// Animations, always last (spec 9.4). Pure planning: which clip goes where, and
// when. No network, no database, no clock, no Remotion, no ffmpeg.
//
// The order never changes: cut -> Submagic captions -> animation overlays ->
// finalize (law: .claude/rules/animations-last.md). Everything here runs on the
// Submagic export, never on the master Submagic sees.
//
// TWO THINGS THIS FILE DOES NOT IMPORT, ON PURPOSE.
//   - anchorTime() from align.mjs (9.2, PR #32). The caller passes it in as
//     `resolveAnchor`: (anchor) => { time, found } | null. The worker wires it as
//     `(a) => anchorTime(cutPlan, a)`. Null means the anchor's line was cut.
//   - the catalog (marketing/broll/catalog.json, 7.3). The caller passes it in.
//     Either an array of entries or an object keyed by id; each entry needs
//     { id, minFrames, maxFrames }. `dataTied: true` is honored when present.
//
// Output items are the `animation_items` column (9.1) plus `skipped` and
// `flags`, which the approval screen shows.

export const FPS = 30;

/** Full-frame mode limits (spec 9.4). */
export const FULLFRAME = Object.freeze({
  leadInSeconds: 3,       // no clips in the first 3 s
  minFaceGapSeconds: 4,   // at least 4 s of Chris's face between clips
  maxClipSeconds: 3,      // at most 3 s per clip...
  maxShare: 0.35,         // ...and at most 35% of the runtime
});

/** Longer clips for two template families (spec 9.4 and the kit rules). */
export const FAMILY_MAX_SECONDS = Object.freeze({ ProofWall: 4, ProofFlood: 6 });

/** An animation lands within 0.3 s of its anchor (spec 9.6, done-when 4). */
export const ANCHOR_TOLERANCE_SECONDS = 0.3;

/** Re-map anchors when the export differs from the master by more than this. */
export const RETIME_THRESHOLD_SECONDS = 0.1;

export const MODES = Object.freeze(["fullframe", "overlay"]);

const EPS = 1e-6;

/** Templates that read only their sample or approval files (laws:
    sample-clients-consistent, proof-cards-from-source). The writer sends them no
    data props, and we drop any that arrive. Spec 7.3, last bullet. */
const DATA_TIED_EXACT = Object.freeze(["QualifyToday", "LettersWritten", "ProofWall"]);
const DATA_TIED_PREFIX = Object.freeze(["ApprovalCarousel", "ProofFlood"]);

export function isDataTied(id, entry) {
  if (entry && entry.dataTied === true) return true;
  const name = String(id || "");
  return DATA_TIED_EXACT.includes(name) || DATA_TIED_PREFIX.some((p) => name.startsWith(p));
}

/** Accept the catalog as an array of entries or an object keyed by id. */
export function catalogIndex(catalog) {
  const map = new Map();
  const entries = Array.isArray(catalog)
    ? catalog
    : Object.entries(catalog || {}).map(([id, e]) => ({ id, ...(e || {}) }));
  for (const e of entries) {
    if (e && typeof e.id === "string" && e.id) map.set(e.id, e);
  }
  return map;
}

const snap = (seconds) => Math.round(seconds * FPS) / FPS;

function familyMaxSeconds(id) {
  for (const [family, secs] of Object.entries(FAMILY_MAX_SECONDS)) {
    if (String(id).startsWith(family)) return secs;
  }
  return FULLFRAME.maxClipSeconds;
}

/** The shortest and longest a template may run, in seconds. */
export function secondsRange(id, entry, mode) {
  const minFrames = Number.isFinite(entry?.minFrames) ? entry.minFrames : 60;
  const maxFrames = Number.isFinite(entry?.maxFrames) ? entry.maxFrames : 90;
  let max = maxFrames / FPS;
  if (mode === "fullframe") max = Math.min(max, familyMaxSeconds(id));
  return { min: minFrames / FPS, max: Math.max(max, minFrames / FPS) };
}

function clampSeconds(requested, range) {
  const want = Number.isFinite(Number(requested)) && Number(requested) > 0 ? Number(requested) : range.min;
  return snap(Math.min(range.max, Math.max(range.min, want)));
}

/** The words an anchor listens for, kept so a re-map can find it again. */
function matchTextOf(anchor) {
  if (!anchor || typeof anchor !== "object") return "";
  if (anchor.phrase !== undefined && anchor.phrase !== null) return String(anchor.phrase);
  if (anchor.keyword) return String(anchor.keyword);
  return "";
}

/**
 * resolveAnimations — turn the writer's `animation_plan[]` into candidates with
 * a time in the cut. Does not apply any layout limit; placeCandidates does.
 *
 *   animationPlan  [{ anchor, template, props, seconds }]   (spec 7.6)
 *   resolveAnchor  (anchor) => { time, found } | null       (null = line was cut)
 *   catalog        see catalogIndex
 *   mode           'fullframe' | 'overlay'
 *
 * Returns { candidates, skipped }. `skipped` rows are { index, template, reason }
 * with reason 'unknown_template' | 'line_cut' | 'bad_anchor'.
 */
export function resolveAnimations({ animationPlan, resolveAnchor, catalog, mode = "fullframe" }) {
  if (!MODES.includes(mode)) throw new RangeError(`animation mode must be one of ${MODES.join(", ")}`);
  if (typeof resolveAnchor !== "function") throw new TypeError("resolveAnchor must be a function");
  const index = catalogIndex(catalog);
  const candidates = [];
  const skipped = [];
  (Array.isArray(animationPlan) ? animationPlan : []).forEach((item, i) => {
    const template = String(item?.template || "");
    const entry = index.get(template);
    if (!entry) { skipped.push({ index: i, template, reason: "unknown_template" }); return; }
    const hit = resolveAnchor(item?.anchor || {});
    if (hit === null || hit === undefined) { skipped.push({ index: i, template, reason: "line_cut" }); return; }
    const time = Number(hit.time);
    if (!Number.isFinite(time) || time < 0) { skipped.push({ index: i, template, reason: "bad_anchor" }); return; }
    const range = secondsRange(template, entry, mode);
    const dataTied = isDataTied(template, entry);
    const props = dataTied ? {} : (item?.props && typeof item.props === "object" ? { ...item.props } : {});
    candidates.push({
      index: i,
      template,
      props,
      anchor: item?.anchor || {},
      match_text: matchTextOf(item?.anchor),
      anchor_found: hit.found !== false,
      cut_time: time,
      seconds: clampSeconds(item?.seconds, range),
    });
  });
  return { candidates, skipped };
}

/**
 * placeCandidates — fix each candidate's start and length against the mode's
 * limits. Candidates that cannot be placed within 0.3 s of their anchor are
 * skipped and flagged, never moved far.
 *
 *   fullframe: nothing in the first 3 s or on the CTA line, 4 s of face between
 *   clips, and no more than 35% of the runtime. An item is nudged LATER by up to
 *   0.3 s to clear the lead-in or the face gap, and SHORTENED (not moved) to stop
 *   at the CTA or the end. If the 35% cap bites, the item latest in the writer's
 *   list goes first.
 *   overlay: see-through clips may sit over Chris, so only overlap and the end
 *   of the video limit them.
 *
 * ctaStartSeconds is where the CTA line starts, in the same timeline as the
 * candidates (the worker reads it off the cut plan). Null means unknown: the
 * CTA rule cannot run and the result carries the flag 'cta_unknown'.
 */
export function placeCandidates({ candidates, catalog, masterSeconds, ctaStartSeconds = null, mode = "fullframe" }) {
  if (!MODES.includes(mode)) throw new RangeError(`animation mode must be one of ${MODES.join(", ")}`);
  const length = Number(masterSeconds);
  if (!Number.isFinite(length) || length <= 0) throw new RangeError("masterSeconds must be a positive number");
  const index = catalogIndex(catalog);
  const full = mode === "fullframe";
  const cta = Number.isFinite(Number(ctaStartSeconds)) && ctaStartSeconds !== null ? Number(ctaStartSeconds) : null;
  const gap = full ? FULLFRAME.minFaceGapSeconds : 0;

  const placed = [];
  const skipped = [];
  const ordered = [...(candidates || [])].sort((a, b) => a.cut_time - b.cut_time || a.index - b.index);

  for (const c of ordered) {
    const entry = index.get(c.template);
    const range = secondsRange(c.template, entry, mode);
    const skip = (reason) => skipped.push({ index: c.index, template: c.template, reason });
    let start = snap(c.cut_time);
    const limit = c.cut_time + ANCHOR_TOLERANCE_SECONDS + EPS;

    if (full && start < FULLFRAME.leadInSeconds - EPS) {
      start = FULLFRAME.leadInSeconds;
      if (start > limit) { skip("lead_in"); continue; }
    }
    const prev = placed[placed.length - 1];
    if (prev && start < prev.end + gap - EPS) {
      start = snap(Math.ceil((prev.end + gap) * FPS - EPS) / FPS);
      if (start > limit) { skip(full ? "too_close" : "overlap"); continue; }
    }

    let end = start + c.seconds;
    const wall = full && cta !== null ? Math.min(cta, length) : length;
    if (full && cta !== null && start >= cta - EPS) { skip("cta"); continue; }
    if (end > wall + EPS) {
      const fit = Math.floor((wall - start) * FPS + EPS) / FPS;
      if (fit + EPS < range.min) { skip(full && cta !== null && cta <= length ? "cta" : "past_end"); continue; }
      end = start + fit;
    }
    placed.push({
      ...c,
      start: snap(start),
      end: snap(end),
      seconds: snap(end) - snap(start),
      frames: Math.round((snap(end) - snap(start)) * FPS),
    });
  }

  if (full) {
    const cap = FULLFRAME.maxShare * length;
    const total = () => placed.reduce((s, p) => s + p.seconds, 0);
    while (placed.length && total() > cap + EPS) {
      if (placed.length === 1) {
        const only = placed[0];
        const range = secondsRange(only.template, index.get(only.template), mode);
        const fit = Math.floor(cap * FPS + EPS) / FPS;
        if (fit + EPS >= range.min) {
          only.seconds = fit; only.end = snap(only.start + fit); only.frames = Math.round(fit * FPS);
          break;
        }
        skipped.push({ index: only.index, template: only.template, reason: "over_share" });
        placed.pop();
        break;
      }
      let worst = 0;
      placed.forEach((p, i) => { if (p.index > placed[worst].index) worst = i; });
      const [drop] = placed.splice(worst, 1);
      skipped.push({ index: drop.index, template: drop.template, reason: "over_share" });
    }
  }

  skipped.sort((a, b) => a.index - b.index);
  const flags = [];
  if (!placed.length) flags.push("no_animation");   // spec: every ad gets at least one
  if (full && cta === null) flags.push("cta_unknown");
  return { items: placed, skipped, flags };
}

/** One call for the normal case: resolve against the cut, then place. */
export function planAnimations({ animationPlan, resolveAnchor, catalog, masterSeconds, ctaStartSeconds = null, mode = "fullframe" }) {
  const resolved = resolveAnimations({ animationPlan, resolveAnchor, catalog, mode });
  const placed = placeCandidates({ candidates: resolved.candidates, catalog, masterSeconds, ctaStartSeconds, mode });
  const skipped = [...resolved.skipped, ...placed.skipped].sort((a, b) => a.index - b.index);
  const flags = [...placed.flags];
  if (resolved.skipped.some((s) => s.reason === "line_cut")) flags.push("anchor_cut");
  return { mode, items: placed.items, skipped, flags };
}

/* ── Re-mapping against Submagic's own words ─────────────────────────────── */

function tokensOf(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Submagic words[] as a stream of { token, start }, one entry per spoken token.
    Accepts start/end or startTime/endTime and word/text, like broll.mjs. */
export function tokenStream(words) {
  const out = [];
  for (const w of Array.isArray(words) ? words : []) {
    const text = typeof w === "string" ? w : (w?.word ?? w?.text ?? "");
    const start = Number(w?.startTime ?? w?.start);
    if (!Number.isFinite(start)) continue;
    for (const token of tokensOf(text)) out.push({ token, start });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Every start time where `phrase` is heard in the stream. */
function occurrences(stream, phrase) {
  const want = tokensOf(phrase);
  if (!want.length) return [];
  const hits = [];
  for (let i = 0; i + want.length <= stream.length; i += 1) {
    let ok = true;
    for (let k = 0; k < want.length; k += 1) {
      if (stream[i + k].token !== want[k]) { ok = false; break; }
    }
    if (ok) hits.push(stream[i].start);
  }
  return hits;
}

/**
 * retimeAnimations — spec 9.4 "Timing". Submagic leaves the timing alone, so the
 * anchors from the cut plan normally hold. If the export's length differs from
 * the master's by more than 0.1 s, find each anchor's words in Submagic's words
 * and place again on the export's timeline.
 *
 * Each item looks for its `match_text` and takes the occurrence closest to its
 * old time. An item whose words are not found keeps its old time and is flagged
 * 'retime_unmatched' (numbers spoken as words can differ from the script's
 * digits; this function does not translate them).
 *
 * Returns { items, skipped, flags, remapped }.
 */
export function retimeAnimations({ items, words, masterSeconds, exportSeconds, catalog, ctaStartSeconds = null, mode = "fullframe" }) {
  const master = Number(masterSeconds);
  const exported = Number(exportSeconds);
  if (!Number.isFinite(master) || !Number.isFinite(exported) || exported <= 0) {
    throw new RangeError("masterSeconds and exportSeconds must be positive numbers");
  }
  if (Math.abs(exported - master) <= RETIME_THRESHOLD_SECONDS + EPS) {
    return { items: [...(items || [])], skipped: [], flags: [], remapped: false };
  }
  const stream = tokenStream(words);
  const flags = ["retimed"];
  const candidates = (items || []).map((it) => {
    const hits = it.match_text ? occurrences(stream, it.match_text) : [];
    let time = it.cut_time;
    if (hits.length) {
      time = hits.reduce((best, h) => (Math.abs(h - it.cut_time) < Math.abs(best - it.cut_time) ? h : best), hits[0]);
    } else if (!flags.includes("retime_unmatched")) {
      flags.push("retime_unmatched");
    }
    const { start, end, frames, ...rest } = it;
    return { ...rest, cut_time: time };
  });
  const placed = placeCandidates({ candidates, catalog, masterSeconds: exported, ctaStartSeconds, mode });
  return { items: placed.items, skipped: placed.skipped, flags: [...flags, ...placed.flags], remapped: true };
}

/** The largest gap between an item's start and its anchor, in seconds. The
    approval check is that this stays within ANCHOR_TOLERANCE_SECONDS. */
export function worstAnchorDrift(items) {
  return (items || []).reduce((m, it) => Math.max(m, Math.abs(it.start - it.cut_time)), 0);
}
