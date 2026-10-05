// The aligner, spec §9.2. PURE — no database, no network, no AI.
//
// Every take below is typed out by hand: the words, and the pauses between
// them, in seconds. A word lasts 0.3 s and is followed by 0.08 s of air unless a
// number in the list adds more. So each test reads like the take it describes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  alignTakes, judgeCut, anchorTime, normalizeText, numberToWords, wordsMatch,
  scriptLines, findAttempts, ALIGN_DEFAULTS, ALIGNER_VERSION
} from "./align.mjs";

const r = (x) => Math.round(x * 1000) / 1000;

/** Words with times: strings are spoken, numbers are extra silence in seconds. */
function speak(items, { wordSec = 0.3, gap = 0.08, t0 = 0.5 } = {}) {
  const words = [];
  let t = t0;
  for (const it of items) {
    if (typeof it === "number") { t += it; continue; }
    for (const w of it.split(/\s+/).filter(Boolean)) {
      words.push({ word: w, start: r(t), end: r(t + wordSec) });
      t += wordSec + gap;
    }
  }
  return words;
}

/** silencedetect's view of a take: every gap of 0.12 s or more, plus the lead-in. */
function silencesOf(words) {
  const out = [{ start: 0, end: words[0].start }];
  for (let i = 1; i < words.length; i += 1) {
    if (words[i].start - words[i - 1].end >= 0.12) out.push({ start: words[i - 1].end, end: words[i].start });
  }
  return out;
}

function take(id, recorded_at, items, extra = {}) {
  const words = speak(items, extra);
  return { id, recorded_at, words, silences: extra.noSilences ? [] : silencesOf(words) };
}

const WORDS_SCRIPT = {
  style: "words",
  body: "Most people never get funded.\n\nThe bank reads your file before it reads you.\n\nBook the call today.",
  parts: [
    { kind: "hook", text: "Most people never get funded." },
    { kind: "line2", text: "The bank reads your file before it reads you." },
    { kind: "cta", text: "Book the call today." }
  ]
};
const L0 = "Most people never get funded.";
const L1 = "The bank reads your file before it reads you.";
const L2 = "Book the call today.";

function spokenText(plan) {
  return plan.kept_words.map((w) => w.text).join(" ");
}

function assertSane(plan) {
  let clock = 0;
  for (const p of plan.pieces) {
    assert.ok(p.end > p.start, `piece ends after it starts (${p.start}–${p.end})`);
    assert.ok(p.start >= 0);
    assert.equal(p.cut_start, r(clock), "pieces sit back to back on the cut's timeline");
    clock += p.end - p.start;
  }
  assert.ok(Math.abs(plan.duration - clock) < 0.005, "the cut is exactly the sum of its pieces — no silence inserted");
  // No stretch of a take plays twice.
  const byTake = {};
  for (const p of plan.pieces) (byTake[p.take_id] ||= []).push(p);
  for (const list of Object.values(byTake)) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i].start >= sorted[i - 1].end - 1e-9, "no overlap in one take");
  }
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, "the plan is plain JSON (it is stored as cut_plan)");
}

/* ───────────────────────────── normalize ───────────────────────────── */

