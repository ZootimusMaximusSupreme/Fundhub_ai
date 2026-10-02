// W1 — roadmap "See a sample" content, pulled from the REAL UnderwriteIQ engine.
// SCRATCH. Not committed. Run from the repo root:
//   env -u ANTHROPIC_BASE_URL node scripts/tmp/w1-roadmap-samples-2026-10-02.mjs
//
// Inputs (simulated, never a real client):
//   - ops/workflows/expected-deliverables-uwiq-2026-09-03-pack/sim-five-credit-report-raw.json
//   - vendor/underwriteiq-full/api/lite/crs/sandbox/{tu,exp,efx}.json  (vendor sandbox, only for the
//     negative-items / dispute pieces, because the sim file is clean)
// Output: ops/workflows/2026-10-02-roadmap-sample-content/w1-samples.json
// No network is used: no API key is read, and none of these code paths call out.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const req = createRequire(import.meta.url);
const imp = (p) => import(join(ROOT, p));

const { runTierEngineFromCrsResult } = await imp("src/finance/crs-tier.mjs");
const { buildLetterPack } = await imp("src/underwrite/letter-pack.mjs");
const { violationsByBureauFromMergedCrs } = await imp("src/metro2/diy/from-crs.mjs");
const { buildDiyPackage } = await imp("src/metro2/diy/package.mjs");
const { collectorsFromViolations } = await imp("src/metro2/diy/collectors.mjs");
const { roundLadderEntry, LADDER_ROUNDS, LETTER_META, LETTER_TYPES } = await imp("src/metro2/letters/catalog.mjs");
const { FUNDING_SEQUENCE_STEPS } = await imp("src/underwrite/funding-sequence.mjs");
const estimate = req(join(ROOT, "vendor/underwriteiq-full/api/lite/crs/estimate-preapprovals.js"));
const pdfjs = await imp("node_modules/pdfjs-dist/legacy/build/pdf.mjs");

/* ── inputs ───────────────────────────────────────────────────────────── */
const SIM_PATH = "ops/workflows/expected-deliverables-uwiq-2026-09-03-pack/sim-five-credit-report-raw.json";
const simRow = JSON.parse(readFileSync(join(ROOT, SIM_PATH), "utf8"));
const sim = simRow.result;
const sb = (n) => JSON.parse(readFileSync(join(ROOT, `vendor/underwriteiq-full/api/lite/crs/sandbox/${n}.json`), "utf8"));
const sandbox = { bureaus: { TU: sb("tu"), EX: sb("exp"), EQ: sb("efx") }, bureausPulled: ["TU", "EX", "EQ"], source: "crs" };

// The sim consumer. Name is in the sim file. The sim file carries NO address
// (creditFiles[].addresses is empty on all three bureaus), so the address is the
// repo's own sim-academy fixture: SIM_PERSONAL in scripts/black-reports/regen-w10-pack.mjs.
const simName = sim.crm_payload.contact.name;
const personal = { name: simName, address: "100 Test Ave\nDenton, TX 76205", city: "Denton", state: "TX", zip: "76205" };
const identity = { fullName: simName, addressLine1: "100 Test Ave", city: "Denton", state: "TX", zip: "76205" };

