// The Drive write provider.
//
// NO NETWORK. One injected `fetchImpl` answers both the Google token exchange
// and the Drive call after it. ADAPTERS_DRY_RUN is "0" wherever a write is
// expected, because the fence defaults to BLOCKED.
//
// The two properties worth the most here are the two named in the module's
// header: a read-only token is reported as a read-only token rather than as a
// mystery, and a video is refused outright instead of being mangled by a
// transport that reads every response as text.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROVIDER, ENABLED, TRANSMITS, FOLDER_MIME,
  DRIVE_WRITE_SCOPE, MAX_TEXT_UPLOAD_BYTES, VIDEO_UPLOAD_UNSUPPORTED,
  grantsWrite, resetTokenCache,
  listNewVideos, getFileMeta, renameFile, ensureFolder, uploadTextFile, uploadVideo
} from "./google-drive-write.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** An OAuth token.json inline, the shape src/company-brain/config.mjs reads. */
const tokenJson = JSON.stringify({
  refresh_token: "rt-test", client_id: "cid-test", client_secret: "cs-test"
});

const envWith = (extra = {}) => ({
  ADAPTERS_DRY_RUN: "0",
  GOOGLE_DRIVE_OAUTH_TOKEN_JSON: tokenJson,
  ...extra
});

/* One fetch stand-in for both hops. The first call is always Google's token
   endpoint; everything after it is Drive. */
function fakeFetch({ scope = DRIVE_WRITE_SCOPE, responses = [] } = {}) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      const body = { access_token: "at-test", expires_in: 3600, token_type: "Bearer", scope };
      return { ok: true, status: 200, headers: { forEach() {} }, text: async () => JSON.stringify(body) };
    }
    const { status = 200, body = {} } = queue.length > 1 ? queue.shift() : (queue[0] || {});
    return {
      ok: status >= 200 && status < 300, status,
      headers: { forEach() {} }, text: async () => JSON.stringify(body)
    };
  };
  impl.calls = calls;
  impl.drive = () => calls.filter((c) => !c.url.includes("oauth2.googleapis.com"));
  return impl;
}

beforeEach(() => resetTokenCache());

