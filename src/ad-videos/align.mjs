// The aligner — spec §9.2 (docs/specs/marketing-machine-2026-10-04.md).
//
// It reads the script and the timed words of every take of one ad, and says
// which stretches of which takes make the cut, in script order. That list is
// the cut plan. The encodes (§9.3) turn it into the master.
//
// PURE CODE. No AI, no database, no network, no clock. The same script and the
// same takes always give the same plan, to the millisecond. Chris wants tokens
// spent only where they pay (spec §2 item 10), and a cut is a matching problem
// that plain code does well.
//
// What the cut must do is owner law, `.claude/rules/ad-video-best-of-clips.md`:
// the best take of every line once, in script order, with dead air, repeats,
// false starts and filler taken out. The numbers below are the spec's.
//
// HOW TO CALL IT
//
//   const plan = alignTakes({
//     script: { body, parts, style },        // ad_scripts.body / .parts / .style
//     takes: [{ id, recorded_at, words, silences, duration_seconds }],
//     struck: [3]                           // line indexes Chris struck (§9.6)
//   });
//   const verdict = judgeCut(plan);         // build | hold | rematch (§9.1 step 7)
//
// `words` is a take's `transcript_words` ({word|text, start|startTime,
// end|endTime} in seconds). `silences` is the take's silencedetect output
// ({start, end} in seconds); without it, the edges are not snapped.

export const ALIGNER_VERSION = 1;

export const ALIGN_DEFAULTS = Object.freeze({
  // Matching. Words of 5+ letters match at an edit similarity of 0.8.
  fuzzyMinLength: 5,
  fuzzyMin: 0.8,
  // A gap this long between two matched words ends an attempt.
  attemptBreakSeconds: 3.0,
  // Pick one attempt per line.
  qualifyCoverage: 0.9,
  maxStallSeconds: 1.0,
  switchCost: 0.15,
  // Stitch restarts.
  stitchWithinSeconds: 8,
  // Edges and gaps.
  leadSeconds: 0.04,
  tailSeconds: 0.08,
  snapSeconds: 0.25,
  gapSeconds: 0.25,
  plannedPauseSeconds: 0.45,
  // Dead air inside a kept stretch longer than this is cut down to a normal gap.
  maxInnerGapSeconds: 0.6,
  // Fillers.
  umSilenceSeconds: 0.15,
  likeSilenceSeconds: 0.25,
  // Lines said differently.
  saidDifferentlyBelow: 0.85,
  saidDifferentlyFactor: 2,
  secondsPerWord: 0.4,
  // Under this, a line's best attempt is not good enough to keep: it is missing.
  minLineCoverage: 0.5,
  // Bullets style: freestyle restarts.
  restartMinWords: 4,
  restartSilenceSeconds: 0.4,
  restartWithinSeconds: 6,
  // judgeCut (§9.1 step 7).
  holdBelow: 0.7,
  rematchBelow: 0.5
});

/* ─────────────────────────────────────────────────────────────────────────
   NORMALIZE BOTH SIDES TO SPOKEN WORDS
   ───────────────────────────────────────────────────────────────────────── */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALE_WORDS = ["thousand", "million", "billion", "trillion"];
const SCALES = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
const NUMBER_WORDS = new Set([...ONES, ...TENS.filter(Boolean), "hundred", ...SCALE_WORDS, "point"]);
const MULTIPLIER_WORDS = new Set(["hundred", ...SCALE_WORDS]);
const SUFFIX = { k: "thousand", m: "million", mm: "million", b: "billion", bn: "billion" };

function under1000(n) {
  const out = [];
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)], "hundred"); n %= 100; }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) out.push(ONES[n]); }
  else if (n > 0) out.push(ONES[n]);
  return out;
}

/** An integer as spoken words, as an array: 300000 → ["three","hundred","thousand"]. */
export function numberToWords(n) {
  n = Math.floor(Math.abs(Number(n)));
  if (!Number.isFinite(n)) return [];
  if (n === 0) return ["zero"];
  const out = [];
  for (const [size, word] of SCALES) {
    if (n >= size) { out.push(...numberToWords(Math.floor(n / size)), word); n %= size; }
  }
  if (n) out.push(...under1000(n));
  return out;
}