/* ── tiny HTML tree + block walker (deliverables are small once the font <style> is dropped) ── */
const VOID = new Set(["br", "hr", "img", "meta", "link", "input"]);
function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&middot;/g, "·").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&amp;/g, "&");
}
function parseHtml(html) {
  html = html.replace(/<!doctype[^>]*>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const root = { tag: "root", cls: "", children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) {
      stack[stack.length - 1].children.push({ text: decode(m[5]) });
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      if (m[1]) {
        for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      } else {
        const cls = (/class="([^"]*)"/.exec(m[3]) || [])[1] || "";
        const aria = (/aria-label="([^"]*)"/.exec(m[3]) || [])[1];
        const node = { tag, cls, aria, children: [] };
        stack[stack.length - 1].children.push(node);
        if (!VOID.has(tag) && !m[4]) stack.push(node);
      }
    }
  }
  return root;
}
const hasCls = (n, c) => (n.cls || "").split(/\s+/).includes(c);
function textOf(n) {
  if (n.text !== undefined) return n.text;
  if (n.tag === "br") return "\u0001";
  return n.children.map(textOf).join("");
}
const clean = (s) => s.replace(/\s+/g, " ").split("\u0001").map((l) => l.trim()).filter(Boolean).join("\n");
const tx = (n) => (n ? clean(textOf(n)) : "");
function findAll(n, pred, out = []) {
  if (n.text === undefined) { if (pred(n)) out.push(n); n.children.forEach((c) => findAll(c, pred, out)); }
  return out;
}
function tableOf(t) {
  const th = findAll(t, (n) => n.tag === "thead")[0];
  const head = th ? findAll(th, (n) => n.tag === "tr")[0] : null;
  const body = findAll(t, (n) => n.tag === "tbody")[0] || t;
  const cells = (tr) => tr.children.filter((c) => c.tag === "td" || c.tag === "th").map((c) => tx(c).replace(/\n/g, " "));
  return {
    head: head ? cells(head) : [],
    rows: findAll(body, (n) => n.tag === "tr").map(cells)
  };
}
function svgOf(s) {
  return { aria_label: s.aria || null, texts: findAll(s, (n) => n.tag === "text").map((t) => tx(t)) };
}
const INLINE = new Set(["a", "b", "i", "span", "strong", "em", "u", "small", "code", "sup", "sub", "br"]);
const isInlineDeep = (n) => n.text !== undefined || (INLINE.has(n.tag) && n.children.every(isInlineDeep));
function blocks(nodes, out = []) {
  for (const n of nodes) {
    if (n.text !== undefined) { const t = clean(n.text); if (t) out.push({ text: t }); continue; }
    const t = n.tag;
    if (hasCls(n, "pagebreak") || hasCls(n, "rule") || t === "br") continue;
    if (hasCls(n, "eyebrow")) { out.push({ eyebrow: tx(n) }); continue; }
    if (/^h[1-4]$/.test(t)) { out.push({ [t]: tx(n) }); continue; }
    if (t === "p") { out.push({ p: tx(n) }); continue; }
    if (t === "ul" || t === "ol") { out.push({ [t]: findAll(n, (x) => x.tag === "li").map((li) => tx(li)) }); continue; }
    if (t === "table") { out.push({ table: tableOf(n) }); continue; }
    if (t === "svg") { out.push({ svg: svgOf(n) }); continue; }
    if (hasCls(n, "cm")) { out.push({ meta: { label: tx(findAll(n, (x) => hasCls(x, "l"))[0]), value: tx(findAll(n, (x) => hasCls(x, "v"))[0]) } }); continue; }
    if (hasCls(n, "card4")) {
      const kv = {};
      findAll(n, (x) => hasCls(x, "kv")).forEach((k) => {
        kv[tx(findAll(k, (x) => hasCls(x, "k"))[0])] = tx(findAll(k, (x) => hasCls(x, "v"))[0]);
      });
      out.push({ card: { title: tx(findAll(n, (x) => hasCls(x, "c4t"))[0]), ...kv } });
      continue;
    }
    if (hasCls(n, "mcol")) {
      const g = (c) => { const f = findAll(n, (x) => hasCls(x, c))[0]; return f ? tx(f) : null; };
      out.push({ month_tile: { number: g("circ"), label: g("mk"), title: g("mt"), bullets: (g("mb") || "").split("\n") } });
      continue;
    }
    if (hasCls(n, "bigstat")) { out.push({ bigstat: { value: tx(findAll(n, (x) => hasCls(x, "bs-val"))[0]), sub: tx(findAll(n, (x) => hasCls(x, "bs-sub"))[0]) } }); continue; }
    if (hasCls(n, "cost")) {
      const g = (c) => { const f = findAll(n, (x) => hasCls(x, c))[0]; return f ? tx(f) : null; };
      out.push({ cost: { number: g("cnum"), title: g("ctitle"), lines: findAll(n, (x) => hasCls(x, "cline")).map(tx) } });
      continue;
    }
    if (hasCls(n, "mquote")) { out.push({ quote: tx(n) }); continue; }
    if (hasCls(n, "note")) { out.push({ note: tx(n) }); continue; }
    if (n.children.length && n.children.every(isInlineDeep)) { const t = tx(n); if (t) out.push({ text: t }); continue; }
    blocks(n.children, out);
  }
  return out;
}
/** html -> { cover: [blocks], sections: [{eyebrow, heading, blocks}] } */
function docOf(html) {
  const flat = blocks(parseHtml(html).children);
  const cover = []; const sections = []; let cur = null;
  for (const b of flat) {
    if (b.eyebrow) { cur = { eyebrow: b.eyebrow, heading: null, blocks: [] }; sections.push(cur); continue; }
    if (!cur) { cover.push(b); continue; }
    if (b.h2 && cur.heading === null && cur.blocks.length === 0) { cur.heading = b.h2; continue; }
    cur.blocks.push(b);
  }
  // the closing "NEXT STEPS" page is printed after the last section; keep it apart
  const last = sections[sections.length - 1];
  let closing = [];
  if (last) {
    const k = last.blocks.findIndex((b) => b.text === "fundhub.");
    if (k >= 0) { closing = last.blocks.slice(k); last.blocks = last.blocks.slice(0, k); }
  }
  return { cover, sections, closing };
}
const sec = (doc, startsWith) => {
  const s = doc.sections.find((x) => x.eyebrow.startsWith(startsWith));
  if (!s) throw new Error(`section not found: ${startsWith}`);
  return s;
};
const coverMeta = (doc) => Object.fromEntries(doc.cover.filter((b) => b.meta).map((b) => [b.meta.label, b.meta.value]));
const coverText = (doc) => doc.cover.filter((b) => b.text || b.h1).map((b) => b.text || b.h1);
const sectionIndex = (doc) => doc.sections.map((s) => ({ eyebrow: s.eyebrow, heading: s.heading }));