describe("scope", () => {
  test("read-only does not write, and full drive does", () => {
    assert.equal(grantsWrite("https://www.googleapis.com/auth/drive.readonly"), false);
    assert.equal(grantsWrite(DRIVE_WRITE_SCOPE), true);
    assert.equal(grantsWrite("https://www.googleapis.com/auth/drive.file"), true);
    assert.equal(grantsWrite(null), null, "Google not saying is not the same as Google saying no");
  });

  test("A READ-ONLY TOKEN IS NAMED, NOT GUESSED AT — and the stored key is left alone", async () => {
    const impl = fakeFetch({ scope: "https://www.googleapis.com/auth/drive.readonly" });
    const res = await ensureFolder({ parentId: "root", name: "043", env: envWith(), fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, false);
    assert.match(res.error, /read-only/);
    assert.match(res.error, /left exactly as it is/);
    assert.equal(impl.drive().length, 0, "a write was attempted on a token that cannot write");
  });

  test("a 403 from Google says what it usually means", async () => {
    const impl = fakeFetch({ responses: [{ status: 403, body: { error: { message: "insufficientPermissions" } } }] });
    const res = await renameFile("f1", "043_t02_raw.mp4", { env: envWith(), fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, false);
    assert.match(res.error, /read-only token/);
  });
});

describe("the fence", () => {
  test("nothing is written when ADAPTERS_DRY_RUN is unset", async () => {
    const impl = fakeFetch({});
    const res = await ensureFolder({
      parentId: "root", name: "043",
      env: { GOOGLE_DRIVE_OAUTH_TOKEN_JSON: tokenJson }, fetchImpl: impl
    });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true);
    assert.equal(impl.drive().length, 0);
  });
});

describe("finding new takes", () => {
  test("a file still uploading is skipped — it has an id and zero bytes", async () => {
    const impl = fakeFetch({ responses: [{ status: 200, body: { files: [
      { id: "a", name: "VID_1.mp4", mimeType: "video/mp4", size: "0", createdTime: "2026-09-23T10:00:00Z" },
      { id: "b", name: "VID_2.mp4", mimeType: "video/mp4", size: "184000000", createdTime: "2026-09-23T10:05:00Z" }
    ] } }] });
    const res = await listNewVideos({ folderId: "raw", env: envWith(), fetchImpl: impl });
    assert.equal(res.ok, true);
    assert.deepEqual(res.files.map((f) => f.id), ["b"]);
    assert.equal(res.skipped, 1);
  });

  test("something that is not a video is skipped", async () => {
    const impl = fakeFetch({ responses: [{ status: 200, body: { files: [
      { id: "n", name: "notes.txt", mimeType: "text/plain", size: "40" }
    ] } }] });
    const res = await listNewVideos({ folderId: "raw", env: envWith(), fetchImpl: impl });
    assert.deepEqual(res.files, []);
  });

  test("the watermark and the folder both reach the query", async () => {
    const impl = fakeFetch({ responses: [{ status: 200, body: { files: [] } }] });
    await listNewVideos({ folderId: "RAWID", since: "2026-09-23T09:00:00.000Z", env: envWith(), fetchImpl: impl });
    const url = decodeURIComponent(impl.drive()[0].url);
    assert.match(url, /'RAWID' in parents/);
    assert.match(url, /trashed = false/);
    assert.match(url, /createdTime > '2026-09-23T09:00:00.000Z'/);
  });

  test("no folder id means no call at all", async () => {
    const impl = fakeFetch({});
    const res = await listNewVideos({ env: envWith(), fetchImpl: impl });
    assert.equal(res.ok, false);
    assert.equal(impl.calls.length, 0);
  });
});

describe("the real picture size", () => {
  test("width and height come off the file, not off a form", async () => {
    const impl = fakeFetch({ responses: [{ status: 200, body: {
      id: "b", name: "VID_2.mp4",
      videoMediaMetadata: { width: 1080, height: 1920, durationMillis: "102000" }
    } }] });
    const res = await getFileMeta("b", { env: envWith(), fetchImpl: impl });
    assert.equal(res.width, 1080);
    assert.equal(res.height, 1920);
    assert.equal(res.durationSeconds, 102);
  });
});

describe("folders", () => {
  test("an existing folder is reused — a second pass must not make a second 043", async () => {
    const impl = fakeFetch({ responses: [{ status: 200, body: { files: [{ id: "f043", name: "043" }] } }] });
    const res = await ensureFolder({ parentId: "paul", name: "043", env: envWith(), fetchImpl: impl });
    assert.equal(res.ok, true);
    assert.equal(res.folderId, "f043");
    assert.equal(res.created, false);
    assert.equal(impl.drive().length, 1, "it created a folder that already existed");
  });

  test("a missing folder is made once", async () => {
    const impl = fakeFetch({ responses: [
      { status: 200, body: { files: [] } },
      { status: 200, body: { id: "new043", name: "043" } }
    ] });
    const res = await ensureFolder({ parentId: "paul", name: "043", env: envWith(), fetchImpl: impl });
    assert.equal(res.created, true);
    assert.equal(res.folderId, "new043");
    assert.equal(JSON.parse(impl.drive()[1].init.body).mimeType, FOLDER_MIME);
  });
});

describe("the brief", () => {
  test("it goes up as multipart, with a boundary the text cannot contain", async () => {
    const impl = fakeFetch({ responses: [{ status: 200, body: { id: "brief1", name: "043_brief.txt" } }] });
    const res = await uploadTextFile({
      parentId: "f043", name: "043_brief.txt",
      content: "Ad number: 43\nLanding link: https://fundhub.ai/?utm_content=43",
      env: envWith(), fetchImpl: impl
    });
    assert.equal(res.ok, true);
    assert.equal(res.fileId, "brief1");
    const call = impl.drive()[0];
    assert.match(call.init.headers["Content-Type"], /multipart\/related; boundary=/);
    const boundary = call.init.headers["Content-Type"].split("boundary=")[1];
    assert.equal(call.init.body.split(boundary).length - 1, 3, "the boundary must appear exactly three times");
  });

  test("anything big enough to be media is refused before a byte moves", async () => {
    const impl = fakeFetch({});
    const res = await uploadTextFile({
      parentId: "f", name: "big.bin", content: "x".repeat(MAX_TEXT_UPLOAD_BYTES + 1),
      env: envWith(), fetchImpl: impl
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /carries text, not media/);
    assert.equal(impl.calls.length, 0);
  });
});

describe("THE NAMED GAP — video bytes", () => {
  /* This is not a bug to be fixed by adding a raw fetch here. The chokepoint
     reads every response with res.text(), so an MP4 cannot travel through it,
     and a module that opened its own socket is exactly what
     src/lib/no-unfenced-transmit.test.mjs exists to stop. The gap is named. */
  test("uploadVideo refuses and says why", async () => {
    const res = await uploadVideo({ parentId: "f", name: "043_t02_final_v1.mp4", sourceUrl: "https://cdn.test/o.mp4" });
    assert.equal(res.ok, false);
    assert.equal(res.unsupported, true);
    assert.equal(res.error, VIDEO_UPLOAD_UNSUPPORTED);
    assert.match(res.error, /reads every response as text/);
  });
});

describe("the posture of this file", () => {
  test("it ships unrouted", () => {
    assert.equal(PROVIDER, "google_drive_write");
    assert.equal(ENABLED, false);
    assert.equal(TRANSMITS, true);
  });

  test("it is NOT in the provider registry", () => {
    const index = fs.readFileSync(path.join(HERE, "index.mjs"), "utf8");
    assert.ok(!/google-drive-write|google_drive_write/.test(index));
  });

  test("the read-only client next door is still read-only", () => {
    const src = fs.readFileSync(path.join(HERE, "../../company-brain/drive-client.mjs"), "utf8");
    assert.match(src.slice(0, 200), /never writes, deletes, or moves/,
      "the write side lives here; if that header ever changes, the split has been undone");
  });
});
