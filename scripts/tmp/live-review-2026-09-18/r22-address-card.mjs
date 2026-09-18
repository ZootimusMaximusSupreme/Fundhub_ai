// Hole 22 reviewer — one marked picture of WHERE Combo's address lives on live rows (read only).
// Street and ZIP are masked (digits -> #, letters after the first -> *). No screen in the app shows this data,
// so the evidence is the live rows themselves, drawn as a table.
import pg from "pg";
import { chromium } from "playwright";
const COMBO = "567c12ce-64de-4043-aa98-d842434bd267";
const OUT = "/Users/chrisstanbridge/Developer/fundhub-platform/docs/workflows/live-prove-2026-09-17-evidence/hole-22/review/address-where-it-lives.png";
const mask = (s) => (typeof s === "string" && s ? s.replace(/\d/g, "#").replace(/([A-Za-z])([A-Za-z]+)/g, (m, a, b) => a + "*".repeat(b.length)) : "—");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("BEGIN READ ONLY");
const rows = [];
let at;
try {
  at = (await c.query("select now() t")).rows[0].t.toISOString();
  const pii = (await c.query(`select count(*)::int n from pii_identity where client_id=$1`, [COMBO])).rows[0].n;
  rows.push({ hit: false, src: "Identity record (pii_identity)", where: `${pii} rows for Combo`, line1: "—", city: "—", st: "—", zip: "—" });
  const cl = (await c.query(`select to_jsonb(c) j from clients c where id=$1`, [COMBO])).rows[0].j;
  rows.push({ hit: false, src: "Client row (clients)", where: `no address columns; custom_fields keys: ${Object.keys(cl.custom_fields || {}).filter((k) => /addr|street|city|zip|postal/i.test(k)).join(",") || "none about address"}`, line1: "—", city: "—", st: "—", zip: "—" });
  const cf = (await c.query(`select business_street_address a, business_city b, business_postal_code z from client_custom_fields where client_id=$1`, [COMBO])).rows[0] || {};
  rows.push({ hit: false, src: "Custom fields (business address)", where: "client_custom_fields", line1: mask(cf.a), city: cf.b || "—", st: "—", zip: mask(cf.z) });
  for (const b of (await c.query(`select name, entity_data->>'city' city, entity_data->>'state' st from businesses where client_id=$1 order by name`, [COMBO])).rows)
    rows.push({ hit: false, src: `Business: ${b.name}`, where: "businesses.entity_data (city + state only, no street)", line1: "—", city: b.city || "—", st: b.st || "—", zip: "—" });
  const sv = (await c.query(`select payload->'answers' a from events where client_id=$1 and name='survey.submitted'`, [COMBO])).rows[0];
  rows.push({ hit: false, src: "Homepage survey answers", where: `${Object.keys(sv?.a || {}).length} answers, none about an address`, line1: "—", city: "—", st: "—", zip: "—" });
  const r = (await c.query(`select result, created_at from crs_results where client_id=$1`, [COMBO])).rows[0];
  for (const [bu, v] of Object.entries(r.result.bureaus)) {
    const rq = v.requestData?.addresses?.[0] || {};
    const fl = v.creditFiles?.[0]?.addresses?.[0] || {};
    rows.push({ hit: true, src: `Credit pull ${bu} — address SENT with the pull (${[v.requestData?.firstName, v.requestData?.lastName].filter(Boolean).join(" ")})`, where: "crs_results.result.bureaus." + bu + ".requestData.addresses[0]", line1: mask(rq.addressLine1), city: rq.city, st: rq.state, zip: mask(rq.postalCode) });
    rows.push({ hit: true, src: `Credit pull ${bu} — address the bureau file RETURNED`, where: "crs_results.result.bureaus." + bu + ".creditFiles[0].addresses[0]", line1: mask(fl.addressLine1), city: fl.city, st: fl.state, zip: mask(fl.postalCode) });
  }
  rows.push({ hit: false, src: `(pull environment: ${r.result.environment}; pulled ${new Date(r.created_at).toISOString().slice(0, 16)}Z)`, where: "", line1: "", city: "", st: "", zip: "" });
} finally { await c.query("ROLLBACK"); await c.end(); }

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
const html = `<!doctype html><html><body style="font:14px -apple-system,Helvetica,sans-serif;margin:24px;background:#fff;color:#111">
<h2 style="margin:0 0 4px">Hole 22 review — where does Sim Combo-20260918 have an address? (live rows, read only, ${at})</h2>
<div style="color:#555;margin-bottom:14px">Client 567c12ce-64de-4043-aa98-d842434bd267. Street and ZIP masked. No app screen shows the credit-pull address.</div>
<table id="t" style="border-collapse:collapse;width:100%">
<tr style="background:#f2f2f2"><th align=left style="padding:6px">Source</th><th align=left>Where</th><th align=left>Street</th><th align=left>City</th><th align=left>State</th><th align=left>ZIP</th></tr>
${rows.map((x) => `<tr class="${x.hit ? "hit" : ""}" style="border-top:1px solid #ddd"><td style="padding:6px">${esc(x.src)}</td><td style="font:12px Menlo,monospace">${esc(x.where)}</td><td style="font:12px Menlo,monospace">${esc(x.line1)}</td><td>${esc(x.city)}</td><td>${esc(x.st)}</td><td style="font:12px Menlo,monospace">${esc(x.zip)}</td></tr>`).join("")}
</table>
<div id="lg" style="margin-top:18px;border:3px solid #e00;padding:8px 10px;display:inline-block">
1 — Identity record, client row, custom fields, businesses, survey: no home street address anywhere<br>
2 — Combo's credit pull on record: one full home address (street, city, state, ZIP), sent with the pull and returned by all three bureau files
</div></body></html>`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.route("**/*", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
await page.setContent(html);
await page.evaluate(() => {
  const t = document.getElementById("t");
  const trs = [...t.querySelectorAll("tr")].slice(1);
  const box = (list, n) => {
    const a = list[0].getBoundingClientRect(), b = list[list.length - 1].getBoundingClientRect();
    const d = document.createElement("div");
    Object.assign(d.style, { position: "absolute", left: `${a.left - 4}px`, top: `${a.top + scrollY - 3}px`, width: `${a.width + 8}px`, height: `${b.bottom - a.top + 6}px`, border: "3px solid #e00", pointerEvents: "none" });
    const tag = document.createElement("div"); tag.textContent = String(n);
    Object.assign(tag.style, { position: "absolute", left: `${a.left - 34}px`, top: `${a.top + scrollY - 3}px`, background: "#e00", color: "#fff", font: "bold 14px sans-serif", padding: "2px 7px" });
    document.body.append(d, tag);
  };
  document.body.style.paddingLeft = "30px";
  const miss = trs.filter((r) => !r.classList.contains("hit") && r.textContent.trim() && !/pull environment/.test(r.textContent));
  const hit = trs.filter((r) => r.classList.contains("hit"));
  box(miss, 1); box(hit, 2);
});
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log("saved", OUT, "rows", rows.length);
