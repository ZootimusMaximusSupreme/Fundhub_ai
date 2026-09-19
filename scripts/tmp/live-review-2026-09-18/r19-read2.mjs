// Hole 19 reviewer — #12 tasks and funding round, read only.
import pg from "pg";
const TWELVE = "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const t = (await c.query(`SELECT * FROM tasks WHERE client_id=$1 ORDER BY created_at`, [TWELVE])).rows;
  console.log("task columns:", Object.keys(t[0] || {}).join(","));
  for (const r of t) console.log("task", JSON.stringify({ title: r.title, type: r.type ?? r.kind ?? r.task_type, status: r.status, assignee: r.assignee, assignee_role: r.assignee_role, staff: r.assignee_staff_id ? "set" : null, done: r.done, wf: r.source_workflow, created_at: r.created_at, source: r.source ?? r.origin }));
  const f = (await c.query(`SELECT * FROM funding_rounds WHERE client_id=$1`, [TWELVE])).rows;
  for (const r of f) console.log("round", JSON.stringify({ status: r.status ?? r.state, stage: r.stage, created_at: r.created_at }));
  await c.query("ROLLBACK");
} finally { await c.end(); }