/** keep blocks of a section between two h3 headings (start inclusive, stop exclusive) */
function sliceByH3(section, startH3, stopH3) {
  const b = section.blocks;
  const i = b.findIndex((x) => x.h3 === startH3);
  if (i < 0) throw new Error(`h3 not found: ${startH3}`);
  let j = stopH3 ? b.findIndex((x, k) => k > i && x.h3 === stopH3) : b.length;
  if (j < 0) j = b.length;
  return b.slice(i, j);
}

/* ── pdf → paragraphs (for the vendor letter writer, which only emits a PDF) ── */
async function pdfParagraphs(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const lines = []; // {page, y, text, font}
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const byY = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] * 2) / 2;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: it.transform[4], w: it.width, s: it.str, font: it.fontName });
    }
    [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([y, items]) => {
      items.sort((a, b) => a.x - b.x);
      let text = "";
      items.forEach((it, i) => {
        if (i > 0) { const prev = items[i - 1]; if (it.x - (prev.x + prev.w) > 1.2 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += " "; }
        text += it.s;
      });
      lines.push({ page: p, y, text: text.replace(/\s+/g, " ").trim(), font: items.reduce((a, b) => (b.s.length > a.s.length ? b : a)).font });
    });
  }
  const gaps = [];
  for (let i = 1; i < lines.length; i++) if (lines[i].page === lines[i - 1].page) gaps.push(Math.round((lines[i - 1].y - lines[i].y) * 2) / 2);
  const freq = new Map(); gaps.forEach((g) => freq.set(g, (freq.get(g) || 0) + 1));
  const body = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const paras = []; let cur = [];
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    const samePage = prev && prev.page === l.page;
    const gap = samePage ? prev.y - l.y : 0;
    const fontChange = prev && prev.font !== l.font;
    if (cur.length && ((samePage && gap > body * 1.35) || fontChange)) { paras.push(cur.join(" ")); cur = []; }
    cur.push(l.text);
  });
  if (cur.length) paras.push(cur.join(" "));
  // the numbered REQUESTED ACTIONS list wraps into one paragraph: split it back into its numbered items
  const split = paras.flatMap((t) => (/^1 [A-Z]/.test(t) ? t.split(/\s(?=\d [A-Z])/) : [t]));
  return { pages: doc.numPages, body_line_gap: body, paragraphs: split };
}

const firstLine = (t) => String(t || "").split("\n").find((l) => l.trim())?.trim() || "";

/* ═══════════════ RUN THE REAL ENGINE ═══════════════ */
const commands = [];
const log = {};

