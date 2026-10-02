#!/usr/bin/env node
// scripts/sim/make-documents.mjs — build the fake documents each walk client uploads.
//
//   node scripts/sim/make-documents.mjs                 # clients 08, 09, 10
//   node scripts/sim/make-documents.mjs --client 11     # one client (08 to 14)
//   node scripts/sim/make-documents.mjs --client 14 --last Eight-Funding   # a rerun's name
//   node scripts/sim/make-documents.mjs --list          # the plan, writes nothing
//   node scripts/sim/make-documents.mjs --today 2026-09-16
//
// Writes ops/workflows/sim-documents/<NN>/ (pictures + consent-form.txt, all fake)
// and ops/workflows/sim-documents/
// MATRIX.md (committed: which file passes, which fails, and what you should see).
//
// WHY THESE EXIST. The DOC-CHECK agent decides accept / request_more / hold on a
// real image. A walk that only uploads a clean ID proves the happy path and
// nothing else — the value of the agent is what it does with a photo you cannot
// read and a statement from last winter.
//
// WHAT THE CHECKER COMPARES (src/handlers/doc-check.mjs:192-221). The client's name
// on file is clients.first_name + " " + clients.last_name — for the walk,
// "Sim Eight-Funding" and so on, typed on survey screen 1. So every document here
// prints THAT client's name, first name first, exactly as on file. An accepted
// ID's printed name is copied onto the dispute letters word for word
// (src/identity/verified.mjs:136, src/repair/analyze.mjs:671-673).
//
// The checker also sees the uploaded FILE NAME (doc-check.mjs:312). Names like
// "id-blurry.png" gave the answer away, so files are numbered and the answer key
// lives only in MATRIX.md.
//
// NOBODY REAL IS ON THESE. The address and date of birth are the fake ones from
// credentials/sim-identity/owner-identity.local.json. The SSN is SIM_SSN from
// push-credit.mjs:151 — the vendor's test number 666-15-4480, which matches the
// fake credit file's last four and which a real production pull refuses before
// it is sent (src/finance/crs-identities.mjs:257-262). Blur is a CSS filter on the
// rendered page, so the pixels really are unreadable. Out-of-date documents carry
// real past dates computed from --today.
//
// BUREAU REPLY LETTERS (#9 and #10 only). The reply reader copies the letter text
// and then plain code looks for each disputed account's last four digits and a
// result word near it (src/metro2/inbound/parse-response.mjs:17-50):
//   * the window is 120 characters before the ending to 200 after, and the first
//     place the digits appear wins — so no other text carries those digits, and
//     every account block is followed by 200+ neutral characters;
//   * items with no account number (name, address, duplicate inquiry) take the
//     first result word in the opening 400 characters;
//   * result words are plain substrings: deleted/removed/"no longer report",
//     verified/remains/accurate (so "inaccurate" too), updated/modified/
//     corrected/changed (so "unchanged" too). The filler avoids every one.
// Confidence is 0.35 + 0.55 × (items with a result ÷ all open items); 0.85 or
// more confirms with no person (parse-loop.mjs:6, :69). #10's letter keeps result
// words out of the opening so it stays under 0.85 and waits for "Mark as checked";
// #9's letter covers every item so it confirms by itself.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "ops/workflows/sim-documents");
const IDENTITY_FILE = path.join(ROOT, "credentials/sim-identity/owner-identity.local.json");
const SIM_SSN = "666154480"; // push-credit.mjs:151

const CLIENTS = {
  "08": { last: "Eight-Funding", path: "Funding done-for-you" },
  "09": { last: "Nine-Repair", path: "Credit repair, six rounds" },
  "10": { last: "Ten-Trial", path: "Repair trial, two rounds" },
  "11": { last: "Eleven-Blueprint", path: "Capital Blueprint" },
  "12": { last: "Twelve-Academy", path: "Capital Academy" },
  "13": { last: "Thirteen-NoBook", path: "Does not book" },
  "14": { last: "Fourteen", path: "Spare, for a rerun" }
};
const DEFAULT_CLIENTS = ["08", "09", "10"];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const TODAY = new Date(arg("today", new Date().toISOString().slice(0, 10)) + "T12:00:00Z");
const shift = (days) => new Date(TODAY.getTime() + days * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const pretty = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const mdy = (d) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });

