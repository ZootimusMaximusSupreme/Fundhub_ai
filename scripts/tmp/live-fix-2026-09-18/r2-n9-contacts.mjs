// N9 — are the Sim files a reviewer might press the deck button on pointed at
// test inboxes? READ ONLY. Prints the email domain and whether the local part is
// plus-addressed — never the full address, never a phone number.
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n9-contacts.mjs
import { pool, close } from "../../../src/db.mjs";

const IDS = {
  "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f": "Twelve-Academy #12",
  "7ccbeb76-df98-4125-8c14-0d1c9f5e3042": "Thirteen-NoBook #13",
};
const c = await pool().connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(
    `SELECT id, email, COALESCE(is_demo, false) AS is_demo, tags FROM clients WHERE id = ANY($1::uuid[])`,
    [Object.keys(IDS)]);
  for (const row of r.rows) {
    const [local, domain] = String(row.email || "").split("@");
    console.log(IDS[row.id], {
      email_domain: domain || null,
      plus_addressed: /\+/.test(local || ""),
      is_demo: row.is_demo,
      sim_tag: (row.tags || []).filter((t) => /sim|test|walk/i.test(t)),
    });
  }
  await c.query("COMMIT");
} finally {
  c.release();
  await close();
}