describe("normalize both sides to spoken words", () => {
  test("$300,000, 300K and 300 grand all become three hundred thousand (dollars optional)", () => {
    const want = ["three", "hundred", "thousand"];
    assert.deepEqual(normalizeText("$300,000"), want);
    assert.deepEqual(normalizeText("300K"), want);
    assert.deepEqual(normalizeText("$300k."), want);
    assert.deepEqual(normalizeText("300 grand"), want);
    assert.deepEqual(normalizeText("three hundred thousand dollars"), want);
    assert.deepEqual(normalizeText("three hundred grand"), want);
    assert.deepEqual(normalizeText("300,000 dollars"), want);
  });

  test('"a" counts as "one" before hundred, thousand or million', () => {
    assert.deepEqual(normalizeText("a hundred thousand"), ["one", "hundred", "thousand"]);
    assert.deepEqual(normalizeText("a million bucks"), ["one", "million"]);
    assert.deepEqual(normalizeText("$1,000,000"), ["one", "million"]);
    assert.deepEqual(normalizeText("a grand"), ["one", "thousand"]);
    assert.deepEqual(normalizeText("a bank"), ["a", "bank"], "a plain 'a' stays");
  });

  test("% becomes percent, decimals and scale suffixes are spoken", () => {
    assert.deepEqual(normalizeText("20%"), ["twenty", "percent"]);
    assert.deepEqual(normalizeText("20 per cent"), ["twenty", "percent"]);
    assert.deepEqual(normalizeText("$1.5M"), ["one", "point", "five", "million"]);
    assert.deepEqual(normalizeText("750"), ["seven", "hundred", "fifty"]);
    assert.deepEqual(normalizeText("3rd"), ["third"]);
    assert.deepEqual(normalizeText("21st"), ["twenty", "first"]);
  });

  test("contractions are expanded, ↑ marks and CAPS are dropped", () => {
    assert.deepEqual(normalizeText("Don't"), ["do", "not"]);
    assert.deepEqual(normalizeText("It’s"), ["it", "is"]);
    assert.deepEqual(normalizeText("you're we've they'll I'm I'd"), ["you", "are", "we", "have", "they", "will", "i", "am", "i", "would"]);
    assert.deepEqual(normalizeText("can't won't"), ["can", "not", "will", "not"]);
    assert.deepEqual(normalizeText("↑ GET FUNDED"), ["get", "funded"]);
    assert.deepEqual(normalizeText("Fundhub's"), ["fundhubs"], "a possessive is not 'is'");
    assert.deepEqual(normalizeText("pre-approved — today"), ["pre", "approved", "today"]);
  });

  test("numberToWords", () => {
    assert.deepEqual(numberToWords(0), ["zero"]);
    assert.deepEqual(numberToWords(15), ["fifteen"]);
    assert.deepEqual(numberToWords(1234567), ["one", "million", "two", "hundred", "thirty", "four", "thousand", "five", "hundred", "sixty", "seven"]);
  });

  test("words of 5+ letters match at an edit similarity of 0.8, short words must be equal", () => {
    assert.equal(wordsMatch("underwriting", "underwritting"), true);
    assert.equal(wordsMatch("funded", "funder"), true, "1 edit in 6 letters is 0.83");
    assert.equal(wordsMatch("funded", "fended"), true);
    assert.equal(wordsMatch("funds", "finds"), true, "1 edit in 5 letters is exactly 0.8");
    assert.equal(wordsMatch("bank", "bunk"), false, "4 letters never fuzzy-match");
    assert.equal(wordsMatch("credit", "debit"), false);
  });
});

/* ───────────────────────────── lines ───────────────────────────── */

describe("lines", () => {
  test("parts split into sentences; a blank line after a line is a planned pause", () => {
    const { style, lines } = scriptLines({
      body: "Hook one. Hook two.\n\nThe middle line.\nThe CTA.",
      parts: [
        { kind: "hook", text: "Hook one. Hook two." },
        { kind: "body", text: "The middle line." },
        { kind: "cta", text: "The CTA." }
      ]
    });
    assert.equal(style, "words");
    assert.deepEqual(lines.map((l) => [l.kind, l.text, l.pause_after]), [
      ["hook", "Hook one.", false],
      ["hook", "Hook two.", true],
      ["body", "The middle line.", false],
      ["cta", "The CTA.", false]
    ]);
  });

  test("with no parts, the body's paragraphs are the parts", () => {
    const { lines } = scriptLines({ body: "One line here.\n\nAnother one." });
    assert.deepEqual(lines.map((l) => [l.kind, l.text, l.pause_after]), [["body", "One line here.", true], ["body", "Another one.", false]]);
  });

  test("in bullets style a cue stays one freestyle line", () => {
    const { lines } = scriptLines({ style: "bullets", parts: [{ kind: "hook", text: "A. B." }, { kind: "cue", text: "banks. lenders. rates." }] });
    assert.deepEqual(lines.map((l) => [l.kind, l.freestyle]), [["hook", false], ["hook", false], ["cue", true]]);
  });
});

/* ───────────────────────────── the cut ───────────────────────────── */

