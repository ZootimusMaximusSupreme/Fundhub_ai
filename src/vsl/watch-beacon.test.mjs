// What a VSL watch beacon is allowed to say — proved WITHOUT a database.
//
// This file is the half of the beacon's protection that actually runs on every
// CI pass. src/http/vsl-watch.pg.test.mjs needs a Postgres and skips without
// one, and a skipped .pg.test.mjs is not green (CLAUDE.md §12). So the rules
// that decide whether a stranger's POST is stored or thrown away are kept in a
// pure module with no database in it, and asserted here.
//
// Importing api/public/vsl-watch.mjs is safe and is deliberate: src/db.mjs
// builds its pool lazily inside pool(), so nothing connects at import time —
// the same reasoning src/http/routes.test.mjs:26-30 writes down. That import
// also proves the endpoint module parses and resolves its own imports.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  parseWatchBeacon,
  overBodyCap,
  byteLength,
  MAX_BODY_BYTES,
  MAX_SAMPLES,
  WATCH_LIMITS
} from "./watch-beacon.mjs";
import { corsHeaders, allowedOrigins, stampWatchActor } from "../../api/public/vsl-watch.mjs";
import { checkVisitorRate } from "./watch-store.mjs";

const VID = "vid-aaaaaaaaaaaaaaaa";      // 20 chars, inside the 16-64 range
const SID = "sid-bbbbbbbbbbbbbbbb";
const good = (over = {}) => ({ v: "funnel/vsl.mp4", vid: VID, sid: SID, ...over });

describe("VSL watch beacon — the three things it must name", () => {
  test("a well-formed beacon is accepted and keeps its own values", () => {
    const r = parseWatchBeacon(good({ dur: 207.215, pos: 91.4 }));
    assert.equal(r.ok, true);
    assert.equal(r.value.videoKey, "funnel/vsl.mp4");
    assert.equal(r.value.visitorId, VID);
    assert.equal(r.value.sessionKey, SID);
    assert.equal(r.value.durationSeconds, 207.215);
    assert.equal(r.value.maxPositionSeconds, 91.4);
  });

  test("no video, no visitor, no session — each on its own is a refusal", () => {
    assert.equal(parseWatchBeacon({ vid: VID, sid: SID }).error, "bad_video");
    assert.equal(parseWatchBeacon({ v: "funnel/vsl.mp4", sid: SID }).error, "bad_visitor");
    assert.equal(parseWatchBeacon({ v: "funnel/vsl.mp4", vid: VID }).error, "bad_session");
  });

  test("nothing that is not an object is a beacon", () => {
    for (const junk of [null, undefined, "", "hello", 42, true, [], [1, 2]]) {
      assert.equal(parseWatchBeacon(junk).ok, false, `accepted ${JSON.stringify(junk)}`);
    }
  });

  test("an id that is too short, too long or the wrong alphabet is refused", () => {
    assert.equal(parseWatchBeacon(good({ vid: "short" })).ok, false);
    assert.equal(parseWatchBeacon(good({ vid: "a".repeat(65) })).ok, false);
    assert.equal(parseWatchBeacon(good({ vid: "has spaces in it xx" })).ok, false);
    assert.equal(parseWatchBeacon(good({ sid: "semi;colon;injection" })).ok, false);
    // 16 and 64 are the edges and both are legal.
    assert.equal(parseWatchBeacon(good({ vid: "a".repeat(16) })).ok, true);
    assert.equal(parseWatchBeacon(good({ vid: "a".repeat(64) })).ok, true);
  });

  test("a video key cannot walk out of public/ or carry a leading slash", () => {
    assert.equal(parseWatchBeacon(good({ v: "../../etc/passwd" })).ok, false);
    assert.equal(parseWatchBeacon(good({ v: "/funnel/vsl.mp4" })).ok, false);
    assert.equal(parseWatchBeacon(good({ v: "funnel/../secret.mp4" })).ok, false);
    assert.equal(parseWatchBeacon(good({ v: "funnel/vsl.mp4?x=1" })).ok, false);
    assert.equal(parseWatchBeacon(good({ v: "a".repeat(200) })).ok, false);
    // The SLO funnel's own video must be just as welcome as the VSL.
    assert.equal(parseWatchBeacon(good({ v: "funnel/slo/offer.mp4" })).ok, true);
  });
});