// A. sim file (clean) -> funding pack (4 HTML deliverables + summary)
const engineSim = runTierEngineFromCrsResult(sim, { submittedName: personal.name, submittedAddress: personal.address });
const packSim = await buildLetterPack({ crsResult: engineSim, personal, pack: "funding", storedCrs: sim, business: null });
const packSimRepair = await buildLetterPack({ crsResult: engineSim, personal, pack: "repair", storedCrs: sim, business: null });
const simViolations = violationsByBureauFromMergedCrs(sim);
log.sim = {
  engine_outcome: engineSim.outcome,
  funding_pack_files: packSim.files.map((f) => f.filename),
  funding_pack_reason: packSim.reason, letterSkip: packSim.letterSkip, deliverableSkip: packSim.deliverableSkip,
  repair_pack_files: packSimRepair.files.map((f) => f.filename), repair_pack_reason: packSimRepair.reason, repair_complaintSkip: packSimRepair.complaintSkip,
  metro2_violations_by_bureau: simViolations,
  derogatory_tradelines: (engineSim.normalized?.tradelines || []).filter((t) => t.isDerogatory).length
};
const htmlOf = (pack, name) => {
  const f = pack.files.find((x) => x.filename === name);
  if (!f) throw new Error(`pack has no ${name}`);
  return f.content.toString("utf8");
};
const simSnap = docOf(htmlOf(packSim, "funding_snapshot.html"));
const simCA = docOf(htmlOf(packSim, "credit_analysis_report.html"));
const simRoad = docOf(htmlOf(packSim, "optimization_roadmap.html"));

// B. vendor sandbox -> same funding pack (negatives + vendor Round 1 letters) with the sim consumer
const engineSb = runTierEngineFromCrsResult(sandbox, { submittedName: personal.name, submittedAddress: personal.address });
const packSb = await buildLetterPack({ crsResult: engineSb, personal, pack: "funding", storedCrs: sandbox, business: null });
const sbCA = docOf(htmlOf(packSb, "credit_analysis_report.html"));
const sbRoad = docOf(htmlOf(packSb, "optimization_roadmap.html"));
log.sandbox = {
  engine_outcome: engineSb.outcome, identityGate: engineSb.identityGate,
  funding_pack_files: packSb.files.map((f) => f.filename),
  letterSkip: packSb.letterSkip
};

// C. the in-app Metro 2 "Dispute Letter Pack" builder (ds-02 path), same sandbox accounts + sim consumer
const sbViolations = violationsByBureauFromMergedCrs(sandbox);
const diy = await buildDiyPackage({ violationsByBureau: sbViolations, identity, seed: "w1-roadmap-samples-2026-10-02", furnishers: collectorsFromViolations(sbViolations) });
if (!diy.ok) throw new Error(`DIY package refused: ${diy.reason}`);
log.diy = {
  ok: diy.ok, letterCount: diy.letterCount,
  violation_counts_by_bureau: Object.fromEntries(Object.entries(sbViolations).map(([k, v]) => [k, v.length])),
  files: diy.files.map((f) => f.path)
};
const diyFile = (p) => {
  const f = diy.files.find((x) => x.path === p);
  if (!f) throw new Error(`DIY pack has no ${p}`);
  return f;
};