describe("one clean take", () => {
  const t1 = take("t1", "2026-10-05T10:00:00Z", [L0, L1, L2]);
  const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });

  test("zero missing lines, full coverage, every line kept in script order", () => {
    assert.equal(plan.version, ALIGNER_VERSION);
    assert.deepEqual(plan.missing_lines, []);
    assert.deepEqual(plan.said_differently, []);
    assert.equal(plan.coverage, 1);
    assert.deepEqual(plan.lines.map((l) => l.status), ["kept", "kept", "kept", "kept"].slice(0, plan.lines.length));
    assert.equal(spokenText(plan), normalizeText(`${L0} ${L1} ${L2}`).join(" "));
    assertSane(plan);
  });

  test("the cut starts 40 ms before the first word and ends 80 ms after the last", () => {
    const first = t1.words[0], last = t1.words[t1.words.length - 1];
    assert.equal(plan.pieces[0].start, r(first.start - 0.04));
    assert.equal(plan.pieces[plan.pieces.length - 1].end, r(last.end + 0.08));
  });

  test("lines said back to back in one take join into one piece", () => {
    assert.equal(plan.pieces.length, 1);
    assert.deepEqual(plan.pieces[0].lines, [0, 1, 2]);
    assert.equal(plan.switches, 0);
  });

  test("judgeCut: build", () => {
    assert.equal(judgeCut(plan).action, "build");
  });

  test("the same input gives the same plan", () => {
    assert.deepEqual(alignTakes({ script: WORDS_SCRIPT, takes: [t1] }), plan);
  });
});

