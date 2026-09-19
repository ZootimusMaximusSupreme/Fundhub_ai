/* The public lending-climate lead magnet: api/public/climate-match.mjs plus the
 * page at public/climate/.
 *
 * Two things are being guarded here, and they are the two the offer brief bans
 * outright (docs/ads/climate-lead-magnet-offer-2026-09-18.md §7):
 *
 *   1. the count and the names come from the REAL matcher over REAL rows, and
 *   2. no approval odds, no percentage, no promised dollar amount ever reaches
 *      the visitor — not from the endpoint, not typed into the page.
 *
 * No database. The lender read is injected, exactly as matchLenders is pure.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import handler, {
  TEASER_LIMIT,
  UTM_KEYS,
  CLIMATE_SOURCE,
  parseClimateMatchBody,
  runClimateMatch,
  recordClimateLead
} from "../../api/public/climate-match.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIMATE_DIR = path.resolve(HERE, "../../public/climate");
const PAGE = fs.readFileSync(path.join(CLIMATE_DIR, "index.html"), "utf8");
const PAGE_JS = fs.readFileSync(path.join(CLIMATE_DIR, "climate.js"), "utf8");

/* A small stand-in book with the three shapes that matter: a national row, a
   row that names states, and a business-table row. Same public field set
   mapClimateLender() publishes, because that is what the handler is handed. */
const BOOK = [
  {
    id: "1", name: "American Express", product_name: "Business Gold",
    lender_table: "OnlineBizCC", eligible_states: "All States",
    logo_path: "/assets/lenders/amex.png", priority_tier: 1, bureaus_pulled: "EX", type: "lender"
  },
  {
    id: "2", name: "Desert Local Bank", product_name: null,
    lender_table: "InBranchPersonalCC", eligible_states: "AZ, NV",
    logo_path: null, priority_tier: 2, bureaus_pulled: "TU", type: "lender"
  },
  {
    id: "3", name: "Gulf Coast Credit Union", product_name: null,
    lender_table: "InBranchPersonalCC", eligible_states: "FL",
    logo_path: null, priority_tier: 2, bureaus_pulled: "EQ", type: "lender"
  },
  {
    id: "4", name: "Sunrise Business Bank", product_name: "Biz line",
    lender_table: "InBranchBizCC", eligible_states: "AZ",
    logo_path: null, priority_tier: 3, bureaus_pulled: "EX Biz", type: "lender"
  }
];

const pull = async () => ({ lenders: BOOK, stale: false });

function res() {
  const out = { code: null, body: null, headers: {} };
  return {
    out,
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
    end() { return this; }
  };
}

/* ─────────────────────────── reading the body ─────────────────────────── */

test("climate-match: the home state is required and junk is not invented into one", () => {
  assert.equal(parseClimateMatchBody(null).error, "invalid_json");
  assert.equal(parseClimateMatchBody({}).error, "home_state_required");
  assert.equal(parseClimateMatchBody({ home_state: "Arizona" }).error, "home_state_required");
  assert.equal(parseClimateMatchBody({ home_state: "az" }).homeState, "AZ");
});

test("climate-match: the same state twice is one lane, not two", () => {
  const p = parseClimateMatchBody({ home_state: "AZ", business_state: "az" });
  assert.equal(p.homeState, "AZ");
  assert.equal(p.businessState, null);
});

test("climate-match: an unanswered business question stays unknown, never false", () => {
  assert.equal(parseClimateMatchBody({ home_state: "AZ" }).hasBusiness, null);
  assert.equal(parseClimateMatchBody({ home_state: "AZ", has_business: "maybe" }).hasBusiness, null);
  assert.equal(parseClimateMatchBody({ home_state: "AZ", has_business: "yes" }).hasBusiness, true);
  assert.equal(parseClimateMatchBody({ home_state: "AZ", has_business: "no" }).hasBusiness, false);
});

