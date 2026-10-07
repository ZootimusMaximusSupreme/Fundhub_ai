// src/yesdoor/providers/outbox-sandbox.mjs — pretend email and text delivery.
// Spec §7. Pure: given queued yd_outbox rows, returns the updates to write. The
// `yd-outbox-dispatch` cron (every 5 minutes) applies them. Nothing is sent.
//
//   dispatch(rows, { now })  ->  { updates, skipped }
//
// An update is { id, status: "sent", provider: "sandbox", provider_ref, sent_at }
// or { id, status: "failed", provider: "sandbox", error } for a row that could
// not be delivered even in a sandbox (no usable address, unknown channel).
// Rows that are not `queued` are skipped, so running the cron twice sends nothing twice.

export const PROVIDER = "sandbox";
export const SANDBOX = true;

const CHANNELS = new Set(["email", "sms"]);

function addressProblem(row) {
  const to = typeof row.to_address === "string" ? row.to_address.trim() : "";
  if (!CHANNELS.has(row.channel)) return `unknown channel "${row.channel}"`;
  if (!to) return "no to_address";
  if (row.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return "to_address is not an email address";
  if (row.channel === "sms" && to.replace(/\D/g, "").length < 10) return "to_address is not a phone number";
  return null;
}

export function dispatch(rows = [], { now = new Date() } = {}) {
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString();
  const updates = [];
  const skipped = [];
  for (const row of rows) {
    if (!row || row.status !== "queued") {
      skipped.push({ id: row?.id ?? null, reason: "not queued" });
      continue;
    }
    const problem = addressProblem(row);
    if (problem) {
      updates.push({ id: row.id, status: "failed", provider: PROVIDER, error: problem });
      continue;
    }
    updates.push({
      id: row.id, status: "sent", provider: PROVIDER,
      provider_ref: `sandbox-${row.id}`, sent_at: stamp
    });
  }
  return { updates, skipped };
}