describe("best take of every line, once, in script order", () => {
  test("a fumbled line is taken from the take that got it right", () => {
    const t1 = take("t1", "2026-10-05T10:00:00Z", [L0, 0.5, "the bank reads your", 1.5, L2]);
    const t2 = take("t2", "2026-10-05T10:05:00Z", [L1]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1, t2] });
    assert.deepEqual(plan.missing_lines, []);
    assert.deepEqual(plan.pieces.map((p) => [p.take_id, p.line]), [["t1", 0], ["t2", 1], ["t1", 2]]);
    assert.equal(plan.switches, 2);
    assert.equal(plan.coverage, 1);
    assert.equal(spokenText(plan), normalizeText(`${L0} ${L1} ${L2}`).join(" "), "each line once, no fumble left in");
    assertSane(plan);
  });

  test("when two takes are both clean, the latest one wins every line (no needless switching)", () => {
    const t1 = take("t1", "2026-10-05T10:00:00Z", [L0, L1, L2]);
    const t2 = take("t2", "2026-10-05T10:05:00Z", [L0, L1, L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t2, t1] });
    assert.deepEqual(plan.takes_used, ["t2"]);
    assert.equal(plan.pieces.length, 1);
  });

  test("takes are ordered by recorded_at, not by the order they arrive in", () => {
    const early = take("early", "2026-10-05T09:00:00Z", [L0, L1, L2]);
    const late = take("late", "2026-10-05T11:00:00Z", [L0, L1, L2]);
    assert.deepEqual(alignTakes({ script: WORDS_SCRIPT, takes: [late, early] }).takes_used, ["late"]);
    assert.deepEqual(alignTakes({ script: WORDS_SCRIPT, takes: [early, late] }).takes_used, ["late"]);
  });

  test("a line said twice in one take keeps the later, clean try", () => {
    const t1 = take("t1", "2026-10-05T10:00:00Z", [L0, L1, 0.6, L1, L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    const line1 = plan.kept_words.filter((w) => w.line === 1);
    const secondTry = t1.words[5 + 9];
    assert.equal(line1[0].start, secondTry.start, "line 2 starts at its second try");
    assert.equal(line1.length, normalizeText(L1).length, "and is in the cut once");
    assertSane(plan);
  });

  test("a try with a stall over 1.0 s loses to a clean try", () => {
    const t1 = take("t1", "2026-10-05T10:00:00Z", [L0, "the bank reads your file", 1.4, "before it reads you", 0.6, L1, L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    const line1 = plan.kept_words.filter((w) => w.line === 1);
    assert.equal(line1[0].start, t1.words[14].start, "the clean try, not the stalled one");
  });

  test("a mis-heard word does not break the line", () => {
    const t1 = take("t1", "2026-10-05T10:00:00Z", [L0, "the bank reeds your file before it reads you.", L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    assert.deepEqual(plan.missing_lines, []);
    assert.equal(plan.lines[1].status, "kept");
    assert.ok(plan.lines[1].coverage >= 0.9);
  });

  test("numbers match however they were written or heard", () => {
    const script = { body: "You can get $300,000 in 30 days.", parts: [{ kind: "hook", text: "You can get $300,000 in 30 days." }] };
    const t1 = take("t1", null, ["you can get three hundred thousand dollars in thirty days"]);
    const plan = alignTakes({ script, takes: [t1] });
    assert.equal(plan.coverage, 1);
  });
});

describe("restarts and false starts", () => {
  test("a restart is stitched: the first try up to the restart point, then the second try", () => {
    const t1 = take("t1", "2026-10-05T10:00:00Z", ["most people never get funded because", 0.5, "because their file is thin."]);
    const script = { body: "Most people never get funded because their file is thin.", parts: [{ kind: "hook", text: "Most people never get funded because their file is thin." }] };
    const plan = alignTakes({ script, takes: [t1] });
    assert.equal(plan.coverage, 1);
    assert.equal(spokenText(plan), "most people never get funded because their file is thin", "'because' is said once");
    assert.equal(plan.pieces.length, 2, "two stretches of the same take");
    const dup = t1.words[5];
    assert.ok(plan.pieces[0].end <= t1.words[6].start, "the false start's 'because' is cut out");
    assert.ok(plan.pieces[0].end < dup.end || plan.pieces[1].start > dup.start);
    assertSane(plan);
  });

  test("a restart from the top of the line keeps only the full try", () => {
    const t1 = take("t1", null, ["the bank reads your", 0.4, L1]);
    const script = { body: L1, parts: [{ kind: "line2", text: L1 }] };
    const plan = alignTakes({ script, takes: [t1] });
    assert.equal(spokenText(plan), normalizeText(L1).join(" "));
    assert.equal(plan.pieces.length, 1);
    assert.equal(plan.pieces[0].start, r(t1.words[4].start - 0.04));
  });

  test("a restart more than 8 s later is not stitched", () => {
    const line = "most people never get funded because their file is thin";
    const attemptsOf = (items) => {
      const words = speak(items);
      const toks = words.map((w) => ({ text: normalizeText(w.word)[0], start: w.start, end: w.end }));
      return findAttempts({ order: 0, toks }, normalizeText(line));
    };
    assert.equal(attemptsOf(["most people never get funded because", 9, "because their file is thin"]).length, 2);
    const plan = alignTakes({
      script: { body: line, parts: [{ kind: "hook", text: line }] },
      takes: [take("t1", null, ["most people never get funded because", 9, "because their file is thin"])]
    });
    assert.ok(plan.coverage < 1, "no stitch across 9 s of silence");
  });
});

describe("fillers", () => {
  const script = { body: L1, parts: [{ kind: "line2", text: L1 }] };

  test('"um" with 150 ms of silence on both sides is cut', () => {
    const t1 = take("t1", null, ["the bank reads", 0.12, "um", 0.12, "your file before it reads you"]);
    const plan = alignTakes({ script, takes: [t1] });
    assert.ok(!plan.kept_words.some((w) => w.text === "um"));
    assert.equal(plan.pieces.length, 2);
    assertSane(plan);
  });

  test('"um" run straight into the words is left alone (cutting it would clip speech)', () => {
    const t1 = take("t1", null, ["the bank reads um your file before it reads you"]);
    const plan = alignTakes({ script, takes: [t1] });
    assert.ok(plan.kept_words.some((w) => w.text === "um"));
  });

  test('"like" and "you know" need 250 ms on both sides', () => {
    const cut = alignTakes({ script, takes: [take("t1", null, ["the bank reads", 0.2, "you know", 0.2, "your file before it", 0.2, "like", 0.2, "reads you"])] });
    assert.ok(!cut.kept_words.some((w) => w.text === "know" || w.text === "like"));
    const kept = alignTakes({ script, takes: [take("t1", null, ["the bank reads", 0.1, "like", 0.1, "your file before it reads you"])] });
    assert.ok(kept.kept_words.some((w) => w.text === "like"), "only 180 ms of air: kept");
  });

  test('a "like" the script says is never cut', () => {
    const line = "It works like a loan.";
    const plan = alignTakes({
      script: { body: line, parts: [{ kind: "hook", text: line }] },
      takes: [take("t1", null, ["it works", 0.3, "like", 0.3, "a loan"])]
    });
    assert.ok(plan.kept_words.some((w) => w.text === "like"));
    assert.equal(plan.coverage, 1);
  });
});

describe("edges and gaps", () => {
  test("dead air between lines becomes the normal gap: 250 ms of the source's own pause", () => {
    const script = { body: `${L0} ${L1}`, parts: [{ kind: "hook", text: `${L0} ${L1}` }] };
    const t1 = take("t1", null, [L0, 2.0, L1], { noSilences: true });
    const plan = alignTakes({ script, takes: [t1] });
    assert.equal(plan.pieces.length, 2);
    const lastOfL0 = t1.words[4];
    assert.equal(plan.pieces[0].end, r(lastOfL0.end + 0.08 + 0.25));
    assert.ok(plan.duration < (t1.words[t1.words.length - 1].end - t1.words[0].start) - 1.5, "the 2 s pause is gone");
  });

  test("at a planned pause (a blank line in the script) the gap can run to 450 ms", () => {
    const t1 = take("t1", null, [L0, 2.0, L1, 2.0, L2], { noSilences: true });
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    assert.ok(plan.lines[0].pause_after);
    assert.equal(plan.pieces[0].end, r(t1.words[4].end + 0.08 + 0.45));
  });

  test("the gap never reaches into the next word, and no silence is inserted", () => {
    const t1 = take("t1", null, [L0, 0.25, L1], { noSilences: true });
    const script = { body: `${L0} ${L1}`, parts: [{ kind: "hook", text: `${L0} ${L1}` }] };
    const plan = alignTakes({ script, takes: [t1] });
    assert.equal(plan.pieces.length, 1, "a short natural pause stays as it was");
    assert.equal(plan.pieces[0].end, r(t1.words[t1.words.length - 1].end + 0.08));
    assertSane(plan);
  });

  test("an edge snaps to the nearest silence within 250 ms", () => {
    const t1 = take("t1", null, [L1]);
    t1.silences = [{ start: 0.1, end: 0.3 }];
    const plan = alignTakes({ script: { body: L1, parts: [{ kind: "line2", text: L1 }] }, takes: [t1] });
    assert.equal(plan.pieces[0].start, 0.3, "0.46 is not silence; the silence ending at 0.30 is 160 ms away");
    const far = take("t1", null, [L1]);
    far.silences = [{ start: 0.0, end: 0.1 }];
    const plan2 = alignTakes({ script: { body: L1, parts: [{ kind: "line2", text: L1 }] }, takes: [far] });
    assert.equal(plan2.pieces[0].start, 0.46, "a silence 360 ms away is too far to snap to");
  });

  test("long dead air inside a line is cut down too", () => {
    const t1 = take("t1", null, ["the bank reads your file", 0.9, "before it reads you"], { noSilences: true });
    const plan = alignTakes({ script: { body: L1, parts: [{ kind: "line2", text: L1 }] }, takes: [t1] });
    assert.equal(plan.pieces.length, 2);
    assert.equal(plan.lines[0].status, "kept");
  });
});

describe("lines said differently, missing lines and holds", () => {
  test("a line said in other words between kept neighbours of one take is kept and marked", () => {
    const t1 = take("t1", null, [L0, "banks look at the paperwork first", L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    assert.deepEqual(plan.said_differently, [1]);
    assert.deepEqual(plan.missing_lines, []);
    assert.equal(plan.lines[1].status, "said_differently");
    assert.ok(plan.kept_words.some((w) => w.text === "paperwork"));
    assertSane(plan);
  });

  test("a ramble over twice the line's length is not kept", () => {
    const ramble = "so what happens is the bank goes and they pull everything they can find and they look at all of it and they decide before you ever even talk to anybody there at all";
    const t1 = take("t1", null, [L0, ramble, L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    assert.deepEqual(plan.missing_lines, [1]);
    assert.ok(!plan.kept_words.some((w) => w.text === "ramble" || w.text === "anybody"));
  });

  test("a missing hook holds the take before Submagic", () => {
    const t1 = take("t1", null, [L1, L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    assert.deepEqual(plan.missing_lines, [0]);
    const v = judgeCut(plan);
    assert.equal(v.action, "hold");
    assert.match(v.hold_reason, /missing the hook/);
  });

  test("coverage under 70% holds; under 50% sends the take back to be matched again", () => {
    assert.equal(judgeCut({ coverage: 0.65, lines: [] }).action, "hold");
    assert.match(judgeCut({ coverage: 0.65, lines: [] }).hold_reason, /65%/);
    assert.equal(judgeCut({ coverage: 0.49, lines: [] }).action, "rematch");
    assert.equal(judgeCut({ coverage: 0.95, lines: [{ kind: "cta", status: "missing" }] }).action, "hold");
    const wrongScript = alignTakes({ script: WORDS_SCRIPT, takes: [take("t1", null, ["something else entirely about taxes and nothing more"])] });
    assert.equal(judgeCut(wrongScript).action, "rematch");
  });

  test("a struck line is left out of the cut and is not missing", () => {
    const t1 = take("t1", null, [L0, L1, L2]);
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1], struck: [1] });
    assert.deepEqual(plan.struck_lines, [1]);
    assert.deepEqual(plan.missing_lines, []);
    assert.ok(!plan.kept_words.some((w) => w.line === 1));
    assert.equal(plan.coverage, 1, "coverage counts the lines still in the script");
    assert.equal(plan.pieces.length, 2);
    assertSane(plan);
  });

  test("no takes, no words: everything missing, nothing to cut", () => {
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [] });
    assert.deepEqual(plan.pieces, []);
    assert.equal(plan.coverage, 0);
    assert.equal(judgeCut(plan).action, "rematch");
  });
});

describe("bullets style", () => {
  const script = {
    style: "bullets",
    body: "Your bank already decided.\nHere is why.\n\nfile age\nutilization\nrates\n\nThat is the roadmap.\nBook the call.",
    parts: [
      { kind: "hook", text: "Your bank already decided." },
      { kind: "line2", text: "Here is why." },
      { kind: "cue", text: "file age" },
      { kind: "cue", text: "utilization" },
      { kind: "cue", text: "rates" },
      { kind: "reveal", text: "That is the roadmap." },
      { kind: "cta", text: "Book the call." }
    ]
  };
  const middle = [
    "first your file has an age and young files scare them",
    "then the banks look at your",
    0.6,
    "then the banks look at your utilization and anything over thirty percent hurts",
    "and every lender has their own box"
  ];
  const t1 = take("t1", null, ["your bank already decided", "here is why", ...middle, "that is the roadmap", "book the call"]);
  const plan = alignTakes({ script, takes: [t1] });

  test("word-for-word parts are aligned; the freestyle middle rides between line 2 and the reveal", () => {
    assert.equal(plan.style, "bullets");
    assert.deepEqual(plan.missing_lines, []);
    assert.equal(plan.coverage, 1);
    assert.ok(plan.kept_words.some((w) => w.text === "young"), "the freestyle words are in the cut");
    assertSane(plan);
  });

  test("a freestyle restart of 4+ words after 400 ms of silence keeps only the last copy", () => {
    const n = spokenText(plan).split(" ").filter((w, i, a) => w === "banks" && a[i + 1] === "look").length;
    assert.equal(n, 1);
  });

  test("cues are found by keyword and anchors use a cue index plus a keyword", () => {
    const cues = plan.lines.filter((l) => l.kind === "cue");
    assert.deepEqual(cues.map((c) => c.status), ["kept", "kept", "said_differently"]);
    assert.equal(cues[1].keyword, "utilization");
    const hit = anchorTime(plan, { cue: 1, keyword: "thirty" });
    assert.equal(hit.found, true);
    const thirty = plan.kept_words.find((w) => w.text === "thirty");
    assert.equal(hit.time, thirty.cut_start);
    const fallback = anchorTime(plan, { cue: 1, keyword: "mortgage" });
    assert.deepEqual(fallback, { time: cues[1].cut_start, found: false }, "falls back to the cue's start");
    assert.ok(cues[0].cut_start < cues[1].cut_start && cues[1].cut_start <= cues[2].cut_start);
  });

  test("the freestyle middle's fillers go too", () => {
    const t2 = take("t2", null, ["your bank already decided", "here is why", "first your file", 0.2, "um", 0.2, "has an age utilization lenders", "that is the roadmap", "book the call"]);
    const p2 = alignTakes({ script, takes: [t2] });
    assert.ok(!p2.kept_words.some((w) => w.text === "um"));
  });
});

describe("anchors in words style", () => {
  const t1 = take("t1", null, [L0, L1, L2]);
  test("an exact phrase lands where it is said in the cut", () => {
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1] });
    const a = anchorTime(plan, { phrase: "reads your file" });
    const w = plan.kept_words.find((x) => x.text === "reads");
    assert.deepEqual(a, { time: w.cut_start, found: true });
  });
  test("an anchor whose line was cut returns null (the animation is skipped and flagged)", () => {
    const plan = alignTakes({ script: WORDS_SCRIPT, takes: [t1], struck: [1] });
    assert.equal(anchorTime(plan, { phrase: "reads your file" }), null);
  });
});

describe("a real shoot: several takes, each with its own trouble", () => {
  const lines = [
    "Your bank already decided before you walked in.",
    "Here is what they saw.",
    "A file under two years old reads as a risk.",
    "Cards over thirty percent read as stress.",
    "The roadmap fixes both in ninety days.",
    "Tap the button and get yours."
  ];
  const script = {
    style: "words",
    body: `${lines[0]} ${lines[1]}\n\n${lines[2]} ${lines[3]}\n\n${lines[4]}\n\n${lines[5]}`,
    parts: [
      { kind: "hook", text: lines[0] },
      { kind: "line2", text: lines[1] },
      { kind: "body", text: `${lines[2]} ${lines[3]}` },
      { kind: "reveal", text: lines[4] },
      { kind: "cta", text: lines[5] }
    ]
  };
  // Take 1: good start, stalls and gives up on line 4.
  const t1 = take("IMG_0412.MOV", "2026-10-05T15:00:00Z", [
    0.8, lines[0], lines[1], 0.9, "um", 0.3, lines[2], "cards over thirty", 1.6, "uh", 2.0
  ]);
  // Take 2: false start on line 4, then lines 4–6 clean, with a "you know".
  const t2 = take("IMG_0413.MOV", "2026-10-05T15:02:00Z", [
    0.5, "cards over thirty percent read as", 0.6, "cards over 30% read as stress.", 0.3,
    "you know", 0.3, lines[4], 1.2, lines[5], 1.5
  ]);
  // Take 3: Chris redoes only the hook. Submagic's word shape (text/startTime/endTime).
  const t3raw = take("IMG_0414.MOV", "2026-10-05T15:04:00Z", [0.4, lines[0], 1.0]);
  const t3 = { ...t3raw, words: t3raw.words.map((w) => ({ text: w.word, startTime: w.start, endTime: w.end })) };

  const plan = alignTakes({ script, takes: [t3, t1, t2] });

  test("every line once, in script order, with no filler, false start or doubled line", () => {
    assert.deepEqual(plan.missing_lines, []);
    assert.equal(plan.coverage, 1);
    assert.ok(plan.lines.every((l) => l.status === "kept"));
    assert.equal(spokenText(plan), normalizeText(lines.join(" ")).join(" "));
    assert.equal(judgeCut(plan).action, "build");
    assertSane(plan);
  });

  test("every line keeps its latest clean try: the re-done hook comes from take 3", () => {
    const owner = Object.fromEntries(plan.lines.map((l) => [l.index, l.take_id]));
    assert.deepEqual(owner, {
      0: "IMG_0414.MOV",
      1: "IMG_0412.MOV",
      2: "IMG_0412.MOV",
      3: "IMG_0413.MOV",
      4: "IMG_0413.MOV",
      5: "IMG_0413.MOV"
    });
    assert.equal(plan.switches, 2);
  });

  test("dead air is gone: no silence over 0.6 s inside a piece, none at the head or tail", () => {
    for (const p of plan.pieces) {
      const inside = plan.kept_words.filter((w) => w.take_id === p.take_id && w.start >= p.start && w.end <= p.end);
      for (let i = 1; i < inside.length; i += 1) assert.ok(inside[i].start - inside[i - 1].end <= 0.6);
      assert.ok(inside[0].start - p.start <= 0.04 + 1e-9, "40 ms lead");
      assert.ok(p.end - inside[inside.length - 1].end <= 0.08 + 0.45 + 1e-9, "tail plus at most a planned pause");
    }
    assert.ok(plan.duration < 18, `cut is ${plan.duration}s; the takes run ${r(t1.words.at(-1).end + t2.words.at(-1).end + t3raw.words.at(-1).end)}s`);
  });
});

describe("review round 1 (PR #32)", () => {
  const lineCoverage = (scriptText, said) => {
    const plan = alignTakes({
      script: { body: scriptText, parts: [{ kind: "hook", text: scriptText }] },
      takes: [take("t1", null, [said])]
    });
    return plan.lines[0].coverage;
  };

  test("spoken numbers in a transcript are read as a phrase, like the script", () => {
    assert.ok(lineCoverage("You can get $300,000 in funding.", "you can get 300 grand in funding") >= 0.9);
    assert.ok(lineCoverage("You can get $100,000 in funding.", "you can get a hundred thousand in funding") >= 0.9);
    assert.ok(lineCoverage("Start with $50K in funding.", "start with 50 grand in funding") >= 0.9);
    assert.equal(lineCoverage("You can get $300,000 in funding.", "you can get 300 grand in funding"), 1);
  });

  test("a merged number keeps the time of the words it came from", () => {
    const t1 = take("t1", null, ["you can get 300 grand"]);
    const plan = alignTakes({ script: { body: "You can get $300,000.", parts: [{ kind: "hook", text: "You can get $300,000." }] }, takes: [t1] });
    const thousand = plan.kept_words.find((w) => w.text === "thousand");
    assert.equal(thousand.word, "grand");
    assert.equal(thousand.start, t1.words[4].start);
    assert.equal(thousand.end, t1.words[4].end);
    const hundred = plan.kept_words.find((w) => w.text === "hundred");
    assert.equal(hundred.word, "300");
  });

  test("years are said as years", () => {
    assert.deepEqual(normalizeText("2026"), ["twenty", "twenty", "six"]);
    assert.deepEqual(normalizeText("In 1905."), ["in", "nineteen", "oh", "five"]);
    assert.deepEqual(normalizeText("2005"), ["two", "thousand", "five"]);
    assert.deepEqual(normalizeText("1900"), ["nineteen", "hundred"]);
    assert.deepEqual(normalizeText("$2,500"), ["two", "thousand", "five", "hundred"], "a price with a comma stays a plain number");
  });

  test("the LATEST qualifying try wins, even when an earlier one heard more words", () => {
    const line = "The bank reads your whole file before it ever reads you.";
    const n = normalizeText(line).length;
    const t1 = take("t1", "2026-10-05T10:00:00Z", [line]);
    const t2 = take("t2", "2026-10-05T10:05:00Z", ["the bank reads your whole file before it ever reads"]);
    const plan = alignTakes({ script: { body: line, parts: [{ kind: "hook", text: line }] }, takes: [t1, t2] });
    assert.equal(n, 11);
    assert.equal(plan.lines[0].coverage, r(10 / 11), "take 2 heard 91%");
    assert.equal(plan.lines[0].take_id, "t2", "take 2 is later and qualifies, so it wins over take 1's 100%");
  });

  test("a line the script says twice never reuses one recorded stretch", () => {
    const hook = "Book the call today.";
    const script = {
      body: `${hook}\n\nThe bank reads your file before it reads you.\n\n${hook}`,
      parts: [{ kind: "hook", text: hook }, { kind: "line2", text: L1 }, { kind: "cta", text: hook }]
    };
    const t1 = take("t1", null, [hook, L1, hook]);
    const plan = alignTakes({ script, takes: [t1] });
    assert.deepEqual(plan.missing_lines, []);
    const first = plan.kept_words.filter((w) => w.line === 0);
    const last = plan.kept_words.filter((w) => w.line === 2);
    assert.equal(first[0].start, t1.words[0].start, "the hook is the first time he said it");
    assert.equal(last[0].start, t1.words[4 + 9].start, "the CTA is the second time");
    assertSane(plan);
    const once = alignTakes({ script, takes: [take("t1", null, [hook, L1])] });
    assert.equal(once.missing_lines.length, 1, "said once: only one of the two lines gets it");
  });

  test("an all-struck or empty script is a hold, not a rematch", () => {
    const t1 = take("t1", null, [L0, L1, L2]);
    const allStruck = alignTakes({ script: WORDS_SCRIPT, takes: [t1], struck: [0, 1, 2] });
    assert.equal(allStruck.words_total, 0);
    assert.equal(judgeCut(allStruck).action, "hold");
    const empty = alignTakes({ script: { body: "" }, takes: [t1] });
    assert.equal(judgeCut(empty).action, "hold");
    assert.match(judgeCut(empty).hold_reason, /no script lines/);
  });
});

test("the defaults are the spec's numbers", () => {
  assert.equal(ALIGN_DEFAULTS.qualifyCoverage, 0.9);
  assert.equal(ALIGN_DEFAULTS.maxStallSeconds, 1.0);
  assert.equal(ALIGN_DEFAULTS.switchCost, 0.15);
  assert.equal(ALIGN_DEFAULTS.stitchWithinSeconds, 8);
  assert.equal(ALIGN_DEFAULTS.leadSeconds, 0.04);
  assert.equal(ALIGN_DEFAULTS.tailSeconds, 0.08);
  assert.equal(ALIGN_DEFAULTS.snapSeconds, 0.25);
  assert.equal(ALIGN_DEFAULTS.gapSeconds, 0.25);
  assert.equal(ALIGN_DEFAULTS.plannedPauseSeconds, 0.45);
  assert.equal(ALIGN_DEFAULTS.umSilenceSeconds, 0.15);
  assert.equal(ALIGN_DEFAULTS.likeSilenceSeconds, 0.25);
  assert.equal(ALIGN_DEFAULTS.saidDifferentlyBelow, 0.85);
  assert.equal(ALIGN_DEFAULTS.restartMinWords, 4);
  assert.equal(ALIGN_DEFAULTS.restartSilenceSeconds, 0.4);
  assert.equal(ALIGN_DEFAULTS.restartWithinSeconds, 6);
  assert.equal(ALIGN_DEFAULTS.holdBelow, 0.7);
  assert.equal(ALIGN_DEFAULTS.rematchBelow, 0.5);
});
