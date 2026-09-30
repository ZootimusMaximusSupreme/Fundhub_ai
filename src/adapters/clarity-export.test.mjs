import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchClarityLiveInsights } from "./clarity-export.mjs";

test("Clarity export allows 10 fetch calls then blocks the 11th without fetch", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clarity-export-"));
  const counterPath = join(dir, "counter.json");
  const env = {
    CLARITY_DATA_EXPORT_TOKEN: "test-token-not-real",
    CLARITY_PROJECT_ID: "test-project",
  };

  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      async text() {
        return "[]";
      },
    };
  };

  try {
    for (let i = 0; i < 10; i += 1) {
      await fetchClarityLiveInsights({
        counterPath,
        env,
        numOfDays: 1,
      });
    }
    assert.equal(fetchCalls, 10, "calls 1–10 must reach fetch");

    await assert.rejects(
      () =>
        fetchClarityLiveInsights({
          counterPath,
          env,
          numOfDays: 1,
        }),
      (err) => {
        assert.match(String(err && err.message), /daily cap \(10\)/i);
        return true;
      }
    );
    assert.equal(fetchCalls, 10, "call 11 must not call fetch");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
