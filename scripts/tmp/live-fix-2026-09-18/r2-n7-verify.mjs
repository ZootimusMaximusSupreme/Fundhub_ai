// N7 — LOOK ONLY. Signs in as the owner (one POST, the login), then GETs the
// live APIs the screens use for Sim Eight-Funding: the invoice list (the AR /
// Payments views) and the client dashboard (rounds, the Total Approved tile).
// Never prints a password, token or cookie.
//
// Run: node --env-file=<repo>/.env scripts/tmp/live-fix-2026-09-18/r2-n7-verify.mjs [tag]
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://fundhub.ai";
const EIGHT = "d682c13b-11f3-4bd5-a0c5-232b6a7875c4";
const TAG = process.argv[2] || "verify";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/N7";
mkdirSync(OUT, { recursive: true });

const password = process.env.STAFF_INITIAL_PASSWORD || "";
if (!password) throw new Error("STAFF_INITIAL_PASSWORD not set");
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "fundhub-n7-fixer" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password })
});
const m = (login.headers.get("set-cookie") || "").match(/(?:^|,\s*)fundhub_session=([^;]+)/);
if (!m) { console.log("login failed", login.status); process.exit(1); }
const cookie = `fundhub_session=${m[1]}`;
const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie, "user-agent": "fundhub-n7-fixer" } });
  let j = null; try { j = await r.json(); } catch { j = null; }
  return { status: r.status, json: j };
};

const out = { at: new Date().toISOString(), tag: TAG, login: login.status };
const inv = await get(`/api/read/invoices?client_id=${EIGHT}`);
const items = inv.json?.data?.items || inv.json?.items || inv.json?.data || [];
out.invoices = {
  status: inv.status,
  items: Array.isArray(items) ? items.map((i) => ({
    id: String(i.id || "").slice(0, 8), source: i.source, status: i.status,
    amount_due: i.amount_due, balance_due: i.balance_due, paid: i.paid ?? i.amount_paid,
    notes: i.notes, funding_round_id: i.funding_round_id
  })) : items
};
const d = await get(`/api/dashboard/client?id=${EIGHT}`);
const dd = d.json?.data || d.json || {};
out.dashboard = {
  status: d.status,
  rounds: (dd.rounds || dd.funding_rounds || []).map((r) => ({
    round_number: r.round_number, status: r.status, approved_amount: r.approved_amount, funded_amount: r.funded_amount
  })),
  keys: Object.keys(dd).slice(0, 60)
};
const apps = await get(`/api/applications?client_id=${EIGHT}`);
out.applications = {
  status: apps.status,
  rows: (apps.json?.applications || []).map((a) => ({
    lender: a.lender_name || a.bank, status: a.status, approved_amount: a.approved_amount,
    excluded: !!a.approval_excluded_at, round: String(a.funding_round_id || "").slice(0, 8)
  }))
};
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