describe("VSL watch beacon — NULL means unknown and must survive", () => {
  test("everything but the three required fields may be absent, and absent is null", () => {
    const r = parseWatchBeacon(good());
    assert.equal(r.ok, true);
    for (const k of [
      "durationSeconds", "maxPositionSeconds", "maxPositionAfterUnmuteSeconds",
      "watchedFraction",
      "unmuted", "finished", "autoplayBlocked",
      "replayCount", "rewindCount", "skipCount",
      "utmContent", "pageUrl", "referrer", "deviceHint", "webdriver",
      "samples", "sampleCount"
    ]) {
      assert.strictEqual(r.value[k], null, `${k} should be null when the beacon did not say`);
    }
  });

  test("wd true is the automated-browser flag, and a word in its place is refused", () => {
    assert.equal(parseWatchBeacon(good({ wd: true })).value.webdriver, true);
    assert.equal(parseWatchBeacon(good({ wd: false })).value.webdriver, false);
    assert.equal(parseWatchBeacon(good({ wd: "true" })).ok, false);
  });

  test("the door marks a robot browser as an agent and a normal browser as a person", () => {
    const value = parseWatchBeacon(good()).value;
    const robot = stampWatchActor(value, {
      headers: { "user-agent": "Mozilla/5.0 HeadlessChrome/120" }
    });
    assert.equal(robot.actor, "agent");
    assert.equal(robot.actorReason, "bot_browser");

    const auto = stampWatchActor({ ...value, webdriver: true }, {
      headers: { "user-agent": "Mozilla/5.0" }
    });
    assert.equal(auto.actor, "agent");
    assert.equal(auto.actorReason, "automated_browser");

    const person = stampWatchActor(value, {
      headers: { "user-agent": "Mozilla/5.0" }
    });
    assert.equal(person.actor, "person");
    assert.equal(person.actorReason, "browser");
  });

  test("false is a measurement and is NOT turned into null", () => {
    const r = parseWatchBeacon(good({ unmuted: false, finished: false, blocked: false }));
    assert.strictEqual(r.value.unmuted, false);
    assert.strictEqual(r.value.finished, false);
    assert.strictEqual(r.value.autoplayBlocked, false);
  });

  test("zero is a measurement and is NOT turned into null", () => {
    const r = parseWatchBeacon(good({ pos: 0, replays: 0, rewinds: 0, skips: 0, n: 0 }));
    assert.strictEqual(r.value.maxPositionSeconds, 0);
    assert.strictEqual(r.value.replayCount, 0);
    assert.strictEqual(r.value.rewindCount, 0);
    assert.strictEqual(r.value.skipCount, 0);
    assert.strictEqual(r.value.sampleCount, 0);
  });

  test("a flag that is not a real true or false is refused, never coerced", () => {
    for (const junk of ["true", "yes", 1, 0, "", "false"]) {
      assert.equal(parseWatchBeacon(good({ unmuted: junk })).ok, false,
        `coerced ${JSON.stringify(junk)} into a flag`);
    }
  });
});

describe("VSL watch beacon — one viewing is two runs, so two positions", () => {
  /* Tapping for sound sets currentTime=0, so a viewing that was unmuted holds
     two runs of the same video. If these two numbers were one number, somebody
     who ran it silently to 3:00, tapped, and left would be stored as "chose to
     watch, reached 3:00" — the opposite of what happened. */
  test("the two positions are kept apart and neither is worked out from the other", () => {
    const r = parseWatchBeacon(good({ dur: 207.215, pos: 180, pos_unmuted: 12, unmuted: true }));
    assert.equal(r.ok, true);
    assert.equal(r.value.maxPositionSeconds, 180, "the whole viewing, both runs");
    assert.equal(r.value.maxPositionAfterUnmuteSeconds, 12, "the run after the tap, alone");
  });

  test("somebody who never tapped has NO second run, and that is null and not 0", () => {
    const r = parseWatchBeacon(good({ pos: 180, unmuted: false }));
    assert.strictEqual(r.value.maxPositionAfterUnmuteSeconds, null,
      "a 0 here would say they tapped and watched none of it, which is a different fact");
  });

  test("zero after the tap is a real measurement and survives as zero", () => {
    const r = parseWatchBeacon(good({ pos: 180, pos_unmuted: 0, unmuted: true }));
    assert.strictEqual(r.value.maxPositionAfterUnmuteSeconds, 0);
  });

  test("it is held to the same rules as the ordinary position", () => {
    for (const junk of ["12", NaN, Infinity, -1, 86401, true, {}]) {
      assert.equal(parseWatchBeacon(good({ pos_unmuted: junk })).ok, false,
        `accepted ${String(junk)} as an after-unmute position`);
    }
    assert.equal(parseWatchBeacon(good({ pos_unmuted: 1 })).error, undefined);
  });

  test("the fraction is still worked out from the whole viewing, not the second run", () => {
    const r = parseWatchBeacon(good({ dur: 200, pos: 100, pos_unmuted: 10 }));
    assert.equal(r.value.watchedFraction, 0.5);
  });
});

