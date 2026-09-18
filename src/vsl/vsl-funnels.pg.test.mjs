// vsl-funnels.pg.test.mjs — which funnel a video viewing belongs to (385).
//
// The owner question this answers, 2026-09-17: "how do we account for multiple
// funnels?" Every viewing already carried its page address (379). 385 adds a short
// list that names a funnel by that address, and a view that shows every viewing
// with its funnel. These tests prove the view tells two funnels apart, never hides
// an unlisted page, never counts one viewing twice, and names viewings recorded
// before their funnel was listed — which is why no second paste is needed.
//
// Viewings are written through the real beacon handler, the one a stranger's
// browser hits, so a test row takes exactly the path a real one does. Reads run
// asStaff(): vsl_watch_sessions carries FORCEd row-level security, and a bare query
// is anonymous to it — it matches zero rows rather than erroring, which would make
// every assertion below pass while proving nothing.
//
// Test pages live on the reserved .invalid domain, so no row written here can ever
// collide with, or be mistaken for, a real funnel.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { close } from "../db.mjs";
import { asStaff } from "../partners/rls.mjs";
import handler from "../../api/public/vsl-watch.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;
const MARK = "vslfunneltest";
const HOST = `https://${MARK}.invalid`;
const VIDEO = "funnel/vsl.mp4";

const res = () => {
  const r = { code: null, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  return r;
};

describe("v_vsl_watch_by_funnel (385)", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let seq = 0;
  const id = (kind) => `${MARK}-${kind}-${String(++seq).padStart(6, "0")}-xxxx`;

  /* One viewing, through the real beacon handler. Returns its visitor id. */
  const view = async (page) => {
    const vid = id("v");
    const body = { v: VIDEO, vid, sid: id("s"), dur: 207.215, pos: 30, page };
    const r = res();
    await handler(
      { method: "POST", headers: {}, query: {}, body, rawBody: JSON.stringify(body) },
      r
    );
    assert.equal(r.code, 200, `the beacon refused a test viewing: ${JSON.stringify(r.body)}`);
    return vid;
  };

  const orgOf = async (vid) => (await asStaff((tx) => tx.query(
    `SELECT org_id FROM vsl_watch_sessions WHERE visitor_id = $1`, [vid]
  ))).rows[0].org_id;

  const list = (orgId, key, name, page) => asStaff((tx) => tx.query(
    `INSERT INTO vsl_funnels (org_id, funnel_key, name, page_url) VALUES ($1, $2, $3, $4)`,
    [orgId, key, name, page]
  ));

  const rowsFor = async (vid) => (await asStaff((tx) => tx.query(
    `SELECT funnel_key, funnel_name, page_url FROM v_vsl_watch_by_funnel WHERE visitor_id = $1`,
    [vid]
  ))).rows;

  async function purge() {
    if (!HAVE_DB) return;
    await asStaff(async (tx) => {
      await tx.query(`DELETE FROM vsl_funnels WHERE page_url LIKE $1`, [`${HOST}%`]);
      // Positions go with their session by ON DELETE CASCADE (379, Part 4).
      await tx.query(`DELETE FROM vsl_watch_sessions WHERE visitor_id LIKE $1`, [`${MARK}%`]);
    });
  }

  before(async () => { await purge(); });
  after(async () => { await purge(); await close(); });

  test("two funnels on two pages: each viewing lands under its own funnel", async () => {
    const a = await view(`${HOST}/funnel-a/watch`);
    const b = await view(`${HOST}/funnel-b/watch`);
    const org = await orgOf(a);
    await list(org, `${MARK}-a`, "Funnel A", `${HOST}/funnel-a/watch`);
    await list(org, `${MARK}-b`, "Funnel B", `${HOST}/funnel-b/watch`);

    assert.deepEqual(
      (await rowsFor(a)).map((r) => [r.funnel_key, r.funnel_name]),
      [[`${MARK}-a`, "Funnel A"]]
    );
    assert.deepEqual(
      (await rowsFor(b)).map((r) => [r.funnel_key, r.funnel_name]),
      [[`${MARK}-b`, "Funnel B"]]
    );
  });

  test("a funnel listed AFTER the viewing still names it — no second paste needed", async () => {
    const page = `${HOST}/late/watch`;
    const vid = await view(page);

    const before = await rowsFor(vid);
    assert.equal(before.length, 1);
    assert.equal(before[0].funnel_key, null, "not listed yet, so no funnel");

    await list(await orgOf(vid), `${MARK}-late`, "Listed late", page);

    const after = await rowsFor(vid);
    assert.equal(after[0].funnel_key, `${MARK}-late`);
    assert.equal(after[0].funnel_name, "Listed late");
  });

  test("an unlisted page is not hidden: no funnel key, and its address as the name", async () => {
    const page = `${HOST}/nobody-listed-this/watch`;
    const vid = await view(page);
    const rows = await rowsFor(vid);
    assert.equal(rows.length, 1, "an unlisted viewing must still be counted, once");
    assert.equal(rows[0].funnel_key, null);
    assert.equal(rows[0].funnel_name, page);
  });

  test("a capital letter or a trailing slash does not stop the match", async () => {
    const vid = await view(`${HOST}/Mixed-Case/watch`);
    await list(await orgOf(vid), `${MARK}-case`, "Case funnel", `${HOST}/mixed-case/watch/`);
    const rows = await rowsFor(vid);
    assert.equal(rows[0].funnel_key, `${MARK}-case`);
  });

  test("one page cannot be listed twice, so one viewing can never count twice", async () => {
    const page = `${HOST}/once/watch`;
    const vid = await view(page);
    const org = await orgOf(vid);
    await list(org, `${MARK}-once`, "First listing", page);

    // The same page again, dressed differently. Refused by the unique index —
    // which is exactly what guarantees the view's join matches at most one row.
    await assert.rejects(
      () => list(org, `${MARK}-twice`, "Second listing", `${HOST}/ONCE/watch/`),
      /duplicate key|unique/i
    );
    assert.equal((await rowsFor(vid)).length, 1, "one viewing, one row");
  });

  test("one funnel may own several pages", async () => {
    const one = await view(`${HOST}/multi/page-1`);
    const two = await view(`${HOST}/multi/page-2`);
    const org = await orgOf(one);
    await list(org, `${MARK}-multi`, "Multi-page funnel", `${HOST}/multi/page-1`);
    await list(org, `${MARK}-multi`, "Multi-page funnel", `${HOST}/multi/page-2`);
    assert.equal((await rowsFor(one))[0].funnel_key, `${MARK}-multi`);
    assert.equal((await rowsFor(two))[0].funnel_key, `${MARK}-multi`);
  });

  test("a listed address with ? or # is refused — it could never match a viewing", async () => {
    const vid = await view(`${HOST}/refuse/watch`);
    const org = await orgOf(vid);
    await assert.rejects(
      () => list(org, `${MARK}-q`, "Has a query", `${HOST}/refuse/watch?utm_source=fb`),
      /vsl_funnels_page_ck|check constraint/i
    );
    await assert.rejects(
      () => list(org, `${MARK}-h`, "Has a hash", `${HOST}/refuse/watch#t=30`),
      /vsl_funnels_page_ck|check constraint/i
    );
  });
});
