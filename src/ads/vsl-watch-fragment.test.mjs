// src/ads/vsl-watch-fragment.test.mjs — the two decisions inside the VSL watch
// beacon, and the contract it has with the endpoint, proved against the file
// that actually gets pasted into ClickFunnels.
//
// THE CONTRACT TEST IS THE ONE THAT EARNS ITS KEEP. The receiver
// (src/vsl/watch-beacon.mjs) reads a short, fixed set of field names and
// ignores everything else. So a name that drifts on either side is not an error
// anywhere: the beacon is accepted, the number is dropped, and the screen shows
// nothing with no clue why. This test compares the two lists directly.
//
// WHY THE TEST REACHES INTO AN HTML FILE. The beacon at
// marketing/landing-pages/07-vsl-watch-beacon.html is pasted by hand into a
// ClickFunnels page. It cannot import anything, so the logic cannot live in a
// module and be shared. Copying the two functions into this file instead would
// mean the test proves a copy while the page runs something else — the exact
// bug this suite exists to catch. So the test slices the real functions out of
// the real file, between two marker comments, and runs those.
//
// npm test's glob is src/** and scripts/** only (CLAUDE.md §12), which is why
// this sits here and not next to the fragment.
//
// WHAT THIS CANNOT TEST, said plainly rather than faked: everything that needs
// a browser. Whether sendBeacon fires on page-hide, whether the cross-site post
// is accepted, whether the unmute really restarts the video, and whether a
// ClickFunnels page renders the player late — none of that can be proved
// without a real browser and the real live page. No test here pretends to.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FRAGMENT = path.join(ROOT, "marketing/landing-pages", "07-vsl-watch-beacon.html");
const SOURCE = fs.readFileSync(FRAGMENT, "utf8");

const START = "PURE LOGIC START";
const END = "PURE LOGIC END";

function sliceLogic() {
  const a = SOURCE.indexOf(START);
  const b = SOURCE.indexOf(END);
  assert.ok(a > -1, `${START} marker is missing from the fragment`);
  assert.ok(b > a, `${END} marker is missing or above the start marker`);
  const body = SOURCE.slice(SOURCE.indexOf("*/", a) + 2, SOURCE.lastIndexOf("/*", b));
  // eslint-disable-next-line no-new-func
  return new Function(body + "\nreturn { fhShouldSample, fhClassifySeek };")();
}

const { fhShouldSample, fhClassifySeek } = sliceLogic();

// The code, without the long header comment written for Chris. The header names
// the things this script deliberately avoids ("there is no setInterval below"),
// so a ban scanned over the whole file would fail on its own explanation. The
// bans below are scanned over the code that actually runs.
function scriptBody() {
  const blocks = SOURCE.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) || [];
  assert.equal(blocks.length, 1, "expected exactly one inline script in the fragment");
  return blocks[0].replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
}
const CODE = scriptBody();

describe("fhShouldSample — one row per whole second, never four", () => {
  test("the first tick of a viewing is always written down", () => {
    assert.equal(fhShouldSample(null, 0), 0);
    assert.equal(fhShouldSample(undefined, 12.4), 12);
  });

  test("timeupdate firing four times a second produces one row a second", () => {
    // This is the whole reason the function exists. The browser fires
    // timeupdate about four times a second; sending all of them is four times
    // the data for none of the meaning.
    let last = null;
    const kept = [];
    for (let t = 0; t <= 10; t += 0.25) {
      const second = fhShouldSample(last, t);
      if (second !== null) { kept.push(second); last = second; }
    }
    assert.deepEqual(kept, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("the same second is never written down twice", () => {
    assert.equal(fhShouldSample(7, 7.0), null);
    assert.equal(fhShouldSample(7, 7.99), null);
    assert.equal(fhShouldSample(7, 8.0), 8);
  });

  test("going backwards is never a sample — a jump back is a rewind, handled elsewhere", () => {
    assert.equal(fhShouldSample(100, 30), null);
    assert.equal(fhShouldSample(100, 0), null);
  });

  test("rubbish in gives nothing out, never a made-up zero", () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity, -1, "5", {}, []]) {
      assert.equal(fhShouldSample(3, bad), null, `${String(bad)} should have been ignored`);
    }
  });

  test("a cleared lastSecond starts recording again from wherever it lands", () => {
    // After a seek the fragment sets lastSecond back to null on purpose, so the
    // re-watch records from the new position instead of being swallowed.
    assert.equal(fhShouldSample(null, 30.6), 30);
  });
});