const ORDINAL_IRREGULAR = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function ordinal(words) {
  const last = words[words.length - 1];
  let o = ORDINAL_IRREGULAR[last];
  if (!o) o = last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`;
  return [...words.slice(0, -1), o];
}

const IS_PRONOUN_S = new Set([
  "it", "that", "there", "here", "what", "who", "he", "she", "where", "how", "when", "why",
  "everything", "nothing", "something", "someone", "everyone", "this"
]);
const CONTRACTION_WHOLE = {
  "won't": "will not", "can't": "can not", "cannot": "can not", "shan't": "shall not",
  "ain't": "is not", "let's": "let us", "y'all": "you all"
};

function expandContraction(w) {
  if (CONTRACTION_WHOLE[w]) return CONTRACTION_WHOLE[w];
  let m;
  if ((m = w.match(/^(.+)n't$/))) return `${m[1]} not`;
  if ((m = w.match(/^(.+)'re$/))) return `${m[1]} are`;
  if ((m = w.match(/^(.+)'ve$/))) return `${m[1]} have`;
  if ((m = w.match(/^(.+)'ll$/))) return `${m[1]} will`;
  if ((m = w.match(/^(.+)'m$/))) return `${m[1]} am`;
  if ((m = w.match(/^(.+)'d$/))) return `${m[1]} would`;
  if ((m = w.match(/^(.+)'s$/)) && IS_PRONOUN_S.has(m[1])) return `${m[1]} is`;
  return w;
}

const NUMBER_RE = /^(\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(k|mm|m|bn|b)?(%)?$/;

function numberTokens(m) {
  const [, , intPart, dec, suffix, pct] = m;
  const out = numberToWords(Number(intPart.replace(/,/g, "")));
  if (dec) out.push("point", ...dec.split("").map((d) => ONES[Number(d)]));
  if (suffix) out.push(SUFFIX[suffix]);
  if (pct) out.push("percent");
  return out;
}

function tokenizeOne(raw) {
  // Keep a leading $ and a trailing %; strip every other edge mark.
  const core = raw.replace(/^[^a-z0-9$]+/, "").replace(/[^a-z0-9%]+$/, "");
  if (!core) return [];
  let m;
  if ((m = core.match(NUMBER_RE))) return numberTokens(m);
  if ((m = core.match(/^(\d+)(st|nd|rd|th)$/))) return ordinal(numberToWords(Number(m[1])));
  if ((m = core.match(/^\$?(\d+)([a-z]+)$/))) return [...numberToWords(Number(m[1])), m[2]];
  const expanded = expandContraction(core);
  return expanded
    .replace(/'/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((t) => (/^\d+$/.test(t) ? numberToWords(Number(t)) : [t]));
}

/* The number context rules, run over the token list:
   "a" counts as "one" before hundred/thousand/million; "grand" and "k" after a
   number mean thousand; "dollars" after a number is optional, so it is dropped
   on both sides; "per cent" is "percent". */
function numberContext(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const prev = out[out.length - 1];
    const prevIsNumber = prev !== undefined && NUMBER_WORDS.has(prev);
    if (t === "a" && MULTIPLIER_WORDS.has(tokens[i + 1])) { out.push("one"); continue; }
    if (t === "a" && tokens[i + 1] === "grand") { out.push("one"); continue; }
    if ((t === "grand" || t === "k") && prevIsNumber) { out.push("thousand"); continue; }
    if ((t === "dollars" || t === "dollar" || t === "bucks") && prevIsNumber) continue;
    if (t === "per" && tokens[i + 1] === "cent") { out.push("percent"); i += 1; continue; }
    out.push(t);
  }
  return out;
}

/** Text → spoken-word tokens. Both the script and the transcript go through this. */
export function normalizeText(text) {
  const s = String(text ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/↑/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/&/g, " and ");
  const tokens = s.split(/\s+/).filter(Boolean).flatMap(tokenizeOne);
  return numberContext(tokens);
}

function editSimilarity(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Two normalized words match: equal, or both 5+ letters at edit similarity ≥ 0.8. */
export function wordsMatch(a, b, opts = ALIGN_DEFAULTS) {
  if (a === b) return true;
  if (a.length < opts.fuzzyMinLength || b.length < opts.fuzzyMinLength) return false;
  return editSimilarity(a, b) >= opts.fuzzyMin;
}

/* ─────────────────────────────────────────────────────────────────────────
   THE SCRIPT, AS LINES
   ───────────────────────────────────────────────────────────────────────── */

/** Parts said word for word. In the bullets style a `cue` is freestyled. */
const WORD_FOR_WORD = new Set(["hook", "line2", "body", "reveal", "cta"]);

function sentences(text) {
  return String(text)
    .split(/\n/)
    .flatMap((ln) => ln.split(/(?<=[.!?])\s+(?=\S)/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Is this line followed by a blank line in the body? That is a planned pause.
   Found by walking the body with a cursor, so a repeated sentence is located at
   its own place, not at its first copy. */
function locatePauses(body, lines) {
  const text = String(body || "");
  let cursor = 0;
  for (const line of lines) {
    const at = text.indexOf(line.text, cursor);
    if (at < 0) continue;
    cursor = at + line.text.length;
    if (/^[ \t]*\r?\n[ \t]*\r?\n/.test(text.slice(cursor))) line.pause_after = true;
  }
}

/**
 * Split the script into lines using `parts` (spec §7.4: [{kind, text}]).
 * A word-for-word part is split into its sentences, because rule 39 writes the
 * teleprompter as paragraphs; a cue stays one line. With no parts, the body's
 * paragraphs are taken as `body` parts.
 */
export function scriptLines(script = {}) {
  const style = script.style === "bullets" ? "bullets" : "words";
  let parts = Array.isArray(script.parts) && script.parts.length ? script.parts : null;
  if (!parts) {
    parts = String(script.body || "")
      .split(/\n[ \t]*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((text) => ({ kind: "body", text, pause_after: true }));
  }
  const lines = [];
  parts.forEach((part, partIndex) => {
    const kind = String(part?.kind || "body");
    const freestyle = style === "bullets" && kind === "cue";
    const pieces = freestyle ? [String(part?.text || "").trim()] : sentences(part?.text || "");
    pieces.forEach((text, k) => {
      const tokens = normalizeText(text);
      if (!tokens.length) return;
      lines.push({
        index: lines.length,
        part_index: partIndex,
        kind,
        text,
        tokens,
        freestyle,
        pause_after: k === pieces.length - 1 && part?.pause_after === true
      });
    });
  });
  locatePauses(script.body, lines);
  if (lines.length) lines[lines.length - 1].pause_after = false;
  return { style, lines };
}

/* ─────────────────────────────────────────────────────────────────────────
   THE TAKES, AS TIMED TOKENS
   ───────────────────────────────────────────────────────────────────────── */

function readWords(words) {
  const out = [];
  for (const w of Array.isArray(words) ? words : []) {
    const text = typeof w === "string" ? w : (w?.word ?? w?.text ?? "");
    const start = Number(w?.start ?? w?.startTime);
    const end = Number(w?.end ?? w?.endTime);
    if (!String(text).trim()) continue;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    out.push({ word: String(text).trim(), start, end });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

function readSilences(silences) {
  const out = [];
  for (const s of Array.isArray(silences) ? silences : []) {
    const start = Number(Array.isArray(s) ? s[0] : (s?.start ?? s?.silence_start));
    const end = Number(Array.isArray(s) ? s[1] : (s?.end ?? s?.silence_end));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* One transcript word can be several spoken tokens ("$300,000" is three). The
   word's time is shared out evenly, so a gap inside one word is zero. */
function takeTokens(words) {
  const toks = [];
  words.forEach((w, wi) => {
    const parts = normalizeText(w.word);
    const step = (w.end - w.start) / (parts.length || 1);
    parts.forEach((text, k) => {
      toks.push({ text, start: w.start + step * k, end: w.start + step * (k + 1), word_index: wi, word: w.word });
    });
  });
  return toks;
}

function prepareTakes(takes) {
  return (Array.isArray(takes) ? takes : [])
    .map((t, inputIndex) => ({ t, inputIndex }))
    .sort((a, b) => {
      const ra = Date.parse(a.t?.recorded_at ?? "");
      const rb = Date.parse(b.t?.recorded_at ?? "");
      const ka = Number.isFinite(ra) ? ra : Infinity;
      const kb = Number.isFinite(rb) ? rb : Infinity;
      return ka - kb || a.inputIndex - b.inputIndex;
    })
    .map(({ t, inputIndex }, order) => {
      const duration = Number(t?.duration_seconds ?? t?.duration);
      return {
        id: t?.id ?? `take-${inputIndex}`,
        order,
        toks: takeTokens(readWords(t?.words ?? t?.transcript_words)),
        silences: readSilences(t?.silences),
        duration: Number.isFinite(duration) && duration > 0 ? duration : null
      };
    });
}

/* ─────────────────────────────────────────────────────────────────────────
   ATTEMPTS: every try at every line in every take
   ───────────────────────────────────────────────────────────────────────── */

function makeAttempt(take, pairs, n) {
  pairs.sort((a, b) => a[0] - b[0]);
  const toks = take.toks;
  let stall = 0;
  for (let i = 1; i < pairs.length; i += 1) {
    stall = Math.max(stall, toks[pairs[i][1]].start - toks[pairs[i - 1][1]].end);
  }
  const first = pairs[0][1], last = pairs[pairs.length - 1][1];
  return {
    take: take.order,
    pairs,
    segments: [[first, last]],
    firstK: pairs[0][0],
    lastK: pairs[pairs.length - 1][0],
    start: toks[first].start,
    end: toks[last].end,
    coverage: pairs.length / n,
    stall
  };
}

function extendForward(take, line, i, j, opts) {
  const toks = take.toks, n = line.length;
  const m = (t, k) => t < toks.length && k < n && wordsMatch(toks[t].text, line[k], opts);
  const pairs = [[j, i]];
  let t = i + 1, k = j + 1;
  while (k < n && t < toks.length) {
    const lastEnd = toks[pairs[pairs.length - 1][1]].end;
    if (toks[t].start - lastEnd > opts.attemptBreakSeconds) break;
    if (m(t, k)) { pairs.push([k, t]); t += 1; k += 1; continue; }
    // He went back over words he had already said: a restart. End this try
    // here; stitch() joins it to the next one at the restart point.
    if ([1, 2, 3].some((back) => k - back >= j && wordsMatch(toks[t].text, line[k - back], opts))) break;
    if (m(t + 1, k)) { t += 1; continue; }                       // one extra word said
    if (m(t, k + 1)) { k += 1; continue; }                       // one script word dropped
    if (m(t + 1, k + 1)) { t += 1; k += 1; continue; }           // one word heard wrong
    if (m(t + 2, k)) { t += 2; continue; }                       // two extra words said
    if (m(t, k + 2)) { k += 2; continue; }                       // two script words dropped
    break;
  }
  return pairs;
}

function extendBackward(take, line, i, j, floor, opts) {
  const toks = take.toks;
  const m = (t, k) => t > floor && t >= 0 && k >= 0 && wordsMatch(toks[t].text, line[k], opts);
  const pairs = [];
  let t = i - 1, k = j - 1;
  while (k >= 0 && t > floor) {
    if (toks[t + 1].start - toks[t].end > opts.attemptBreakSeconds) break;
    if (m(t, k)) { pairs.push([k, t]); t -= 1; k -= 1; continue; }
    if (m(t - 1, k)) { t -= 1; continue; }
    if (m(t, k - 1)) { k -= 1; continue; }
    break;
  }
  return pairs;
}

/** Every attempt at one line (normalized tokens) in one take, in time order. */
export function findAttempts(take, line, opts = ALIGN_DEFAULTS) {
  const toks = take.toks, n = line.length;
  const out = [];
  if (!n) return out;
  const m = (t, k) => t < toks.length && wordsMatch(toks[t].text, line[k], opts);
  let coveredUntil = -1;
  for (let i = 0; i < toks.length; i += 1) {
    if (i <= coveredUntil) continue;
    let best = null;
    for (let j = 0; j < n; j += 1) {
      if (!m(i, j)) continue;
      // A seed is two words in a row, unless the line is one word long.
      if (n > 1 && !(j + 1 < n && m(i + 1, j + 1))) continue;
      const pairs = [...extendBackward(take, line, i, j, coveredUntil, opts), ...extendForward(take, line, i, j, opts)];
      if (!best || pairs.length > best.length) best = pairs;
    }
    if (!best) continue;
    const attempt = makeAttempt(take, best, n);
    out.push(attempt);
    coveredUntil = attempt.segments[0][1];
  }
  return out;
}

/* Stitch restarts. A covers words a..k. A later B starts at word j, with
   j ≤ k+1, within 8 s of A's end. Join them at word j: A's words before j, then
   B. A's false-start tail is cut out. */
function stitch(take, attempts, n, opts) {
  const all = [...attempts];
  for (let bi = 0; bi < attempts.length; bi += 1) {
    const B = attempts[bi];
    const joined = [];
    for (const A of all) {
      if (A === B || A.end > B.start) continue;
      if (B.start - A.end > opts.stitchWithinSeconds) continue;
      const j = B.firstK;
      if (!(j > A.firstK && j <= A.lastK + 1 && B.lastK > A.lastK)) continue;
      const head = A.pairs.filter(([k]) => k < j);
      if (!head.length) continue;
      const headSegs = [];
      const headEnd = head[head.length - 1][1];
      for (const [s, e] of A.segments) {
        if (s > headEnd) break;
        headSegs.push([s, Math.min(e, headEnd)]);
      }
      const pairs = [...head, ...B.pairs];
      let stall = 0;
      for (const seg of [...headSegs, ...B.segments]) {
        const inSeg = pairs.filter(([, t]) => t >= seg[0] && t <= seg[1]);
        for (let i = 1; i < inSeg.length; i += 1) {
          stall = Math.max(stall, take.toks[inSeg[i][1]].start - take.toks[inSeg[i - 1][1]].end);
        }
      }
      joined.push({
        take: take.order,
        pairs,
        segments: [...headSegs, ...B.segments],
        firstK: A.firstK,
        lastK: B.lastK,
        start: A.start,
        end: B.end,
        coverage: pairs.length / n,
        stall,
        stitched: true
      });
    }
    all.push(...joined);
  }
  return all;
}

/* ─────────────────────────────────────────────────────────────────────────
   PICK ONE ATTEMPT PER LINE
   ───────────────────────────────────────────────────────────────────────── */

function overlaps(a, b) {
  return a.take === b.take && b.start < a.end && b.end > a.start;
}

/* The candidates: every attempt with 90%+ coverage and no stall over 1.0 s; if
   none qualifies, every attempt. Then a dynamic program over the lines, cost =
   (1 − coverage) + 0.15 per switch between takes. A tiny recency term makes the
   LATEST attempt win every tie, which is the spec's tie-break. */
function chooseAttempts(lineAttempts, opts) {
  const flat = lineAttempts.flat().sort((a, b) => a.take - b.take || a.start - b.start);
  flat.forEach((a, r) => { a.rank = r; });
  const maxRank = Math.max(1, flat.length - 1);
  const eps = 1e-4;

  const cands = lineAttempts.map((atts) => {
    const good = atts.filter((a) => a.coverage >= opts.qualifyCoverage && a.stall <= opts.maxStallSeconds);
    return good.length ? good : atts;
  });
  const order = cands.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
  const choice = new Array(lineAttempts.length).fill(null);
  if (!order.length) return choice;

  const own = (a) => (1 - a.coverage) + eps * (1 - a.rank / maxRank);
  let cost = cands[order[0]].map(own);
  const back = [];
  for (let s = 1; s < order.length; s += 1) {
    const prev = cands[order[s - 1]], cur = cands[order[s]];
    const next = [], ptr = [];
    for (const b of cur) {
      let best = Infinity, arg = 0;
      prev.forEach((a, ai) => {
        const step = (a.take !== b.take ? opts.switchCost : 0) + (overlaps(a, b) ? 10 : 0);
        const c = cost[ai] + step;
        if (c < best - 1e-12) { best = c; arg = ai; }
      });
      next.push(best + own(b));
      ptr.push(arg);
    }
    cost = next;
    back.push(ptr);
  }
  let arg = 0;
  cost.forEach((c, i) => { if (c < cost[arg] - 1e-12) arg = i; });
  for (let s = order.length - 1; s >= 0; s -= 1) {
    choice[order[s]] = cands[order[s]][arg];
    if (s > 0) arg = back[s - 1][arg];
  }
  return choice;
}

/* ─────────────────────────────────────────────────────────────────────────
   FILLERS, DEAD AIR, FREESTYLE RESTARTS
   ───────────────────────────────────────────────────────────────────────── */

const UM = new Set(["um", "umm", "ummm", "uh", "uhh", "uhm", "uhmm"]);

function gapBefore(toks, i) { return i > 0 ? toks[i].start - toks[i - 1].end : Infinity; }
function gapAfter(toks, i) { return i < toks.length - 1 ? toks[i + 1].start - toks[i].end : Infinity; }

/* Token indexes to drop: "um"/"uh" with 150 ms of silence on both sides, "like"
   and "you know" with 250 ms. A word the script itself says is never a filler. */
function fillerDrops(toks, indexes, scriptWords, opts) {
  const drop = new Set();
  const keep = new Set(indexes);
  for (const i of indexes) {
    if (scriptWords.has(i)) continue;
    const t = toks[i].text;
    if (UM.has(t) && gapBefore(toks, i) >= opts.umSilenceSeconds && gapAfter(toks, i) >= opts.umSilenceSeconds) drop.add(i);
    if (t === "like" && gapBefore(toks, i) >= opts.likeSilenceSeconds && gapAfter(toks, i) >= opts.likeSilenceSeconds) drop.add(i);
    if (t === "you" && keep.has(i + 1) && toks[i + 1].text === "know" && !scriptWords.has(i + 1) &&
        gapBefore(toks, i) >= opts.likeSilenceSeconds && gapAfter(toks, i + 1) >= opts.likeSilenceSeconds) {
      drop.add(i); drop.add(i + 1);
    }
  }
  return drop;
}

/* Bullets style. A restart is a run of 4+ words that repeats: its first copy
   ends in 400 ms of silence and it comes back within 6 s. Keep the last copy. */
function dropFreestyleRestarts(toks, indexes, opts) {
  let list = [...indexes];
  const L = opts.restartMinWords;
  const same = (a, b) => wordsMatch(toks[a].text, toks[b].text, opts);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i + L <= list.length; i += 1) {
      const runEnd = toks[list[i + L - 1]].end;
      for (let m = i + L; m + L <= list.length; m += 1) {
        if (toks[list[m]].start - runEnd > opts.restartWithinSeconds) break;
        let ok = true;
        for (let k = 0; k < L; k += 1) if (!same(list[i + k], list[m + k])) { ok = false; break; }
        if (!ok) continue;
        if (toks[list[m]].start - toks[list[m - 1]].end < opts.restartSilenceSeconds) continue;
        list = [...list.slice(0, i), ...list.slice(m)];
        changed = true;
        break outer;
      }
    }
  }
  return list;
}

/* Kept token indexes → runs. A run breaks wherever tokens were dropped, and
   wherever dead air inside the stretch runs past maxInnerGapSeconds. */
function toRuns(toks, indexes, opts) {
  const runs = [];
  for (const i of indexes) {
    const last = runs[runs.length - 1];
    if (last && i === last[last.length - 1] + 1 && toks[i].start - toks[i - 1].end <= opts.maxInnerGapSeconds) last.push(i);
    else runs.push([i]);
  }
  return runs;
}

/* ─────────────────────────────────────────────────────────────────────────
   EDGES
   ───────────────────────────────────────────────────────────────────────── */

/* Snap an edge to the nearest silence within 250 ms, never past [lo, hi]. */
function snap(t, lo, hi, silences, maxDist) {
  if (!silences.length) return t;
  let best = null;
  for (const s of silences) {
    const a = Math.max(s.start, lo), b = Math.min(s.end, hi);
    if (a > b) continue;
    if (t >= a && t <= b) return t;
    const p = t < a ? a : b;
    if (Math.abs(p - t) <= maxDist && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
  }
  return best === null ? t : best;
}

function pieceEdges(take, run, opts) {
  const toks = take.toks;
  const a = run[0], b = run[run.length - 1];
  const prevEnd = a > 0 ? toks[a - 1].end : 0;
  const nextStart = b < toks.length - 1 ? toks[b + 1].start : (take.duration ?? Infinity);
  let start = Math.min(toks[a].start, Math.max(prevEnd, toks[a].start - opts.leadSeconds, 0));
  let end = Math.max(toks[b].end, Math.min(nextStart, toks[b].end + opts.tailSeconds));
  start = snap(start, prevEnd, toks[a].start, take.silences, opts.snapSeconds);
  end = snap(end, toks[b].end, nextStart, take.silences, opts.snapSeconds);
  return { start, end, nextStart };
}

/* ─────────────────────────────────────────────────────────────────────────
   BULLETS: the freestyle middle
   ───────────────────────────────────────────────────────────────────────── */

const STOP = new Set([
  "that", "this", "with", "your", "you", "they", "them", "then", "than", "have", "from", "what",
  "when", "will", "would", "about", "just", "into", "were", "their", "there", "here", "because",
  "and", "the", "for", "are", "not", "but", "can", "get", "got", "its"
]);
function cueKeywords(tokens) {
  const k = tokens.filter((t) => t.length >= 4 && !STOP.has(t));
  return k.length ? k : tokens.filter((t) => !STOP.has(t));
}

function bestAttemptIn(attempts, takeOrder, opts, before = Infinity) {
  const ok = attempts.filter((a) => a.take === takeOrder && a.coverage >= opts.minLineCoverage && a.end <= before);
  return ok.length ? ok[ok.length - 1] : null;
}

/* The freestyle block between two word-for-word lines. For each take, its
   region runs from the end of the line before to the start of the line after.
   The take whose region hears the most cues wins; on a tie, the latest. */
function planFreestyleBlock(takes, cueLines, prevLine, nextLine, allAttempts, opts) {
  let best = null;
  for (let ti = takes.length - 1; ti >= 0; ti -= 1) {
    const take = takes[ti];
    if (!take.toks.length) continue;
    let hi = take.toks.length;
    if (nextLine) {
      const nx = bestAttemptIn(allAttempts[nextLine.index], take.order, opts);
      if (!nx) continue;
      hi = nx.segments[0][0];
    }
    let lo = -1;
    if (prevLine) {
      const before = hi < take.toks.length ? take.toks[hi].start : Infinity;
      const pv = bestAttemptIn(allAttempts[prevLine.index], take.order, opts, before);
      if (!pv) continue;
      lo = pv.segments[pv.segments.length - 1][1];
    }
    const region = [];
    for (let i = lo + 1; i < hi; i += 1) region.push(i);
    if (!region.length) continue;
    const kept = dropFreestyleRestarts(take.toks, region, opts);
    const cues = locateCues(take, kept, cueLines, opts);
    const heard = cues.filter((c) => c.found).length;
    if (!best || heard > best.heard) best = { take, kept, cues, heard };
  }
  return best;
}

function locateCues(take, kept, cueLines, opts) {
  let cursor = 0;
  const found = cueLines.map((line) => {
    const keys = cueKeywords(line.tokens);
    for (let p = cursor; p < kept.length; p += 1) {
      const tok = take.toks[kept[p]];
      const key = keys.find((k) => wordsMatch(tok.text, k, opts));
      if (key) { cursor = p + 1; return { line: line.index, found: true, keyword: key, at: tok.start }; }
    }
    return { line: line.index, found: false, keyword: null, at: null };
  });
  // A cue whose keywords were not heard starts evenly between its neighbours.
  const regionStart = kept.length ? take.toks[kept[0]].start : 0;
  const regionEnd = kept.length ? take.toks[kept[kept.length - 1]].end : 0;
  for (let i = 0; i < found.length; i += 1) {
    if (found[i].at !== null) continue;
    let p = i - 1; while (p >= 0 && found[p].at === null) p -= 1;
    let q = i + 1; while (q < found.length && found[q].at === null) q += 1;
    const a = p >= 0 ? found[p].at : regionStart;
    const b = q < found.length ? found[q].at : regionEnd;
    found[i].at = a + ((b - a) * (i - p)) / (q - p);
  }
  return found;
}

/* ─────────────────────────────────────────────────────────────────────────
   THE PLAN
   ───────────────────────────────────────────────────────────────────────── */

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Make the cut plan for one ad from all of its takes.
 * Returns { pieces, lines, missing_lines, said_differently, coverage, ... }.
 */
export function alignTakes({ script, takes, struck = [], options = {} } = {}) {
  const opts = { ...ALIGN_DEFAULTS, ...options };
  const { style, lines } = scriptLines(script);
  const prepared = prepareTakes(takes);
  const struckSet = new Set((Array.isArray(struck) ? struck : []).map(Number));

  const active = lines.filter((l) => !struckSet.has(l.index));
  const spoken = active.filter((l) => !l.freestyle);

  // 1–3. Every attempt at every word-for-word line, restarts stitched.
  const attemptsByLine = {};
  for (const line of spoken) {
    attemptsByLine[line.index] = prepared.flatMap((take) =>
      stitch(take, findAttempts(take, line.tokens, opts), line.tokens.length, opts));
  }

  // 4. One attempt per line.
  const chosen = chooseAttempts(spoken.map((l) => attemptsByLine[l.index]), opts);
  const state = new Map();
  spoken.forEach((line, i) => {
    const a = chosen[i];
    state.set(line.index, {
      attempt: a,
      status: a && a.coverage >= opts.minLineCoverage ? "kept" : "missing",
      segments: a ? a.segments.map(([s, e]) => ({ take: a.take, s, e })) : [],
      scriptWords: a ? new Set(a.pairs.map(([, t]) => t)) : new Set(),
      matched: a && a.coverage >= opts.minLineCoverage ? a.pairs.length : 0
    });
  });

  // 7. Lines said differently: under 85%, between kept neighbours in one take.
  //    The neighbours are the lines right before and after it in the cut; a
  //    freestyle cue in between means there is no single stretch to keep.
  for (let pos = 0; pos < active.length; pos += 1) {
    const line = active[pos];
    if (line.freestyle) continue;
    const st = state.get(line.index);
    if (st.attempt && st.attempt.coverage >= opts.saidDifferentlyBelow) continue;
    const before = active[pos - 1], after = active[pos + 1];
    if (!before || !after || before.freestyle || after.freestyle) continue;
    const prev = state.get(before.index), next = state.get(after.index);
    if (prev.status !== "kept" || next.status !== "kept") continue;
    if (prev.attempt.take !== next.attempt.take) continue;
    const take = prepared[prev.attempt.take];
    const lo = prev.segments[prev.segments.length - 1].e;
    const hi = next.segments[0].s;
    if (hi - lo < 2) continue;
    const span = take.toks[hi - 1].end - take.toks[lo + 1].start;
    if (span >= opts.saidDifferentlyFactor * line.tokens.length * opts.secondsPerWord) continue;
    st.status = "said_differently";
    st.segments = [{ take: take.order, s: lo + 1, e: hi - 1 }];
  }

  // Bullets: each run of cues is one freestyle block.
  const cueState = new Map();
  if (style === "bullets") {
    for (let i = 0; i < active.length; i += 1) {
      if (!active[i].freestyle) continue;
      const block = [];
      while (i < active.length && active[i].freestyle) { block.push(active[i]); i += 1; }
      const after = active[i];
      i -= 1;
      const beforeIdx = active.indexOf(block[0]) - 1;
      const before = beforeIdx >= 0 ? active[beforeIdx] : null;
      const prevLine = before && state.get(before.index)?.status === "kept" ? before : null;
      const nextLine = after && state.get(after.index)?.status === "kept" ? after : null;
      if ((before && !prevLine) || (after && !nextLine)) {
        block.forEach((l) => cueState.set(l.index, { status: "missing" }));
        continue;
      }
      const plan = planFreestyleBlock(prepared, block, prevLine, nextLine, attemptsByLine, opts);
      if (!plan) { block.forEach((l) => cueState.set(l.index, { status: "missing" })); continue; }
      block.forEach((l, k) => cueState.set(l.index, {
        status: plan.cues[k].found ? "kept" : "said_differently",
        cue: plan.cues[k],
        take: plan.take.order
      }));
      // The block's speech is laid down once, at its first cue.
      cueState.get(block[0].index).block = { take: plan.take, kept: plan.kept, cues: plan.cues, last: block[block.length - 1] };
    }
  }

  // 5–6. Pieces, in script order.
  const raw = [];
  for (const line of active) {
    if (line.freestyle) {
      const cs = cueState.get(line.index);
      if (!cs?.block) continue;
      const { take, kept, cues, last } = cs.block;
      // Each word belongs to the cue it was said under.
      const lineFor = (i) => {
        let owner = cues[0].line;
        for (const c of cues) if (c.at <= take.toks[i].start + 1e-9) owner = c.line;
        return owner;
      };
      const drop = fillerDrops(take.toks, kept, new Set(), opts);
      const runs = toRuns(take.toks, kept.filter((i) => !drop.has(i)), opts);
      runs.forEach((run, ri) => raw.push({
        take, run, line: lineFor(run[0]), lineFor, kind: "freestyle",
        pause: ri === runs.length - 1 && last.pause_after
      }));
      continue;
    }
    const st = state.get(line.index);
    if (st.status === "missing") continue;
    st.segments.forEach((seg, si) => {
      const take = prepared[seg.take];
      const idx = [];
      for (let i = seg.s; i <= seg.e; i += 1) idx.push(i);
      const drop = fillerDrops(take.toks, idx, st.scriptWords, opts);
      const runs = toRuns(take.toks, idx.filter((i) => !drop.has(i)), opts);
      runs.forEach((run, ri) => raw.push({
        take, run, line: line.index,
        kind: st.status === "said_differently" ? "said_differently" : "line",
        pause: line.pause_after && si === st.segments.length - 1 && ri === runs.length - 1
      }));
    });
  }

  // Edges, then the source's own pause between pieces.
  const pieces = raw.map((p) => {
    const e = pieceEdges(p.take, p.run, opts);
    return { ...p, start: e.start, end: e.end, nextStart: e.nextStart };
  });
  for (let i = 0; i < pieces.length - 1; i += 1) {
    const p = pieces[i];
    const cap = p.pause ? opts.plannedPauseSeconds : opts.gapSeconds;
    const limit = Number.isFinite(p.nextStart) ? p.nextStart : p.end + cap;
    p.end = Math.max(p.end, Math.min(p.end + cap, limit));
  }
  // Same take, back to back: never play a stretch twice; join what touches.
  const merged = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && last.take === p.take && p.start >= last.start && p.start < last.end) last.end = p.start;
    const prevRun = last && last.runs[last.runs.length - 1].run;
    if (last && last.take === p.take && p.run[0] === prevRun[prevRun.length - 1] + 1 && p.start <= last.end + 1e-6) {
      last.end = Math.max(last.end, p.end);
      last.runs.push(p);
      for (const i of p.run) {
        const ln = p.lineFor ? p.lineFor(i) : p.line;
        if (!last.lines.includes(ln)) last.lines.push(ln);
      }
      continue;
    }
    const lines0 = [];
    for (const i of p.run) {
      const ln = p.lineFor ? p.lineFor(i) : p.line;
      if (!lines0.includes(ln)) lines0.push(ln);
    }
    merged.push({ take: p.take, start: p.start, end: p.end, kind: p.kind, line: p.line, lines: lines0, runs: [p] });
  }

  // The cut's own timeline.
  let clock = 0;
  const kept_words = [];
  const outPieces = merged.map((p) => {
    const start = r3(p.start), end = r3(p.end);
    const piece = {
      take_id: p.take.id,
      take_index: p.take.order,
      start,
      end,
      line: p.line,
      lines: p.lines,
      kind: p.kind,
      cut_start: r3(clock),
      cut_end: r3(clock + (end - start))
    };
    for (const r of p.runs) {
      for (const i of r.run) {
        const tok = p.take.toks[i];
        kept_words.push({
          text: tok.text,
          word: tok.word,
          line: r.lineFor ? r.lineFor(i) : r.line,
          take_id: p.take.id,
          start: r3(tok.start),
          end: r3(tok.end),
          cut_start: r3(clock + tok.start - start),
          cut_end: r3(clock + tok.end - start)
        });
      }
    }
    clock += end - start;
    return piece;
  });

  // Lines, as the approval screen shows them (§9.6): kept, missing or said differently.
  const outLines = lines.map((line) => {
    const base = { index: line.index, part_index: line.part_index, kind: line.kind, text: line.text, pause_after: line.pause_after };
    if (struckSet.has(line.index)) return { ...base, status: "struck", coverage: null, take_id: null, cut_start: null, cut_end: null };
    const mine = kept_words.filter((w) => w.line === line.index);
    const span = mine.length ? { cut_start: mine[0].cut_start, cut_end: mine[mine.length - 1].cut_end } : { cut_start: null, cut_end: null };
    if (line.freestyle) {
      const cs = cueState.get(line.index) || { status: "missing" };
      const at = cs.cue ? cutTimeOf(outPieces, prepared[cs.take]?.id, cs.cue.at) : null;
      return {
        ...base,
        status: cs.status,
        coverage: null,
        take_id: cs.take !== undefined ? prepared[cs.take].id : null,
        keyword: cs.cue?.keyword ?? null,
        cut_start: at,
        cut_end: null
      };
    }
    const st = state.get(line.index);
    return {
      ...base,
      status: st.status,
      coverage: st.attempt ? r3(st.attempt.coverage) : 0,
      take_id: st.status === "missing" ? null : prepared[st.segments[0].take].id,
      ...span
    };
  });
  // A cue's span runs to the next cue's start, or to the end of its block.
  for (let i = 0; i < outLines.length; i += 1) {
    const l = outLines[i];
    if (!lines[i].freestyle || l.cut_start === null) continue;
    const next = outLines[i + 1];
    if (next && lines[i + 1].freestyle && next.cut_start !== null) { l.cut_end = next.cut_start; continue; }
    let j = i;
    while (j > 0 && lines[j - 1].freestyle) j -= 1;
    const blockLines = new Set(lines.slice(j, i + 1).map((x) => x.index));
    const blockWords = kept_words.filter((w) => blockLines.has(w.line));
    l.cut_end = blockWords.length ? blockWords[blockWords.length - 1].cut_end : l.cut_start;
  }

  const wordsTotal = spoken.reduce((s, l) => s + l.tokens.length, 0);
  const wordsMatched = spoken.reduce((s, l) => s + state.get(l.index).matched, 0);
  let switches = 0;
  for (let i = 1; i < outPieces.length; i += 1) if (outPieces[i].take_id !== outPieces[i - 1].take_id) switches += 1;

  return {
    version: ALIGNER_VERSION,
    style,
    pieces: outPieces,
    lines: outLines,
    missing_lines: outLines.filter((l) => l.status === "missing").map((l) => l.index),
    said_differently: outLines.filter((l) => l.status === "said_differently").map((l) => l.index),
    struck_lines: outLines.filter((l) => l.status === "struck").map((l) => l.index),
    coverage: wordsTotal ? r3(wordsMatched / wordsTotal) : 0,
    words_total: wordsTotal,
    words_matched: wordsMatched,
    duration: r3(clock),
    switches,
    takes_used: [...new Set(outPieces.map((p) => p.take_id))],
    kept_words
  };
}

/* A moment in a take → the same moment in the cut, or null when it was cut. */
function cutTimeOf(pieces, takeId, t) {
  if (t === null || t === undefined) return null;
  for (const p of pieces) {
    if (p.take_id === takeId && t >= p.start - 1e-6 && t <= p.end + 1e-6) return r3(p.cut_start + (t - p.start));
  }
  const after = pieces.find((p) => p.take_id === takeId && p.start >= t);
  return after ? after.cut_start : null;
}

/* ─────────────────────────────────────────────────────────────────────────
   WHAT HAPPENS NEXT (§9.1 step 7)
   ───────────────────────────────────────────────────────────────────────── */

const REQUIRED = [["hook", "the hook"], ["line2", "line 2"], ["cta", "the call to action"]];

/**
 * build   — make the master.
 * hold    — park at `cut` before any Submagic spend: the hook, line 2 or the CTA
 *           is missing, or coverage is under 70%. Chris picks Use this cut or Re-film.
 * rematch — under 50% coverage: back to `transcribed`, match again without this script.
 */
export function judgeCut(plan, options = {}) {
  const opts = { ...ALIGN_DEFAULTS, ...options };
  const coverage = Number(plan?.coverage) || 0;
  const pct = Math.round(coverage * 100);
  if (coverage < opts.rematchBelow) {
    return { action: "rematch", hold_reason: null, reason: `only ${pct}% of the script's words were heard — this take is probably a different script` };
  }
  const lines = Array.isArray(plan?.lines) ? plan.lines : [];
  const missing = REQUIRED
    .filter(([kind]) => lines.some((l) => l.kind === kind && l.status === "missing"))
    .map(([, name]) => name);
  const reasons = [];
  if (missing.length) reasons.push(`missing ${missing.join(", ")}`);
  if (coverage < opts.holdBelow) reasons.push(`only ${pct}% of the script's words were heard`);
  if (reasons.length) return { action: "hold", hold_reason: reasons.join("; "), reason: reasons.join("; ") };
  return { action: "build", hold_reason: null, reason: `${pct}% of the script's words heard` };
}