test("climate-match: an unrecognised score band is dropped rather than stored as typed", () => {
  assert.equal(parseClimateMatchBody({ home_state: "AZ", score_band: "800ish" }).scoreBand, null);
  assert.equal(parseClimateMatchBody({ home_state: "AZ", score_band: "650-699" }).scoreBand, "650-699");
});

test("climate-match: the five ad tags survive the submit — this is the homepage bug not repeated", () => {
  const body = { home_state: "AZ" };
  for (const k of UTM_KEYS) body[k] = `v-${k}`;
  const p = parseClimateMatchBody(body);
  for (const k of UTM_KEYS) assert.equal(p.utm[k], `v-${k}`);
  assert.equal(UTM_KEYS.length, 5);
});

/* ───────────────────────────── the count ──────────────────────────────── */

test("climate-match: the count and the lanes come from the real matcher", async () => {
  const p = parseClimateMatchBody({ home_state: "AZ" });
  const d = await runClimateMatch(p, { pullCrmLenders: pull, db: {} });
  // Amex (national) + Desert Local (AZ) + Sunrise (AZ business) — not the FL row.
  assert.equal(d.count, 3);
  assert.equal(d.lanes.national, 1);
  assert.equal(d.lanes.home.state, "AZ");
  assert.equal(d.lanes.home.count, 2);
  assert.equal(d.book_size, BOOK.length);
  assert.ok(!d.teaser.some((t) => t.name === "Gulf Coast Credit Union"));
});

test("climate-match: a second state opens the second lane of local banks", async () => {
  const p = parseClimateMatchBody({ home_state: "AZ", business_state: "FL" });
  const d = await runClimateMatch(p, { pullCrmLenders: pull, db: {} });
  assert.equal(d.count, 4);
  assert.equal(d.lanes.business.state, "FL");
  assert.equal(d.lanes.business.count, 1);
});

test("climate-match: no business on file holds back the business cards and says so", async () => {
  const p = parseClimateMatchBody({ home_state: "AZ", has_business: "no" });
  const d = await runClimateMatch(p, { pullCrmLenders: pull, db: {} });
  /* AZ with three matches becomes one: both business-card rows in the book
     (Amex's OnlineBizCC and Sunrise's InBranchBizCC) are held back, leaving the
     personal-card row. The visitor is told that in words, not shown a quietly
     shorter list. */
  assert.equal(d.count, 1);
  assert.equal(d.teaser[0].name, "Desert Local Bank");
  assert.match(d.held_for_no_business, /no business on file/i);
});

test("climate-match: the teaser is capped and carries names only — no money, no odds", async () => {
  const many = [];
  for (let i = 0; i < 40; i++) {
    many.push({
      id: String(i), name: `Bank ${i}`, product_name: null, lender_table: "OnlineBizCC",
      eligible_states: "All States", logo_path: null, priority_tier: 1,
      bureaus_pulled: "EX", type: "lender",
      /* Staff-only money columns deliberately present on the input row: the
         point of this assertion is that they do NOT come out the other side. */
      typical_approval_range: "$25,000 - $75,000", max_known_loc: 150000, insider_tips: "call the branch"
    });
  }
  const p = parseClimateMatchBody({ home_state: "AZ" });
  const d = await runClimateMatch(p, { pullCrmLenders: async () => ({ lenders: many }), db: {} });
  assert.equal(d.count, 40);
  assert.equal(d.teaser.length, TEASER_LIMIT);
  assert.ok(TEASER_LIMIT >= 4 && TEASER_LIMIT <= 5, "the brief teases four to five names");
  for (const t of d.teaser) {
    assert.deepEqual(Object.keys(t).sort(), ["lane", "logo_path", "name", "product_name"]);
  }
  const json = JSON.stringify(d);
  assert.doesNotMatch(json, /approval_range|max_known_loc|insider_tips/);
  assert.doesNotMatch(json, /\$\s?\d/, "no dollar figure may reach the public page");
});