describe("VSL watch beacon — the fraction is ours, not the caller's", () => {
  test("it is computed from position and duration", () => {
    const r = parseWatchBeacon(good({ dur: 200, pos: 50 }));
    assert.equal(r.value.watchedFraction, 0.25);
  });

  test("a fraction the caller sends is ignored entirely", () => {
    const r = parseWatchBeacon(good({ dur: 200, pos: 4, watched_fraction: 1, fraction: 1 }));
    assert.equal(r.value.watchedFraction, 0.02);
  });

  test("it stays null when either half is unknown", () => {
    assert.strictEqual(parseWatchBeacon(good({ pos: 50 })).value.watchedFraction, null);
    assert.strictEqual(parseWatchBeacon(good({ dur: 200 })).value.watchedFraction, null);
  });

  test("a hair past the end is a rounding artefact, so it clamps to 1", () => {
    const r = parseWatchBeacon(good({ dur: 207.215, pos: 207.4 }));
    assert.equal(r.value.watchedFraction, 1);
  });

  test("a zero-length video is refused rather than divided by", () => {
    assert.equal(parseWatchBeacon(good({ dur: 0, pos: 5 })).ok, false);
  });
});

describe("VSL watch beacon — numbers that are not numbers", () => {
  test("a string, a NaN and an infinity are all refused", () => {
    for (const junk of ["91.4", NaN, Infinity, -Infinity, {}, [], true]) {
      assert.equal(parseWatchBeacon(good({ pos: junk })).ok, false,
        `accepted ${String(junk)} as a position`);
    }
  });

  test("a negative position, and one longer than a day, are refused", () => {
    assert.equal(parseWatchBeacon(good({ pos: -1 })).ok, false);
    assert.equal(parseWatchBeacon(good({ pos: 86401 })).ok, false);
  });

  test("counts must be whole and inside their band", () => {
    assert.equal(parseWatchBeacon(good({ rewinds: 2.5 })).ok, false);
    assert.equal(parseWatchBeacon(good({ rewinds: -1 })).ok, false);
    assert.equal(parseWatchBeacon(good({ rewinds: 10001 })).ok, false);
    assert.equal(parseWatchBeacon(good({ rewinds: 2 })).value.rewindCount, 2);
  });
});

describe("VSL watch beacon — the link, the page and the device", () => {
  test("utm_content is kept raw; no ad number is worked out here", () => {
    const r = parseWatchBeacon(good({ utm_content: "42-phase" }));
    assert.equal(r.value.utmContent, "42-phase");
    // The digits are the database's job (379's ad_number, using fundhub_ad_id).
    // Two copies of that rule is how two screens end up disagreeing.
    assert.ok(!("adNumber" in r.value));
  });

  test("an over-long utm_content is refused rather than trimmed", () => {
    assert.equal(parseWatchBeacon(good({ utm_content: "4".repeat(201) })).ok, false);
  });

  test("only http and https addresses are stored", () => {
    assert.equal(parseWatchBeacon(good({ page: "https://apply.fundhub.ai/watch" })).ok, true);
    assert.equal(parseWatchBeacon(good({ page: "javascript:alert(1)" })).ok, false);
    assert.equal(parseWatchBeacon(good({ ref: "data:text/html,x" })).ok, false);
    assert.equal(parseWatchBeacon(good({ ref: "https://x.test/" + "a".repeat(600) })).ok, false);
  });

  test("an empty string means the browser said nothing, so it is null", () => {
    const r = parseWatchBeacon(good({ ref: "", utm_content: "  " }));
    assert.strictEqual(r.value.referrer, null);
    assert.strictEqual(r.value.utmContent, null);
  });

  test("the device hint is one of three words and nothing else", () => {
    assert.equal(parseWatchBeacon(good({ device: "MOBILE" })).value.deviceHint, "mobile");
    assert.equal(parseWatchBeacon(good({ device: "iPhone 15 Pro" })).ok, false);
    assert.equal(parseWatchBeacon(good({ device: 7 })).ok, false);
  });
});

