import test from "node:test";
import assert from "node:assert/strict";
import { SWEEP_CRON, sweep } from "./blueprint-closer-ready-sweeper.mjs";

test("blueprint closer-ready sweeper uses hourly cron", () => {
  assert.equal(SWEEP_CRON, "0 * * * *");
});

test("sweep returns scanned count with empty db", async () => {
  const db = {
    async query() {
      return { rows: [] };
    }
  };
  const out = await sweep(db);
  assert.equal(out.scanned, 0);
  assert.deepEqual(out.results, []);
});