test("climate-match: the self-reported band does not silently move the count", async () => {
  const low = await runClimateMatch(
    parseClimateMatchBody({ home_state: "AZ", score_band: "500-579" }),
    { pullCrmLenders: pull, db: {} }
  );
  const high = await runClimateMatch(
    parseClimateMatchBody({ home_state: "AZ", score_band: "750+" }),
    { pullCrmLenders: pull, db: {} }
  );
  assert.equal(low.count, high.count);
  assert.equal(low.score_used, false, "the page must say the guess was not scored");
});

test("climate-match: an empty book answers zero and never a made-up number", async () => {
  const d = await runClimateMatch(
    parseClimateMatchBody({ home_state: "AZ" }),
    { pullCrmLenders: async () => ({ lenders: [], stale: true }), db: {} }
  );
  assert.equal(d.count, 0);
  assert.equal(d.teaser.length, 0);
  assert.equal(d.stale, true);
});

/* ───────────────────────────── the lead ───────────────────────────────── */

test("climate-match: the lead goes down the existing survey path, tagged as the climate page", async () => {
  const calls = [];
  const queries = [];
  const parsed = parseClimateMatchBody({
    home_state: "AZ", business_state: "FL", has_business: "yes", score_band: "650-699",
    name: "Sim Person", email: "E2E+Climate@example.com", phone: "6615551234",
    utm_source: "meta", utm_content: "43"
  });
  const out = await recordClimateLead(parsed, {
    db: { query: async (sql, params) => { queries.push([sql, params]); return { rows: [] }; } },
    runSurveySubmit: async (p) => { calls.push(p); return { ok: true, clientId: "client-1" }; }
  });
  assert.equal(out.filed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, CLIMATE_SOURCE);
  assert.equal(calls[0].answers.cf_svy_self_reported_fico, "650-699");
  assert.equal(calls[0].answers.cf_svy_has_business, "Yes");
  assert.equal(calls[0].email, "e2e+climate@example.com");
  // The two things the homepage survey drops are merged onto the client.
  const patch = JSON.parse(queries[0][1][1]);
  assert.equal(patch.home_state, "AZ");
  assert.equal(patch.business_state, "FL");
  assert.equal(patch.utm_source, "meta");
  assert.equal(patch.utm_content, "43");
});

test("climate-match: no contact details means no lead row, and still no throw", async () => {
  const out = await recordClimateLead(parseClimateMatchBody({ home_state: "AZ" }), {
    db: { query: async () => { throw new Error("must not be called"); } },
    runSurveySubmit: async () => { throw new Error("must not be called"); }
  });
  assert.equal(out.filed, false);
});

test("climate-match: a lead that cannot be filed still lets the visitor get their number", async () => {
  const out = await recordClimateLead(
    parseClimateMatchBody({ home_state: "AZ", name: "A B", email: "a@b.co" }),
    { db: { query: async () => ({ rows: [] }) }, runSurveySubmit: async () => { throw new Error("db down"); } }
  );
  assert.equal(out.filed, false);
});

/* ──────────────────────────── the endpoint ────────────────────────────── */

test("climate-match: GET answers 200 with the book size — the pulse can ping it", async () => {
  const r = res();
  await handler({ method: "GET" }, r);
  assert.equal(r.out.code, 200);
  assert.equal(r.out.body.ok, true);
  assert.equal(typeof r.out.body.book_size, "number");
  assert.equal(r.out.body.teaser_limit, TEASER_LIMIT);
  assert.ok(Array.isArray(r.out.body.score_bands));
});

test("climate-match: a bad body answers 400 and writes nothing", async () => {
  const r = res();
  await handler({ method: "POST", body: { home_state: "" } }, r);
  assert.equal(r.out.code, 400);
  assert.equal(r.out.body.error, "home_state_required");
});

test("climate-match: PUT is refused", async () => {
  const r = res();
  await handler({ method: "PUT", body: {} }, r);
  assert.equal(r.out.code, 405);
});

/* ───────────────────────────── the page ───────────────────────────────── */

