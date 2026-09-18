// Board N25 (2026-09-18): `npm run ship` deployed and never re-registered the app with
// Inngest, so a job added in a ship never ran until someone PUT /api/inngest by hand.
//
// Two halves. The helper must call it right and refuse anything but a real success. And
// ship.mjs must actually call it — after /api/health passes, before the ship is logged,
// with a failure that stops the ship. The second half is a source check because ship.mjs
// runs git, lint and a real deploy the moment it is imported.
//
// Lives under scripts/ because npm test only collects src/** and scripts/** (CLAUDE.md §12).

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { reregisterInngest, REGISTERED } from "./inngest-register.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* A fake fetch that answers from a list, one answer per call, and records each call. */
function fakeFetch(answers) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, method: opts?.method });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return { status: a.status, text: async () => (typeof a.body === "string" ? a.body : JSON.stringify(a.body)) };
  };
  return { impl, calls };
}
const noSleep = async () => {};

describe("reregisterInngest", () => {
  test("PUTs the live /api/inngest once and returns modified on a real success", async () => {
    const f = fakeFetch([{ status: 200, body: { message: REGISTERED, modified: true } }]);
    const r = await reregisterInngest({ site: "https://fundhub.ai", fetchImpl: f.impl, sleep: noSleep });
    assert.deepStrictEqual(f.calls, [{ url: "https://fundhub.ai/api/inngest", method: "PUT" }]);
    assert.strictEqual(r.modified, true);
    assert.strictEqual(r.attempts, 1);
  });

  test("modified false is still a success", async () => {
    const f = fakeFetch([{ status: 200, body: { message: REGISTERED, modified: false } }]);
    const r = await reregisterInngest({ fetchImpl: f.impl, sleep: noSleep });
    assert.strictEqual(r.modified, false);
  });

  test("a 502 right after the deploy is retried, then the success counts", async () => {
    const f = fakeFetch([
      { status: 502, body: "<html>Bad Gateway</html>" },
      { status: 200, body: { message: REGISTERED, modified: true } }
    ]);
    const r = await reregisterInngest({ fetchImpl: f.impl, sleep: noSleep });
    assert.strictEqual(f.calls.length, 2);
    assert.strictEqual(r.attempts, 2);
  });

  test("Inngest refusing the sync throws after every try, naming the last answer", async () => {
    const f = fakeFetch([{ status: 500, body: { message: "Failed to register; status code: 401", modified: false } }]);
    await assert.rejects(
      reregisterInngest({ fetchImpl: f.impl, attempts: 3, sleep: noSleep }),
      /did not register after 3 tries.*HTTP 500: Failed to register; status code: 401/
    );
    assert.strictEqual(f.calls.length, 3);
  });

  test("200 without the exact success message is a failure, not a pass", async () => {
    const f = fakeFetch([{ status: 200, body: { message: "Unauthorized" } }]);
    await assert.rejects(reregisterInngest({ fetchImpl: f.impl, attempts: 2, sleep: noSleep }), /HTTP 200: Unauthorized/);
  });

  test("a network error on every try throws", async () => {
    const f = fakeFetch([new Error("fetch failed")]);
    await assert.rejects(reregisterInngest({ fetchImpl: f.impl, attempts: 2, sleep: noSleep }), /fetch failed/);
    assert.strictEqual(f.calls.length, 2);
  });
});

describe("npm run ship re-registers with Inngest after the deploy", () => {
  const src = fs.readFileSync(path.join(HERE, "ship.mjs"), "utf8");

  test("ship.mjs imports the re-register step", () => {
    assert.match(src, /import \{ reregisterInngest \} from "\.\/inngest-register\.mjs";/);
  });

  test("it runs after the deploy and /api/health, and before the ship is logged", () => {
    const deploy = src.indexOf('run("netlify", ["deploy", "--prod"');
    const health = src.indexOf("deployed, but /api/health does not show this build yet");
    const call = src.indexOf("await reregisterInngest({ site: SITE })");
    const logged = src.indexOf("fs.appendFileSync(LOG");
    assert.ok(deploy > 0 && health > deploy, "deploy and health check found in order");
    assert.ok(call > health, "re-register comes after the health check");
    assert.ok(logged > call, "the ship is logged only after the re-register");
  });

  test("a failed re-register stops the ship with a non-zero exit", () => {
    const call = src.indexOf("await reregisterInngest({ site: SITE })");
    const after = src.slice(call, src.indexOf("fs.appendFileSync(LOG"));
    assert.match(after, /catch \(e\) \{\s*fail\(`deployed and live, but Inngest was NOT re-registered/);
    assert.match(src, /function fail\(msg\) \{[\s\S]*?process\.exit\(1\);/);
  });
});
