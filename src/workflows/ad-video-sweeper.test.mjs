// The ad video sweeper.
//
// `db`, the store and the ports are all arguments, so every case here runs with
// no Inngest, no scheduler, no database and no network.
//
// Two properties carry the most weight:
//   * a pass never throws, whatever the store or the network does — the next
//     pass is the recovery, and a thrown pass takes the scheduled function down
//   * a pass is BOUNDED, because every step past `staged` costs money.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  sweep, detect, walk, portsFor, adVideoSweeper,
  SWEEP_CRON, DEFAULT_BATCH, DEFAULT_DETECT_LIMIT
} from "./ad-video-sweeper.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const noDb = { query: async () => ({ rows: [] }) };

/** A store stub with the exact surface this file asks Builder A for. */
function fakeStore({ pending = [], scripts = [], onPatch = () => {}, lastSeen = null, onRecord = () => ({ created: true }) } = {}) {
  return {
    lastRawSeenAt: async () => lastSeen,
    recordRawTake: async (_db, take) => onRecord(take),
    listPending: async () => pending,
    patch: async (_db, id, fields) => onPatch(id, fields),
    candidateScripts: async () => scripts,
    findBySubmagicProjectId: async () => null
  };
}

const naming = {
  rawName: () => "043_t02_raw.mp4",
  finalName: () => "043_t02_final_v1.mp4",
  adFolderName: () => "043",
  briefName: () => "043_brief.txt"
};

describe("a pass that cannot run", () => {
  test("a pass with nothing behind it is reported, not thrown", async () => {
    const res = await sweep(noDb, { env: {} });
    /* WHAT THIS ASSERTED BEFORE THE MERGE, and why it changed. The store was
       Builder A's file and might not exist, so this checked that a MISSING
       MODULE was reported rather than taking the deploy down. It now exists, so
       the pass gets one step further and stops on the database instead.

       The rule under test is the one that has not changed: whatever is missing
       — the module, the database, the folder id — the sweeper SAYS SO and does
       not throw. A registered workflow that throws on import takes every other
       workflow in src/workflows/index.mjs down with it. */
    assert.equal(res.ok, false);
    assert.match(res.error, /store|DATABASE_URL/);
    assert.equal(typeof res.ok, "boolean");
  });

  test("a store that throws is reported, not thrown", async () => {
    const store = fakeStore();
    store.listPending = async () => { throw new Error("connection refused"); };
    const res = await sweep(noDb, { env: {}, store, naming });
    assert.equal(res.ok, false);
    assert.match(res.error, /connection refused/);
  });
});

describe("detect", () => {
  test("with DRIVE_RAW_FOLDER_ID unset nothing is watched and nothing breaks", async () => {
    const res = await detect(noDb, { store: fakeStore(), env: {} });
    assert.equal(res.ok, true);
    assert.equal(res.detected, 0);
    assert.match(res.note, /DRIVE_RAW_FOLDER_ID/);
  });

  test("a store missing the two functions it needs is named, not crashed into", async () => {
    const res = await detect(noDb, { store: {}, env: { DRIVE_RAW_FOLDER_ID: "raw" } });
    assert.equal(res.ok, false);
    assert.match(res.error, /lastRawSeenAt/);
  });
});

