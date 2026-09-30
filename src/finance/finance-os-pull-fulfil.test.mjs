import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  systemPullUsesSimulation,
  fulfilQueuedSystemPulls
} from "./finance-os-pull-fulfil.mjs";

describe("systemPullUsesSimulation", () => {
  test("defaults to simulation when live is not explicitly named", () => {
    assert.equal(systemPullUsesSimulation({}), true);
    assert.equal(systemPullUsesSimulation({ CRS_ALLOW_LIVE: "1" }), true);
  });

  test("live only when FINANCE_OS_SYSTEM_PULL_LIVE and CRS_ALLOW_LIVE are both on", () => {
    assert.equal(
      systemPullUsesSimulation({ FINANCE_OS_SYSTEM_PULL_LIVE: "1", CRS_ALLOW_LIVE: "1" }),
      false
    );
  });
});

describe("fulfilQueuedSystemPulls", () => {
  test("an empty queue does nothing", async () => {
    const db = {
      query: async (text) => {
        if (/FROM soft_pull_requests/.test(text)) return { rows: [] };
        throw new Error("unexpected query");
      }
    };
    const tally = await fulfilQueuedSystemPulls(db, {
      runPull: async () => ({ ok: true }),
      aftercare: async () => ({})
    });
    assert.equal(tally.checked, 0);
    assert.equal(tally.fulfilled, 0);
  });

  test("one fault does not stop the next row", async () => {
    const rows = [
      { id: "a", org_id: "o", client_id: "c1" },
      { id: "b", org_id: "o", client_id: "c2" }
    ];
    let n = 0;
    const db = {
      query: async (text) => {
        if (/FROM soft_pull_requests/.test(text)) return { rows };
        throw new Error("unexpected");
      }
    };
    const tally = await fulfilQueuedSystemPulls(db, {
      runPull: async (_db, { clientId }) => {
        n += 1;
        if (clientId === "c1") throw new Error("boom");
        return { ok: true, crsResultId: "cr" };
      },
      aftercare: async () => ({ ok: true })
    });
    assert.equal(tally.fulfilled, 1);
    assert.equal(tally.errored.length, 1);
    assert.equal(n, 2);
  });
});