function person(nn) {
  const j = JSON.parse(fs.readFileSync(IDENTITY_FILE, "utf8"));
  const last = nn === "14" ? arg("last", CLIENTS[nn].last) : CLIENTS[nn].last;
  return {
    nn,
    first: "Sim",
    last,
    name: `Sim ${last}`,
    ssn: SIM_SSN,
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
  .doc p { font-size:13px; line-height:1.6; margin:0 0 12px; }
  .doc .item { margin:18px 0 0; }
  .doc .item b { display:block; font-size:13.5px; }
  .doc .item .res { font-size:13.5px; margin:2px 0 6px; }

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

const upper = (s) => String(s).toUpperCase();

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
        <div class="row"><div class="k">NAME</div><div class="v">${upper(p.first)} ${upper(p.last)}</div></div>
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
    [shift(-monthsAgo * 30 - 22), "CARD PURCHASE — GROCERY #412", "-186.20", "8,934.24"],
    [shift(-monthsAgo * 30 - 16), "ONLINE TRANSFER TO SAVINGS", "-1,000.00", "7,934.24"],
    [shift(-monthsAgo * 30 - 11), "PAYROLL DEPOSIT — MERIDIAN LOGISTICS", "3,412.88", "11,347.12"],
    [shift(-monthsAgo * 30 - 6), "MESA VALLEY POWER AUTOPAY", "-241.55", "11,105.57"],
    [shift(-monthsAgo * 30 - 2), "CARD PURCHASE — WAREHOUSE CLUB #1188", "-318.41", "10,787.16"]
  ];
  return `<div class="sheet doc">
    <div class="brand"><h1>SAGUARO STATE BANK</h1><div class="muted">Member FDIC</div></div>
    <div class="to"><strong>${upper(p.name)}</strong><br>${p.addr.line1}<br>${p.addr.city}, ${p.addr.state} ${p.addr.postal_code}</div>
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
    <div class="brand"><h1>MESA VALLEY POWER &amp; WATER</h1><div class="muted">Account 88-4419-02</div></div>
    <div class="to"><strong>SERVICE ADDRESS</strong><br>${upper(p.name)}<br>${p.addr.line1}<br>${p.addr.city}, ${p.addr.state} ${p.addr.postal_code}</div>
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
    <div class="nm">${upper(p.name)}</div>
    <div class="sg">${p.first} ${p.last}</div>
    <div class="rule"></div>
    <div style="font-size:9px;color:#5c5136;margin-top:6px;letter-spacing:1px">SIMULATED — NOT A REAL CARD</div>
  </div>`;
}

/* ── Bureau reply letters ────────────────────────────────────────────────────
   Every sentence below was checked against the result-word list in
   parse-response.mjs:22-34. Change one and check again: "remain", "accurate",
   "change", "removed" and "no longer report" are all result words by substring. */
const NEUTRAL_OPEN =
  "Thank you for writing to us. We have finished looking into the items you asked about. " +
  "The outcome for each item is shown below, with a short note on what happens next. " +
  "Please keep this letter with your other papers, because you may need it later. " +
  "If you send us a new request, include your full name and the items you want us to look at again, " +
  "along with any papers that support your request.";
const FILLER =
  "Note: we looked at this item with the company that furnished it to us. If you still have questions " +
  "about this item, you can write to that company at the address shown on your credit file, or send us " +
  "a new request with any papers that support your position on it.";
const FOOT = "This is a simulated letter made for system testing. It did not come from a credit bureau.";

/* #10, TransUnion, round 1. 6104 verified is what ends the trial on a staff
   check: the staff path applies only the oldest open bureau file, which is
   TransUnion round 1 (parse-loop.mjs:66, :135-137; program-cap.mjs:19-53).
   No result word in the opening, so confidence stays under 0.85 and the answer
   waits under "Needs a human read". */
