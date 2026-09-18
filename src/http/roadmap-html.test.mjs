// public/roadmap.html is the second step of the /optimize referral door: the
// person says who they are, and the page draws the plan we walk them through.
//
// The guards that matter here are honesty guards. The roadmap engine runs on a
// STORED SAMPLE FILE until a real credit pull exists, so the page must never let
// an example read as the person's own report, and must never dress an unknown
// number up as a real one.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, "../../public/roadmap.html");
const OPTIMIZE = path.resolve(HERE, "../../public/optimize.html");

const html = fs.readFileSync(PAGE, "utf8");
const optimize = fs.readFileSync(OPTIMIZE, "utf8");

test("roadmap.html reads the roadmap the server already builds", () => {
  assert.match(
    html,
    /\/api\/public\/optimize\?view=roadmap/,
    "must draw the existing roadmap endpoint, not invent its own numbers"
  );
  assert.match(html, /data\.source !== "file"/, "must branch on what the server says the file is");
});

test("an example file is SAID to be an example", () => {
  assert.match(
    html,
    /not on yours/,
    "the sample notice must tell the person the plan is not built on their report"
  );
  assert.match(
    html,
    /are not yours/,
    "the sample notice must say the names, balances and dates are not theirs"
  );
});

test("an unknown figure is never drawn as a zero", () => {
  assert.match(
    html,
    /preapprovalKnown === true/,
    "must read the server's known/unknown flag rather than trusting a 0"
  );
  assert.match(html, /Not known yet/, "an unknown figure says so in words");
});

test("an object finding is spelled out, never printed as a shape", () => {
  assert.match(
    html,
    /function readable\(/,
    "inquiry findings carry an object in `observed` and need spelling out"
  );
  // Both halves of the observed/expected pair must go through it. Either one
  // rendered straight is the bug this guards.
  assert.match(html, /readable\(f\.observed\)/, "`observed` must be spelled out");
  assert.match(html, /readable\(f\.expected\)/, "`expected` must be spelled out");
});

test("the page makes no credit-repair claim and names the right entity", () => {
  assert.match(html, /Fundhub Credit Solutions LLC/, "public entity must be the credit entity");
  assert.match(
    html,
    /does not repair credit/,
    "must repeat that we do not repair credit or contact bureaus"
  );
  assert.doesNotMatch(html, /xyl\.in/i, "must not send people to xyl.in");
  assert.doesNotMatch(html, /Identity\s*IQ/i, "must not mention Identity IQ");
  assert.doesNotMatch(html, /score will go up|raise your score|boost your score/i,
    "must not promise a credit-outcome");
});

test("the close is the phonecall calendar, same as /optimize", () => {
  assert.match(
    html,
    /https:\/\/apply\.fundhub\.ai\/schedule\/phonecall/,
    "must reuse the credit-repair phonecall calendar URL"
  );
  assert.doesNotMatch(html, /funding-book-call/, "not the funding survey calendar");
});

test("/optimize has a door to the roadmap that works on the path people are actually on", () => {
  // The SmartCredit sign-up box only mounts when the ConsumerDirect client key is
  // set, and it is not. Everyone who signs up leaves for smartcredit.com. So the
  // roadmap link has to live on the page itself, not only behind the success state.
  assert.match(
    optimize,
    /id="roadmap" href="\/roadmap"/,
    "the roadmap link must be on the page, not only in the post-signup state"
  );
  assert.match(
    optimize,
    /roadmapButton\("See my roadmap"\)/,
    "the post-signup state must also offer the roadmap"
  );
});

test("what the person typed carries across without going in the web address", () => {
  assert.match(optimize, /remember\(\);\s*\n\s*location\.assign\("\/roadmap"\)/,
    "/optimize must save the typed values before handing off");
  assert.match(html, /sessionStorage\.getItem\("fh_opt"\)/,
    "/roadmap must read the same key /optimize writes");
  assert.doesNotMatch(html, /location\.search|URLSearchParams/,
    "personal data must never be read from or put in the web address");
});

// ── the law, and the client wording on the rounds ────────────────────────────

test("every finding's law is drawn, not just the complaint", () => {
  assert.match(html, /f\.citations \|\| \[\]/, "the FCRA citations must be rendered");
  assert.match(html, /f\.metro2Ref/, "the Metro 2 field reference must be rendered");
  assert.match(html, /The rule this breaks/, "the law block needs a heading a person understands");
});

test("the law summary quotes the engine and writes no law of its own", () => {
  assert.match(html, /function drawLawbook\(/, "a whole-file law list must exist");
  // The gloss shown is the parenthetical the engine already authored. If this page
  // ever starts describing a statute in its own words, that is a different review.
  assert.match(html, /What it covers: /, "the gloss comes from the citation string");
  assert.doesNotMatch(
    html,
    /Fair Credit Reporting Act means|the law says you can|entitles you to/i,
    "the page must not paraphrase a statute in its own words"
  );
});

test("no duration is invented, and 30 days is only claimed when the file cites it", () => {
  assert.match(html, /grants30/, "the 30-day line must be conditional");
  assert.match(html, /1681i\\\(a\\\)\\\(1\\\)/, "conditioned on the section that grants it");
  assert.match(
    html,
    /will not guess a finish date/,
    "the page must say plainly that it does not predict a finish date"
  );
  assert.doesNotMatch(
    html,
    /takes about \d|within \d+ months|\d+ ?- ?\d+ months|done in \d/i,
    "no invented timeline"
  );
});

test("staff operating notes never reach a client's screen", async () => {
  // The engine's own `when` strings are written for staff. Assert the page covers
  // every step the engine can return, so a new round shows plain words or nothing
  // — never "DIY pack as SEND ONLY IF Round 3 failed".
  const { buildOptimizeRoadmap } = await import("../optimize-page/roadmap.mjs");
  const steps = buildOptimizeRoadmap().rounds.map((r) => r.step);
  assert.ok(steps.length > 0, "the engine must return rounds at all");
  for (const step of steps) {
    assert.match(
      html,
      new RegExp(`\\b${step}:`),
      `STEP_WORDS has no client wording for round ${step} — add it before shipping`
    );
  }
  // Scoped to the operating shorthand this page authors or could leak. Round
  // TITLES still come from the engine at runtime and remain technical — see the
  // note in docs/workflows/smartcredit-api-2026-09-17.md.
  assert.doesNotMatch(html, /DIY pack|SEND ONLY IF/i,
    "staff letter-pack shorthand must not be in the page");
});

test("a court case is labelled as a case, not given its court as 'what it covers'", () => {
  // Live 2026-09-17 the page read "Davenport v. Capio Partners, LLC — What it covers:
  // M.D. Pa. 2021." The bracket on a case is the court and year, not its subject.
  assert.match(html, /\/ v\\\. \/\.test\(head\)/, "cases must be detected");
  assert.match(html, /A court case that ruled on this/, "cases get their own wording");
});