/* ═══════════════ 1. QUALIFICATION ═══════════════ */
const numbers = sec(simSnap, "01 /");
const numbersTable = numbers.blocks.find((b) => b.table).table;
const preRow = numbersTable.rows.find((r) => r[0] === "Pre-Approval");
const gapRow = numbersTable.rows.find((r) => r[0] === "Funding Gap");
const qualification = {
  source: "SIM FILE (clean) -> engine -> funding pack -> funding_snapshot.html",
  document: {
    engine_doc_key: "funding_snapshot", file: "funding_snapshot.html",
    printed_title: simSnap.cover.find((b) => b.h1)?.h1 || coverText(simSnap)[3],
    cover_lines: coverText(simSnap),
    cover_meta: coverMeta(simSnap),
    note: "This is the document the sales page calls 'How Much You Qualify For'. The engine prints it as 'Capital Readiness Snapshot' (kicker 'FUNDING SNAPSHOT')."
  },
  current_qualification_amount: preRow[1],
  optimized_qualification_amount: preRow[2],
  gap_line: gapRow[2],
  engine_fields: {
    current_totalCombined: engineSim.preapprovals.totalCombined,
    optimized_totalCombined: engineSim.projectedPreapproval.totalCombined,
    current_personalCard_final: engineSim.preapprovals.personalCard.final,
    current_personalLoan_final: engineSim.preapprovals.personalLoan.final,
    optimized_personalCard_final: engineSim.projectedPreapproval.personalCard.final,
    optimized_personalLoan_final: engineSim.projectedPreapproval.personalLoan.final,
    business_final: engineSim.preapprovals.business.final,
    confidenceBand: engineSim.preapprovals.confidenceBand,
    per_bureau_scores: engineSim.consumerSignals.scores.perBureau,
    median_score: engineSim.consumerSignals.scores.median,
    decision_label: engineSim.decision_label
  },
  numbers_section: { eyebrow: numbers.eyebrow, heading: numbers.heading, blocks: numbers.blocks },
  breakdown_section: (({ eyebrow, heading, blocks: b }) => ({ eyebrow, heading, blocks: b }))(sec(simSnap, "02 /")),
  costing_you_section: (({ eyebrow, heading, blocks: b }) => ({ eyebrow, heading, blocks: b }))(sec(simSnap, "03 /")),
  after_optimization_section: (({ eyebrow, heading, blocks: b }) => ({ eyebrow, heading, blocks: b }))(sec(simSnap, "05 /")),
  next_step_section: (({ eyebrow, heading, blocks: b }) => ({ eyebrow, heading, blocks: b }))(sec(simSnap, "06 /")),
  all_sections: sectionIndex(simSnap)
};

/* ═══════════════ 2. CREDIT ANALYSIS ═══════════════ */
const slice = (s) => ({ eyebrow: s.eyebrow, heading: s.heading, blocks: s.blocks });
const negSb = sec(sbCA, "05 /");
const negTable = negSb.blocks.find((b) => b.table).table;
const negLines = negSb.blocks.filter((b) => b.h3 || b.p || b.text).map((b) => b.h3 || b.p || b.text);
const credit_analysis = {
  source: "SIM FILE (clean) -> engine -> funding pack -> credit_analysis_report.html; the negative-items piece is from the vendor SANDBOX file because the sim file has zero negative items",
  document: {
    engine_doc_key: "credit_analysis", file: "credit_analysis_report.html",
    cover_lines: coverText(simCA), cover_meta: coverMeta(simCA),
    printed_title: "Financial Profile Assessment (kicker 'CREDIT ANALYSIS REPORT')"
  },
  opening_lines: simCA.cover.filter((b) => b.p).map((b) => b.p),
  all_sections: sectionIndex(simCA),
  from_sim_file: {
    note: "The sim file reports 0 negative items on all three bureaus (engine bureauNegatives all clean), so the 'costly items' on this file are the three revolving cards below.",
    bureau_health_summary: slice(sec(simCA, "01 /")),
    score_breakdown: slice(sec(simCA, "02 /")),
    utilization_costly_items: slice(sec(simCA, "03 /")),
    negatives_section_as_printed: slice(sec(simCA, "05 /")),
    bottom_line: slice(sec(simCA, "08 /"))
  },
  from_sandbox_file_with_sim_consumer: {
    note: "Vendor sandbox (tu/exp/efx.json) run through the same engine and same builder, consumer name/address set to the sim consumer. The engine's identity gate flags the sandbox's own name/address against the sim consumer, so this run's printed outcome is MANUAL_REVIEW and its pre-approval prints $0; use ONLY the bureau summary and negative items from it.",
    printed_outcome: coverMeta(sbCA).OUTCOME,
    bureau_health_summary: slice(sec(sbCA, "01 /")),
    negative_items_section_heading: { eyebrow: negSb.eyebrow, heading: negSb.heading },
    negative_items_table_head: negTable.head,
    first_four_negative_items: negTable.rows.slice(0, 4),
    all_negative_item_rows: negTable.rows,
    negative_items_lines_as_printed: negLines
  }
};