describe("VSL watch beacon — the curve, and the caps that bound it", () => {
  test("samples are floored to whole seconds, de-duplicated and sorted", () => {
    const r = parseWatchBeacon(good({ samples: [12.7, 3, 12.9, 1, 3] }));
    assert.deepEqual(r.value.samples, [1, 3, 12]);
  });

  test("more than the cap in one call is refused, not trimmed", () => {
    const over = Array.from({ length: MAX_SAMPLES + 1 }, (_, i) => i);
    assert.equal(parseWatchBeacon(good({ samples: over })).error, "too_many_samples");
    const atCap = Array.from({ length: MAX_SAMPLES }, (_, i) => i);
    assert.equal(parseWatchBeacon(good({ samples: atCap })).ok, true);
  });

  test("one bad element poisons the whole beacon", () => {
    assert.equal(parseWatchBeacon(good({ samples: [1, 2, "3"] })).ok, false);
    assert.equal(parseWatchBeacon(good({ samples: [1, -2] })).ok, false);
    assert.equal(parseWatchBeacon(good({ samples: [1, 999999] })).ok, false);
    assert.equal(parseWatchBeacon(good({ samples: "1,2,3" })).ok, false);
  });

  test("an empty list is not a curve, so it stays unknown", () => {
    assert.strictEqual(parseWatchBeacon(good({ samples: [] })).value.samples, null);
  });

  test("the running total is separate from the length of the list", () => {
    // Nine samples taken, all at second 5 — a stuck player. The array collapses
    // to one entry and the total does not, which is the whole point of keeping
    // both numbers.
    const r = parseWatchBeacon(good({ samples: [5, 5, 5], n: 9 }));
    assert.deepEqual(r.value.samples, [5]);
    assert.equal(r.value.sampleCount, 9);
  });
});

describe("VSL watch beacon — the size gate", () => {
  test("the cap is counted in bytes, not characters", () => {
    assert.equal(byteLength("abc"), 3);
    assert.equal(byteLength("€"), 3);              // one character, three bytes
    assert.ok(overBodyCap("€".repeat(MAX_BODY_BYTES)));
  });

  test("a body at the cap passes and one byte over does not", () => {
    assert.equal(overBodyCap("x".repeat(MAX_BODY_BYTES)), false);
    assert.equal(overBodyCap("x".repeat(MAX_BODY_BYTES + 1)), true);
  });

  test("nothing at all is not over the cap", () => {
    assert.equal(overBodyCap(""), false);
    assert.equal(overBodyCap(null), false);
    assert.equal(overBodyCap(undefined), false);
  });
});

describe("VSL watch beacon — the cross-site allow-list", () => {
  test("the live funnel page is allowed and gets its own origin echoed back", () => {
    const h = corsHeaders("https://apply.fundhub.ai", {});
    assert.equal(h["Access-Control-Allow-Origin"], "https://apply.fundhub.ai");
    assert.equal(h.Vary, "Origin");
  });

  test("a stranger's site gets NO header at all, which is what blocks it", () => {
    assert.deepEqual(corsHeaders("https://not-us.example", {}), {});
    assert.deepEqual(corsHeaders("", {}), {});
    assert.deepEqual(corsHeaders(undefined, {}), {});
  });

  test("a wildcard is never returned to anybody", () => {
    for (const origin of ["https://apply.fundhub.ai", "https://evil.test", "*", null]) {
      const h = corsHeaders(origin, {});
      assert.notEqual(h["Access-Control-Allow-Origin"], "*");
    }
  });

  test("a near-miss on the domain is not the domain", () => {
    assert.deepEqual(corsHeaders("https://apply.fundhub.ai.evil.test", {}), {});
    assert.deepEqual(corsHeaders("http://apply.fundhub.ai", {}), {});   // not https
  });

  test("an extra origin can be added by environment variable", () => {
    const env = { VSL_BEACON_ORIGINS: "https://new-funnel.test, https://other.test" };
    assert.ok(allowedOrigins(env).has("https://new-funnel.test"));
    assert.equal(
      corsHeaders("https://other.test", env)["Access-Control-Allow-Origin"],
      "https://other.test"
    );
    // and the default list is still there
    assert.ok(allowedOrigins(env).has("https://apply.fundhub.ai"));
  });
});

