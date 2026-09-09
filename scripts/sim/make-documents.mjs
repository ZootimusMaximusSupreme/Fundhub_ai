#!/usr/bin/env node
// scripts/sim/make-documents.mjs — build the fake documents a walk client uploads.
//
//   node scripts/sim/make-documents.mjs            # writes docs/workflows/sim-documents/
//   node scripts/sim/make-documents.mjs --list     # names and expectations, writes nothing
//
// WHY THESE EXIST. The DOC-CHECK agent decides accept / request_more / hold on a
// real image, and until now there was nothing to point at it. A walk that only
// ever uploads a clean ID proves the happy path and nothing else — the whole
// value of the agent is what it does with a photo you cannot read and a
// statement from last winter.
//
// NOBODY REAL IS ON THESE. The identity is the simulated one from
// credentials/sim-identity/owner-identity.local.json (owner-set 2026-09-09: fake
// identity, fake credit file, no bureau is ever called). The SSN area number 000
// has never been issued by the Social Security Administration.
//
// HOW THE BAD ONES ARE MADE. Blur is a CSS filter on the rendered page, not a
// note in a filename — the pixels really are unreadable, which is the only
// version of "blurry" an image model can fail on. Out-of-date documents carry
// real dates in the past. The wrong-person ID carries a different name against
// the same address, which is the shape of the defect the walk board recorded on
// 2026-09-06: a wrong-person document counting toward a complete packet.
//
// Dates are computed from --today (default: the real today) so a statement is
// always genuinely N days old rather than frozen at a date that ages into
// nonsense.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = "docs/workflows/sim-documents";
const IDENTITY_FILE = "credentials/sim-identity/owner-identity.local.json";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const TODAY = new Date(arg("today", new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
const shift = (days) => new Date(TODAY.getTime() + days * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const pretty = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const mdy = (d) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });

function identity() {
  const j = JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
  return {
    first: j.legal_first_name,
    last: j.legal_last_name,
    name: `${j.legal_first_name} ${j.legal_last_name}`,
    ssn: String(j.ssn),
    dob: j.dob,
    addr: j.current_address
  };
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; background: #6b7280; }
  .sheet { background: #fff; }
  .lic { width: 660px; height: 416px; padding: 22px 26px; background:
     linear-gradient(135deg,#eef4fb 0%,#dce8f6 55%,#e8f0f9 100%); position: relative; }
  .lic .hdr { display:flex; justify-content:space-between; align-items:flex-start;
     border-bottom:3px solid #14406e; padding-bottom:8px; }
  .lic .st { font-size:23px; font-weight:800; color:#14406e; letter-spacing:.5px; }
  .lic .sub { font-size:11px; color:#33556f; letter-spacing:2.4px; margin-top:2px; }
  .lic .cls { text-align:right; font-size:10px; color:#33556f; line-height:1.5; }
  .lic .body { display:flex; gap:20px; margin-top:16px; }
  .lic .photo { width:132px; height:168px; background:linear-gradient(160deg,#9fb2c4,#6f8399);
     border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.28); position:relative; }
  .lic .photo:after { content:""; position:absolute; left:35px; top:32px; width:62px; height:62px;
     border-radius:50%; background:#c3cedb; box-shadow:0 74px 0 -12px #c3cedb; }
  .lic .fields { flex:1; }
  .lic .row { margin-bottom:9px; }
  .lic .k { font-size:8.5px; color:#5b7a95; letter-spacing:1.5px; font-weight:700; }
  .lic .v { font-size:15px; color:#0d2438; font-weight:650; line-height:1.25; }
  .lic .two { display:flex; gap:26px; }
  .lic .sig { position:absolute; right:26px; bottom:16px; font-family:"Snell Roundhand","Brush Script MT",cursive;
     font-size:27px; color:#16324a; transform:rotate(-3.5deg); }
  .lic .no { position:absolute; left:26px; bottom:14px; font-size:11px; color:#33556f; letter-spacing:1.4px; }
  .lic.expired:before { content:"EXPIRED"; position:absolute; inset:0; display:flex;
     align-items:center; justify-content:center; font-size:74px; font-weight:900;
     color:rgba(190,32,42,.17); transform:rotate(-17deg); letter-spacing:8px; }

  .doc { width: 700px; padding: 44px 48px; background:#fff; color:#111; }
  .doc h1 { font-size:20px; letter-spacing:.4px; }
  .doc .brand { display:flex; justify-content:space-between; align-items:baseline;
     border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:20px; }
  .doc .muted { color:#555; font-size:11.5px; }
  .doc .to { margin:16px 0 22px; font-size:13.5px; line-height:1.6; }
  .doc table { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
  .doc th { text-align:left; border-bottom:1.5px solid #111; padding:7px 4px; font-size:10px;
     letter-spacing:1.2px; color:#333; }
  .doc td { padding:7px 4px; border-bottom:1px solid #e4e4e4; }
  .doc td.n { text-align:right; font-variant-numeric:tabular-nums; }
  .doc .tot { font-weight:750; }
  .doc .foot { margin-top:26px; font-size:10.5px; color:#666; line-height:1.6; }

  .ssn { width:560px; height:330px; padding:30px 34px;
     background:linear-gradient(155deg,#f4f1e4 0%,#eae5d2 100%); position:relative; }
  .ssn .seal { position:absolute; right:34px; top:28px; width:78px; height:78px; border-radius:50%;
     border:2.5px solid #7a6f4e; opacity:.42; }
  .ssn h2 { font-size:16.5px; letter-spacing:2.6px; color:#3c3320; font-weight:750; }
  .ssn .num { font-size:33px; letter-spacing:5px; margin:44px 0 8px; color:#2b2416; font-weight:700; }
  .ssn .nm { font-size:17.5px; letter-spacing:1.6px; color:#2b2416; }
  .ssn .sg { margin-top:40px; font-family:"Snell Roundhand","Brush Script MT",cursive;
     font-size:24px; color:#2b2416; transform:rotate(-2deg); }
  .ssn .rule { border-top:1px solid #8a7f5e; width:250px; margin-top:2px; }
`;

function licence(p, { expired = false } = {}) {
  const exp = expired ? shift(-118) : shift(1580);
  return `<div class="sheet lic ${expired ? "expired" : ""}">
    <div class="hdr">
      <div><div class="st">ARIZONA</div><div class="sub">DRIVER LICENSE</div></div>
      <div class="cls">CLASS&nbsp;&nbsp;D<br>DD&nbsp;&nbsp;4419-2280-7715</div>
    </div>
    <div class="body">
      <div class="photo"></div>
      <div class="fields">
        <div class="row"><div class="k">NAME</div><div class="v">${p.last.toUpperCase()}<br>${p.first.toUpperCase()}</div></div>
        <div class="row"><div class="k">ADDRESS</div><div class="v" style="font-size:13px">${p.addr.line1}<br>${p.addr.city}, ${p.addr.state} ${p.addr.postal_code}</div></div>
        <div class="two">
          <div class="row"><div class="k">DOB</div><div class="v">${mdy(new Date(p.dob + "T12:00:00Z"))}</div></div>
          <div class="row"><div class="k">ISS</div><div class="v">${mdy(shift(expired ? -1943 : -365))}</div></div>
          <div class="row"><div class="k">EXP</div><div class="v">${mdy(exp)}</div></div>
        </div>
      </div>
    </div>
    <div class="no">DL&nbsp;&nbsp;D08841927</div>
    <div class="sig">${p.first} ${p.last}</div>
  </div>`;
}

function statement(p, { monthsAgo = 1 } = {}) {
  const end = shift(-monthsAgo * 30);
  const start = shift(-monthsAgo * 30 - 30);
  const rows = [
    [shift(-monthsAgo * 30 - 27), "PAYROLL DEPOSIT — MERIDIAN LOGISTICS", "3,412.88", "9,120.44"],
    [shift(-monthsAgo * 30 - 22), "CARD PURCHASE — FRY'S FOOD #412", "-186.20", "8,934.24"],
    [shift(-monthsAgo * 30 - 16), "ONLINE TRANSFER TO SAVINGS", "-1,000.00", "7,934.24"],
    [shift(-monthsAgo * 30 - 11), "PAYROLL DEPOSIT — MERIDIAN LOGISTICS", "3,412.88", "11,347.12"],
    [shift(-monthsAgo * 30 - 6), "SRP UTILITIES AUTOPAY", "-241.55", "11,105.57"],
    [shift(-monthsAgo * 30 - 2), "CARD PURCHASE — COSTCO #1188", "-318.41", "10,787.16"]
  ];
  return `<div class="sheet doc">
    <div class="brand"><h1>SAGUARO STATE BANK</h1><div class="muted">Member FDIC</div></div>
    <div class="to"><strong>${p.name}</strong><br>${p.addr.line1}<br>${p.addr.city}, ${p.addr.state} ${p.addr.postal_code}</div>
    <div class="muted">CHECKING ····4419 &nbsp;·&nbsp; STATEMENT PERIOD ${pretty(start)} — ${pretty(end)}</div>
    <table>
      <thead><tr><th>DATE</th><th>DESCRIPTION</th><th style="text-align:right">AMOUNT</th><th style="text-align:right">BALANCE</th></tr></thead>
      <tbody>${rows.map(([d, desc, amt, bal]) =>
        `<tr><td>${mdy(d)}</td><td>${desc}</td><td class="n">${amt}</td><td class="n">${bal}</td></tr>`).join("")}
        <tr class="tot"><td colspan="3">ENDING BALANCE</td><td class="n">10,787.16</td></tr>
      </tbody>
    </table>
    <div class="foot">Statement generated ${pretty(end)}. Questions about this statement? Call 1-800-555-0142.<br>
      This is a simulated document produced for system testing. It is not a bank record.</div>
  </div>`;
}

function utility(p) {
  const due = shift(18);
  const issued = shift(-9);
  return `<div class="sheet doc">
    <div class="brand"><h1>SALT RIVER UTILITIES</h1><div class="muted">Account 88-4419-02</div></div>
    <div class="to"><strong>SERVICE ADDRESS</strong><br>${p.name}<br>${p.addr.line1}<br>${p.addr.city}, ${p.addr.state} ${p.addr.postal_code}</div>
    <div class="muted">BILL DATE ${pretty(issued)} &nbsp;·&nbsp; DUE ${pretty(due)}</div>
    <table>
      <thead><tr><th>DESCRIPTION</th><th style="text-align:right">AMOUNT</th></tr></thead>
      <tbody>
        <tr><td>Residential electric service — 1,142 kWh</td><td class="n">198.40</td></tr>
        <tr><td>Water and wastewater</td><td class="n">34.15</td></tr>
        <tr><td>Environmental benefits surcharge</td><td class="n">9.00</td></tr>
        <tr class="tot"><td>TOTAL DUE</td><td class="n">241.55</td></tr>
      </tbody>
    </table>
    <div class="foot">Simulated document for system testing. Not a real utility bill.</div>
  </div>`;
}

function ssnCard(p) {
  const n = p.ssn;
  return `<div class="sheet ssn">
    <div class="seal"></div>
    <h2>SOCIAL SECURITY</h2>
    <div class="num">${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}</div>
    <div class="nm">${p.name.toUpperCase()}</div>
    <div class="sg">${p.first} ${p.last}</div>
    <div class="rule"></div>
    <div style="font-size:9px;color:#5c5136;margin-top:6px;letter-spacing:1px">SIMULATED — NOT A REAL CARD</div>
  </div>`;
}

/* Every file, what it is, and what DOC-CHECK is expected to answer. The
   expectation is the point: a document nobody predicted an outcome for proves
   nothing when the agent returns something. */
const PLAN = (p) => [
  { file: "id-clean.png", kind: "id_document", html: licence(p), blur: 0,
    expect: "accept", why: "in date, name and address match the client on file" },
  { file: "id-blurry.png", kind: "id_document", html: licence(p), blur: 3.4,
    expect: "request_more", why: "genuinely unreadable pixels — nothing can be verified off it" },
  { file: "id-expired.png", kind: "id_document", html: licence(p, { expired: true }), blur: 0,
    expect: "request_more", why: `expiry ${mdy(shift(-118))} is in the past` },
  { file: "id-wrong-person.png", kind: "id_document",
    html: licence({ ...p, first: "Marcus", last: "Reyes", name: "Marcus Reyes" }), blur: 0,
    expect: "request_more or hold", why: "different person, same address — the packet defect from the 2026-09-06 board" },
  { file: "bank-statement-clean.png", kind: "bank_statement", html: statement(p, { monthsAgo: 1 }), blur: 0,
    expect: "accept", why: "period ended last month, name and address match" },
  { file: "bank-statement-stale.png", kind: "bank_statement", html: statement(p, { monthsAgo: 7 }), blur: 0,
    expect: "request_more", why: "period ended about seven months ago" },
  { file: "bank-statement-blurry.png", kind: "bank_statement", html: statement(p, { monthsAgo: 1 }), blur: 3.0,
    expect: "request_more", why: "unreadable" },
  { file: "proof-of-address-clean.png", kind: "proof_of_address", html: utility(p), blur: 0,
    expect: "accept", why: "recent bill at the address on file" },
  { file: "ssn-card-clean.png", kind: "ssn_card", html: ssnCard(p), blur: 0,
    expect: "accept", why: "legible, name matches — the agent is told never to request more only because it is not a photo ID" }
];

async function main() {
  const p = identity();
  const plan = PLAN(p);

  if (process.argv.includes("--list")) {
    for (const d of plan) console.log(`${d.file.padEnd(30)} ${d.kind.padEnd(18)} expect ${d.expect} — ${d.why}`);
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  for (const d of plan) {
    const blur = d.blur ? `filter: blur(${d.blur}px);` : "";
    await page.setContent(
      `<style>${CSS}</style><div style="display:inline-block;padding:26px;${blur}">${d.html}</div>`,
      { waitUntil: "load" }
    );
    const el = await page.$("div");
    await el.screenshot({ path: path.join(OUT, d.file) });
    console.log(`wrote ${d.file}  (${d.kind}, expect ${d.expect})`);
  }

  await browser.close();

  const readme = [
    "# Simulated upload documents",
    "",
    "Generated by `scripts/sim/make-documents.mjs`. Re-run it to rebuild; the dates",
    "are computed from the day it runs, so a \"stale\" statement is always genuinely",
    "stale rather than frozen at a date that ages into nonsense.",
    "",
    "**Nobody real is on these.** The identity is the simulated one in",
    "`credentials/sim-identity/owner-identity.local.json` (owner-set 2026-09-09: fake",
    "identity, fake credit file, no bureau is ever called). The SSN area number 000",
    "has never been issued by the Social Security Administration.",
    "",
    "The blur is a CSS filter applied before the screenshot, so the pixels really are",
    "unreadable. A filename that merely says \"blurry\" tests nothing.",
    "",
    "| file | kind | DOC-CHECK should answer | why |",
    "|---|---|---|---|",
    ...plan.map((d) => `| \`${d.file}\` | \`${d.kind}\` | **${d.expect}** | ${d.why} |`),
    "",
    `Built ${iso(TODAY)}.`
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "README.md"), readme + "\n");
  console.log(`wrote README.md — ${plan.length} documents`);
}

main().catch((e) => { console.error(e); process.exit(1); });