const REPLY_10 = {
  bureau: "TransUnion",
  opening: NEUTRAL_OPEN,
  items: [
    ["Account", "WELLS FARGO CARD · ending 6104", "verified"],
    ["Account", "LVNV FUNDING LLC · ending 4417", "deleted"],
    ["Account", "COMENITY BANK · ending 2298", "updated"]
  ]
};
/* #9, Equifax. Covers every disputed ending and every inquiry creditor, and puts
   "deleted" in the opening for the name, address and duplicate-inquiry items, so
   every open item gets a result and the reader confirms it by itself. The
   opening's result word sits more than 120 characters ahead of the first ending. */
const REPLY_09 = {
  bureau: "Equifax",
  opening:
    "Thank you for writing to us. Some of the personal details you asked about were deleted from your file. " +
    "We have finished looking into the other items you asked about, and the outcome for each one is shown below " +
    "with a short note on what happens next. Please keep this letter with your other papers, because you may need it later.",
  items: [
    ["Account", "CAPITAL ONE · ending 7729", "verified"],
    ["Account", "MIDLAND CREDIT MGMT · ending 6642", "deleted"],
    ["Account", "PORTFOLIO RECOVERY · ending 9075", "deleted"],
    ["Account", "SYNCB/CARE CREDIT · ending 1256", "updated"],
    ["Account", "CREDIT ONE BANK · ending 3018", "updated"],
    ["Inquiry", "KROLL FACTUAL DATA", "deleted"],
    ["Inquiry", "ONEMAIN FINANCIAL", "deleted"],
    ["Inquiry", "FIRST PREMIER BANK", "deleted"]
  ]
};

const RESULT_WORDS = /deleted|removed|no longer report|verified|remains|accurate|updated|modified|corrected|changed/i;

function bureauLetter(p, reply) {
  // Guard the rules above so an edit cannot quietly break the matcher.
  if (RESULT_WORDS.test(FILLER) || RESULT_WORDS.test(FOOT) || RESULT_WORDS.test(NEUTRAL_OPEN)) {
    throw new Error("a result word slipped into the neutral text of the bureau letter");
  }
  const endings = reply.items.map(([, label]) => (label.match(/ending (\d{4})/) || [])[1]).filter(Boolean);
  const head = `${reply.bureau} ${p.name} ${pretty(TODAY)} ${reply.opening}`;
  for (const e of endings) {
    if (head.includes(e)) throw new Error(`ending ${e} appears before its own account`);
  }
  return `<div class="sheet doc">
    <div class="brand"><h1>DISPUTE RESULTS</h1><div class="muted">${reply.bureau} · simulated test letter</div></div>
    <div class="to"><strong>${upper(p.name)}</strong><br>${pretty(TODAY)}</div>
    <p>${reply.opening}</p>
    ${reply.items.map(([kind, label, word]) => `<div class="item">
      <b>${kind}: ${label}</b>
      <div class="res">Result: ${word}</div>
      <p>${FILLER}</p>
    </div>`).join("")}
    <div class="foot">${FOOT}</div>
  </div>`;
}

/* ── The plan: every file, how to upload it, and what should happen ────────── */
const WHERE_ID = "Portal → Send a file → ID and personal documents";
const WHERE_REPLY = "Portal → Send a file → Upload your bureau response";

const ACCEPT_SEE = "Email \"Documents approved — you're moving\" and a text \"documents approved\".";
const MORE_SEE = "Text \"Got your upload — one thing needs fixing\" and, after a reload, a note in the portal's Send a file card. No email.";
const HOLD_SEE = "No message. A staff task \"Document hold — …\" in Calendar, \"No date on it\".";
const RETAKE_SEE = "Email \"Please retake your bureau letter photo\" (its \"What to fix\" line may be empty). The Repair card moves to \"Response received\". If no retake email comes and a \"Bureau answer needs a look\" row appears instead, tell Claude and do not press it. If nothing happens at all, tell Claude.";

