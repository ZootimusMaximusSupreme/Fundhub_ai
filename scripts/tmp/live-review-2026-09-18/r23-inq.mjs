// Hole 23 reviewer — do #13's inquiry list and card use on the panel come from the sample report? READ ONLY.
import pg from "pg";
const ID = "7ccbeb76-df98-4125-8c14-0d1c9f5e3042";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  const r = (await c.query(`SELECT jsonb_path_query_array(result->'inquiries', '$[*]') inq, result->'utilization' util FROM crs_results WHERE client_id=$1`, [ID])).rows[0];
  const inq = (r.inq || []).map((i) => [i.creditor || i.subscriberName || i.name || i.lender || JSON.stringify(i).slice(0, 60), i.bureau || i.source || ""].join(" "));
  console.log(JSON.stringify({ reportInquiries: inq, utilization: r.util }, null, 2));
  await c.query("ROLLBACK");
} finally { await c.end(); }
