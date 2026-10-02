// The eleven gold-pack charts, as web-page SVG.
//
// A Node port of ops/workflows/gold-deliverables-v5/fh_charts.py (reference
// only, never run). The contract is DIAGRAM_SPEC.md in the same folder,
// sections 3, 4, 6 and 7. Every function is pure: same arguments, byte-for-byte
// the same string. No Math.random, no Date, no model in the drawing path.
//
// Each returns `<div class="chart"><svg ...></svg></div>`, or "" when
// DIAGRAM_SPEC section 6 says the chart must not be drawn. A missing chart reads
// as a clean page. A wrong chart reads as a broken product.
//
// WHAT IS THE SAME AS THE PYTHON
//   Coordinates, sizes, colours, copy and argument shapes (tuples are arrays,
//   names are camelCase, `cap` is the optional last argument). Numbers are
//   formatted the way Python's "%.1f" / "%.0f" do it, including round-half-even
//   on an exact tie, so a coordinate prints the same digits the gold PDF used.
//
// WHAT IS DIFFERENT, AND WHY (each one is listed on the workflow board too)
//   * Web page, not PDF: the <svg> is width="100%" with the same viewBox and a
//     508pt max-width, where the Python pinned width/height in pt for WeasyPrint.
//   * Every chart carries role="img" and an aria-label.
//   * Suppression guards (section 6) the Python did not have.
//   * journeyMap is parameterised (section 4.5). severityScale no longer prints
//     the Jordan-only "7" and "SIGNET BANK" lines; it derives them from items.
//   * utilizationBars starts 10 units lower: the Python drew its TARGET label at
//     y=-2, outside the frame, so it never showed (see the gold PDF, page 5).
//   * timeline widens its score axis when today's score or the month-6 range
//     falls outside lo/hi, as unlockLadder does. The Python kept 620-720 fixed,
//     so a 598 start drew the TODAY dot at y=147, under the month rail and in
//     among the month labels. Inside 620-720 nothing moves: the gold input
//     (636, 680-710) prints the Python's exact coordinates. The timeline prints
//     no axis, so a wider axis changes a slope, never a number the reader sees.
//   * A percent or a score prints at most one decimal ("93%", "104.3%",
//     "636.1"); the Python printed whatever float it was handed. Whole numbers,
//     the only thing the gold pack ever passed, print exactly as before.
//   * utilizationTank prints dollars with the page's own usd() (whole dollars),
//     so the tank agrees with the table above it. Whole numbers are unchanged.
//   * A caller's em dash or en dash becomes "-" (the dash gate, section 8).
//
// Escaping uses the house helper, which writes ' as &#39; where Python wrote
// &#x27;. Both are the same character on the page.

import { esc } from "./escape.mjs";
import { usd } from "./format.mjs";

const W = 508.0; // body text column, in points
const INK = "#0C0C0D";
const TRACK = "#E8E8EB";
const HAIR = "#DDDDE1";
const LABEL = "#6E6E76";
const MUTED = "#9A9AA1";

// Same id in every chart, as the Python. Several charts on one page repeat an
// identical <defs>; whichever copy url(#fhspec) resolves to, it is the same
// gradient. Keep this string identical across charts for that reason.
const SPEC_DEF =
  '<defs><linearGradient id="fhspec" x1="0" y1="0" x2="1" y2="0">'
  + '<stop offset="0" stop-color="#8B5CF6"/><stop offset="0.22" stop-color="#3B82F6"/>'
  + '<stop offset="0.45" stop-color="#22D3EE"/><stop offset="0.66" stop-color="#34D399"/>'
  + '<stop offset="0.84" stop-color="#FBBF24"/><stop offset="1" stop-color="#F97066"/>'
  + "</linearGradient></defs>";

// Anything that means a number went missing on the way in. Never printed.
const BROKEN = /\bNaN\b|\bundefined\b|\bInfinity\b/;
// The phrase as a reader sees it. SVG text collapses any run of spaces, line
// breaks and no-break spaces to one space, so all of those count, as do a
// hyphen (the render.test.mjs gate is /credit[\s-]*repair/i), the Unicode
// hyphens, a soft hyphen and the invisible joiners. svg() also reads the text
// with its tags taken out, which catches the two words wrapped onto two lines.
const BANNED = /credit[\s\-\u00AD\u200B-\u200D\u2010-\u2015\u2060]*repair/i;

/* ------------------------------------------------------------ helpers */

/** Python "%.{d}f": exact decimal rounding, round-half-even on an exact tie. */
function pyFixed(x, d) {
  const neg = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  // An exact tie at d decimals is a value whose double is odd / 2^(d+1).
  const t = a * 2 ** (d + 1);
  let s;
  if (Number.isInteger(t) && t % 2 === 1 && t <= Number.MAX_SAFE_INTEGER) {
    const scale = 10 ** d;
    let n = Math.floor(a * scale);
    if (n % 2 === 1) n += 1;
    s = d === 0 ? String(n) : `${Math.floor(n / scale)}.${String(n % scale).padStart(d, "0")}`;
  } else {
    s = a.toFixed(d);
  }
  return neg ? `-${s}` : s;
}
const f1 = (x) => pyFixed(x, 1);
const f0 = (x) => pyFixed(x, 0);

/** Thousands commas on a plain decimal string, as Python's "," option. */
function group(s) {
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [i, f] = body.split(".");
  const gi = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + gi + (f === undefined ? "" : `.${f}`);
}
/** Python f"{v:,.0f}". */
const comma0 = (v) => group(f0(v));
/**
 * A percent or a score for the page: at most one decimal, no trailing ".0".
 * 93 prints "93", 104.3 prints "104.3", 93.0306... prints "93". A computed
 * value never shows sixteen digits of float noise.
 */
function short(v) {
  const s = f1(v);
  const t = s.endsWith(".0") ? s.slice(0, -2) : s;
  return t === "-0" ? "0" : t;
}

/** A real finite number, or null. null, "", booleans and NaN are not numbers. */
function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
/** A number to print. Missing prints "-", never 0. */
function disp(v) {
  const n = num(v);
  return n === null ? "-" : String(n);
}

/** Text for the page: no em or en dash, then escaped (quotes too). */
function tx(t) {
  return esc(String(t ?? "").replace(/[\u2013\u2014]/g, "-"));
}

/** Length in code points, as Python len(). */
const clen = (s) => [...s].length;