/* ═══════════════ 3. ROADMAP ═══════════════ */
const road01 = sec(simRoad, "01 /");
const tiles = road01.blocks.filter((b) => b.month_tile).map((b) => b.month_tile);
const roadM1 = sec(simRoad, "02 /");
const roadM23 = sec(simRoad, "03 /");
const roadChecklist = sec(simRoad, "08 /");
const checklistFor = (n) => {
  const i = roadChecklist.blocks.findIndex((b) => b.h4 === `Month ${n}`);
  if (i < 0) throw new Error(`checklist month ${n} not found`);
  return roadChecklist.blocks[i + 1].ul;
};
const roadmap = {
  source: "SIM FILE (clean) -> engine -> funding pack -> optimization_roadmap.html",
  document: {
    engine_doc_key: "roadmap", file: "optimization_roadmap.html",
    cover_lines: coverText(simRoad), cover_meta: coverMeta(simRoad),
    printed_title: "6-Month Business Readiness Roadmap (kicker 'CREDIT OPTIMIZATION ROADMAP')"
  },
  intro_note: simRoad.cover.filter((b) => b.p).map((b) => b.p),
  total_months_in_plan: tiles.length,
  total_months_source: "count of the month tiles the engine prints in section 01 / PROJECTION; also the document title says 6-Month",
  month_tiles_all: tiles,
  projection: road01.blocks.find((b) => b.bigstat).bigstat,
  month_1: {
    section_eyebrow: roadM1.eyebrow, section_heading: roadM1.heading,
    section_blocks_exact: roadM1.blocks,
    checklist_items_exact: checklistFor(1)
  },
  month_2: {
    section_eyebrow: roadM23.eyebrow, section_heading: roadM23.heading,
    note: "The engine prints Months 2 and 3 in one section ('Months 2-3 - Results'). These blocks are only the Month 2 part, cut at the engine's own 'What to Expect in Month 3' heading.",
    blocks_exact: sliceByH3(roadM23, "What to Expect in Month 2", "What to Expect in Month 3"),
    checklist_items_exact: checklistFor(2)
  },
  alt_month_1_dispute_steps_from_sandbox_file: {
    note: "The sim file is clean, so its Month 1 Steps 2 and 3 read 'No Experian negatives are listed on this file.' / 'No Equifax negatives...'. Same engine and same builder on the vendor sandbox accounts (consumer name/address = sim consumer) fills those steps with real items. Only Steps 2 to 4 are taken from that run; its other numbers (pre-approval $0, outcome MANUAL_REVIEW) are NOT usable.",
    blocks_exact: sliceByH3(sec(sbRoad, "02 /"), "Step 2: Round 1 Dispute Letters - Experian First", "Step 5: Form Your LLC"),
    month_1_tile_bullets_same_in_both_runs: sbRoad.sections.length ? sec(sbRoad, "01 /").blocks.filter((b) => b.month_tile).map((b) => b.month_tile).slice(0, 1) : []
  },
  later_months: {
    titles_from_tiles: tiles.filter((t) => +t.number >= 3).map((t) => ({ number: t.number, label: t.label, title: t.title, tile_bullets: t.bullets })),
    section_headings_as_printed: simRoad.sections.filter((s) => /^0[3-6] \/ MONTH/.test(s.eyebrow)).map((s) => ({ eyebrow: s.eyebrow, heading: s.heading })),
    note: "Titles only, as asked. Section 03 prints 'Months 2-3 - Results', then 04 'Month 4 - Final Push', 05 'Month 5 - Business Milestone', 06 'Month 6 - The Reveal'."
  },
  all_sections: sectionIndex(simRoad)
};

