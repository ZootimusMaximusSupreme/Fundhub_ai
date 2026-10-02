// src/funnel/buybox-version.test.mjs — the "buy box version 2" marker row
// (docs/tracking/tracking-spec.md, "Buy box versions").
//
// scripts/tracking/mark-buybox-version.mjs writes ONE events row through the
// real emit(): funnel.buybox_version { version: 2, page: "/roadmap",
// deployed_at }, idempotency key buybox-version:2. These tests run the real
// emit() against a fake events table that keeps one row per (org, key), the
// way the real unique index does, so a second run is proved to save nothing
// and to keep the first deploy time.
//
// What this cannot prove: the real Postgres index. The key is the same
// ON CONFLICT path every funnel event already uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { emit } from "../events/bus.mjs";
import {
  BUYBOX_EVENT, BUYBOX_PAGE, BUYBOX_VERSION, buyboxVersionKey, markBuyboxVersion
} from "../../scripts/tracking/mark-buybox-version.mjs";
import { TRACK_EVENTS } from "./track.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";

function eventsTable() {
  const rows = [];
  return {
    rows,
    async query(sql, params) {
      if (/INSERT INTO events/.test(sql)) {
        const [orgId, name, version, key, clientId, payload] = params;
        if (key && rows.some((r) => r.org_id === orgId && r.idempotency_key === key)) return { rows: [] };
        const id = `evt-${rows.length + 1}`;
        rows.push({ id, org_id: orgId, name, version, idempotency_key: key, client_id: clientId, payload: structuredClone(payload) });
        return { rows: [{ id }] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
}

test("one row: funnel.buybox_version {version 2, /roadmap, deployed_at}, key buybox-version:2", async () => {
  const db = eventsTable();
  const now = new Date("2026-10-02T19:30:00.000Z");
  const out = await markBuyboxVersion(db, { emit, now, orgId: ORG });
  assert.equal(out.deduped, false);
  assert.equal(out.id, "evt-1");
  assert.equal(db.rows.length, 1);
  const row = db.rows[0];
  assert.equal(row.name, "funnel.buybox_version");
  assert.equal(row.name, BUYBOX_EVENT);
  assert.equal(row.idempotency_key, "buybox-version:2");
  assert.equal(row.idempotency_key, buyboxVersionKey());
  assert.deepEqual(row.payload, { version: 2, page: "/roadmap", deployed_at: "2026-10-02T19:30:00.000Z" });
  assert.equal(BUYBOX_VERSION, 2);
  assert.equal(BUYBOX_PAGE, "/roadmap");
  assert.equal(row.client_id, null, "a page marker, not anyone's record");
});

test("running it again saves nothing and keeps the first deploy time", async () => {
  const db = eventsTable();
  await markBuyboxVersion(db, { emit, now: new Date("2026-10-02T19:30:00.000Z"), orgId: ORG });
  const again = await markBuyboxVersion(db, { emit, now: new Date("2026-10-03T08:00:00.000Z"), orgId: ORG });
  assert.equal(again.deduped, true);
  assert.equal(again.id, null);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].payload.deployed_at, "2026-10-02T19:30:00.000Z");
});

test("the write is non-canonical, skips Inngest, and carries the key", async () => {
  const seen = [];
  await markBuyboxVersion({}, {
    now: new Date("2026-10-02T19:30:00.000Z"),
    emit: async (_db, name, payload, opts) => { seen.push({ name, payload, opts }); return { id: "e1", deduped: false }; }
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].opts.allowNonCanonical, true);
  assert.equal(seen[0].opts.skipInngest, true);
  assert.equal(seen[0].opts.idempotencyKey, "buybox-version:2");
  await assert.rejects(() => markBuyboxVersion({}, {}), /emit is required/);
});

test("the marker is not a browser event: the track door does not accept it", () => {
  assert.equal(Object.hasOwn(TRACK_EVENTS, "buybox_version"), false);
});

test("the spec documents the marker and the bbv prop", () => {
  const spec = fs.readFileSync(fileURLToPath(new URL("../../docs/tracking/tracking-spec.md", import.meta.url)), "utf8");
  assert.match(spec, /## Buy box versions/);
  assert.match(spec, /`funnel\.buybox_version`, payload `\{ version: 2, page: "\/roadmap", deployed_at: <ISO time> \}`, idempotency key `buybox-version:2`/);
  assert.match(spec, /node scripts\/tracking\/mark-buybox-version\.mjs/);
});