/** Python _wrap(): deterministic greedy wrap of a comma-joined name list. */
function wrapNames(names, maxChars) {
  const lines = [];
  let cur = "";
  for (const raw of names) {
    const n = String(raw ?? "");
    const piece = cur ? `${cur}, ${n}` : n;
    if (clen(piece) > maxChars && cur) {
      lines.push(cur);
      cur = n;
    } else {
      cur = piece;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Python _wwrap(): deterministic word wrap for plain phrases. */
function wrapWords(text, maxChars) {
  const lines = [];
  let cur = "";
  for (const w of String(text ?? "").split(" ")) {
    const piece = cur ? `${cur} ${w}` : w;
    if (clen(piece) > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = piece;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// size and ls are strings so they print exactly as Python printed its literals
// ("7.0", not "7").
function mono(x, y, t, { size = "7.0", fill = LABEL, weight = "500", anchor = "start", ls = "0.6" } = {}) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="JetBrains Mono" font-size="${size}" `
    + `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" `
    + `letter-spacing="${ls}">${tx(t)}</text>`;
}

function inter(x, y, t, { size = "8.4", fill = INK, weight = "400", anchor = "start" } = {}) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="Inter" font-size="${size}" `
    + `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${tx(t)}</text>`;
}

/** Python _svg(), for a browser. Returns "" if anything unprintable got in. */
function svg(height, body, cap, label) {
  let caption = "";
  let h = height;
  if (cap !== null && cap !== undefined && String(cap) !== "") {
    caption = mono(0, height + 12, cap, { size: "6.4", fill: MUTED, ls: "1.0" });
    h = height + 16;
  }
  const out = `<div class="chart"><svg width="100%" viewBox="0 0 ${f0(W)} ${f0(h)}" `
    + `style="display:block;width:100%;height:auto;max-width:${f0(W)}pt" `
    + `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${tx(label)}">`
    + `${SPEC_DEF}${body}${caption}</svg></div>`;
  // Tags read as a space: "credit" ending one <text> and "repair" starting the
  // next is the phrase on the page all the same.
  const shown = out.replace(/<[^>]*>/g, " ");
  return BROKEN.test(out) || BANNED.test(out) || BANNED.test(shown) ? "" : out;
}

/** Widen a score axis so every value sits on it, with a 10 point margin. */
function widen(lo, hi, values) {
  let L = num(lo);
  let H = num(hi);
  if (L === null || H === null) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  if (mn < L) L = Math.floor(mn / 10) * 10 - 10;
  if (mx > H) H = Math.ceil(mx / 10) * 10 + 10;
  return H > L ? [L, H] : null;
}

/* ============================================================ analytics */

/**
 * waterfall(steps, cap)
 * steps: [[label, sublabel, value, kind]], kind is "base" | "gain" | "total".
 * Gain bars float on the running total.
 * Returns "" when: no steps, no "total" step, any value not a finite number
 * or negative, the total is not larger than every "base" step (projected <=
 * current), the running total ever climbs past the total (spec 4.8: the total
 * is the largest value; a gain bar taller than the Projected bar contradicts
 * its own numbers, and a big enough one is drawn above the frame), or the
 * columns are too narrow to draw a bar.
 */
export function waterfall(steps, cap) {
  if (!Array.isArray(steps) || steps.length === 0) return "";
  if (!steps.every((s) => Array.isArray(s) && num(s[2]) !== null && num(s[2]) >= 0)) return "";
  const totals = steps.filter((s) => s[3] === "total").map((s) => num(s[2]));
  if (!totals.length) return "";
  const total = Math.max(...totals);
  if (!(total > 0)) return "";
  if (steps.some((s) => s[3] === "base" && !(total > num(s[2])))) return "";
  // Every bar top is the running total at that step; none may pass the total.
  // Compared in whole cents so float noise (0.1 + 0.2) never suppresses.
  let run = 0;
  for (const s of steps) {
    run = s[3] === "gain" ? run + num(s[2]) : num(s[2]);
    if (Math.round(run * 100) > Math.round(total * 100)) return "";
  }

  const top = 34.0;
  const baseY = 176.0;
  const plotH = baseY - top;
  const scale = plotH / total;
  const n = steps.length;
  const colw = W / n;
  const barw = Math.min(96.0, colw - 62.0);
  if (!(barw > 0)) return "";

  const out = [`<line x1="0" y1="${f1(baseY)}" x2="${f0(W)}" y2="${f1(baseY)}" `
    + `stroke="${INK}" stroke-width="0.9"/>`];
  let running = 0.0;
  let prevTopX = null;
  let prevTopY = null;
  const said = [];

  steps.forEach(([lab, sub, rawVal, kind], i) => {
    const val = num(rawVal);
    const cx = colw * i + colw / 2.0;
    const x = cx - barw / 2.0;
    let ty;
    if (kind === "gain") {
      const y0 = baseY - (running + val) * scale;
      const h = val * scale;
      out.push(`<rect x="${f1(x)}" y="${f1(y0)}" width="${f1(barw)}" height="${f1(h)}" `
        + `fill="#F2F2F4" stroke="${INK}" stroke-width="0.8"/>`);
      out.push(`<rect x="${f1(x)}" y="${f1(y0)}" width="${f1(barw)}" height="2" `
        + 'fill="url(#fhspec)"/>');
      running += val;
      ty = y0;
    } else {
      const h = val * scale;
      const y0 = baseY - h;
      out.push(`<rect x="${f1(x)}" y="${f1(y0)}" width="${f1(barw)}" height="${f1(h)}" `
        + `fill="${INK}"/>`);
      running = val;
      ty = y0;
    }
    const figure = kind !== "gain" ? `$${comma0(val)}` : `+$${comma0(val)}`;
    const upper = String(lab ?? "").toUpperCase();
    said.push(`${upper} ${figure}`);
    out.push(mono(cx, ty - 8, figure,
      { size: "11.5", fill: INK, weight: "700", anchor: "middle", ls: "-0.2" }));
    out.push(mono(cx, baseY + 15, upper, { size: "6.4", fill: LABEL, anchor: "middle", ls: "1.2" }));
    if (sub) {
      out.push(inter(cx, baseY + 27, sub, { size: "7.4", fill: MUTED, anchor: "middle" }));
    }
    if (prevTopX !== null) {
      out.push(`<line x1="${f1(prevTopX)}" y1="${f1(prevTopY)}" x2="${f1(x)}" `
        + `y2="${f1(prevTopY)}" stroke="${MUTED}" stroke-width="0.7" `
        + 'stroke-dasharray="2.5 2"/>');
    }
    prevTopX = x + barw;
    prevTopY = ty;
  });
  return svg(baseY + 34, out.join(""), cap, `Funding waterfall: ${said.join(", ")}`);
}

/**
 * unlockLadder(current, tiers, lo = 620, hi = 710, cap)
 * tiers: [[scoreFloor, [lenderName, ...]]], ascending (sorted here anyway).
 * A tier with no lender names is dropped. Scores above every tier read
 * UNLOCKED. A score or floor outside lo/hi widens the rail.
 * Returns "" when: current is not a number, any floor is not a number, or no
 * tier has a lender (the lender set is empty).
 */
export function unlockLadder(current, tiers, lo = 620, hi = 710, cap) {
  const cur = num(current);
  if (cur === null || !Array.isArray(tiers)) return "";
  const rows = [];
  for (const t of tiers) {
    if (!Array.isArray(t)) return "";
    const s = num(t[0]);
    if (s === null) return "";
    const names = (Array.isArray(t[1]) ? t[1] : [])
      .map((n) => String(n ?? "").trim())
      .filter(Boolean);
    if (names.length) rows.push([s, names]);
  }
  if (!rows.length) return "";
  rows.sort((a, b) => a[0] - b[0]);
  const range = widen(lo, hi, [cur, ...rows.map((r) => r[0])]);
  if (!range) return "";
  const [L, H] = range;

  const x0 = 26.0;
  const x1 = W - 12.0;
  const railY = 44.0;
  const px = (s) => x0 + (s - L) / (H - L) * (x1 - x0);

  const out = [`<rect x="${f1(x0)}" y="${f1(railY)}" width="${f1(x1 - x0)}" height="2.4" fill="${TRACK}"/>`];
  const cx = px(cur);
  out.push(`<rect x="${f1(x0)}" y="${f1(railY)}" width="${f1(cx - x0)}" height="2.4" fill="${INK}"/>`);

  for (const [s] of rows) {
    const gx = px(s);
    out.push(`<line x1="${f1(gx)}" y1="${f1(railY - 5)}" x2="${f1(gx)}" y2="${f1(railY + 8)}" `
      + `stroke="${INK}" stroke-width="0.9"/>`);
    out.push(mono(gx, railY + 19, short(s), { size: "7.0", fill: LABEL, anchor: "middle", ls: "0.8" }));
  }

  out.push(`<polygon points="${f1(cx)},${f1(railY - 2)} ${f1(cx - 4.6)},${f1(railY - 10)} `
    + `${f1(cx + 4.6)},${f1(railY - 10)}" fill="${INK}"/>`);
  // self-describing marker label, clamped so it never overruns either edge
  const mark = `YOUR MEDIAN SCORE  ${short(cur)}`;
  const half = clen(mark) * (7.2 * 0.6 + 1.0) / 2.0;
  let lx;
  let anch;
  if (cx - half < 0) {
    lx = 0.0;
    anch = "start";
  } else if (cx + half > W) {
    lx = W;
    anch = "end";
  } else {
    lx = cx;
    anch = "middle";
  }
  out.push(mono(lx, railY - 15, mark, { size: "7.2", fill: INK, weight: "700", anchor: anch, ls: "1.0" }));

  let y = railY + 42;
  let lenders = 0;
  for (const [s, names] of rows) {
    const gap = Math.trunc(s) - Math.trunc(cur);
    lenders += names.length;
    out.push(`<line x1="0" y1="${f1(y - 13)}" x2="${f0(W)}" y2="${f1(y - 13)}" `
      + `stroke="${HAIR}" stroke-width="0.7"/>`);
    out.push(`<rect x="0" y="${f1(y - 9)}" width="30" height="12.5" fill="${INK}"/>`);
    out.push(mono(15, y, short(s), { size: "7.2", fill: "#FFFFFF", weight: "700", anchor: "middle", ls: "0.4" }));
    out.push(mono(38, y, gap > 0 ? `+${gap} PTS` : "UNLOCKED", { size: "6.6", fill: LABEL, ls: "1.0" }));
    const lines = wrapNames(names, 58);
    lines.forEach((ln, j) => {
      out.push(inter(96, y + j * 10.4, ln, { size: "8.2", fill: INK, weight: j === 0 ? "600" : "400" }));
    });
    out.push(mono(W, y, `${names.length}`, { size: "7.6", fill: MUTED, anchor: "end", ls: "0" }));
    y += 14 + 10.4 * (lines.length - 1) + 12;
  }
  return svg(y - 8, out.join(""), cap,
    `Score ladder: your median score ${short(cur)}, ${lenders} lenders across ${rows.length} score floors`);
}

/**
 * utilizationBars(rows, targetPct = 10, cap)
 * rows: [[label, pct, detail]]. pct is 0-100 and may be above 100: the fill
 * stops at 100%, the printed percent stays true. A row whose pct is not a
 * number (a card with an unknown limit) is left out; a bar implies a
 * measurement. A single row draws one bar; the caller adds no aggregate row.
 * Returns "" when: no row has a known pct, or targetPct is not a number.
 */
export function utilizationBars(rows, targetPct = 10, cap) {
  const tgt = num(targetPct);
  if (tgt === null || !Array.isArray(rows)) return "";
  const known = rows.filter((r) => Array.isArray(r) && num(r[1]) !== null);
  if (!known.length) return "";

  const lx = 0.0;
  const bx = 148.0;
  const bw = W - bx - 46.0;
  const rowh = 40.0;
  // The Python started at 14, which put the TARGET label at y=-2: clipped.
  const y0 = 24.0;
  const out = [];
  let y = y0;
  const tx0 = bx + bw * (tgt / 100.0);

  for (const [lab, rawPct, detail] of known) {
    const pct = num(rawPct);
    out.push(inter(lx, y + 1, lab, { size: "9.0", fill: INK, weight: "700" }));
    out.push(`<rect x="${f1(bx)}" y="${f1(y - 8)}" width="${f1(bw)}" height="13" fill="${TRACK}"/>`);
    const fillw = bw * (Math.min(Math.max(pct, 0), 100) / 100.0);
    out.push(`<rect x="${f1(bx)}" y="${f1(y - 8)}" width="${f1(fillw)}" height="13" fill="${INK}"/>`);
    out.push(mono(W, y + 1, `${short(pct)}%`, { size: "10.5", fill: INK, weight: "700", anchor: "end", ls: "-0.2" }));
    out.push(inter(lx, y + 14, detail, { size: "7.6", fill: MUTED }));
    y += rowh;
  }

  const top = y0 - 12.0;
  const bot = y - rowh + 8.0;
  out.push(`<line x1="${f1(tx0)}" y1="${f1(top)}" x2="${f1(tx0)}" y2="${f1(bot)}" `
    + `stroke="${INK}" stroke-width="0.9" stroke-dasharray="3 2.4"/>`);
  out.push(mono(tx0, top - 4, `TARGET  ${short(tgt)}%`, { size: "6.4", fill: INK, weight: "700", anchor: "middle", ls: "1.0" }));
  const said = known.map((r) => `${String(r[0] ?? "")} ${short(num(r[1]))}%`).join(", ");
  return svg(y - 14, out.join(""), cap, `Utilization by card: ${said}. Target ${short(tgt)}%`);
}

/**
 * timeline(months, startScore, endLo, endHi, lo = 620, hi = 720, cap)
 * months: [[n, phase, action, noteOrNull]]. action is split on " · ".
 * The band is anchored, not interpolated: today's score to the month-6 range.
 * The range is drawn on the last month column, so that column must be month 6.
 * A score outside lo/hi widens the axis (the Python kept 620-720 and drew an
 * out-of-range dot in among the month labels); inside 620-720 nothing moves.
 * Returns "" when: fewer than 2 months, the last month is not month 6 (the
 * range would sit on, and be read as, an earlier or later month), startScore /
 * endLo / endHi is not a number (no stated month-6 range), or endLo is above
 * endHi.
 */
export function timeline(months, startScore, endLo, endHi, lo = 620, hi = 720, cap) {
  const start = num(startScore);
  const eLo = num(endLo);
  const eHi = num(endHi);
  if (!Array.isArray(months) || months.length < 2) return "";
  if (!months.every(Array.isArray)) return "";
  if (num(months[months.length - 1][0]) !== 6) return "";
  if (start === null || eLo === null || eHi === null || eLo > eHi) return "";
  const range = widen(lo, hi, [start, eLo, eHi]);
  if (!range) return "";
  const [L, H] = range;

  const n = months.length;
  const colw = W / n;
  const top = 30.0;
  const bandH = 96.0;
  const railY = top + bandH + 16.0;
  const py = (score) => top + bandH - (score - L) / (H - L) * bandH;

  const xFirst = colw / 2.0;
  const xLast = colw * (n - 1) + colw / 2.0;
  const yS = py(start);
  const yLo = py(eLo);
  const yHi = py(eHi);

  const out = [`<polygon points="${f1(xFirst)},${f1(yS)} ${f1(xLast)},${f1(yHi)} `
    + `${f1(xLast)},${f1(yLo)}" fill="#F2F2F4"/>`];
  out.push(`<line x1="${f1(xFirst)}" y1="${f1(yS)}" x2="${f1(xLast)}" y2="${f1(yHi)}" `
    + `stroke="${INK}" stroke-width="1.3"/>`);
  out.push(`<line x1="${f1(xFirst)}" y1="${f1(yS)}" x2="${f1(xLast)}" y2="${f1(yLo)}" `
    + `stroke="${MUTED}" stroke-width="0.9" stroke-dasharray="3 2.4"/>`);
  out.push(`<rect x="${f1(xLast)}" y="${f1(yHi)}" width="2" `
    + `height="${f1(yLo - yHi)}" fill="url(#fhspec)"/>`);

  out.push(`<circle cx="${f1(xFirst)}" cy="${f1(yS)}" r="3.1" fill="${INK}"/>`);
  out.push(mono(xFirst + 8, yS + 3, short(start), { size: "9.5", fill: INK, weight: "700", ls: "-0.2" }));
  out.push(mono(xFirst + 8, yS - 7, "TODAY", { size: "6.0", fill: MUTED, ls: "1.2" }));
  out.push(mono(xLast - 8, yHi + 1, `${short(eLo)}-${short(eHi)}`,
    { size: "9.5", fill: INK, weight: "700", anchor: "end", ls: "-0.2" }));
  out.push(mono(xLast - 8, yHi - 9, "PROJECTED", { size: "6.0", fill: MUTED, anchor: "end", ls: "1.2" }));

  out.push(`<line x1="0" y1="${f1(railY)}" x2="${f0(W)}" y2="${f1(railY)}" `
    + `stroke="${TRACK}" stroke-width="2.4"/>`);

  // pass 1: wrap every action so all notes can share one baseline
  const wrapped = months.map((m) => wrapNames(String(m[2] ?? "").split(" · "), 20));
  const maxlines = Math.max(...wrapped.map((w) => w.length));
  const noteY = railY + 40 + maxlines * 9.4 + 2;

  // pass 2: draw
  months.forEach(([mNum, phase, , note], i) => {
    const cx = colw * i + colw / 2.0;
    const label = disp(mNum);
    out.push(`<circle cx="${f1(cx)}" cy="${f1(railY + 1.2)}" r="4.4" fill="${INK}"/>`);
    out.push(mono(cx, railY + 3.6, label, { size: "6.0", fill: "#FFFFFF", weight: "700", anchor: "middle", ls: "0" }));
    out.push(mono(cx, railY + 18, `MONTH ${label}`, { size: "6.0", fill: MUTED, anchor: "middle", ls: "1.1" }));
    out.push(inter(cx, railY + 29, phase, { size: "8.4", fill: INK, weight: "700", anchor: "middle" }));
    wrapped[i].forEach((ln, j) => {
      out.push(inter(cx, railY + 40 + j * 9.4, ln, { size: "7.2", fill: MUTED, anchor: "middle" }));
    });
    if (note) {
      out.push(mono(cx, noteY, note, { size: "6.4", fill: INK, weight: "700", anchor: "middle", ls: "0.4" }));
    }
  });
  return svg(noteY + 12, out.join(""), cap,
    `Score timeline: ${short(start)} today, ${short(eLo)}-${short(eHi)} projected`);
}

/* ============================================================ explainers */

/**
 * utilizationTank(cardName, limit, balance, targetBal, payAmount, cap)
 * One revolving card with a known limit, the worst offender. Percentages are
 * computed here, never passed. Fill clamps at 100%; the printed % stays true.
 * Dollars print with the page's usd() (whole dollars), never float noise.
 * Returns "" when: limit is not a positive finite number, balance / targetBal /
 * payAmount is not a finite number, targetBal is negative, payAmount is not
 * above 0 (nothing to pay down means the picture would teach a false lesson),
 * the balance is not above the target (the goal tank would be as full as
 * today's, or fuller), or payAmount is not balance - targetBal to within a
 * dollar (spec 4.2; "$1,762 ... PAY DOWN $9,999 ... $189" does not add up).
 */
export function utilizationTank(cardName, limit, balance, targetBal, payAmount, cap) {
  const lim = num(limit);
  const bal = num(balance);
  const tgt = num(targetBal);
  const pay = num(payAmount);
  if (lim === null || !(lim > 0) || bal === null || tgt === null || pay === null) return "";
  if (tgt < 0 || !(pay > 0)) return "";
  if (!(bal > tgt) || Math.abs(bal - tgt - pay) > 1) return "";

  const pct = bal / lim * 100.0;
  const tgtPct = tgt / lim * 100.0;

  const t1x = 40.0;
  const t2x = 372.0;
  const tw = 96.0;
  const top = 46.0;
  const bot = 214.0;
  const th = bot - top;
  const gapC = (t1x + tw + t2x) / 2.0;
  const fillY = (p) => bot - (Math.min(Math.max(p, 0), 100) / 100.0) * th;

  const headline = `Your ${String(cardName ?? "")} card holds ${usd(lim)}. Right now it is ${f0(pct)}% full.`;
  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];

  out.push(mono(t1x + tw / 2, 38, "TODAY", { size: "7.0", fill: LABEL, anchor: "middle", ls: "1.6" }));
  out.push(mono(t2x + tw / 2, 38, "THE GOAL", { size: "7.0", fill: INK, weight: "700", anchor: "middle", ls: "1.6" }));

  for (const x of [t1x, t2x]) {
    out.push(`<path d="M ${f1(x)} ${f1(top)} L ${f1(x)} ${f1(bot)} `
      + `L ${f1(x + tw)} ${f1(bot)} L ${f1(x + tw)} ${f1(top)}" `
      + `fill="none" stroke="${INK}" stroke-width="1.3"/>`);
  }

  // A zero balance would give a -0.7 height; SVG draws nothing either way.
  const fy1 = fillY(pct);
  out.push(`<rect x="${f1(t1x + 0.7)}" y="${f1(fy1)}" width="${f1(tw - 1.4)}" `
    + `height="${f1(Math.max(0, bot - fy1 - 0.7))}" fill="${INK}"/>`);
  const fy2 = fillY(tgtPct);
  out.push(`<rect x="${f1(t2x + 0.7)}" y="${f1(fy2)}" width="${f1(tw - 1.4)}" `
    + `height="${f1(Math.max(0, bot - fy2 - 0.7))}" fill="${INK}"/>`);

  out.push(`<line x1="${f1(t1x + tw)}" y1="${f1(fy1)}" x2="${f1(t1x + tw + 16)}" y2="${f1(fy1)}" `
    + `stroke="${MUTED}" stroke-width="0.7"/>`);
  out.push(mono(t1x + tw + 20, fy1 + 4, usd(bal), { size: "12.5", fill: INK, weight: "700", ls: "-0.3" }));
  out.push(mono(t1x + tw + 20, fy1 + 16, `${f0(pct)}% FULL`, { size: "6.6", fill: LABEL, ls: "1.2" }));

  out.push(mono(t2x - 10, fy2 + 4, usd(tgt),
    { size: "10.5", fill: INK, weight: "700", anchor: "end", ls: "-0.2" }));

  const sy = fillY(10.0);
  out.push(`<line x1="${f1(t1x - 8)}" y1="${f1(sy)}" x2="${f1(t2x + tw + 8)}" y2="${f1(sy)}" `
    + `stroke="${INK}" stroke-width="0.9" stroke-dasharray="3.2 2.6"/>`);
  out.push(mono(gapC, sy - 5, "THE SAFE ZONE · UNDER 10%",
    { size: "6.5", fill: INK, weight: "700", anchor: "middle", ls: "1.1" }));

  const ay = 118.0;
  out.push(`<line x1="${f1(t1x + tw + 58)}" y1="${f1(ay)}" x2="${f1(t2x - 24)}" y2="${f1(ay)}" `
    + `stroke="${INK}" stroke-width="1.2"/>`);
  out.push(`<polygon points="${f1(t2x - 14)},${f1(ay)} ${f1(t2x - 25)},${f1(ay - 4.4)} `
    + `${f1(t2x - 25)},${f1(ay + 4.4)}" fill="${INK}"/>`);
  out.push(mono(gapC, ay - 9, `PAY DOWN ${usd(pay)}`,
    { size: "7.6", fill: INK, weight: "700", anchor: "middle", ls: "1.0" }));
  out.push(inter(gapC, ay + 15, "the fastest win on your entire report",
    { size: "7.6", fill: MUTED, anchor: "middle" }));

  const ty = bot + 23;
  out.push(inter(0, ty, "A nearly full card tells every lender 'I am maxed out.'",
    { size: "9.4", fill: INK, weight: "600" }));
  out.push(inter(0, ty + 15, "Get it under the dotted line and your score jumps. "
    + "Your pre-approval jumps with it.", { size: "9.0", fill: "#45454B" }));
  return svg(ty + 24, out.join(""), cap, headline);
}

/**
 * scoreLineup(rows, cap)
 * rows: [[bureauName, score, note]] x 3, any order. Sorted lowest first so the
 * middle card is literally the middle score, with an arrow picking it.
 * Returns "" when: not exactly three rows, or any score is not a number.
 */
export function scoreLineup(rows, cap) {
  if (!Array.isArray(rows) || rows.length !== 3) return "";
  if (!rows.every((r) => Array.isArray(r) && num(r[1]) !== null)) return "";
  const ranked = [...rows].sort((a, b) => Math.trunc(num(a[1])) - Math.trunc(num(b[1])));
  const spread = Math.trunc(num(ranked[2][1])) - Math.trunc(num(ranked[0][1]));
  const mid = ranked[1];

  const cw = 150.0;
  const gap = 12.0;
  const x0 = (W - (cw * 3 + gap * 2)) / 2.0;
  const top = 62.0;
  const ch = 116.0;

  const headline = "You do not have one credit score. You have three.";
  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];

  const mcx = x0 + cw + gap + cw / 2.0;
  out.push(mono(mcx, 34, "LENDERS PICK THE MIDDLE SCORE",
    { size: "7.0", fill: INK, weight: "700", anchor: "middle", ls: "1.1" }));
  out.push(`<line x1="${f1(mcx)}" y1="${f1(40)}" x2="${f1(mcx)}" y2="${f1(top - 7)}" `
    + `stroke="${INK}" stroke-width="1.2"/>`);
  out.push(`<polygon points="${f1(mcx)},${f1(top - 2)} ${f1(mcx - 4.6)},${f1(top - 9)} `
    + `${f1(mcx + 4.6)},${f1(top - 9)}" fill="${INK}"/>`);

  const tags = ["LOWEST", "YOUR MIDDLE SCORE", "HIGHEST"];
  ranked.forEach(([name, score, note], i) => {
    const x = x0 + i * (cw + gap);
    const isMid = i === 1;
    out.push(`<rect x="${f1(x)}" y="${f1(top)}" width="${f1(cw)}" height="${f1(ch)}" `
      + `fill="#FFFFFF" stroke="${isMid ? INK : "#DDDDE1"}" `
      + `stroke-width="${isMid ? "1.5" : "0.9"}"/>`);
    if (isMid) {
      out.push(`<rect x="${f1(x)}" y="${f1(top)}" width="${f1(cw)}" height="2.4" `
        + 'fill="url(#fhspec)"/>');
    }
    const cx = x + cw / 2.0;
    out.push(mono(cx, top + 20, String(name ?? "").toUpperCase(),
      { size: "6.8", fill: isMid ? INK : LABEL, anchor: "middle", ls: "1.4" }));
    out.push(mono(cx, top + 58, disp(score),
      { size: "28", fill: INK, weight: "700", anchor: "middle", ls: "-1.0" }));
    out.push(inter(cx, top + 78, note,
      { size: "7.6", fill: isMid ? "#45454B" : MUTED, anchor: "middle" }));
    out.push(mono(cx, top + ch - 8, tags[i], {
      size: "6.0", fill: isMid ? INK : MUTED,
      weight: isMid ? "700" : "500", anchor: "middle", ls: "1.0"
    }));
  });

  const ty = top + ch + 22;
  out.push(inter(0, ty, "Line them up from lowest to highest. Lenders use the middle "
    + `one. Yours is ${disp(mid[1])}.`, { size: "9.4", fill: INK, weight: "600" }));
  out.push(inter(0, ty + 15, "They do not match because not every company reports to all "
    + "three bureaus.", { size: "9.0", fill: "#45454B" }));
  // With no gap there is nothing to close; the sentence would be false.
  if (spread !== 0) {
    out.push(inter(0, ty + 29, `Your best and worst are ${spread} points apart. Closing `
      + "that gap is the job.", { size: "9.0", fill: "#45454B" }));
  }
  return svg(ty + 38, out.join(""), cap, headline);
}

/**
 * severityScale(items, cap)
 * items: [[tableNum, shortName, plainNote, fx, side]]. fx is the 0..1 position
 * on the hurts-less to hurts-most rail, from the report's own ranking; side is
 * "a" (label above) or "b" (below). Alternate strictly.
 * The headline count is items.length and the lead names the item furthest
 * right; the Python printed Jordan's "7" and "SIGNET BANK" for everyone.
 * Returns "" when: fewer than 3 items, or any fx is not a number in 0..1.
 */
export function severityScale(items, cap) {
  if (!Array.isArray(items) || items.length < 3) return "";
  if (!items.every((it) => Array.isArray(it) && num(it[3]) !== null && num(it[3]) >= 0 && num(it[3]) <= 1)) {
    return "";
  }
  const railY = 118.0;
  const rx0 = 10.0;
  const rx1 = W - 10.0;

  const headline = `Your ${items.length} negative items are not equally bad.`;
  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];
  out.push(`<line x1="${f1(rx0)}" y1="${f1(railY)}" x2="${f1(rx1)}" y2="${f1(railY)}" `
    + `stroke="${TRACK}" stroke-width="2.6"/>`);
  out.push(`<polygon points="${f1(rx1 + 6)},${f1(railY)} ${f1(rx1 - 3)},${f1(railY - 4.2)} `
    + `${f1(rx1 - 3)},${f1(railY + 4.2)}" fill="${INK}"/>`);
  out.push(mono(rx0, railY + 15, "HURTS LESS · EASIER TO FIX", { size: "6.2", fill: MUTED, ls: "1.1" }));
  out.push(mono(rx1, railY + 15, "HURTS MOST · FIX FIRST",
    { size: "6.2", fill: INK, weight: "700", anchor: "end", ls: "1.1" }));

  let worst = items[0];
  for (const [itemNum, name, note, rawFx, side] of items) {
    const fx = num(rawFx);
    if (fx > num(worst[3])) worst = [itemNum, name, note, rawFx, side];
    const x = rx0 + fx * (rx1 - rx0);
    const lx = Math.min(Math.max(x, 58.0), W - 58.0);
    let ly;
    if (side === "a") {
      ly = 52.0;
      out.push(`<line x1="${f1(x)}" y1="${f1(railY - 8)}" x2="${f1(x)}" y2="${f1(ly + 16)}" `
        + `stroke="${HAIR}" stroke-width="0.8"/>`);
    } else {
      ly = 160.0;
      out.push(`<line x1="${f1(x)}" y1="${f1(railY + 8)}" x2="${f1(x)}" y2="${f1(ly - 10)}" `
        + `stroke="${HAIR}" stroke-width="0.8"/>`);
    }
    out.push(`<circle cx="${f1(x)}" cy="${f1(railY)}" r="7.2" fill="${INK}"/>`);
    out.push(mono(x, railY + 2.6, disp(itemNum),
      { size: "6.6", fill: "#FFFFFF", weight: "700", anchor: "middle", ls: "0" }));
    out.push(inter(lx, ly, name, { size: "7.9", fill: INK, weight: "700", anchor: "middle" }));
    wrapWords(note, 20).forEach((ln, j) => {
      out.push(inter(lx, ly + 10 + j * 9.0, ln, { size: "7.0", fill: MUTED, anchor: "middle" }));
    });
  }

  const ty = 206.0;
  out.push(inter(0, ty, `Start on the right. ${String(worst[1] ?? "")} hurts the most. Fix it first.`,
    { size: "9.4", fill: INK, weight: "600" }));
  out.push(inter(0, ty + 15, "The ones on the far left hurt less and are easier to fix.",
    { size: "9.0", fill: "#45454B" }));
  return svg(ty + 24, out.join(""), cap, headline);
}

/** "$7,936 becomes $19,841": the before and after amounts a panel states. */
const BECOMES = /\$\s*(\d[\d,]*(?:\.\d+)?)\s+becomes\s+\$\s*(\d[\d,]*(?:\.\d+)?)/gi;

/**
 * moneyChain(steps, headline, teach, cap)
 * steps: [[kicker, boldLine, subLine]] drawn as a chain of panels with arrows,
 * cause to effect, left to right. Four is the tested width. The last panel
 * gets the emphasis. The CALLER suppresses this when projected <= current: it
 * holds the numbers, this function holds only words. Backstop: a panel whose
 * own words read "$A becomes $B" (the spec 4.4 shape) with B <= A is refused.
 * Returns "" when: fewer than 2 steps, a panel says the money goes down or
 * stays flat ("$19,841 becomes $7,936"), or the panels do not fit side by side
 * (five or more at the Python's 112-wide panels).
 */
export function moneyChain(steps, headline, teach, cap) {
  if (!Array.isArray(steps) || steps.length < 2 || !steps.every(Array.isArray)) return "";
  for (const s of steps) {
    for (const m of s.map((t) => String(t ?? "")).join("\n").matchAll(BECOMES)) {
      const a = Number(m[1].replace(/,/g, ""));
      const b = Number(m[2].replace(/,/g, ""));
      if (!(b > a)) return "";
    }
  }
  const n = steps.length;
  const bw = 112.0;
  const bh = 90.0;
  const agap = (W - bw * n) / (n - 1);
  if (agap < 16) return "";
  const top = 30.0;

  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];
  steps.forEach(([kick, bold, sub], i) => {
    const x = i * (bw + agap);
    const last = i === n - 1;
    out.push(`<rect x="${f1(x)}" y="${f1(top)}" width="${f1(bw)}" height="${f1(bh)}" `
      + `fill="${last ? "#F6F6F8" : "#FFFFFF"}" `
      + `stroke="${last ? INK : "#DDDDE1"}" `
      + `stroke-width="${last ? "1.4" : "0.9"}"/>`);
    if (last) {
      out.push(`<rect x="${f1(x)}" y="${f1(top)}" width="${f1(bw)}" height="2.4" `
        + 'fill="url(#fhspec)"/>');
    }
    const cx = x + bw / 2.0;
    out.push(mono(cx, top + 15, kick, { size: "5.8", fill: LABEL, anchor: "middle", ls: "1.3" }));
    const blines = wrapWords(bold, 13);
    blines.forEach((ln, j) => {
      out.push(inter(cx, top + 32 + j * 11.0, ln, { size: "8.8", fill: INK, weight: "700", anchor: "middle" }));
    });
    const sy = top + 32 + blines.length * 11.0 + 3;
    wrapWords(sub, 16).forEach((ln, j) => {
      out.push(mono(cx, sy + j * 9.6, ln, { size: "6.9", fill: "#45454B", anchor: "middle", ls: "0.2" }));
    });
    if (!last) {
      const ax0 = x + bw + 4;
      const ax1 = x + bw + agap - 4;
      const ay = top + bh / 2.0;
      out.push(`<line x1="${f1(ax0)}" y1="${f1(ay)}" x2="${f1(ax1 - 6)}" y2="${f1(ay)}" `
        + `stroke="${INK}" stroke-width="1.2"/>`);
      out.push(`<polygon points="${f1(ax1)},${f1(ay)} ${f1(ax1 - 8)},${f1(ay - 4)} `
        + `${f1(ax1 - 8)},${f1(ay + 4)}" fill="${INK}"/>`);
    }
  });

  const ty = top + bh + 24;
  out.push(inter(0, ty, teach, { size: "9.4", fill: INK, weight: "600" }));
  return svg(ty + 10, out.join(""), cap, headline);
}

