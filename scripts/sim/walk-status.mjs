#!/usr/bin/env node
// scripts/sim/walk-status.mjs — what state are the walk clients actually in.
//
//   node scripts/sim/walk-status.mjs
//
// READ ONLY. Every statement here is a SELECT. It writes nothing, to any table,
// ever — the walk boards have been quoted from memory for four days and the
// point of this file is to replace "the board said" with "the database says".
//
// It answers the four questions docs/workflows/2026-09-08-walk-readiness.md
// left open, and it answers them in one pass so the answers cannot disagree
// with each other:
//
//   1. Which walk clients exist, and are they flagged synthetic/demo? Those two
//      flags are the only thing stopping a real text or a real bureau call going
//      out about an invented person (fulfillment-walk-2026-09-05.md §0.2).
//   2. Did each one enrol? The 2026-09-06 board recorded Walk2 never enrolling
//      and Walk3 enrolling through the desk button, which caps it at two rounds.
//   3. Does each have a checklist, and does it carry duplicate tasks? Walk1 had
//      eleven tasks with two exact duplicates.
//   4. Is the DOC-CHECK agent live? Without it the funding document hold never
//      clears and there is no manual override anywhere.

import { loadEnv } from "../load-env.mjs";
loadEnv();
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const q = async (label, sql, params = []) => {
  try {
    const r = await c.query(sql, params);
    console.log(`\n=== ${label} ===`);
    if (!r.rows.length) console.log("(no rows)");
    else console.table(r.rows);
    return r.rows;
  } catch (e) {
    console.log(`\n=== ${label} ===\n  ERROR: ${e.message}`);
    return [];
  }
};

await c.connect();

const walk = await q("walk / sim clients", `
  SELECT id, first_name, last_name, email, outcome_tier,
         custom_fields->>'synthetic' AS synthetic,
         is_demo,
         created_at::date AS created
    FROM clients
   WHERE first_name ILIKE 'walk%'
      OR first_name ILIKE 'sim%'
      OR email ILIKE '%+sim-%'
      OR email ILIKE '%walk%'
   ORDER BY created_at DESC
   LIMIT 25`);

const ids = walk.map((w) => w.id);

if (ids.length) {
  await q("repair enrolment", `
    SELECT c.first_name, rp.status, rp.rounds_total, rp.rounds_used, rp.created_at::date AS started
      FROM repair_programs rp
      JOIN clients c ON c.id = rp.client_id
     WHERE rp.client_id = ANY($1)
     ORDER BY rp.created_at DESC`, [ids]);

  await q("checklist rows, and duplicates", `
    SELECT c.first_name,
           COUNT(*)::int AS tasks,
           COUNT(*) FILTER (WHERE w.status = 'done')::int AS done,
           (COUNT(*) - COUNT(DISTINCT w.title))::int AS duplicate_titles
      FROM client_waypoints w
      JOIN clients c ON c.id = w.client_id
     WHERE w.client_id = ANY($1)
     GROUP BY c.first_name
     ORDER BY c.first_name`, [ids]);

  await q("money posted", `
    SELECT c.first_name, p.amount_cents, p.status, p.created_at::date AS paid
      FROM payments p
      JOIN clients c ON c.id = p.client_id
     WHERE p.client_id = ANY($1)
     ORDER BY p.created_at DESC
     LIMIT 20`, [ids]);

  await q("soft pull requests", `
    SELECT c.first_name, s.requested_by_kind, s.status, s.requested_at::date AS asked
      FROM soft_pull_requests s
      JOIN clients c ON c.id = s.client_id
     WHERE s.client_id = ANY($1)
     ORDER BY s.requested_at DESC
     LIMIT 20`, [ids]);
}

await q("the DOC-CHECK agent — live, or not running at all", `
  SELECT code, name, status, runtime
    FROM agents
   WHERE code ILIKE '%doc%' OR name ILIKE '%doc%'
   ORDER BY code`);

await q("every agent's status", `
  SELECT status, COUNT(*)::int AS agents
    FROM agents
   GROUP BY status
   ORDER BY status`);

await q("finance-os subscriptions (the new paid add-on)", `
  SELECT COUNT(*)::int AS rows
    FROM subscriptions
   WHERE tier = 'finance-os'`);

await c.end();
