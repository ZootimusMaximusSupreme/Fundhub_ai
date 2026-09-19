// Independent re-review API pass. Password login. No secrets printed. No writes.
const BASE = "https://fundhub.ai";
const IDS = {
  eight: "d682c13b-11f3-4bd5-a0c5-232b6a7875c4",
  nine: "be3dcfd7-faae-4001-b97f-9bc30875bbcd",
  eleven: "029964c5-4d8e-47ed-88c9-53ac13863fd4",
  twelve: "f01cc0e0-c8f6-4343-93e5-6a33f0d3112f",
  thirteen: "7ccbeb76-df98-4125-8c14-0d1c9f5e3042",
  combo: "567c12ce-64de-4043-aa98-d842434bd267",
};

const pw = process.env.STAFF_INITIAL_PASSWORD || "";
if (!pw) throw new Error("STAFF_INITIAL_PASSWORD not set");

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "chris@fundhub.ai", password: pw }),
});
const login = await loginRes.json();
const token = login.token || "";
if (!token) {
  console.log(JSON.stringify({ login: { status: loginRes.status, ok: login.ok, keys: Object.keys(login) } }));
  process.exit(1);
}
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0] || "";

async function get(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, cookie },
  });
  let body = null;
  try { body = await r.json(); } catch { body = { _parse: false }; }
  return { status: r.status, body };
}