/* ═══════════════ 4. DISPUTE ═══════════════ */
const vendorEx = packSb.files.find((f) => f.filename === "ex_round1.pdf");
if (!vendorEx) throw new Error("vendor ex_round1.pdf not produced");
const vendorLetter = await pdfParagraphs(vendorEx.content);
const diyEx = diyFile("03-round-1/ex-metro2.pdf");
const titleOfText = (f) => firstLine(f.text);
const letterTypesAll = Object.values(LETTER_TYPES).map((k) => ({ type: k, ...LETTER_META[k] }));
const dispute = {
  source: "VENDOR SANDBOX accounts + SIM consumer name/address. The SIM FILE cannot produce a dispute letter: all 4 of its accounts are current with 0 derogatory items, so the engine writes none (see no_letters_from_sim_file).",
  no_letters_from_sim_file: {
    funding_pack_files: log.sim.funding_pack_files,
    funding_pack_letterSkip: log.sim.letterSkip,
    repair_pack_files: log.sim.repair_pack_files,
    repair_pack_reason: log.sim.repair_pack_reason,
    repair_pack_complaintSkip: log.sim.repair_complaintSkip,
    metro2_violations_by_bureau: log.sim.metro2_violations_by_bureau,
    derogatory_tradelines_in_sim_file: log.sim.derogatory_tradelines
  },
  consumer_on_letter: { name: simName, address: "100 Test Ave, Denton, TX 76205" },
  letter: {
    which: "Round 1 dispute to Experian, one account, three dispute items. Written by the vendor letter writer inside buildLetterPack (the same call the app makes), funding pack, file ex_round1.pdf.",
    file: "ex_round1.pdf",
    date_printed_on_letter_note: "The letter writer stamps the day it is run (2026-10-02). The sim pull date is 2026-09-04.",
    pages: vendorLetter.pages,
    paragraphs_exact: vendorLetter.paragraphs,
    full_text: vendorLetter.paragraphs.join("\n\n")
  },
  alt_letter_in_app_dispute_pack: {
    which: "Round 1 Experian Metro 2 dispute from the in-app Dispute Letter Pack builder (buildDiyPackage, the ds-02 path). Same sandbox accounts, same sim consumer. It lists every stale-date item the Metro 2 checks fire on, so it is long and repetitive; the vendor letter above is the cleaner sample.",
    file: "03-round-1/ex-metro2.pdf",
    full_text: diyEx.text
  },
  rounds_1_to_6: LADDER_ROUNDS.map((r) => roundLadderEntry(r)),
  rounds_source: "src/metro2/letters/catalog.mjs roundLadderEntry(). R6 reuses the Round 3 final notice (catalog.mjs says so; no separate letter type exists).",
  escalation_complaint_letter_types: ["cfpb_complaint", "state_ag_complaint"].map((k) => ({ type: k, ...LETTER_META[k] })),
  all_letter_types_in_catalog: letterTypesAll,
  pack_files_as_generated: {
    in_app_dispute_pack_files: diy.files.map((f) => ({
      path: f.path,
      kind: f.pdf ? "pdf" : "text",
      heading_first_line: f.text ? firstLine(f.text) : null
    })),
    funding_pack_letters_vendor_writer: packSb.files.filter((f) => /\.pdf$/.test(f.filename) && f.type).map((f) => ({ file: f.filename, type: f.type, bureau: f.bureau || null })),
    note_funding_pack: "The vendor writer only emits Round 1 (accounts with no recorded bureau answer are all Round 1) plus inquiry-removal and personal-information letters. Rounds 2 and 3 and the complaints exist only in the in-app pack above."
  },
  complaint_cover_sheet_exact: diyFile("06-complaints-CONDITIONAL/COVER.txt").text,
  complaint_titles_as_printed: {
    cfpb: titleOfText(diyFile("06-complaints-CONDITIONAL/cfpb-complaint.pdf")),
    state_ag: titleOfText(diyFile("06-complaints-CONDITIONAL/state-ag-complaint.pdf"))
  },
  start_here_exact: diyFile("01-START-HERE-instructions.pdf.txt").text,
  decision_tree_exact: diyFile("02-decision-tree.pdf.txt").text,
  round_tracker_exact: diyFile("08-round-tracker.pdf.txt").text,
  round_2_cover_sheet_exact: diyFile("04-round-2-CONDITIONAL/COVER-EX.txt").text
};