describe("walk", () => {
  test("a row moves one step and the patch is written once", async () => {
    const patches = [];
    const store = fakeStore({
      pending: [{ id: "r1", status: "staged", source_url: "https://x.test/a.mp4" }],
      onPatch: (id, fields) => patches.push([id, fields])
    });
    const res = await walk(noDb, {
      store,
      ports: {
        ...portsFor({ env: {}, naming }),
        submagic: { createProject: async () => ({ ok: true, projectId: "p9" }) }
      }
    });
    assert.equal(res.ok, true);
    assert.equal(res.advanced, 1);
    assert.equal(patches.length, 1);
    assert.equal(patches[0][1].status, "editing");
    assert.equal(res.per[0].from, "staged");
    assert.equal(res.per[0].to, "editing");
  });

  test("a row that cannot move writes NOTHING", async () => {
    const patches = [];
    const store = fakeStore({
      pending: [{ id: "r1", status: "raw_landed", drive_raw_file_id: "d1" }],
      onPatch: (id, f) => patches.push([id, f])
    });
    const res = await walk(noDb, { store, ports: portsFor({ env: {}, naming }) });
    assert.equal(patches.length, 0, "a row that waited must not be rewritten with an empty patch");
    assert.match(res.per[0].note, /staging is not built/);
  });

  test("every row in the batch gets a turn, and one stuck row does not block the rest", async () => {
    const store = fakeStore({
      pending: [
        { id: "r1", status: "raw_landed", drive_raw_file_id: "d1" },
        { id: "r2", status: "staged", source_url: "https://x.test/a.mp4" }
      ]
    });
    const res = await walk(noDb, {
      store,
      ports: { ...portsFor({ env: {}, naming }), submagic: { createProject: async () => ({ ok: true, projectId: "p9" }) } }
    });
    assert.equal(res.per.length, 2);
    assert.equal(res.advanced, 1);
  });

  test("a store missing listPending/patch is named", async () => {
    const res = await walk(noDb, { store: {}, ports: {} });
    assert.equal(res.ok, false);
    assert.match(res.error, /listPending/);
  });
});

describe("a whole pass", () => {
  test("an empty folder and an empty queue is a clean, quiet pass", async () => {
    const res = await sweep(noDb, { env: {}, store: fakeStore(), naming });
    assert.equal(res.ok, true);
    assert.equal(res.detected, 0);
    assert.equal(res.advanced, 0);
  });

  test("the batch limit reaches the store", async () => {
    let asked = null;
    const store = fakeStore();
    store.listPending = async (_db, opts) => { asked = opts.limit; return []; };
    await sweep(noDb, { env: {}, store, naming, limit: 3 });
    assert.equal(asked, 3);
  });

  test("the default batch is bounded and small — every step past staged costs money", () => {
    assert.ok(DEFAULT_BATCH > 0 && DEFAULT_BATCH <= 25);
    assert.ok(DEFAULT_DETECT_LIMIT > 0 && DEFAULT_DETECT_LIMIT <= 50);
  });
});

describe("what actually gates this", () => {
  test("it IS registered — a take nobody looks for is a take nobody edits", () => {
    const index = fs.readFileSync(path.join(HERE, "index.mjs"), "utf8");
    assert.ok(/adVideoSweeper/.test(index));
  });

  test("it is defined and it is one reviewable file", () => {
    assert.ok(adVideoSweeper);
  });

  test("it runs often enough that a take is picked up within minutes", () => {
    const [minute] = SWEEP_CRON.split(" ");
    assert.match(minute, /^\*\/(\d+)$/);
    assert.ok(Number(minute.slice(2)) <= 5,
      "the research puts the useful polling window at two to five minutes");
  });

  test("REGISTERING IT SENDS NOTHING — the ports read the fences, not a flag of their own", () => {
    const src = fs.readFileSync(path.join(HERE, "ad-video-sweeper.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const flag of ["force", "skipCompliance", "override", "bypass", "test_bypass"]) {
      assert.ok(!new RegExp(`\\b${flag}\\b`, "i").test(code), `the sweeper must not contain a ${flag} identifier`);
    }
    assert.ok(!/DRY_RUN/.test(code),
      "the sweeper must not read a dry-run flag itself — the chokepoint owns that decision");
  });

  test("it reaches the network only through the fenced providers", () => {
    const src = fs.readFileSync(path.join(HERE, "ad-video-sweeper.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\bfetch\s*\(/.test(code));
    assert.ok(/messaging\/providers\/submagic\.mjs/.test(src));
    assert.ok(/messaging\/providers\/google-drive-write\.mjs/.test(src));
  });
});