/* Upload order per client. #8 goes bad-first so the funding pause can be watched
   staying on; #9 and #10 go good-first because an approved ID or bill is what
   unlocks their letters (src/repair/analyze.mjs:664-666), and a wrong-person ID
   would push their repair card forward on arrival (src/repair/handlers.mjs:40-56). */
const ORDER = {
  "08": { needed: ["photo-id-2", "photo-id-4", "photo-id-3", "bank-statement-2", "ssn-card-1", "photo-id-1", "proof-of-address-1"],
          optional: ["bank-statement-3", "bank-statement-1"] },
  "09": { needed: ["photo-id-1", "proof-of-address-1", "bureau-letter-2", "bureau-letter-1"],
          optional: ["photo-id-2", "photo-id-3", "bank-statement-2", "bank-statement-3", "bank-statement-1", "ssn-card-1", "photo-id-4"] },
  "10": { needed: ["photo-id-1", "proof-of-address-1", "bureau-letter-2", "bureau-letter-1"],
          optional: ["bank-statement-1", "photo-id-2", "photo-id-3", "bank-statement-2", "bank-statement-3", "ssn-card-1", "photo-id-4"] }
};

function plan(p) {
  const all = library(p);
  const key = (d) => d.file.replace(/\.png$/, "");
  // Clients outside the walk's upload steps (#11 to #14): nothing is required.
  const order = ORDER[p.nn] || { needed: [], optional: all.map(key) };
  const byName = new Map(all.map((d) => [key(d), d]));
  const out = [];
  const seen = new Set();
  for (const [list, needed] of [[order.needed, true], [order.optional, false]]) {
    for (const k of list) {
      if (seen.has(k) || !byName.has(k)) continue;
      seen.add(k);
      out.push({ ...byName.get(k), needed });
    }
  }
  return out;
}