describe("VSL watch beacon — the rate limit is described honestly", () => {
  test("the numbers are fixed in one place so the endpoint and the store agree", () => {
    for (const k of [
      "maxNewSessionsPerVisitor", "windowMinutes",
      "maxNewSessionsSiteWide", "siteWindowMinutes"
    ]) {
      assert.equal(typeof WATCH_LIMITS[k], "number", `${k} must be a number`);
      assert.ok(WATCH_LIMITS[k] > 0, `${k} must be above zero`);
    }
    assert.ok(Object.isFrozen(WATCH_LIMITS));
  });

  /* The per-visitor count can be walked around by making up a new visitor id,
     which the module says out loud. The site-wide count is the one that cannot,
     so it has to exist. This test fails if somebody deletes it. */
  test("there is a site-wide ceiling, not only a per-browser one", () => {
    assert.ok(WATCH_LIMITS.maxNewSessionsSiteWide > WATCH_LIMITS.maxNewSessionsPerVisitor,
      "the site-wide ceiling must be the looser of the two — it is a wall against a machine, not a throttle on people");
  });
});

/* These run with no Postgres by handing checkVisitorRate a fake transaction that
   records the SQL it is asked for. They cannot prove the count is RIGHT — that
   needs a database and lives in src/http/vsl-watch.pg.test.mjs — but they do
   prove the site-wide guard is asked for at all, which is the thing a later
   edit is most likely to drop by accident. */
describe("VSL watch beacon — the site-wide guard is actually asked for", () => {
  const spy = (row) => {
    const seen = [];
    return {
      seen,
      tx: {
        query: async (sql, params) => {
          seen.push({ sql, params });
          return { rows: [row] };
        }
      }
    };
  };
  const who = { visitorId: "v".repeat(20), sessionKey: "s".repeat(20) };

  test("every check asks the database for the whole-site count", async () => {
    const s = spy({ recent: 0, known: false, site_recent: 0 });
    await checkVisitorRate(s.tx, who);
    assert.match(s.seen[0].sql, /fundhub_vsl_recent_count/,
      "without this call the flood ceiling does not exist");
  });

  test("naming one limit must not switch the other guard off", async () => {
    const s = spy({ recent: 0, known: false, site_recent: 0 });
    await checkVisitorRate(s.tx, { ...who, limits: { maxNewSessionsPerVisitor: 3 } });
    assert.match(s.seen[0].sql, /fundhub_vsl_recent_count/);
    assert.equal(typeof s.seen[0].params[3], "number",
      "the site window must fall back to the default, not arrive undefined");
  });

  test("over the site ceiling is refused, and it says which guard fired", async () => {
    const s = spy({ recent: 0, known: false, site_recent: 5000 });
    const out = await checkVisitorRate(s.tx, who);
    assert.equal(out.limited, true);
    assert.equal(out.reason, "site_flood");
    assert.ok(out.retryAfterMinutes > 0, "a refusal must say when to come back");
  });

  test("a viewing that already exists is never refused, flood or no flood", async () => {
    const s = spy({ recent: 99999, known: true, site_recent: 99999 });
    const out = await checkVisitorRate(s.tx, who);
    assert.equal(out.limited, false,
      "cutting off an existing viewing throws away the longest watches, which are worth the most");
  });

  test("the two guards report themselves separately", async () => {
    const s = spy({ recent: 99999, known: false, site_recent: 0 });
    const out = await checkVisitorRate(s.tx, who);
    assert.equal(out.reason, "visitor_burst");
  });
});
