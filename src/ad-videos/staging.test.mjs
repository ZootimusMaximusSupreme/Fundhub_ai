// Staging — the one route a take can travel, and the proof it publishes nothing.
//
// NO NETWORK. This module makes no call at all any more, which is itself the
// property worth the most here.
//
// THE TEST THAT MATTERS IS THE ABSENCE ONE. A `link` mode used to live in this
// file: it called drive.shareAnyoneWithLink() — "anyone holding this link may
// read this file" — and nothing ever took that permission back off. It was
// deleted on 2026-09-22 along with the provider call it needed, because
// Submagic takes the bytes directly and no public link is needed by anybody.
//
// So the assertions below are on what CANNOT happen: no module here shares a
// file, no environment variable turns sharing back on, and no answer from this
// module ever carries a URL. A test that only checked "did it return ok" would
// pass while quietly publishing a video.

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

import * as staging from "./staging.mjs";
import { publicUrlFor, MODE_DIRECT, MODES } from "./staging.mjs";

const row = (extra = {}) => ({ id: "row1", drive_raw_file_id: "1M8Vnwglva5mhvqPqeGAopLcBztjZwvDe", ...extra });

describe("nothing is ever published", () => {
  test("direct is the only mode there is", () => {
    assert.deepEqual([...MODES], [MODE_DIRECT]);
  });

  test("it makes NO call and returns NO url", async () => {
    const res = await publicUrlFor(row(), { env: {} });
    assert.equal(res.ok, true);
    assert.equal(res.mode, MODE_DIRECT);
    assert.equal(res.url, null, "staging must not hand back a link");
  });

  test("no environment variable can turn sharing back on", async () => {
    /* The old switch, plus every spelling somebody might reach for. None of
       them may change the answer, because the code that acted on them is gone
       rather than defaulted off. */
    for (const env of [
      { AD_VIDEO_STAGING_MODE: "link" }, { AD_VIDEO_STAGING_MODE: "LINK" },
      { AD_VIDEO_STAGING_MODE: "public" }, { AD_VIDEO_SHARE: "1" }
    ]) {
      const res = await publicUrlFor(row(), { env });
      assert.equal(res.mode, MODE_DIRECT);
      assert.equal(res.url, null, `${JSON.stringify(env)} must not make a take world-readable`);
    }
  });

  test("THE MODULE HOLDS NO WAY TO SHARE A FILE", () => {
    /* Read as text on purpose. An export that is missing today can be added
       back tomorrow by an agent that thinks it is restoring a feature; this
       fails the moment the words come back. */
    const src = readFileSync(new URL("./staging.mjs", import.meta.url), "utf8");
    const body = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    assert.equal(/shareAnyoneWithLink\s*\(/.test(body), false,
      "staging must not be able to share a Drive file with anyone");
    assert.equal(/drive\.usercontent\.google\.com/.test(body), false,
      "staging must not build a public download link");
    assert.equal(staging.stagingMode, undefined, "the mode switch is gone, not defaulted");
    assert.equal(staging.driveDownloadUrl, undefined, "the public link builder is gone");
    assert.equal(staging.MODE_LINK, undefined, "there is no link mode to name");
  });

  test("it leaves a mark that says where the bytes are", async () => {
    const res = await publicUrlFor(row(), { env: {} });
    assert.equal(res.storageKey, "drive:1M8Vnwglva5mhvqPqeGAopLcBztjZwvDe");
    assert.ok(res.at, "the step above writes this as staged_at");
    assert.match(res.note, /nothing was shared/);
  });
});

describe("a row that cannot be staged at all", () => {
  test("no Drive file id is a permanent refusal, not a retry", async () => {
    for (const bad of [null, "", "   ", undefined]) {
      const res = await publicUrlFor(row({ drive_raw_file_id: bad }), { env: {} });
      assert.equal(res.ok, false);
      assert.equal(res.retryable, false, "a row with no file will never grow one");
      assert.equal(res.url, null);
    }
  });

  test("no row at all does not throw", async () => {
    const res = await publicUrlFor(undefined, { env: {} });
    assert.equal(res.ok, false);
  });
});