function library(p) {
  const docs = [
    { file: "photo-id-2.png", html: licence(p), blur: 3.4, where: WHERE_ID, pick: "Photo ID",
      expect: "request more", sure: "high", see: MORE_SEE,
      why: "The picture is too blurry to read. The rules say blurry means request more." },
    { file: "photo-id-4.png", html: licence({ ...p, first: "Marcus", last: "Reyes", name: "Marcus Reyes" }), blur: 0,
      where: WHERE_ID, pick: "Photo ID",
      expect: "request more or hold (never approved)", sure: "medium", see: `${MORE_SEE} Or: ${HOLD_SEE}`,
      why: "Wrong person: the name is MARCUS REYES. Known bug: it still counts toward a full ID-and-address set the moment it lands." },
    { file: "photo-id-3.png", html: licence(p, { expired: true }), blur: 0, where: WHERE_ID, pick: "Photo ID",
      expect: "request more", sure: "medium", see: MORE_SEE,
      why: `Ran out on ${mdy(shift(-118))} and carries a faint EXPIRED stamp. The rules never mention expiry, so an approval here is a finding, not a mistake in the file.` },
    { file: "bank-statement-2.png", html: statement(p, { monthsAgo: 7 }), blur: 0, where: WHERE_ID, pick: "Bank statement",
      expect: "request more", sure: "high", see: MORE_SEE,
      why: "The statement ended about 7 months ago. The rules want a recent one." },
    { file: "bank-statement-3.png", html: statement(p, { monthsAgo: 1 }), blur: 3.0, where: WHERE_ID, pick: "Bank statement",
      expect: "request more", sure: "high", see: MORE_SEE, why: "Too blurry to read." },
    { file: "photo-id-1.png", html: licence(p), blur: 0, where: WHERE_ID, pick: "Photo ID",
      expect: "approved — but only after \"put identity on file\"", sure: "medium",
      see: p.nn === "08"
        ? `${ACCEPT_SEE} If instead you get the "one thing needs fixing" text, that is the first finding: say "put identity on file #8", then upload this same file again.`
        : `${ACCEPT_SEE} If you get the "one thing needs fixing" text instead, that is a finding: read the note in the portal and tell Claude. The identity is already on file, so uploading it again will not help.`,
      why: "Good ID with the right name. The checker is told the address and birth date are \"not on file\" until Claude puts them there, and its rules want both to match. The face is a plain grey shape, which a reader could also question." },
    { file: "proof-of-address-1.png", html: utility(p), blur: 0, where: WHERE_ID, pick: "Proof of address",
      expect: "approved (after \"put identity on file\")", sure: "low", see: ACCEPT_SEE,
      why: "Recent bill, right name, same address as the ID. An approved bill saves the name and address the repair letters need. Low confidence: the footer says it is simulated, and the rules hold anything that looks altered — a hold here is a finding, not a broken file." },
    { file: "bank-statement-1.png", html: statement(p, { monthsAgo: 1 }), blur: 0, where: WHERE_ID, pick: "Bank statement",
      expect: "approved (after \"put identity on file\")", sure: "low", see: ACCEPT_SEE,
      why: "Good statement from last month. Low confidence: the footer says it is simulated, and the rules put anything that looks altered on hold." },
    { file: "ssn-card-1.png", html: ssnCard(p), blur: 0, where: WHERE_ID, pick: "Social Security card",
      expect: "approved", sure: "medium",
      see: p.nn === "08" ? `${ACCEPT_SEE} Reload the Client Control Panel: "On Hold Because" is now empty.` : ACCEPT_SEE,
      why: p.nn === "08"
        ? "A written rule forces approval when the card is readable and the name matches — it does not need the address or birth date, so it is the first file that can lift #8's pause. It saves no name. If it comes back hold, the \"SIMULATED\" line on the card is the likely reason."
        : "A written rule forces approval when the card is readable and the name matches. It saves no name, so it does not unlock repair letters." }
  ];
  const reply = p.nn === "10" ? REPLY_10 : p.nn === "09" ? REPLY_09 : null;
  if (reply) {
    const staff = p.nn === "10";
    docs.push(
      { file: "bureau-letter-1.png", html: bureauLetter(p, reply), blur: 0, where: WHERE_REPLY, pick: "Letter from a credit bureau",
        expect: staff ? "waits for a person, then trial done" : "confirmed by itself", sure: "medium",
        see: staff
          ? "Specialist desk → \"Repair\" → reload. The box \"Needs a human read\" shows \"Bureau answer needs a look\" with \"Confidence 0.576\". Press \"Mark as checked\" on THAT row only — the box lists the whole company and shows no client name, so if you see more than one row, stop and tell Claude first. The button then reads \"Checked\". Gmail gets \"We reviewed your bureau response\" twice (only one lists the accounts), \"Round 2 is out\" (expected, not a failure), and \"Your trial rounds are complete — next steps\". #10 is counted under the \"Trial ending\" tile, its row label still reads \"Send letters\" (letters are never mailed on this walk), the Repair card lands on \"Round complete\", and a task \"Re-pull CRS and re-underwrite — new round\" shows under \"No date on it\"."
          : "No staff press. Gmail gets \"We reviewed your bureau response\" three times (only one lists the accounts) and a \"Round N is out\" email. After a reload the Repair card sits on \"Round complete\".",
        why: staff
          ? "TransUnion reply: Wells Fargo 6104 verified (that is what ends the trial), LVNV 4417 deleted, Comenity 2298 updated. The site's own matcher scores it 0.576, so it waits for a person. Upload only after the round-1 letters are staged, or it is ignored. Do not pay the L3.15 full-program link before this step — the trial must still be active."
          : "Equifax reply that names every disputed account and inquiry with a result; the site's own matcher scores it 0.90, so it confirms alone. Known: the answers apply to all three bureaus and are filed under the TransUnion file, so a round-2 letter staged AFTER this upload quotes it. Upload it after L2.17 (round 2 staged)." },
      { file: "bureau-letter-2.png", html: bureauLetter(p, reply), blur: 3.4, where: WHERE_REPLY, pick: "Letter from a credit bureau",
        expect: "retake", sure: "medium", see: RETAKE_SEE,
        why: "Same letter, too blurry to read. Upload this one BEFORE bureau-letter-1." }
    );
  }
  return docs;
}