/* ─────────────────────────────────────────────────────────────────────────
   ANCHORS (§9.4 reads these)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Where an animation lands in the cut.
 *   words style:   { phrase: "three hundred thousand" } — the first kept place it is said
 *   bullets style: { cue: 2, keyword: "lenders" }    — the cue index among the cues,
 *                  falling back to the cue's start when the keyword is not heard
 * Returns { time, found } in cut seconds, or null when the anchor's line was cut
 * (the animation is skipped and flagged).
 */
export function anchorTime(plan, anchor = {}) {
  const words = Array.isArray(plan?.kept_words) ? plan.kept_words : [];
  if (anchor.phrase !== undefined && anchor.phrase !== null) {
    const want = normalizeText(anchor.phrase);
    if (!want.length) return null;
    for (let i = 0; i + want.length <= words.length; i += 1) {
      let ok = true;
      for (let k = 0; k < want.length; k += 1) {
        if (!wordsMatch(words[i + k].text, want[k])) { ok = false; break; }
      }
      if (ok) return { time: words[i].cut_start, found: true };
    }
    return null;
  }
  if (anchor.cue !== undefined && anchor.cue !== null) {
    const cues = (plan?.lines || []).filter((l) => l.kind === "cue");
    const cue = cues[Number(anchor.cue)];
    if (!cue || cue.cut_start === null || cue.cut_start === undefined) return null;
    if (anchor.keyword) {
      const want = normalizeText(anchor.keyword);
      const end = cue.cut_end ?? Infinity;
      const hit = words.find((w) => w.cut_start >= cue.cut_start - 1e-6 && w.cut_start < end && want.length && wordsMatch(w.text, want[0]));
      if (hit) return { time: hit.cut_start, found: true };
    }
    return { time: cue.cut_start, found: false };
  }
  return null;
}
