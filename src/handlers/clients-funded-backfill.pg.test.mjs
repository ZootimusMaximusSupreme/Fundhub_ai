// Hole N18 — the backfill migration run against real Postgres.
// SKIPS unless DATABASE_URL is set. Every fixture and the migration's own UPDATE
// run inside one transaction that always rolls back, so nothing is left behind.
//
// Five fixture clients, one per case the rule has to get right:
//   walk1     one funded $45,000 round, client says not funded  -> funded, 45000
//   two       two funded rounds, 25,000 + 25,000                 -> funded, 50000
//   unknown   one funded round with no amount + one of 10,000    -> funded, NULL (never a partial sum)
//   started   only a 'started' round                             -> untouched, not funded
//   keeper    already funded, no funded round                    -> untouched, still funded (never un-funds)

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { close, pool } from "../db.mjs";

const HAS_DB = !!process.env.DATABASE_URL;
const SQL = readFileSync(
  new URL("../../db/migrations/386_backfill_clients_funded_from_rounds.sql", import.meta.url),
  "utf8"
);

describe("backfill clients.funded from funded rounds", {
  skip: !HAS_DB ? "no DATABASE_URL" : false
}, () => {
  let client;
  let orgId;
  const ids = {};

  const addClient = async (name, { funded = false, amount = null } = {}) => {
    ids[name] = (await client.query(
      `INSERT INTO clients (org_id, first_name, last_name, funded, funded_amount)
       VALUES ($1, 'n18_backfill', $2, $3, $4) RETURNING id`,
      [orgId, name, funded, amount]
    )).rows[0].id;
  };
  const addRound = (name, n, status, funded) => client.query(
    `INSERT INTO funding_rounds (org_id, client_id, round_number, status, product, funded_amount)
     VALUES ($1, $2, $3, $4, 'card_stacking', $5)`,
    [orgId, ids[name], n, status, funded]
  );
  const row = async (name) => (await client.query(
    `SELECT funded, funded_amount FROM clients WHERE id = $1`, [ids[name]]
  )).rows[0];

  before(async () => {
    client = await pool().connect();
    await client.query("BEGIN");
    orgId = (await client.query(
      `SELECT id FROM orgs WHERE is_default ORDER BY created_at LIMIT 1`
    )).rows[0]?.id;
    assert.ok(orgId, "default org is required");

    await addClient("walk1");
    await addRound("walk1", 1, "funded", 45000);
    await addRound("walk1", 2, "started", null);

    await addClient("two");
    await addRound("two", 1, "funded", 25000);
    await addRound("two", 2, "funded", 25000);

    await addClient("unknown", { funded: true, amount: 99999 });
    await addRound("unknown", 1, "funded", null);
    await addRound("unknown", 2, "funded", 10000);

    await addClient("started");
    await addRound("started", 1, "started", null);

    await addClient("keeper", { funded: true, amount: 12345 });

    await client.query(SQL);
  });

  after(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    await close();
  });

  test("a client with a funded round now reads funded with that round's amount", async () => {
    const r = await row("walk1");
    assert.equal(r.funded, true);
    assert.equal(Number(r.funded_amount), 45000);
  });

  test("the funded total is the sum of the funded rounds", async () => {
    const r = await row("two");
    assert.equal(r.funded, true);
    assert.equal(Number(r.funded_amount), 50000);
  });

  test("a funded round with no amount leaves the total unknown, not a partial sum", async () => {
    const r = await row("unknown");
    assert.equal(r.funded, true);
    assert.equal(r.funded_amount, null);
  });

  test("a client with no funded round is not touched", async () => {
    const r = await row("started");
    assert.equal(r.funded, false);
    assert.equal(r.funded_amount, null);
  });

  test("it never un-funds a client", async () => {
    const r = await row("keeper");
    assert.equal(r.funded, true);
    assert.equal(Number(r.funded_amount), 12345);
  });

  test("running it again changes nothing", async () => {
    const again = await client.query(SQL);
    const mine = Object.values(ids);
    const stillOut = (await client.query(
      `SELECT count(*)::int AS n FROM clients c
         JOIN (SELECT client_id, org_id,
                      CASE WHEN bool_and(funded_amount IS NOT NULL) THEN SUM(funded_amount) END AS total
                 FROM funding_rounds WHERE status = 'funded' GROUP BY client_id, org_id) s
           ON s.client_id = c.id AND s.org_id = c.org_id
        WHERE c.id = ANY($1)
          AND (c.funded IS DISTINCT FROM true OR c.funded_amount IS DISTINCT FROM s.total)`,
      [mine]
    )).rows[0].n;
    assert.equal(again.rowCount, 0, "a second run must match nothing");
    assert.equal(stillOut, 0);
  });
});