test("climate page: it exists and reads the three live endpoints", () => {
  assert.match(PAGE, /<title>[^<]*Lending Climate/i);
  assert.match(PAGE_JS, /\/api\/climate/);
  assert.match(PAGE_JS, /\/api\/public\/climate-match/);
  assert.match(PAGE_JS, /\/api\/public\/optimize/);
  assert.match(PAGE, /climate\.js/);
});

test("climate page: no approval odds, no promised amount, no guarantee", () => {
  const text = PAGE + PAGE_JS;
  const banned = [
    /\b\d{1,3}\s?%\s?(approval|approved|odds)/i,
    /approval\s+(odds|chance|probability)/i,
    /\bpre[- ]?approved\b/i,
    /\bguaranteed\s+funding\b/i,
    /\bno\s+denials\b/i,
    /we(?:'|’)?ll\s+get\s+you\s+funded/i,
    /\byou\s+(?:are|will\s+be)\s+approved\b/i,
    /\byour\s+score\s+will\s+go\s+up\b/i,
    /\b0%\s+interest\b/i,
    /up\s+to\s+\$[\d,]+/i
  ];
  for (const re of banned) {
    assert.doesNotMatch(text, re, `banned public claim matched ${re}`);
  }
});

test("climate page: the only price on it is the existing $32 assessment", () => {
  const prices = (PAGE.match(/\$[\d,]+/g) || []).filter((p) => p !== "$32");
  assert.deepEqual(prices, [], `unexpected prices on the public page: ${prices.join(", ")}`);
  assert.match(PAGE, /\$32/);
  assert.match(PAGE, /Business Financial Assessment/);
});

test("climate page: soft-pull wording is scoped to the paid assessment only", () => {
  assert.match(PAGE, /soft pull/i);
  // "does not affect your credit score" is allowed about the pull; it may never
  // be said about working with Fundhub generally.
  assert.doesNotMatch(PAGE, /working with us (?:never|does not) affect/i);
});

test("climate page: it mints no Commas product and names no catalog title of its own", () => {
  const text = PAGE + PAGE_JS;
  assert.doesNotMatch(text, /products\/create/);
  assert.doesNotMatch(text, /public-api/);
});

test("climate page: every climate band carries its word, never colour alone", () => {
  for (const word of ["Very favorable", "Favorable", "Neutral", "Tight", "Very tight"]) {
    assert.ok(PAGE_JS.includes(word), `the legend must name the band "${word}" in words`);
  }
  assert.doesNotMatch(PAGE + PAGE_JS, /the (red|green) ones/i);
});

test("climate page: all four states are built — loading, empty, error, full", () => {
  assert.match(PAGE, /class="skel"/, "loading: a skeleton in the real layout");
  assert.match(PAGE, /Nothing picked yet/, "empty: says what will appear and what to do");
  assert.match(PAGE, /id="err"/, "error: a real message, in the visitor's words");
  assert.match(PAGE, /id="count"/, "full: the number");
  assert.doesNotMatch(PAGE_JS, /Math\.random/, "no sample rows, no invented figures");
});

test("climate page: the state colour is set as a style, not as an attribute that cannot paint", () => {
  /* The stylesheet gives every path a default grey fill, and a CSS declaration
     beats a presentation attribute. setAttribute("fill", …) therefore puts the
     right colour in the markup and paints nothing — measured on 2026-09-18,
     all 51 states grey. UI-STANDARDS §12.6: assert what paints. */
  assert.match(PAGE_JS, /\.style\.fill\s*=/, "the fill must be an inline style");
  assert.doesNotMatch(PAGE_JS, /setAttribute\(\s*["']fill["']/, "a fill attribute loses to the stylesheet");
  assert.match(PAGE, /svg\.usmap path\{fill:/, "the default grey fill is what the attribute would lose to");
});

test("climate page: the map geometry it draws is the file that ships beside it", () => {
  const paths = JSON.parse(fs.readFileSync(path.join(CLIMATE_DIR, "us-states-paths.json"), "utf8"));
  assert.equal(Object.keys(paths).length, 51);
  assert.match(PAGE_JS, /us-states-paths\.json/);
  assert.match(PAGE, /viewBox="0 0 959 593"/);
});