/** A display amount ("$7,936") or a number, as a number; anything else null. */
function moneyValue(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/);
  return m ? Number(m[1].replace(/,/g, "") + (m[2] || "")) : null;
}
/** A display amount to print. Missing prints "-". */
function moneyText(v) {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return `$${comma0(v)}`;
  return "-";
}

/**
 * journeyMap({ now, after, rounds = 3, hasCleanBureau, outcome }, cap)
 * The fundability journey (DIAGRAM_SPEC 4.5, parameterised).
 *   now / after     already-formatted display amounts ("$7,936") or null.
 *   rounds          dispute rounds on the repair track, a whole number 1-4.
 *   hasCleanBureau  true only when the file shows a clean bureau.
 *   outcome         the client's outcome code; "REPAIR_ONLY" also drops Track 1.
 * Two tracks (Track 1 fund now + Track 2 repair) only when hasCleanBureau ===
 * true, outcome is not REPAIR_ONLY, and now is not $0 or less; copy then
 * matches the Python. Otherwise Track 1 is not drawn at all and the repair
 * rounds run on one row under a "REPAIR FIRST" label, with repair-first copy.
 * "$0 AVAILABLE TODAY" on a FUND NOW track is an empty track (spec 4.5). A
 * missing now is not a zero: the track stays and prints "- AVAILABLE TODAY",
 * the house mark for unknown. The bigger-number box is drawn only when both
 * now and after read as amounts and after > now; otherwise the map ends at
 * RE-CHECK with no claim after it.
 * Returns "" when: the argument is null or not an object (no journey record),
 * or rounds is not a whole number from 1 to 4.
 */
