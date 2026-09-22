// Staging — the two routes a take can travel, and the safety of each.
//
// NO NETWORK. The Drive provider is a stub, which is also how the module is
// meant to be used from the sweeper: ports in, verdict out.
//
// The properties worth the most here are the ones a reviewer cannot check by
// reading the happy path:
//
//   * `direct` publishes NOTHING. No call, no link, no permission. A test that
//     only checked "did it return ok" would pass while quietly sharing a video
//     with the internet, so the assertion is on the calls that did NOT happen.
//   * A bad value in the mode variable reads as `direct`, never as `link`. A
//     typo must not be the thing that makes a take world-readable.
//   * The link carries `confirm=t`. Without it a file over roughly 100 MB
//     answers a virus-scan page with a 200 status, which an editor accepts and
//     then cannot decode. Measured 2026-09-22.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  publicUrlFor, stagingMode, driveDownloadUrl,
  MODE_DIRECT, MODE_LINK, MODES, STAGING_MODE_VAR, DRIVE_DOWNLOAD_BASE
} from "./staging.mjs";

const row = (extra = {}) => ({ id: "row1", drive_raw_file_id: "1M8Vnwglva5mhvqPqeGAopLcBztjZwvDe", ...extra });

/** A Drive stub that records whether anything was shared. */
function fakeDrive({ ok = true, error = null, retryable = true } = {}) {
  const shared = [];
  return {
    shared,
    shareAnyoneWithLink: async (fileId) => {
      shared.push(fileId);
      return ok ? { ok: true, retryable: false, fileId, permissionId: "perm1" } : { ok: false, retryable, error };
    }
  };
}

describe("which route", () => {
  test("nothing set means direct — the route that publishes nothing", () => {
    assert.equal(stagingMode({}), MODE_DIRECT);
    assert.equal(stagingMode({ [STAGING_MODE_VAR]: "" }), MODE_DIRECT);
  });

  test("link is the only way to get link", () => {
    assert.equal(stagingMode({ [STAGING_MODE_VAR]: "link" }), MODE_LINK);
    assert.equal(stagingMode({ [STAGING_MODE_VAR]: "LINK" }), MODE_LINK);
  });

  test("A TYPO READS AS DIRECT, never as link", () => {
    for (const typo of ["lnik", "public", "true", "1", "url", "yes"]) {
      assert.equal(stagingMode({ [STAGING_MODE_VAR]: typo }), MODE_DIRECT,
        `"${typo}" must not be the thing that makes a take world-readable`);
    }
  });

  test("the two modes are the whole list", () => {
    assert.deepEqual([...MODES], [MODE_DIRECT, MODE_LINK]);
  });
});

describe("direct — the default", () => {
  test("it makes NO call and returns NO url", async () => {
    const drive = fakeDrive();
    const res = await publicUrlFor(row(), { env: {}, drive });
    assert.equal(res.ok, true);
    assert.equal(res.mode, MODE_DIRECT);
    assert.equal(res.url, null, "direct must not hand back a link");
    assert.deepEqual(drive.shared, [], "direct must not share the file with anybody");
  });

  test("it leaves a mark that says where the bytes are", async () => {
    const res = await publicUrlFor(row(), { env: {}, drive: fakeDrive() });
    assert.equal(res.storageKey, "drive:1M8Vnwglva5mhvqPqeGAopLcBztjZwvDe");
    assert.ok(res.at, "the step above writes this as staged_at");
  });
});

describe("link — the fallback", () => {
  test("it shares exactly one file and builds the download link", async () => {
    const drive = fakeDrive();
    const res = await publicUrlFor(row(), { env: { [STAGING_MODE_VAR]: "link" }, drive });
    assert.equal(res.ok, true);
    assert.equal(res.mode, MODE_LINK);
    assert.deepEqual(drive.shared, ["1M8Vnwglva5mhvqPqeGAopLcBztjZwvDe"],
      "one file, never a folder and never a second file");
    assert.ok(res.url.startsWith(DRIVE_DOWNLOAD_BASE));
  });

  test("THE LINK CARRIES confirm=t — without it a big take returns a virus-scan page", () => {
    const url = driveDownloadUrl("abc123");
    assert.match(url, /[?&]confirm=t(&|$)/);
    assert.match(url, /[?&]export=download(&|$)/);
    assert.match(url, /[?&]id=abc123(&|$)/);
  });

  test("the link carries the file id and NOTHING else about us", () => {
    const url = new URL(driveDownloadUrl("abc123"));
    assert.deepEqual([...url.searchParams.keys()].sort(), ["confirm", "export", "id"],
      "no token, no org, no row id, no anything that names Fundhub or a client");
    assert.equal(url.pathname, "/download");
  });

  test("a file id with a query character in it cannot escape the query string", () => {
    const url = new URL(driveDownloadUrl("abc&export=evil"));
    assert.equal(url.searchParams.get("id"), "abc&export=evil");
    assert.equal(url.searchParams.get("export"), "download");
  });

  test("Drive refusing to share is reported, not papered over", async () => {
    const res = await publicUrlFor(row(), {
      env: { [STAGING_MODE_VAR]: "link" },
      drive: fakeDrive({ ok: false, error: "HTTP 403 from Google", retryable: false })
    });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, false);
    assert.equal(res.url, null);
    assert.match(res.error, /403/);
  });

  test("a provider that cannot share says so rather than returning a dead link", async () => {
    const res = await publicUrlFor(row(), { env: { [STAGING_MODE_VAR]: "link" }, drive: {} });
    assert.equal(res.ok, false);
    assert.match(res.error, /share a file/);
  });
});

describe("a row that cannot be staged at all", () => {
  test("no Drive file id is a permanent refusal, not a retry", async () => {
    const drive = fakeDrive();
    for (const bad of [null, "", "   ", undefined]) {
      const res = await publicUrlFor(row({ drive_raw_file_id: bad }), { env: {}, drive });
      assert.equal(res.ok, false);
      assert.equal(res.retryable, false, "a row with no file will never grow one");
    }
    assert.deepEqual(drive.shared, []);
  });

  test("no row at all does not throw", async () => {
    const res = await publicUrlFor(undefined, { env: {}, drive: fakeDrive() });
    assert.equal(res.ok, false);
  });

  test("driveDownloadUrl of nothing is null, not a broken link", () => {
    assert.equal(driveDownloadUrl(""), null);
    assert.equal(driveDownloadUrl(null), null);
  });
});

describe("the mode can be forced for one call", () => {
  test("an explicit mode beats the environment", async () => {
    const drive = fakeDrive();
    const res = await publicUrlFor(row(), { env: { [STAGING_MODE_VAR]: "link" }, drive, mode: MODE_DIRECT });
    assert.equal(res.mode, MODE_DIRECT);
    assert.deepEqual(drive.shared, []);
  });

  test("an unknown forced mode falls back to the environment, not to link", async () => {
    const drive = fakeDrive();
    const res = await publicUrlFor(row(), { env: {}, drive, mode: "whatever" });
    assert.equal(res.mode, MODE_DIRECT);
    assert.deepEqual(drive.shared, []);
  });
});
