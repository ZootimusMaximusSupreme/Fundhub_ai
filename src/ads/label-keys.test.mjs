// src/ads/label-keys.test.mjs — the normaliser, with no database.
//
// THIS ONE ACTUALLY RUNS. Every endpoint test for the script writer is a
// .pg.test.mjs and skips wherever DATABASE_URL is unset, which is most places.
// The rule this module carries — one spelling per angle — is the whole reason
// 377 could be trusted with free-text labels, so it is proved by a test that
// runs in every pass instead of one that waits for a Postgres.

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  normaliseLabelKey, isLabelKey, friendlyName, normaliseLane, isLane, LABEL_KEY_RE
} from "./label-keys.mjs";
import { LANES } from "./registry.mjs";

describe("normaliseLabelKey", () => {
  test("the three spellings of one angle all land on the same key", () => {
    // The exact split 377's header warns about. If this ever fails, one angle's
    // spend is being counted in two groups and every answer built on it is wrong.
    const want = "denial_angle";
    for (const typed of [
      "denial_angle", "Denial Angle", "denial-angle", "DENIAL ANGLE",
      "  Denial   Angle  ", "Denial_Angle", "denial--angle", "denial__angle"
    ]) {
      assert.equal(normaliseLabelKey(typed), want, `"${typed}" did not normalise to ${want}`);
    }
  });

  test("punctuation collapses the same way a space does", () => {
    assert.equal(normaliseLabelKey("Denial — Angle"), "denial_angle");
    assert.equal(normaliseLabelKey("broker burn / angle"), "broker_burn_angle");
    assert.equal(normaliseLabelKey("Chris's angle"), "chris_s_angle");
  });

  test("digits survive, and a lane-shaped word is left alone", () => {
    assert.equal(normaliseLabelKey("funding600"), "funding600");
    assert.equal(normaliseLabelKey("proof_first_v2"), "proof_first_v2");
  });

  test("nothing in means null out — never an empty string, never a placeholder", () => {
    // NULL MEANS UNKNOWN (CLAUDE.md §12). An unlabelled script is a normal
    // script, so a blank must not become "" and land in the database as a value.
    for (const nothing of [null, undefined, "", "   ", "---", "___", "!!!"]) {
      assert.equal(normaliseLabelKey(nothing), null, `${JSON.stringify(nothing)} produced a value`);
    }
  });

  test("a key that is already clean is returned unchanged", () => {
    // Normalising twice must give the same answer as normalising once, or a row
    // rewritten by a later tool drifts away from the row it came from.
    for (const key of ["denial_angle", "vsl", "cold", "landing_page", "a1"]) {
      assert.equal(normaliseLabelKey(key), key);
      assert.equal(normaliseLabelKey(normaliseLabelKey(key)), key);
    }
  });
});

describe("isLabelKey", () => {
  test("it is the database's own regex, so the two can never disagree", () => {
    assert.equal(LABEL_KEY_RE.source, "^[a-z][a-z0-9_]{1,48}$");
  });

  test("accepts what 377's CHECK accepts", () => {
    for (const ok of ["denial_angle", "cold", "vsl", "landing_page", "a1", "a" + "b".repeat(48)]) {
      assert.equal(isLabelKey(ok), true, `${ok} should be a legal key`);
    }
  });

  test("refuses what the CHECK refuses, including what normalising cannot fix", () => {
    // "3 second hook" normalises cleanly and is still illegal — a key must start
    // with a letter. That is why the writer asks this question separately rather
    // than assuming normalising is enough.
    assert.equal(normaliseLabelKey("3 second hook"), "3_second_hook");
    assert.equal(isLabelKey("3_second_hook"), false);

    for (const bad of ["a", "", "Denial_Angle", "denial angle", "denial-angle",
                       "a" + "b".repeat(49), null, undefined, 7]) {
      assert.equal(isLabelKey(bad), false, `${JSON.stringify(bad)} should not be a legal key`);
    }
  });
});

describe("friendlyName", () => {
  test("turns a key back into words for the dictionary", () => {
    assert.equal(friendlyName("denial_angle"), "Denial Angle");
    assert.equal(friendlyName("broker_burn_angle"), "Broker Burn Angle");
    assert.equal(friendlyName("landing_page"), "Landing Page");
    assert.equal(friendlyName("cold"), "Cold");
  });

  test("nothing in means null out", () => {
    for (const nothing of [null, undefined, "", "   "]) {
      assert.equal(friendlyName(nothing), null);
    }
  });
});

describe("lane", () => {
  test("normalises case and spacing without touching the word itself", () => {
    assert.equal(normaliseLane("  Funding600 "), "funding600");
    assert.equal(normaliseLane("WL"), "wl");
    assert.equal(normaliseLane(null), null);
    assert.equal(normaliseLane("  "), null);
  });

  test("the five real lanes pass and are the registry's list, not a second copy", () => {
    assert.deepEqual([...LANES], ["funding600", "premium", "sorting", "uwiq", "wl"]);
    for (const lane of LANES) assert.equal(isLane(lane), true);
  });

  test("'unknown' is refused, because a person typing a lane is not garbage on the wire", () => {
    assert.equal(isLane("unknown"), false);
    assert.equal(isLane("funding_600"), false);
    assert.equal(isLane(""), false);
    assert.equal(isLane(null), false);
  });
});