export function journeyMap(opts = {}, cap) {
  if (opts === null || typeof opts !== "object" || Array.isArray(opts)) return "";
  const { now = null, after = null, rounds = 3, hasCleanBureau = false, outcome = null } = opts;
  const r = num(rounds);
  if (r === null || !Number.isInteger(r) || r < 1 || r > 4) return "";
  const nowN = moneyValue(now);
  const afterN = moneyValue(after);
  const track1 = hasCleanBureau === true
    && String(outcome ?? "").trim().toUpperCase() !== "REPAIR_ONLY"
    && !(nowN !== null && nowN <= 0);
  const bigger = nowN !== null && afterN !== null && afterN > nowN;

  const headline = track1
    ? "Your plan runs on two tracks at the same time."
    : "Your plan starts with repair.";
  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];

  const t1y = 64.0;
  const my = track1 ? 110.0 : 70.0;
  // one track: the repair row sits on the start node's centre line
  const t2y = track1 ? 156.0 : my - 12;

  // start node
  out.push(mono(0, my - 28, "YOU ARE HERE", { size: "6.0", fill: INK, weight: "700", ls: "1.2" }));
  out.push(`<rect x="0" y="${f0(my - 22)}" width="70" height="44" fill="${INK}"/>`);
  out.push(mono(35, my - 3, "START", { size: "7.4", fill: "#FFFFFF", weight: "700", anchor: "middle", ls: "1.4" }));
  out.push(mono(35, my + 10, "DIAGNOSTIC DONE", { size: "4.9", fill: "#B9B9C0", anchor: "middle", ls: "0.8" }));

  // split connectors
  if (track1) {
    for (const yy of [t1y, t2y]) {
      out.push(`<path d="M 70 ${f0(my)} L 82 ${f0(my)} L 82 ${f0(yy)} L 94 ${f0(yy)}" `
        + `fill="none" stroke="${INK}" stroke-width="1.1"/>`);
    }
  } else {
    out.push(`<path d="M 70 ${f0(my)} L 94 ${f0(my)}" fill="none" stroke="${INK}" stroke-width="1.1"/>`);
  }

  // track 1: fund now (never drawn empty; not drawn at all without a clean bureau)
  if (track1) {
    out.push(mono(96, t1y - 14, "TRACK 1 · FUND NOW", { size: "6.4", fill: INK, weight: "700", ls: "1.3" }));
    out.push(`<rect x="96" y="${f0(t1y - 18 + 2)}" width="0" height="0" fill="none"/>`);
    out.push(`<rect x="96" y="${f0(t1y - 16 + 8)}" width="140" height="40" fill="#FFFFFF" `
      + `stroke="${INK}" stroke-width="1.1"/>`);
    out.push(inter(166, t1y + 8, "Apply on your clean file", { size: "7.6", fill: INK, weight: "700", anchor: "middle" }));
    out.push(mono(166, t1y + 20, `${moneyText(now)} AVAILABLE TODAY`,
      { size: "5.9", fill: LABEL, anchor: "middle", ls: "0.7" }));
    out.push(`<line x1="236" y1="${f0(t1y + 4)}" x2="330" y2="${f0(t1y + 4)}" `
      + `stroke="${INK}" stroke-width="1.1"/>`);
  }

  // track 2: repair rounds. Three rounds is the Python's exact geometry.
  out.push(mono(96, t2y - 14, track1 ? "TRACK 2 · REPAIR" : "REPAIR FIRST",
    { size: "6.4", fill: INK, weight: "700", ls: "1.3" }));
  const bw = r <= 3 ? 60 : (212 - (r - 1) * 16) / r;
  const step = bw + 16;
  for (let i = 0; i < r; i++) {
    const bx = 96 + i * step;
    out.push(`<rect x="${bx}" y="${f0(t2y - 8)}" width="${bw}" height="40" fill="#FFFFFF" `
      + `stroke="${INK}" stroke-width="1.1"/>`);
    out.push(mono(bx + bw / 2, t2y + 8, `ROUND ${i + 1}`,
      { size: "6.4", fill: INK, weight: "700", anchor: "middle", ls: "0.8" }));
    out.push(mono(bx + bw / 2, t2y + 19, "DISPUTE", { size: "5.2", fill: MUTED, anchor: "middle", ls: "1.0" }));
    if (i < r - 1) {
      out.push(`<line x1="${bx + bw}" y1="${f0(t2y + 12)}" x2="${bx + bw + 14}" y2="${f0(t2y + 12)}" `
        + `stroke="${INK}" stroke-width="1.1"/>`);
      out.push(`<polygon points="${bx + bw + 16},${f0(t2y + 12)} ${bx + bw + 9},${f0(t2y + 9)} `
        + `${bx + bw + 9},${f0(t2y + 15)}" fill="${INK}"/>`);
    }
  }
  out.push(mono(96, t2y + 46, "EACH ROUND: DISPUTE · WAIT 30 DAYS · VERIFY · THEN THE NEXT",
    { size: "5.6", fill: MUTED, ls: "0.9" }));
  out.push(`<line x1="${96 + (r - 1) * step + bw}" y1="${f0(t2y + 12)}" x2="330" y2="${f0(t2y + 12)}" `
    + `stroke="${INK}" stroke-width="1.1"/>`);

  // merge
  if (track1) {
    for (const yy of [t1y + 4, t2y + 12]) {
      out.push(`<path d="M 330 ${f0(yy)} L 342 ${f0(yy)} L 342 ${f0(my)} L 352 ${f0(my)}" `
        + `fill="none" stroke="${INK}" stroke-width="1.1"/>`);
    }
  } else {
    out.push(`<path d="M 330 ${f0(my)} L 352 ${f0(my)}" fill="none" stroke="${INK}" stroke-width="1.1"/>`);
  }
  out.push(`<polygon points="356,${f0(my)} 348,${f0(my - 3.6)} 348,${f0(my + 3.6)}" fill="${INK}"/>`);
  out.push(`<rect x="356" y="${f0(my - 20)}" width="62" height="40" fill="#FFFFFF" `
    + `stroke="${INK}" stroke-width="1.1"/>`);
  out.push(mono(387, my - 3, "RE-CHECK", { size: "6.2", fill: INK, weight: "700", anchor: "middle", ls: "0.7" }));
  out.push(mono(387, my + 9, "FRESH REPORT", { size: "5.0", fill: MUTED, anchor: "middle", ls: "0.7" }));

  // destination: only a bigger number the caller actually has
  if (bigger) {
    out.push(`<line x1="418" y1="${f0(my)}" x2="432" y2="${f0(my)}" `
      + `stroke="${INK}" stroke-width="1.1"/>`);
    out.push(`<polygon points="436,${f0(my)} 428,${f0(my - 3.6)} 428,${f0(my + 3.6)}" fill="${INK}"/>`);
    out.push(`<rect x="436" y="${f0(my - 24)}" width="72" height="48" fill="#F6F6F8" `
      + `stroke="${INK}" stroke-width="1.4"/>`);
    out.push(`<rect x="436" y="${f0(my - 24)}" width="72" height="2.4" fill="url(#fhspec)"/>`);
    out.push(mono(472, my - 2, moneyText(after), { size: "9.8", fill: INK, weight: "700", anchor: "middle", ls: "-0.3" }));
    out.push(mono(472, my + 12, "BIGGER APPROVALS", { size: "4.9", fill: LABEL, anchor: "middle", ls: "0.7" }));
  }

  const ty = t2y + 68;
  if (track1) {
    out.push(inter(0, ty, "You do not wait for repair to finish before you get money. "
      + "Both tracks run at the same time.", { size: "9.4", fill: INK, weight: "600" }));
  } else {
    out.push(inter(0, ty, "Repair comes first on this file. Then a fresh report shows what opens up.",
      { size: "9.4", fill: INK, weight: "600" }));
  }
  out.push(inter(0, ty + 15, "Each dispute round makes the next application round stronger.",
    { size: "9.0", fill: "#45454B" }));
  return svg(ty + 24, out.join(""), cap, headline);
}