const STAGE_NOTE = "Either one approved unlocks Stage, because the bill carries the name too. If neither is approved, stop and tell Claude: nothing on screen can approve a document by hand, and Stage will keep saying the ID has not been read.";
const ORDER_NOTE = {
  "08": "**Where the pause shows:** open #8's Client Control Panel, expand \"Credit & Hold Status\", and check \"On Hold Because\" reads \"Documents Pending Approval\". If it says anything else, tell Claude before uploading. Reload the panel after each upload. Ignore the \"On hold because\" box in the \"Funding round\" block — it reads a different field and stays a dash.\n\nUpload top to bottom. The bad ones go first so you can see the pause stay on after each. The Social Security card is the first file that can lift it. Then the good ID with nothing on file — if it comes back \"needs fixing\", say \"put identity on file #8\" and upload it again.",
  "09": `Say "put identity on file #9" BEFORE uploading anything (#8 already showed what happens without it). Then the good ID and the bill. ${STAGE_NOTE} The bureau letters go in after round-2 letters are staged (L2.17): blurry one first, then the good one. Everything marked optional can go in after, or not at all.`,
  "10": `Say "put identity on file #10" first. Then the good ID and the bill. ${STAGE_NOTE} The bureau letters go in after the round-1 letters are staged (L2.18): blurry one first, then the good one, then "Mark as checked" (L3.14). Everything marked optional can go in after, or not at all.`,
  "11": "Nothing on the walk asks a Blueprint buyer for a document. You only need `consent-form.txt` for the soft pull (L1.5). The pictures are here if you want to try the upload box; the same answers as #8 apply.",
  "12": "Nothing on the walk asks an Academy buyer for a document, and the portal may not show an upload box at all. You only need `consent-form.txt` for the soft pull (L1.5)."
};

function consentText(p) {
  return [
    `Consent form values for ${p.name} (sheet step L1.5). All fake.`,
    "",
    `Full legal name:        ${p.name}`,
    `Social Security number: 666-15-4480`,
    `Date of birth:          ${p.dob}`,
    `Street address:         ${p.addr.line1}`,
    `City:                   ${p.addr.city}`,
    `State:                  ${p.addr.state}`,
    `ZIP:                    ${p.addr.postal_code}`,
    "",
    "Leave \"+ Add a business\" empty. Submit once. Do NOT pay the $32.",
    ""
  ].join("\n");
}