describe("fhClassifySeek — telling a rewind from a skip from the unmute restart", () => {
  test("the tap for sound sends the video to zero, and that is NOT a rewind", () => {
    // ops/workflows/cf-vsl-watch-html-step1.html:133-134 runs
    // v.muted=false; v.currentTime=0; v.controls=true.
    // Called a rewind, the opening looks like the best-watched part of the
    // video and there is a fake cliff at whatever second they tapped.
    assert.equal(fhClassifySeek(60, 0, true), "restart");
    assert.equal(fhClassifySeek(1.5, 0, true), "restart");
    assert.equal(fhClassifySeek(207, 0.2, true), "restart");
  });

  test("the same jump with nothing armed is a real rewind", () => {
    assert.equal(fhClassifySeek(60, 0, false), "rewind");
  });

  test("tapping for sound in the first second is not a restart and not a rewind", () => {
    // The video had barely moved, so sending it back to zero moves nothing.
    assert.equal(fhClassifySeek(0.4, 0, true), null);
  });

  test("a genuine rewind while armed is still a rewind — only a jump to the very start is the restart", () => {
    assert.equal(fhClassifySeek(100, 70, true), "rewind");
  });

  test("a jump forward is a skip, armed or not", () => {
    assert.equal(fhClassifySeek(30, 90, false), "skip");
    assert.equal(fhClassifySeek(30, 90, true), "skip");
  });

  test("a nudge under three quarters of a second is the browser, not a person", () => {
    assert.equal(fhClassifySeek(30, 30.2, false), null);
    assert.equal(fhClassifySeek(30, 29.5, false), null);
    assert.equal(fhClassifySeek(30, 30, false), null);
  });

  test("three quarters of a second and over is a person", () => {
    assert.equal(fhClassifySeek(30, 30.8, false), "skip");
    assert.equal(fhClassifySeek(30, 29.2, false), "rewind");
  });

  test("rubbish in gives nothing out", () => {
    for (const bad of [null, undefined, NaN, Infinity, "10", {}]) {
      assert.equal(fhClassifySeek(bad, 10, false), null);
      assert.equal(fhClassifySeek(10, bad, false), null);
    }
  });
});