function pick(o, keys) {
  const out = {};
  if (!o || typeof o !== "object") return out;
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

function clientOf(res) {
  return res.body?.data?.client || res.body?.client || {};
}

const [
  eightDash, nineDash, elevenDash, twelveDash, thirteenDash, comboDash,
  eightRounds, comboRounds,
  eightInv, comboInv,
  eightDocs, nineDocs, thirteenDocs, comboDocs,
  eightSum, twelveSum, thirteenSum, comboSum,
  eightFin, twelveEnt, twelveProg, thirteenProg,
  fulfill, repairCases, kpis, financeOs, opsPulse, moneyMap,
  eightTx, comboTx,
] = await Promise.all([
  get(`/api/dashboard/client?id=${IDS.eight}`),
  get(`/api/dashboard/client?id=${IDS.nine}`),
  get(`/api/dashboard/client?id=${IDS.eleven}`),
  get(`/api/dashboard/client?id=${IDS.twelve}`),
  get(`/api/dashboard/client?id=${IDS.thirteen}`),
  get(`/api/dashboard/client?id=${IDS.combo}`),
  get(`/api/read/funding-rounds?client_id=${IDS.eight}`),
  get(`/api/read/funding-rounds?client_id=${IDS.combo}`),
  get(`/api/read/invoices?client_id=${IDS.eight}`),
  get(`/api/read/invoices?client_id=${IDS.combo}`),
  get(`/api/read/documents?client_id=${IDS.eight}`),
  get(`/api/read/documents?client_id=${IDS.nine}`),
  get(`/api/read/documents?client_id=${IDS.thirteen}`),
  get(`/api/read/documents?client_id=${IDS.combo}`),
  get(`/api/read/portal-summary?client_id=${IDS.eight}`),
  get(`/api/read/portal-summary?client_id=${IDS.twelve}`),
  get(`/api/read/portal-summary?client_id=${IDS.thirteen}`),
  get(`/api/read/portal-summary?client_id=${IDS.combo}`),
  get(`/api/read/finance-os?client_id=${IDS.eight}`),
  get(`/api/read/entitlements?client_id=${IDS.twelve}`),
  get(`/api/read/client-progress?client_id=${IDS.twelve}`),
  get(`/api/read/client-progress?client_id=${IDS.thirteen}`),
  get(`/api/dashboard/clients?limit=200&fulfillment=1`),
  get(`/api/read/repair-cases`),
  get(`/api/dashboard/kpis?period=7d`),
  get(`/api/read/finance-os`),
  get(`/api/read/ops-pulse?period=7d`),
  get(`/api/read/money-map`),
  get(`/api/read/transactions?client_id=${IDS.eight}`),
  get(`/api/read/transactions?client_id=${IDS.combo}`),
]);

function cf(c) {
  return c.custom_fields && typeof c.custom_fields === "object" ? c.custom_fields : {};
}

function slimClient(res) {
  const c = clientOf(res);
  const f = cf(c);
  return {
    status: res.status,
    name: c.full_name || c.name || null,
    funded: c.funded ?? f.funded ?? null,
    funded_amount: c.funded_amount ?? f.funded_amount ?? null,
    employee_next_action: c.employee_next_action ?? f.employee_next_action ?? null,
    identity_verified: c.identity_verified ?? f.identity_verified ?? null,
    address: c.address || c.street_address || c.street || f.address || null,
    city: c.city || null,
    zip: c.zip || c.postal_code || null,
    keys: Object.keys(c).slice(0, 40),
    cfKeys: Object.keys(f).slice(0, 40),
  };
}

function listOf(res, ...names) {
  const d = res.body?.data || res.body || {};
  for (const n of names) if (Array.isArray(d[n])) return d[n];
  if (Array.isArray(d)) return d;
  return [];
}

function findRow(res, id) {
  const rows = listOf(res, "clients", "rows", "items");
  return rows.find((x) => x.id === id) || null;
}

const eightRow = findRow(fulfill, IDS.eight);
const comboRow = findRow(fulfill, IDS.combo);
const nineRow = findRow(fulfill, IDS.nine);

const out = {
  login: { status: loginRes.status, ok: login.ok, role: login.staff?.role || null, name: login.staff?.name || null },
  h7: {
    client: slimClient(nineDash),
    tasks: listOf(nineDash, "tasks").slice(0, 15).map((t) => pick(t, ["title", "name", "kind", "status", "blocker"])),
    row: eightRow ? null : null,
    nineRow: nineRow ? pick(nineRow, ["name", "full_name", "employee_next_action", "next_action", "fulfillment_chip", "identity_verified"]) : null,
  },
  h8: {
    client: slimClient(eightDash),
    rounds: { status: eightRounds.status, items: listOf(eightRounds, "rounds", "funding_rounds").map((r) => pick(r, ["status", "funded_cents", "approved_cents", "amount_cents", "kind", "product", "lender"])) },
    row: eightRow ? pick(eightRow, ["name", "full_name", "funded", "funded_amount", "employee_next_action", "next_action", "fulfillment_chip", "total_approved", "approved_amount"]) : { missing: true, fulfillStatus: fulfill.status },
    kpis: { status: kpis.status, keys: Object.keys(kpis.body?.data || kpis.body || {}).slice(0, 30) },
  },
  h9: {
    invoices: { status: eightInv.status, items: listOf(eightInv, "invoices").map((i) => pick(i, ["number", "invoice_number", "status", "amount_cents", "amount", "paid_cents", "balance_cents", "title"])) },
    summaryStatus: eightSum.status,
    summaryKeys: Object.keys(eightSum.body?.data || eightSum.body || {}).slice(0, 40),
    summaryMoney: pick(eightSum.body?.data || eightSum.body || {}, ["invoices", "payments", "bills", "due", "due_now", "ar"]),
    financeStatus: eightFin.status,
    financeKeys: Object.keys(eightFin.body?.data || eightFin.body || {}).slice(0, 30),
  },
  h11: {
    client: slimClient(twelveDash),
    ents: { status: twelveEnt.status, items: listOf(twelveEnt, "entitlements").map((e) => pick(e, ["title", "name", "status", "kind", "product_title", "offer"])) },
    summaryKeys: Object.keys(twelveSum.body?.data || twelveSum.body || {}).slice(0, 40),
    own: (twelveSum.body?.data || twelveSum.body || {}).what_you_own
      || (twelveSum.body?.data || twelveSum.body || {}).owned
      || (twelveSum.body?.data || twelveSum.body || {}).downloads
      || null,
  },
  h12: {
    stored: slimClient(eightDash).employee_next_action,
    row: eightRow ? pick(eightRow, ["employee_next_action", "next_action", "fulfillment_chip"]) : null,
  },
  h13: {
    eleven: slimClient(elevenDash),
    summaryName: (elevenDash.body?.data || elevenDash.body || {}).client?.full_name
      || clientOf(elevenDash).full_name
      || clientOf(elevenDash).name
      || null,
  },
  h14: {
    status: repairCases.status,
    keys: Object.keys(repairCases.body?.data || repairCases.body || {}).slice(0, 30),
    counts: (repairCases.body?.data || repairCases.body || {}).counts || (repairCases.body?.data || repairCases.body || {}).stats || null,
    cases: listOf(repairCases, "cases", "repair_cases").slice(0, 10).map((r) => pick(r, ["client_name", "name", "stage", "stuck", "status", "waiting_on_bureau", "need_me"])),
  },
  h16: {
    identity: slimClient(nineDash).identity_verified,
    docs: { status: nineDocs.status, count: listOf(nineDocs, "documents").length, items: listOf(nineDocs, "documents").slice(0, 15).map((d) => pick(d, ["title", "kind", "subtype", "status", "read_status", "ocr_status", "error", "vendor_status"])) },
  },
  h17: {
    docs: { status: thirteenDocs.status, count: listOf(thirteenDocs, "documents").length, items: listOf(thirteenDocs, "documents").slice(0, 10).map((d) => pick(d, ["title", "kind", "subtype", "status", "bytes", "byte_size"])) },
    summaryKeys: Object.keys(thirteenSum.body?.data || thirteenSum.body || {}).slice(0, 30),
  },
  h18: {
    client: slimClient(comboDash),
    rounds: { status: comboRounds.status, items: listOf(comboRounds, "rounds", "funding_rounds").map((r) => pick(r, ["status", "funded_cents", "approved_cents", "amount_cents", "kind"])) },
    invoices: listOf(comboInv, "invoices").map((i) => pick(i, ["number", "status", "amount_cents", "paid_cents"])),
    tx: { status: comboTx.status, items: listOf(comboTx, "transactions").slice(0, 10).map((t) => pick(t, ["status", "amount_cents", "kind", "source", "provider_status", "title"])) },
  },
  h19: {
    status: twelveProg.status,
    keys: Object.keys(twelveProg.body?.data || twelveProg.body || {}).slice(0, 30),
    waypoints: (twelveProg.body?.data || twelveProg.body || {}).waypoints || null,
    nextStep: (twelveProg.body?.data || twelveProg.body || {}).nextStep || null,
    message: (twelveProg.body?.data || twelveProg.body || {}).message || (twelveProg.body?.data || twelveProg.body || {}).empty_reason || null,
  },
  h22: {
    client: slimClient(comboDash),
    docs: { status: comboDocs.status, count: listOf(comboDocs, "documents").length, items: listOf(comboDocs, "documents").slice(0, 10).map((d) => pick(d, ["title", "kind", "subtype"])) },
    row: comboRow ? pick(comboRow, ["name", "full_name", "address", "city"]) : null,
  },
  h23: {
    client: slimClient(thirteenDash),
    crs: listOf(thirteenDash, "crs_results").slice(0, 6).map((r) => pick(r, ["bureau", "score", "simulated", "is_simulated", "source"])),
  },
};

console.log(JSON.stringify(out, null, 2));