function matrix(people) {
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  const lines = [
    "# Fake upload documents — what should pass and what should fail",
    "",
    `Built ${iso(TODAY)} by \`scripts/sim/make-documents.mjs\`. The pictures are in the numbered folders beside this file. Re-run the script to rebuild them; dates are worked out from the day it runs.`,
    "",
    "## Before you upload anything",
    "",
    "- **Type the client's name exactly as on file.** Survey screen 1: first name `Sim`, last name as below. Every document prints that same name.",
    "- **Consent form (L1.5):** copy the values from `consent-form.txt` in the client's folder. Same fake SSN (666-15-4480), birth date and address for everyone. Nothing blocks a repeat.",
    "- **Upload in the portal box \"ID and personal documents\"** (the bureau letters use \"Upload your bureau response\"). Pick the type first, press the button once to choose the file, then again (\"Send 1 file\") to send it. It then says \"Sent\" (\"Try again\" means it failed). The type box keeps the last choice, so set it again before every file. The \"Inquiry documents\" box is never checked.",
    "- **Pictures only.** Every file is PNG.",
    "- **Answers take a minute or two.** They come from an AI reading the picture.",
    "- **Texts wait overnight.** Between 8 pm and 8 am Arizona time the text is held until morning. Reload the portal and read the note under \"Send a file\" instead. Every test client's text goes to the same phone and starts \"Hey Sim\" — say `check texts #N` to know whose it is.",
    "",
    "## What each answer looks like",
    "",
    "| Answer | What you see |",
    "|---|---|",
    `| Approved | ${ACCEPT_SEE} |`,
    `| Request more | ${MORE_SEE} |`,
    `| Hold | ${HOLD_SEE} |`,
    "| Nobody could read it | Staff task \"Check this id document by hand — nobody has read it\" (the words change with the type). No message to the client. The site could not open the file, or it has no AI key. |",
    "| Retake (bureau letters) | " + RETAKE_SEE + " |",
    "| Nothing at all | The checker is switched off, or it answered with a word the site does not know. For a bureau letter, silence also means the reader could not answer. Tell Claude. |",
    "",
    "## Say this to Claude",
    "",
    "| You say | Claude does |",
    "|---|---|",
    "| `make docs #N` | Runs `node scripts/sim/make-documents.mjs --client N`. Clients 08–12 are already built. |",
    "| `put identity on file #N` | Runs `node scripts/sim/put-identity-on-file.mjs --client N --write`. Writes the fake address and birth date where the checker reads them, on that test client only. |",
    ""
  ];
  for (const p of people) {
    lines.push(`## #${Number(p.nn)} ${p.name} — ${CLIENTS[p.nn].path}`, "");
    if (ORDER_NOTE[p.nn]) lines.push(ORDER_NOTE[p.nn], "");
    lines.push(`Folder: \`ops/workflows/sim-documents/${p.nn}/\``, "");
    lines.push("| Order | File | Needed? | Where | Pick | Should come back | How sure | You should see | Why |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    plan(p).forEach((d, i) => {
      lines.push(`| ${i + 1} | \`${d.file}\` | ${d.needed ? "yes" : "optional"} | ${esc(d.where)} | ${esc(d.pick)} | **${esc(d.expect)}** | ${d.sure} | ${esc(d.see)} | ${esc(d.why)} |`);
    });
    lines.push("");
  }
  lines.push(
    "## What this does not cover",
    "",
    "- LLC papers, tax return, proof of income, FTC or police report, passport: nothing on the walk needs them.",
    "- Texting photos in: every test client shares one phone number, so the site cannot tell whose photo it is.",
    "- #11 and #12: nothing asks a Blueprint or Academy buyer for a document. `make docs #11` still builds a set if you want one.",
    ""
  );
  return lines.join("\n");
}

async function main() {
  const pickArg = arg("client");
  const nns = pickArg ? [String(pickArg).replace(/\D/g, "").padStart(2, "0")] : DEFAULT_CLIENTS;
  for (const nn of nns) {
    if (!CLIENTS[nn]) throw new Error(`unknown client ${nn} — use 08 to 14`);
  }
  const people = nns.map(person);

  if (process.argv.includes("--list")) {
    for (const p of people) {
      console.log(`\n#${Number(p.nn)} ${p.name}`);
      for (const d of plan(p)) console.log(`  ${d.file.padEnd(24)} ${d.pick.padEnd(28)} expect ${d.expect} (${d.sure})`);
    }
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const p of people) {
    const dir = path.join(OUT, p.nn);
    fs.mkdirSync(dir, { recursive: true });
    for (const d of plan(p)) {
      const blur = d.blur ? `filter: blur(${d.blur}px);` : "";
      await page.setContent(
        `<style>${CSS}</style><div style="display:inline-block;padding:26px;${blur}">${d.html}</div>`,
        { waitUntil: "load" }
      );
      const el = await page.$("div");
      await el.screenshot({ path: path.join(dir, d.file) });
    }
    fs.writeFileSync(path.join(dir, "consent-form.txt"), consentText(p));
    console.log(`#${Number(p.nn)} ${p.name}: ${plan(p).length} files in ops/workflows/sim-documents/${p.nn}/`);
  }
  await browser.close();

  // The matrix lists the three walk clients plus every client folder that exists.
  const built = fs.readdirSync(OUT).filter((d) => CLIENTS[d] && fs.statSync(path.join(OUT, d)).isDirectory());
  const inMatrix = [...new Set([...DEFAULT_CLIENTS, ...built, ...nns])].sort().map(person);
  fs.writeFileSync(path.join(OUT, "MATRIX.md"), matrix(inMatrix));
  console.log("wrote ops/workflows/sim-documents/MATRIX.md");
}

export { bureauLetter, person, REPLY_09, REPLY_10, CSS };

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