/**
 * disputeClock(cap)
 * How a dispute round works, with the 30 day clock drawn in. No data: the
 * same for every client. Never returns "".
 */
export function disputeClock(cap) {
  const bw = 112.0;
  const bh = 64.0;
  const top = 42.0;
  const agap = (W - bw * 4) / 3.0;
  const xs = [0, 1, 2, 3].map((i) => i * (bw + agap));
  const cyc = top + bh / 2.0;

  const headline = "Why disputes take rounds, not days.";
  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];

  const boxes = [
    ["STEP 1", "Send letters", "round 1 goes out"],
    ["STEP 2", "The 30 day clock", "the law gives bureaus 30 days"],
    ["STEP 3", "Results come back", "deleted · updated · verified"],
    ["STEP 4", "Still verified?", "we escalate, stronger letter"]
  ];
  boxes.forEach(([kick, bold, sub], i) => {
    const x = xs[i];
    out.push(`<rect x="${f1(x)}" y="${f1(top)}" width="${f1(bw)}" height="${f1(bh)}" `
      + `fill="#FFFFFF" stroke="${INK}" stroke-width="0.9"/>`);
    const cx = x + bw / 2.0;
    out.push(mono(cx, top + 13, kick, { size: "5.6", fill: LABEL, anchor: "middle", ls: "1.3" }));
    out.push(inter(cx, top + 28, bold, { size: "8.2", fill: INK, weight: "700", anchor: "middle" }));
    wrapWords(sub, 17).forEach((ln, j) => {
      out.push(mono(cx, top + 41 + j * 9.2, ln, { size: "6.0", fill: "#45454B", anchor: "middle", ls: "0.2" }));
    });
    if (i < 3) {
      const ax0 = x + bw + 4;
      const ax1 = x + bw + agap - 4;
      out.push(`<line x1="${f1(ax0)}" y1="${f1(cyc)}" x2="${f1(ax1 - 6)}" y2="${f1(cyc)}" `
        + `stroke="${INK}" stroke-width="1.1"/>`);
      out.push(`<polygon points="${f1(ax1)},${f1(cyc)} ${f1(ax1 - 8)},${f1(cyc - 4)} `
        + `${f1(ax1 - 8)},${f1(cyc + 4)}" fill="${INK}"/>`);
    }
  });

  // the clock face on box 2
  const ccx = xs[1] + bw - 16;
  const ccy = top + 14;
  const rad = 8.0;
  out.push(`<circle cx="${f1(ccx)}" cy="${f1(ccy)}" r="${f1(rad)}" fill="#FFFFFF" `
    + `stroke="${INK}" stroke-width="1.0"/>`);
  out.push(`<line x1="${f1(ccx)}" y1="${f1(ccy)}" x2="${f1(ccx)}" y2="${f1(ccy - 5.4)}" `
    + `stroke="${INK}" stroke-width="1.0"/>`);
  out.push(`<line x1="${f1(ccx)}" y1="${f1(ccy)}" x2="${f1(ccx + 3.8)}" y2="${f1(ccy + 1.6)}" `
    + `stroke="${INK}" stroke-width="1.0"/>`);

  // deleted exit from box 3
  const ex = xs[2] + bw / 2.0;
  out.push(`<line x1="${f1(ex)}" y1="${f1(top + bh)}" x2="${f1(ex)}" y2="${f1(top + bh + 16)}" `
    + `stroke="${INK}" stroke-width="1.1"/>`);
  out.push(`<polygon points="${f1(ex)},${f1(top + bh + 20)} ${f1(ex - 3.6)},${f1(top + bh + 12)} `
    + `${f1(ex + 3.6)},${f1(top + bh + 12)}" fill="${INK}"/>`);
  out.push(mono(ex, top + bh + 31, "DELETED = OFF YOUR REPORT",
    { size: "6.2", fill: INK, weight: "700", anchor: "middle", ls: "0.9" }));

  // loop back from box 4 over the top to box 1
  const lx0 = xs[3] + bw / 2.0;
  const lx1 = xs[0] + bw / 2.0;
  const ly = 28.0;
  out.push(`<path d="M ${f1(lx0)} ${f1(top)} L ${f1(lx0)} ${f1(ly)} L ${f1(lx1)} ${f1(ly)} `
    + `L ${f1(lx1)} ${f1(top - 4)}" fill="none" stroke="${MUTED}" `
    + 'stroke-width="0.9" stroke-dasharray="3 2.4"/>');
  out.push(`<polygon points="${f1(lx1)},${f1(top - 1)} ${f1(lx1 - 3.6)},${f1(top - 8)} `
    + `${f1(lx1 + 3.6)},${f1(top - 8)}" fill="${MUTED}"/>`);
  out.push(mono((lx0 + lx1) / 2.0, ly - 5, "ROUND 2 · ROUND 3",
    { size: "6.0", fill: MUTED, anchor: "middle", ls: "1.1" }));

  const ty = top + bh + 50;
  out.push(inter(0, ty, "One round rarely clears everything. Three rounds is normal.",
    { size: "9.4", fill: INK, weight: "600" }));
  out.push(inter(0, ty + 15, "The 30 day clock is set by law. That is why this takes "
    + "months, not days.", { size: "9.0", fill: "#45454B" }));
  return svg(ty + 24, out.join(""), cap, headline);
}