describe("the fragment itself", () => {
  test("the whole pasted script parses — npm run lint does not look in this folder", () => {
    assert.doesNotThrow(() => new Function(CODE), "the pasted script does not parse");
  });

  test("NO TIMER — the clock is the browser's own timeupdate event", () => {
    // public/app/client-portal.html:1240 states the rule this repo follows, and
    // src/http/crm-html.test.mjs bans repeating timers in that file outright.
    // A clock ticking with no video behind it is a fake number.
    assert.ok(!/setInterval/.test(CODE), "must not measure with setInterval");
    assert.ok(!/setTimeout/.test(CODE), "must not measure with setTimeout");
    assert.ok(/timeupdate/.test(CODE), "the position must come from timeupdate");
  });

  test("one source of truth for the ad number — it reads 06's store, it does not re-read the address bar", () => {
    assert.ok(/fh_attribution/.test(CODE), "must read the store 06-utm-hidden-fields.html writes");
    assert.ok(
      !/location\.search|URLSearchParams/.test(CODE),
      "must not parse the URL again — two readers drift apart"
    );
  });

  test("it posts to the endpoint the route map has to carry", () => {
    // A handler that is not in the hardcoded ROUTES map in
    // netlify/functions/api.mjs returns "not found" everywhere (CLAUDE.md §12).
    assert.ok(SOURCE.includes("https://fundhub.ai/api/public/vsl-watch"));
    assert.ok(SOURCE.includes('"public/vsl-watch"'), "the route key must be written down for the integrator");
  });

  test("the cross-site trick is intact — text/plain, or the browser silently kills the beacon", () => {
    assert.ok(CODE.includes("sendBeacon"), "must use sendBeacon so it survives the page closing");
    assert.ok(/text\/plain;charset=UTF-8/.test(CODE), "the body must go out as text/plain");
    assert.ok(!/application\/json/.test(CODE), "a JSON content-type triggers a preflight and the beacon dies");
    assert.ok(/keepalive/.test(CODE), "the fetch fallback must be keepalive or it dies with the page");
  });

  test("every key it sends is a key the receiver reads — and the three required ones are there", () => {
    // src/vsl/watch-beacon.mjs is the door. It reads a short, fixed set of
    // names and ignores everything else, so a key that drifts is not an error
    // anywhere — the number simply never arrives. THAT is the failure this
    // catches: silence, not a crash.
    const validator = fs.readFileSync(path.join(ROOT, "src", "vsl", "watch-beacon.mjs"), "utf8");
    const reads = new Set([...validator.matchAll(/\bbody\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    assert.ok(reads.size >= 10, "could not read the receiver's field list");

    const block = CODE.slice(CODE.indexOf("function payload(kind)"));
    const ret = block.slice(block.indexOf("return {"), block.indexOf("\n    }"));
    const sends = [...ret.matchAll(/^\s{8}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);
    assert.ok(sends.length >= 15, "could not read the fragment's payload keys");

    for (const key of sends) {
      assert.ok(reads.has(key), `the fragment sends "${key}" and the receiver never looks at it`);
    }
    for (const required of ["v", "vid", "sid"]) {
      assert.ok(sends.includes(required), `"${required}" is required and is not being sent`);
    }
  });

  test("the visitor id matches the shape db/migrations/379_vsl_watch.sql:436 demands", () => {
    // 379 makes visitor_id NOT NULL and checks it against this exact pattern.
    // A beacon that does not match it is thrown away by the database, and the
    // page has no way to find out.
    assert.ok(/fh_visitor_v1/.test(CODE), "the visitor id must be kept on the device");
    assert.ok(
      CODE.includes("^[A-Za-z0-9_-]{16,64}$"),
      "the fragment must check the stored id against 379's pattern before reusing it"
    );
    // The table is another workflow's file and may not have landed yet. When it
    // is there, the two must agree. When it is not, this half stays quiet
    // rather than failing for a reason that has nothing to do with the beacon.
    const table = path.join(ROOT, "db", "migrations", "379_vsl_watch.sql");
    if (fs.existsSync(table)) {
      assert.ok(
        fs.readFileSync(table, "utf8").includes("^[A-Za-z0-9_-]{16,64}$"),
        "379 changed its visitor_id pattern — the fragment now sends ids the database will refuse"
      );
    }
  });

  test("the jump counts are counted in the page, not read back off the seconds list", () => {
    // The seconds list is capped and emptied after every send, so counting from
    // it would lose every jump that happened before the last message.
    for (const field of ["replays", "rewinds", "skips"]) {
      assert.ok(CODE.includes(field + ":"), `${field} must be sent as its own number`);
    }
    assert.ok(/n: everPlayed \? sampleTotal/.test(CODE), "the sample count must be a running total");
  });

  test("the words are not in the code either — a weak check, kept as a second lock", () => {
    // THIS ONE ON ITS OWN IS NOT A GUARANTEE and must never be read as one. It
    // only says the script does not NAME a click id anywhere. A click id can
    // travel perfectly well inside a field with an innocent name — which is
    // exactly what happened before review: the whole address of the page was
    // being sent, and the ad platform bolts its click id onto that address.
    // The real guard is "the page address is cut at the ?" below, which runs
    // the shipped pageUrl on an address with a click id on it.
    for (const forbidden of ["fbclid", "gclid", "email", "phone", "first_name", "last_name"]) {
      assert.ok(!new RegExp(forbidden, "i").test(CODE), `must not touch ${forbidden}`);
    }
  });
});

// ── THE PAGE ADDRESS, RUN FOR REAL ─────────────────────────────────────────
// pageUrl() is not pure — it reads location — so it cannot live between the
// PURE LOGIC markers. It is still sliced out of the real pasted file rather
// than copied, for the same reason: a copy proves the copy.
function slicePageUrl(href) {
  const a = CODE.indexOf("function pageUrl(");
  const b = CODE.indexOf("function videoPathOf(");
  assert.ok(a > -1 && b > a, "pageUrl has moved — the test can no longer slice it out of the real file");
  // eslint-disable-next-line no-new-func
  const built = new Function("location", CODE.slice(a, b) + "\nreturn pageUrl;")({ href });
  return built();
}

describe("the page address never carries a click id", () => {
  test("a click id on the end of the address is cut off before anything is sent", () => {
    // Meta puts fbclid on every link it sends somebody through, so the watch
    // page's own address routinely carries one. db/migrations/379_vsl_watch.sql
    // keeps the FIRST address it ever sees and never replaces it, so anything
    // that gets in cannot be cleaned up afterwards.
    const out = slicePageUrl("https://apply.fundhub.ai/watch?fbclid=IwAR9xNOTAREALID");
    assert.equal(out, "https://apply.fundhub.ai/watch");
    assert.ok(!/fbclid/i.test(out), "the click id is still travelling inside the page address");
  });

  test("everything after the ? goes, and everything after the # goes", () => {
    const out = slicePageUrl("https://apply.fundhub.ai/watch?utm_source=fb&gclid=abc123#t=30");
    assert.equal(out, "https://apply.fundhub.ai/watch");
    assert.ok(!/gclid|utm_source/i.test(out));
  });

  test("a plain address is left exactly as it is", () => {
    assert.equal(slicePageUrl("https://apply.fundhub.ai/watch"), "https://apply.fundhub.ai/watch");
  });

  test("anything that is not a web address comes back empty, never mangled", () => {
    assert.equal(slicePageUrl("about:blank"), null);
    assert.equal(slicePageUrl(""), null);
  });
});

// ── A FAKE BROWSER, JUST ENOUGH OF ONE ─────────────────────────────────────
// Both blockers found in review were about ORDER — which event the browser
// fires first — and neither could be caught by calling the two pure functions
// on their own. So this runs the REAL pasted script inside a hand-made browser
// and fires the events in the order a real browser fires them.
//
// WHAT THIS IS NOT: a browser. It does not prove sendBeacon survives a closing
// tab, that the cross-site post is accepted, or that ClickFunnels renders the
// player at all. It proves what the script DECIDES when events arrive in a
// given order, and nothing else.
function eventTarget() {
  const map = new Map();
  return {
    addEventListener(name, fn) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(fn);
    },
    fire(name, ev) { for (const fn of (map.get(name) || []).slice()) fn(ev); }
  };
}

function runFragment(options = {}) {
  const beacons = [];
  const localData = new Map();
  const sessionData = new Map();
  if (options.attribution) sessionData.set("fh_attribution", JSON.stringify(options.attribution));

  const videoEvents = eventTarget();
  const src = options.src || "https://fundhub.ai/funnel/vsl.mp4";
  const video = {
    tagName: "VIDEO",
    currentSrc: src,
    src,
    currentTime: 0,
    duration: 207.215,
    muted: true,
    volume: 1,
    paused: true,
    ended: false,
    addEventListener: videoEvents.addEventListener,
    fire(name) { videoEvents.fire(name, { target: video }); }
  };

  const docEvents = eventTarget();
  const doc = {
    readyState: "complete",
    visibilityState: "visible",
    referrer: options.referrer || "",
    documentElement: { clientWidth: 1200 },
    querySelectorAll() { return [video]; },
    addEventListener: docEvents.addEventListener
  };

  const win = {
    innerWidth: options.width || 1200,
    crypto: globalThis.crypto,
    addEventListener: eventTarget().addEventListener
  };

  const nav = {
    sendBeacon(url, blob) {
      beacons.push({ url, body: JSON.parse(blob.parts.join("")) });
      return true;
    }
  };

  class FakeBlob {
    constructor(parts, type) { this.parts = parts; this.type = type && type.type; }
  }

  const shelf = (data) => ({
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); }
  });

  // eslint-disable-next-line no-new-func
  new Function(
    "window", "document", "navigator", "location",
    "localStorage", "sessionStorage", "Blob", "fetch", CODE
  )(
    win, doc, nav,
    { href: options.href || "https://apply.fundhub.ai/watch" },
    shelf(localData), shelf(sessionData), FakeBlob,
    () => ({ catch() {} })
  );

  return {
    video,
    beacons,
    last() { return beacons.length ? beacons[beacons.length - 1].body : null; },
    leave() { doc.visibilityState = "hidden"; docEvents.fire("visibilitychange", {}); }
  };
}

describe("the events in the order a real browser fires them", () => {
  test("the player being on the page is reported before anything plays", () => {
    const h = runFragment();
    assert.equal(h.beacons.length, 1, "the opening message must go out as soon as the player is found");
    assert.equal(h.beacons[0].url, "https://fundhub.ai/api/public/vsl-watch");
    assert.equal(h.last().pos, null, "nothing has played, so how far they got is unknown, not 0");
    assert.equal(h.last().n, null, "no samples yet is empty, never a measured 0");
    assert.equal(h.last().v, "funnel/vsl.mp4");
  });

  test("TAPPING FOR SOUND WHILE PAUSED IS NOT A REWIND — the whole point of the file", () => {
    // This is the case the design exists for and the case it used to get wrong.
    // The page's own code (ops/workflows/cf-vsl-watch-html-step1.html:133-134)
    // runs v.muted=false; v.currentTime=0; v.play(). A real browser then fires
    // volumechange, seeking, play, and seeked LAST, because seeked waits for the
    // picture. Any code that forgets the restart is coming by the time seeked
    // arrives files the jump back to zero as a rewind.
    const h = runFragment();
    h.video.fire("loadedmetadata");

    h.video.paused = false;
    h.video.fire("play");
    h.video.currentTime = 60;
    h.video.fire("timeupdate");

    h.video.paused = true;
    h.video.fire("pause");

    h.video.muted = false;
    h.video.fire("volumechange");
    h.video.currentTime = 0;
    h.video.fire("seeking");
    h.video.paused = false;
    h.video.fire("play");
    h.video.fire("seeked");

    h.leave();
    const sent = h.last();
    assert.equal(sent.rewinds, 0, "the tap for sound was counted as a rewind");
    assert.equal(sent.skips, 0);
    assert.equal(sent.unmuted, true, "the tap for sound is the moment they chose to watch");
    assert.equal(sent.blocked, false, "it played, so it was not blocked");
  });

  test("tapping for sound after the browser refused to autoplay is not a rewind either", () => {
    const h = runFragment();
    h.video.fire("loadedmetadata");   // the file is ready and nothing plays

    h.video.muted = false;
    h.video.fire("volumechange");
    h.video.fire("seeking");          // already at 0, so the seek moves nothing
    h.video.paused = false;
    h.video.fire("play");
    h.video.fire("seeked");

    h.leave();
    const sent = h.last();
    assert.equal(sent.rewinds, 0);
    assert.equal(sent.unmuted, true);
    assert.equal(sent.blocked, false, "it did play in the end, so blocked must be a no");
  });

  test("the file was ready, nothing ever played, and it was still stopped — that is blocked", () => {
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.leave();
    const sent = h.last();
    assert.equal(sent.blocked, true);
    assert.equal(sent.pos, null, "nothing played, so how far they got stays unknown");
    assert.equal(sent.n, null);
    assert.equal(sent.replays, null, "no counts are claimed for a video that never played");
  });

  test("a video that is RUNNING is never filed as blocked, even if we joined late", () => {
    // Joining a player that is already going means no play event ever reaches
    // us. Without the "is it still stopped" check, that viewing was stored as
    // blocked = true forever, with seconds sitting on it.
    const h = runFragment();
    h.video.paused = false;
    h.video.fire("loadedmetadata");
    h.video.currentTime = 5;
    h.video.fire("timeupdate");
    h.leave();
    assert.equal(h.last().blocked, null, "unknown, not a made-up yes");
    assert.equal(h.last().pos, 5, "the seconds it did see still go out");
  });

  test("a real jump back is still counted as a rewind", () => {
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.video.paused = false;
    h.video.fire("play");
    h.video.currentTime = 90;
    h.video.fire("timeupdate");
    h.video.fire("seeking");
    h.video.currentTime = 30;
    h.video.fire("seeked");
    h.leave();
    assert.equal(h.last().rewinds, 1, "a plain rewind must still count");
    assert.equal(h.last().skips, 0);
  });

  test("reaching the end says finished, and nothing else claims it", () => {
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.video.paused = false;
    h.video.fire("play");
    h.video.currentTime = 207;
    h.video.fire("timeupdate");
    h.video.ended = true;
    h.video.fire("ended");
    h.leave();
    assert.equal(h.last().finished, true);
    assert.equal(h.last().dur, 207.215, "the length of the file goes out as the browser reported it");
  });

  test("the ad number comes from 06's store, and is empty when 06 is not on the page", () => {
    const withAd = runFragment({ attribution: { utm_content: "43-payroll-hook" } });
    assert.equal(withAd.last().utm_content, "43-payroll-hook", "the ad must travel raw — the database reads the number out");
    const without = runFragment();
    assert.equal(without.last().utm_content, null, "no 06 on the page means no ad, never a guess");
  });

  test("the address that goes out carries no click id, end to end", () => {
    const h = runFragment({ href: "https://apply.fundhub.ai/watch?fbclid=IwAR9xNOTAREALID&utm_content=43" });
    const sent = h.last();
    assert.equal(sent.page, "https://apply.fundhub.ai/watch");
    assert.ok(
      !JSON.stringify(sent).match(/fbclid/i),
      "a click id reached the wire inside some other field"
    );
  });
});

// ── THE SECOND HIGH-WATER MARK ─────────────────────────────────────────────
// The video auto-plays MUTED and the tap for sound sends it back to zero
// (ops/workflows/cf-vsl-watch-html-step1.html:133). So "the video reached
// 3:00" and "a person chose to watch and reached 3:00" are different facts.
// `pos` is the first. `pos_unmuted` is the second, and it is the only one worth
// quoting. src/vsl/watch-beacon.mjs:71-84 spells out why, and :285 is the
// validator that accepts it.
//
// If the page script does not send it the column is empty forever and the
// difference is thrown away at the source, where it can never be recovered.
describe("pos_unmuted — how far they got AFTER they chose to watch", () => {
  test("before any tap it is empty, and empty is not zero", () => {
    // Somebody who scrolled past a silently playing video never chose to
    // watch. The honest answer for them is "we do not know", forever. A 0 here
    // would read as a measured fact — that they tapped and watched nothing.
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.video.paused = false;
    h.video.fire("play");
    h.video.currentTime = 60;
    h.video.fire("timeupdate");
    h.leave();

    const sent = h.last();
    assert.equal(sent.pos, 60, "the whole viewing did reach 60 seconds");
    assert.equal(sent.pos_unmuted, null, "nobody tapped, so this must be empty");
    assert.notEqual(sent.pos_unmuted, 0, "0 would claim they tapped and watched nothing");
    assert.equal(sent.unmuted, false, "and the flag agrees they never tapped");
  });

  test("it is never seeded from the silent run — the exact lie this exists to stop", () => {
    // Ran silently to 3:00, tapped for sound, left immediately. Reported with
    // `pos` alone this person is "chose to watch, reached 3:00". They watched
    // none of it after choosing.
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.video.paused = false;
    h.video.fire("play");
    h.video.currentTime = 180;
    h.video.fire("timeupdate");

    // The tap. The page's own code runs v.muted=false; v.currentTime=0;
    // v.play(). A real browser fires volumechange, seeking, play, then seeked.
    h.video.muted = false;
    h.video.fire("volumechange");
    h.video.currentTime = 0;
    h.video.fire("seeking");
    h.video.fire("play");
    h.video.fire("seeked");
    h.leave();

    const sent = h.last();
    assert.equal(sent.pos, 180, "the whole viewing still reached 180 seconds");
    assert.equal(sent.unmuted, true, "they did tap");
    assert.equal(sent.pos_unmuted, 0, "they tapped and watched nothing — that is 0, not 180");
    assert.notEqual(sent.pos_unmuted, 180, "the silent run's position leaked into the chosen run");
  });

  test("after the tap it fills from the tap onward, and stops at the furthest point reached", () => {
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.video.paused = false;
    h.video.fire("play");
    h.video.currentTime = 180;
    h.video.fire("timeupdate");

    h.video.muted = false;
    h.video.fire("volumechange");
    h.video.currentTime = 0;
    h.video.fire("seeking");
    h.video.fire("play");
    h.video.fire("seeked");

    // Now they actually watch, with the sound on.
    for (const t of [1, 5, 12]) {
      h.video.currentTime = t;
      h.video.fire("timeupdate");
    }
    h.leave();

    const sent = h.last();
    assert.equal(sent.pos_unmuted, 12, "the chosen run reached 12 seconds");
    assert.equal(sent.pos, 180, "and the whole viewing still reached 180");
  });

  test("it goes up and never comes back down when they rewind after tapping", () => {
    const h = runFragment();
    h.video.fire("loadedmetadata");
    h.video.paused = false;
    h.video.fire("play");

    h.video.muted = false;
    h.video.fire("volumechange");
    h.video.fire("seeking");
    h.video.fire("play");
    h.video.fire("seeked");

    h.video.currentTime = 90;
    h.video.fire("timeupdate");
    h.video.fire("seeking");
    h.video.currentTime = 30;   // a real rewind, with the sound on
    h.video.fire("seeked");
    h.video.currentTime = 40;
    h.video.fire("timeupdate");
    h.leave();

    const sent = h.last();
    assert.equal(sent.pos_unmuted, 90, "a rewind must not pull the furthest point back");
    assert.equal(sent.rewinds, 1, "and it is still counted as a rewind");
  });

  test("the receiver actually reads this name — a name that drifts is silent data loss", () => {
    // src/vsl/watch-beacon.mjs ignores any key it does not know. So a fragment
    // sending posUnmuted, or pos_after_unmute, is accepted and dropped with no
    // error anywhere. The name has to match exactly.
    const validator = fs.readFileSync(path.join(ROOT, "src", "vsl", "watch-beacon.mjs"), "utf8");
    assert.ok(
      /\bbody\.pos_unmuted\b/.test(validator),
      "the receiver no longer reads body.pos_unmuted — the fragment's key is now dead"
    );
    assert.ok(/pos_unmuted:/.test(CODE), "the fragment must send pos_unmuted");
  });

  test("it is never seeded from pos in the code, not just in behaviour", () => {
    // A future edit that writes `furthestUnmutedExact = furthestExact` anywhere
    // would pass every behaviour test above only until the ordering changed.
    assert.ok(
      !/furthestUnmutedExact\s*=\s*furthestExact/.test(CODE),
      "the after-tap mark must never be seeded from the whole-viewing mark"
    );
    assert.ok(
      /var furthestUnmutedExact = null/.test(CODE),
      "the after-tap mark must start empty, not at 0"
    );
  });
});
