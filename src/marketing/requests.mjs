// Idempotent POSTs for marketing/* routes (table marketing_requests, migration 407).
// A repeated request_id returns the saved response instead of running the save
// again, so a phone that retries a flaky connection never double-writes.
//
// Only a successful (2xx) answer is saved. A refusal is cheap to repeat and a
// saved refusal would keep refusing after the caller fixed the request.

export function requestIdFrom(req) {
  const fromBody = req?.body && typeof req.body === "object" ? req.body.request_id : undefined;
  const fromHeader = req?.headers?.["x-request-id"];
  const raw = fromBody ?? fromHeader;
  if (raw === undefined || raw === null || raw === "") return null;
  const id = String(raw).trim();
  return id.length > 0 && id.length <= 120 ? id : "invalid";
}

/**
 * Run `run()` once per (org, request_id). `run` returns { status, body }.
 * Returns { status, body, replayed }.
 */
export async function withRequestId(db, { orgId, requestId, route }, run) {
  if (!requestId) return { ...(await run()), replayed: false };
  if (requestId === "invalid") {
    return { status: 400, body: { ok: false, error: "request_id_invalid", message: "request_id must be 1 to 120 characters." }, replayed: false };
  }
  const seen = await db.query(
    `SELECT org_id, route, response FROM marketing_requests WHERE request_id = $1`,
    [requestId]
  );
  const row = seen.rows[0];
  if (row) {
    // A request_id belongs to the org and route that first used it.
    if (row.org_id !== orgId || row.route !== route) {
      return { status: 409, body: { ok: false, error: "request_id_reused", message: "That request_id was already used for a different request." }, replayed: false };
    }
    return { status: row.response.status, body: row.response.body, replayed: true };
  }
  const out = await run();
  if (out.status >= 200 && out.status < 300) {
    await db.query(
      `INSERT INTO marketing_requests (request_id, org_id, route, response)
       VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (request_id) DO NOTHING`,
      [requestId, orgId, route, JSON.stringify({ status: out.status, body: out.body })]
    );
  }
  return { ...out, replayed: false };
}
