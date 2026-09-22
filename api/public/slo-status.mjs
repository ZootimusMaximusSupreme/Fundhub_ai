// GET/OPTIONS /api/public/slo-status?ref=&client_id= — where the buyer's soft
// pull stands, for the /roadmap widget.
//
// NO AUTH. Same stranger class and the same credential as
// api/public/slo-pull.mjs: the pair ref + client_id of one order row
// (payment_links, findSloOrder). A naked client_id, or a ref that belongs to
// somebody else, answers 404 — the same answer as a made-up pair, so it cannot
// be used to learn who exists. The org is taken from the matched client row,
// never from the request.
//
// ONLY THIS ORDER'S PULLS (2026-09-22 review). The answer is built from the
// pulls this order started and nothing else on the client (src/slo/status.mjs),
// so an order placed with somebody else's email never shows their results.
//
// Read only. Never writes, never emits, never charges. The body never carries
// the tier name, the email, a score or any bureau data: only the fields built
// by src/slo/status.mjs (state, bucket, pa, per-bureau status words, the
// booking link, and — on the repair path only, after the pull — the repair
// offer's two catalogue plans).
//
// Cross-site: the widget on https://apply.fundhub.ai polls this, so OPTIONS is
// answered and Access-Control-Allow-Origin is echoed for allow-listed origins
// only (src/slo/cors.mjs). Never "*".
//
// GET with no query answers 400, which the daily pulse counts as up.

import { db } from "../../src/db.mjs";
import { safeError } from "../../src/http/health.mjs";
import { asUuid } from "../../src/slo/connections.mjs";
import { findSloOrder } from "../../src/slo/pull.mjs";
import { loadSloStatus } from "../../src/slo/status.mjs";
import { answerPreflight, applySloCors } from "../../src/slo/cors.mjs";

const METHODS = "GET, OPTIONS";

export default async function handler(req, res, deps = {}) {
  applySloCors(req, res, METHODS);
  res.setHeader("Cache-Control", "no-store");
  if (answerPreflight(req, res, METHODS)) return;
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET") {
    res.setHeader("allow", METHODS);
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const q = req.query || {};
  const ref = String(q.ref == null ? "" : q.ref).trim().slice(0, 120);
  if (!ref) return res.status(400).json({ ok: false, error: "ref_required" });
  const clientId = asUuid(q.client_id ?? q.clientId);
  if (!clientId) return res.status(400).json({ ok: false, error: "client_required" });

  const dbh = deps.db || db;
  try {
    const found = await (deps.findOrder || findSloOrder)(dbh, { clientId, ref });
    if (!found) return res.status(404).json({ ok: false, error: "not_found" });
    const status = await (deps.loadStatus || loadSloStatus)(dbh, found);
    return res.status(200).json(status);
  } catch (err) {
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