/**
 * applicationOrder(steps, cap)
 * steps: [[boldRule, subInstance]] drawn as the numbered path, with the
 * shotgun anti-pattern crossed out beside it. Five is the tested height.
 * With fewer than four steps the shotgun panel keeps the four-step height so
 * its spokes stay inside it. "The same five applications" is printed only for
 * five steps; any other count drops the number rather than state a wrong one.
 * Returns "" when: no steps.
 */
export function applicationOrder(steps, cap) {
  if (!Array.isArray(steps) || steps.length === 0 || !steps.every(Array.isArray)) return "";
  const headline = "The order protects your score. Follow it exactly.";
  const out = [inter(0, 13, headline, { size: "11.0", fill: INK, weight: "700" })];
  const top = 36.0;
  const rowh = 37.0;
  const cxch = 11.0;

  const n = steps.length;
  out.push(`<line x1="${f1(cxch)}" y1="${f1(top + 6)}" x2="${f1(cxch)}" `
    + `y2="${f1(top + (n - 1) * rowh + 6)}" stroke="${TRACK}" stroke-width="2"/>`);
  steps.forEach(([bold, sub], i) => {
    const y = top + i * rowh;
    out.push(`<circle cx="${f1(cxch)}" cy="${f1(y + 6)}" r="8" fill="${INK}"/>`);
    out.push(mono(cxch, y + 8.8, String(i + 1), { size: "7.2", fill: "#FFFFFF", weight: "700", anchor: "middle", ls: "0" }));
    out.push(inter(28, y + 5, bold, { size: "8.8", fill: INK, weight: "700" }));
    out.push(mono(28, y + 17, sub, { size: "6.3", fill: LABEL, ls: "0.5" }));
  });

  // the shotgun, crossed out
  const px = 330.0;
  const pw = 178.0;
  const py = top - 2;
  const ph = Math.max((n - 1) * rowh + 16, 3 * rowh + 16);
  out.push(`<rect x="${f1(px)}" y="${f1(py)}" width="${f1(pw)}" height="${f1(ph)}" `
    + 'fill="#F6F6F8" stroke="#DDDDE1" stroke-width="0.9"/>');
  const ccx = px + pw / 2.0;
  const ccy = py + ph / 2.0 - 12;
  out.push(`<circle cx="${f1(ccx)}" cy="${f1(ccy)}" r="4" fill="${MUTED}"/>`);
  const toRad = Math.PI / 180.0; // Python math.radians multiplies by pi/180
  for (let k = 0; k < 6; k++) {
    const a = (-80 + k * 33) * toRad;
    const ex = ccx + 52 * Math.cos(a);
    const ey = ccy + 52 * Math.sin(a);
    out.push(`<line x1="${f1(ccx)}" y1="${f1(ccy)}" x2="${f1(ex)}" y2="${f1(ey)}" `
      + `stroke="${MUTED}" stroke-width="0.9"/>`);
    out.push(`<circle cx="${f1(ex)}" cy="${f1(ey)}" r="2.2" fill="none" `
      + `stroke="${MUTED}" stroke-width="0.9"/>`);
  }
  out.push(`<line x1="${f1(px + 14)}" y1="${f1(py + 12)}" x2="${f1(px + pw - 14)}" `
    + `y2="${f1(py + ph - 30)}" stroke="${INK}" stroke-width="2.2"/>`);
  out.push(`<line x1="${f1(px + pw - 14)}" y1="${f1(py + 12)}" x2="${f1(px + 14)}" `
    + `y2="${f1(py + ph - 30)}" stroke="${INK}" stroke-width="2.2"/>`);
  out.push(mono(ccx, py + ph - 16, "THE SHOTGUN", { size: "6.6", fill: INK, weight: "700", anchor: "middle", ls: "1.2" }));
  out.push(mono(ccx, py + ph - 6, "HARD INQUIRIES · AUTO-DECLINES",
    { size: "5.4", fill: MUTED, anchor: "middle", ls: "0.8" }));

  // Python: top + (n-1)*rowh + 40. Same for n >= 4; below that, clear the panel.
  const ty = Math.max(top + (n - 1) * rowh + 40, py + ph + 26);
  out.push(inter(0, ty, n === 5
    ? "The same five applications in the wrong order get declined."
    : "The same applications in the wrong order get declined.",
  { size: "9.4", fill: INK, weight: "600" }));
  return svg(ty + 10, out.join(""), cap, headline);
}