/* ═══════════════ 5. DUPLICATION ═══════════════ */
const duplication = {
  missing: "The engine has no Business Duplication Map. No code in src/, vendor/, scripts/, db/ or docs/ generates it: the only matches are sales-page HTML, ClickFunnels snapshots, the tracking allow-list ('business_duplication_map' in src/funnel/track.mjs), and docs that say it is promised on the page but not built (docs/finance/capital-blueprint-next-2026-09-29.md: 'Promised on sales page', 'Not listed in UWIQ_DELIVERABLES_CONTENTS'). It is not one of the 4 HTML documents the engine renders (credit_analysis, funding_snapshot, lender_match, roadmap), and not in src/config/offers.mjs UWIQ_DELIVERABLES_CONTENTS. The 'Rivera Supply LLC' sample on the page was hand-written.",
  sections_titles: { missing: "No Business Duplication Map is generated anywhere, so it has no section titles to list." },
  strategic_section_exact: { missing: "No Business Duplication Map is generated anywhere, so there is no engine wording to copy." },
  nearest_real_engine_content_not_the_map: {
    warning: "These are real app/engine outputs about companies, NOT sections of a Business Duplication Map. Listed only so you can see what is real.",
    funding_walk_steps_src_underwrite_funding_sequence: FUNDING_SEQUENCE_STEPS.map((s) => ({ position: s.position, title: s.title, summary: s.summary })),
    engine_business_age_multiplier_vendor_estimate_preapprovals: {
      rule_as_coded: "getBusinessAgeMultiplier(ageMonths): null -> 0, under 12 -> 0.5, under 24 -> 1.0, otherwise 2.0",
      measured: [6, 12, 18, 24, 30].map((m) => ({ age_months: m, multiplier: estimate.getBusinessAgeMultiplier(m) })),
      applies_to: "the business pre-approval slice only, as a multiple of the primary card funding (src/underwrite/business-funding.mjs header)"
    },
    roadmap_month_5_business_section_exact: sec(simRoad, "05 /").blocks,
    simulated_file_business_state: {
      engine_business_summary: engineSim.business_summary,
      businessSignals: engineSim.businessSignals,
      funding_snapshot_business_accounts_line: "No business entity on file. You are leaving a full suite of business funding off the table. We cover how to fix this below."
    }
  }
};

/* ═══════════════ WRITE ═══════════════ */
const out = {
  _meta: {
    task: "W1 — roadmap sample content from the real UnderwriteIQ engine",
    generated_on: "2026-10-02",
    script: "scripts/tmp/w1-roadmap-samples-2026-10-02.mjs (scratch, not committed)",
    command: "env -u ANTHROPIC_BASE_URL node scripts/tmp/w1-roadmap-samples-2026-10-02.mjs",
    engine_calls: [
      "runTierEngineFromCrsResult(sim.result | sandbox) -> vendor/underwriteiq-full/api/lite/crs/engine.js runCRSEngine",
      "buildLetterPack({ pack: 'funding' }) -> src/deliverables (4 HTML docs) + vendor letter-generator",
      "buildDiyPackage({ violationsByBureau from src/metro2 }) -> in-app Dispute Letter Pack"
    ],
    inputs: {
      sim_file: SIM_PATH,
      sandbox_files: ["vendor/underwriteiq-full/api/lite/crs/sandbox/tu.json", "vendor/underwriteiq-full/api/lite/crs/sandbox/exp.json", "vendor/underwriteiq-full/api/lite/crs/sandbox/efx.json"],
      sim_file_flag: { simulated: sim.simulated, notice: sim.simulatedNotice, scores: sim.scores, tradelines: sim.tradelines.length, derogatory: 0 }
    },
    consumer_note: "Name comes from the sim file (crm_payload.contact.name). The sim file carries no address, so the address is the repo's own sim fixture (SIM_PERSONAL, scripts/black-reports/regen-w10-pack.mjs). The sim file's contact email is left out on purpose.",
    wording_note: "Every string below is engine output, copied as printed. The engine prints the company name as 'FundHub' in a few lines (for example 'at FundHub', 'your FundHub advisor') and 'fundhub confidential' on covers. Left exactly as the engine prints it.",
    run_log: log
  },
  consumer: {
    name: simName,
    name_source: "sim file result.crm_payload.contact.name",
    address: "100 Test Ave, Denton, TX 76205",
    address_source: "SIM_PERSONAL in scripts/black-reports/regen-w10-pack.mjs (repo sim fixture). The sim file has no address: creditFiles[].addresses is empty on EX, EQ and TU."
  },
  qualification,
  credit_analysis,
  roadmap,
  dispute,
  duplication
};

const outDir = join(ROOT, "ops/workflows/2026-10-02-roadmap-sample-content");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "w1-samples.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log("wrote", outPath);
console.log("qualification:", qualification.current_qualification_amount, "->", qualification.optimized_qualification_amount, "|", qualification.gap_line);
console.log("roadmap months:", roadmap.total_months_in_plan, "| month1 blocks:", roadmap.month_1.section_blocks_exact.length, "| month2 blocks:", roadmap.month_2.blocks_exact.length);
console.log("letter paragraphs:", vendorLetter.paragraphs.length, "| body gap:", vendorLetter.body_line_gap);
console.log("neg items:", negTable.rows.length, "| rounds:", out.dispute.rounds_1_to_6.map((r) => r.round + ":" + r.title).join("; "));
