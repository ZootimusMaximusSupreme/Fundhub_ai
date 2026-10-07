/* Yesdoor DEMO DATA. Everything in this file is made up ("Sample data").
   It is used only when the real API cannot be reached (see api.js). It answers the
   same routes the real API does, with the same field names, so the pages do not
   know the difference.

   Every sample renter is ONE consistent person (.claude/rules/sample-clients-consistent.md):
   score, collections, evictions, background flags and income agree with each other,
   and the risk tier, lane and approved / likely / no answers are computed here by a
   small copy of the matcher rules (docs/specs/yesdoor-mvp-build-spec.md section 4,
   src/yesdoor/match/*.mjs on branch yesdoor/b3-matcher). Nothing is hand-edited to look
   better. Building users never receive a credit field. */
(function () {
  "use strict";
  var YD = (window.YD = window.YD || {});
  var DAY = 86400000;
  var NOW = Date.now();
  var DB_KEY = "yd-demo-db-v2";
  var SESSION_KEY = "yd-demo-sessions";

  function iso(ms) { return new Date(ms).toISOString(); }
  function ymd(ms) { return iso(ms).slice(0, 10); }
  function daysAgo(n) { return NOW - n * DAY; }
  function cents(d) { return Math.round(d * 100); }
  function dollars(c) { return "$" + Math.round(c / 100).toLocaleString("en-US"); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function plural(n, a, b) { return n + " " + (n === 1 ? a : b); }
  function words(c) { return String(c).replace(/_/g, " "); }

  /* =========================================================== matcher copy */
  var D = { scoreMargin: 20, incomeMargin: 0.10, defaultMultiple: 3, staleDays: 30, tiers: { A: { min: 700, years: 7 }, B: { min: 640, years: 5 }, C: { min: 580 } } };

  function evictionsInside(count, last, years) {
    if (count === null || count === undefined) return null;
    if (count === 0) return 0;
    if (years === null || years === undefined) return count;
    if (!last) return count;
    var cut = new Date(NOW); cut.setUTCFullYear(cut.getUTCFullYear() - years);
    return new Date(last + "T12:00:00Z") > cut ? count : 0;
  }
  function riskTier(file, verified) {
    var score = file.credit_score; var count = file.eviction_count;
    var within = function (y) { return evictionsInside(count, file.eviction_last_at, y); };
    if (score >= D.tiers.A.min && within(D.tiers.A.years) === 0 && file.criminal_flags.length === 0 && verified) return "A";
    if (score >= D.tiers.B.min && within(D.tiers.B.years) === 0) return "B";
    if (score >= D.tiers.C.min && count <= 1) return "C";
    if (count === 1 && within(D.tiers.B.years) === 0) return "C";
    return "D";
  }
  function laneOf(tier) { return tier === "A" || tier === "B" ? "verified" : "second_chance"; }
  var SEV = { pass: 0, close: 1, unknown: 2, fail: 3 };
  function worst(list) { var w = "pass"; list.forEach(function (r) { if (SEV[r] > SEV[w]) w = r; }); return w; }
  function entry(rule, result, reason) { return { rule: rule, result: result, reason: reason }; }

  function needIncome(rent, mult, margin) { return Math.ceil(rent * mult * (1 + margin) - 1e-6); }

  function matchBuilding(file, income, rules, rentCents) {
    var verified = !!(income && income.verified);
    var tier = riskTier(file, verified);
    var reasons = [];
    // score
    var s = file.credit_score;
    if (s >= rules.minScore + D.scoreMargin) reasons.push(entry("score", "pass", "Credit score " + s + " clears the building's minimum of " + rules.minScore + " with room to spare."));
    else if (s >= rules.minScore) reasons.push(entry("score", "close", "Credit score " + s + " meets the building's minimum of " + rules.minScore + ", but not with room to spare."));
    else reasons.push(entry("score", "fail", "Credit score " + s + " is below the building's minimum of " + rules.minScore + "."));
    // income
    if (!verified) reasons.push(entry("income", "unknown", "Income has not been verified yet."));
    else {
      var mult = rules.incomeMultiple || D.defaultMultiple;
      var need = needIncome(rentCents, mult, 0);
      var ok = needIncome(rentCents, mult, D.incomeMargin);
      var m = income.monthly;
      if (m >= ok) reasons.push(entry("income", "pass", "Verified income of " + dollars(m) + " a month clears " + mult + " times the rent (" + dollars(need) + ") with room to spare."));
      else if (m >= need) reasons.push(entry("income", "close", "Verified income of " + dollars(m) + " a month meets " + mult + " times the rent (" + dollars(need) + "), but not with room to spare."));
      else reasons.push(entry("income", "fail", "Verified income of " + dollars(m) + " a month is below " + mult + " times the rent (" + dollars(need) + ") for this rent."));
    }
    // evictions
    if (file.eviction_count === 0) reasons.push(entry("evictions", "pass", "No evictions on file."));
    else {
      var inside = evictionsInside(file.eviction_count, file.eviction_last_at, rules.evictionLookbackYears);
      var win = rules.evictionLookbackYears ? "in the last " + rules.evictionLookbackYears + " years" : "ever";
      if (inside === 0) reasons.push(entry("evictions", "pass", plural(file.eviction_count, "eviction", "evictions") + " on file, but none " + win + ", which is the only window this building looks at."));
      else if (inside > rules.maxEvictions) reasons.push(entry("evictions", "fail", plural(inside, "eviction", "evictions") + " " + win + "; this building allows " + rules.maxEvictions + "."));
      else reasons.push(entry("evictions", "pass", plural(inside, "eviction", "evictions") + " " + win + "; this building allows " + rules.maxEvictions + "."));
    }
    // criminal
    if (!file.criminal_flags.length) reasons.push(entry("criminal", "pass", "No criminal records on file."));
    else {
      var parts = file.criminal_flags.map(function (f) {
        var v = rules.criminalPolicy[f.category]; var label = words(f.category);
        if (v === undefined) return { r: "unknown", t: "This building has not told us how it treats " + label + " records." };
        if (v === "never") return { r: "fail", t: "This building does not accept " + label + " records." };
        if (v === "case_by_case") return { r: "close", t: "This building reviews " + label + " records one by one." };
        return f.years_ago < v
          ? { r: "fail", t: "A " + label + " record from " + f.years_ago + " years ago is inside this building's " + v + "-year window." }
          : { r: "pass", t: "A " + label + " record from " + f.years_ago + " years ago is older than this building's " + v + "-year window." };
      });
      var wr = worst(parts.map(function (p) { return p.r; }));
      reasons.push(entry("criminal", wr, parts.filter(function (p) { return p.r === wr; }).map(function (p) { return p.t; }).join(" ")));
    }
    // freshness
    var days = Math.floor((NOW - new Date(rules.confirmedAt).getTime()) / DAY);
    var stale = days > D.staleDays;
    reasons.push(stale
      ? entry("rules_freshness", "close", "This building last confirmed its rules on " + String(rules.confirmedAt).slice(0, 10) + ", more than " + D.staleDays + " days ago, so the best answer is likely.")
      : entry("rules_freshness", "pass", "This building confirmed its rules on " + String(rules.confirmedAt).slice(0, 10) + "."));

    var w = worst(reasons.map(function (r) { return r.result; }));
    var result = w === "fail" ? "no" : reasons.every(function (r) { return r.result === "pass"; }) ? "approved" : "likely";
    var maxRent = verified ? Math.floor(income.monthly / (rules.incomeMultiple || D.defaultMultiple)) : null;
    return { result: result, reasons: reasons, tier: tier, lane: laneOf(tier), maxRentCents: maxRent, rulesStale: stale };
  }

  /* =========================================================== seed */
  var CRIM = function (fp, mn, fv) { return { felony_violent: fv || "never", felony_property: fp, misdemeanor_nonviolent: mn }; };
  var HOURS_STD = { mon: ["09:00", "17:00"], tue: ["09:00", "17:00"], wed: ["09:00", "17:00"], thu: ["09:00", "17:00"], fri: ["09:00", "17:00"], sat: ["10:00", "16:00"] };
  var HOURS_LONG = { mon: ["09:00", "19:00"], tue: ["09:00", "19:00"], wed: ["09:00", "19:00"], thu: ["09:00", "19:00"], fri: ["09:00", "18:00"], sat: ["10:00", "16:00"], sun: ["12:00", "16:00"] };

  // id, name, company, city, address, zip, units, secondChance, appFee, appFeeWaived, status, software, connection, hours, feePct, payerScore, mismatches, rules
  var BUILDINGS = [
    ["bld-pv", "Palo Verde Flats", "co-1", "Tempe", "1910 E Sample Ave", "85281", 180, false, 5500, true, "live", "yardi", "feed", HOURS_LONG, 100, 96, 0,
      { minScore: 640, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 5, criminalPolicy: CRIM(10, 5), acceptsSecondChance: false, confirmedDaysAgo: 6 }],
    ["bld-mc", "Mesquite Court", "co-2", "Mesa", "340 N Example Dr", "85201", 96, true, 5000, false, "live", "other", "csv", HOURS_STD, 100, 88, 1,
      { minScore: 600, incomeMultiple: 2.5, maxEvictions: 1, evictionLookbackYears: 3, criminalPolicy: CRIM("case_by_case", 3), acceptsSecondChance: true, confirmedDaysAgo: 3 }],
    ["bld-ol", "Ocotillo Lofts", "co-3", "Phoenix", "2020 E Sample Rd", "85004", 140, false, 6000, true, "live", "entrata", "entrata_api", HOURS_STD, 80, 92, 0,
      { minScore: 680, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 7, criminalPolicy: CRIM("never", 7), acceptsSecondChance: false, confirmedDaysAgo: 10 }],
    ["bld-cw", "Copper Wash Apartments", "co-4", "Chandler", "880 W Example Ct", "85224", 220, false, 5500, false, "live", "realpage", "feed", HOURS_STD, 100, 84, 0,
      { minScore: 620, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 5, criminalPolicy: CRIM(7, 3), acceptsSecondChance: false, confirmedDaysAgo: 12 }],
    ["bld-st", "Sunrise Terrace", "co-3", "Scottsdale", "7700 N Sample Blvd", "85251", 260, false, 6500, true, "live", "entrata", "entrata_api", HOURS_LONG, 80, 98, 0,
      { minScore: 700, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 7, criminalPolicy: CRIM("never", 10), acceptsSecondChance: false, confirmedDaysAgo: 4 }],
    ["bld-ac", "Agave Commons", "co-1", "Tempe", "455 S Example Way", "85282", 120, true, 5000, false, "live", "other", "manual", HOURS_STD, 100, 79, 1,
      { minScore: 580, incomeMultiple: 2.5, maxEvictions: 1, evictionLookbackYears: 3, criminalPolicy: CRIM("case_by_case", 2, "case_by_case"), acceptsSecondChance: true, confirmedDaysAgo: 8 }],
    ["bld-dv", "Desert Bloom Villas", "co-2", "Mesa", "1250 E Sample Pkwy", "85210", 150, false, 5000, false, "live", "yardi", "csv", HOURS_STD, 100, 90, 0,
      { minScore: 640, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 5, criminalPolicy: CRIM(7, 5), acceptsSecondChance: false, confirmedDaysAgo: 15 }],
    ["bld-lh", "Lantern Hill Apartments", "co-5", "Phoenix", "3300 N Example St", "85008", 110, true, 4500, false, "live", "other", "csv", HOURS_STD, 100, 82, 2,
      { minScore: 600, incomeMultiple: 3, maxEvictions: 1, evictionLookbackYears: 3, criminalPolicy: CRIM(5, 2), acceptsSecondChance: true, confirmedDaysAgo: 2 }],
    ["bld-cp", "Cholla Park Residences", "co-4", "Chandler", "2100 S Sample Loop", "85225", 200, false, 5500, false, "live", "realpage", "feed", HOURS_STD, 100, 86, 0,
      { minScore: 660, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 5, criminalPolicy: CRIM(7, 5), acceptsSecondChance: false, confirmedDaysAgo: 20 }],
    ["bld-is", "Ironwood Station", "co-5", "Phoenix", "4100 E Example Rd", "85034", 90, true, 4500, false, "live", "other", "manual", HOURS_STD, 100, 75, 1,
      { minScore: 560, incomeMultiple: 2.5, maxEvictions: 2, evictionLookbackYears: 2, criminalPolicy: CRIM(3, 1, "case_by_case"), acceptsSecondChance: true, confirmedDaysAgo: 9 }],
    ["bld-wb", "Willow Bend Residences", "co-3", "Scottsdale", "9900 N Sample Rd", "85260", 240, false, 6500, true, "live", "entrata", "entrata_api", HOURS_LONG, 90, 94, 0,
      { minScore: 680, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 7, criminalPolicy: CRIM("never", 7), acceptsSecondChance: false, confirmedDaysAgo: 5 }],
    ["bld-mr", "Mirage Row", "co-1", "Tempe", "620 W Sample Ln", "85281", 130, false, 5500, false, "live", "yardi", "feed", HOURS_STD, 100, 81, 0,
      { minScore: 620, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 5, criminalPolicy: CRIM(7, 3), acceptsSecondChance: false, confirmedDaysAgo: 45 }],
    // Not matched or shown to renters: not signed yet, or paused.
    ["bld-x1", "Orchard Commons", "co-2", "Glendale", "15 W Example Ave", "85301", 160, false, 5000, false, "target", "yardi", "manual", HOURS_STD, 100, null, 0, null],
    ["bld-x2", "Palm Crest", "co-4", "Peoria", "9000 W Sample Dr", "85345", 210, false, 5500, false, "pitched", "realpage", "manual", HOURS_STD, 100, null, 0, null],
    ["bld-x3", "Vista Terrace", "co-5", "Gilbert", "700 E Example Blvd", "85234", 175, false, 5500, false, "agreement_sent", "entrata", "manual", HOURS_STD, 100, null, 0, null],
    ["bld-x4", "Dune Ridge", "co-1", "Phoenix", "5200 S Sample Ave", "85040", 100, false, 5000, false, "paused", "other", "csv", HOURS_STD, 100, 60, 3,
      { minScore: 640, incomeMultiple: 3, maxEvictions: 0, evictionLookbackYears: 5, criminalPolicy: CRIM(7, 5), acceptsSecondChance: false, confirmedDaysAgo: 21 }]
  ];

  var COMPANIES = [
    { id: "co-1", name: "Desert Living Group", tier: 2, hqState: "AZ", software: "yardi", status: "live" },
    { id: "co-2", name: "Cactus Property Partners", tier: 3, hqState: "AZ", software: "other", status: "live" },
    { id: "co-3", name: "Sonoran Residential Holdings", tier: 1, hqState: "AZ", software: "entrata", status: "live" },
    { id: "co-4", name: "Valley Verde Management", tier: 2, hqState: "AZ", software: "realpage", status: "live" },
    { id: "co-5", name: "Copperline Housing", tier: 3, hqState: "AZ", software: "other", status: "signed" }
  ];

  // building index, unit, beds, baths, sqft, rent $, special
  var LISTINGS = [
    [0, "214", 1, 1, 690, 1395, "Application fee waived for Yesdoor Verified renters"],
    [0, "312", 2, 2, 1020, 1795, "First month free on a 13-month lease"],
    [1, "105", 1, 1, 640, 1215, "$250 off move-in with a tour this week"],
    [1, "221", 2, 1, 880, 1425, ""],
    [2, "3B", 0, 1, 520, 1545, "Application fee waived for Yesdoor Verified renters"],
    [2, "5C", 2, 2, 1100, 2145, "Free parking for 6 months"],
    [3, "118", 1, 1, 720, 1380, ""],
    [3, "240", 2, 2, 1040, 1695, "$500 off your first month"],
    [4, "207", 1, 1, 780, 1895, "Application fee waived for Yesdoor Verified renters"],
    [4, "410", 2, 2, 1180, 2395, "Free parking for 6 months"],
    [5, "12", 0, 1, 480, 1245, "Reduced deposit for approved renters"],
    [5, "31", 1, 1, 700, 1360, ""],
    [6, "8A", 2, 2, 1050, 1585, "$500 off your first month"],
    [6, "14B", 3, 2, 1300, 1950, ""],
    [7, "102", 1, 1, 650, 1290, "Reduced deposit for approved renters"],
    [7, "308", 2, 1, 900, 1540, ""],
    [8, "121", 2, 2, 1070, 1740, "First month free on a 13-month lease"],
    [8, "204", 1, 1, 760, 1450, ""],
    [9, "6", 0, 1, 500, 1200, "Reduced deposit for approved renters"],
    [9, "19", 2, 1, 860, 1475, "$250 off move-in with a tour this week"],
    [10, "330", 1, 1, 800, 1995, "Application fee waived for Yesdoor Verified renters"],
    [10, "418", 3, 2, 1320, 2380, ""],
    [11, "222", 1, 1, 710, 1410, ""],
    [11, "305", 2, 2, 1010, 1820, "$500 off your first month"]
  ];

  var BROKERS = [
    { id: "brk-1", name: "Harbor & Pine Realty", company: "Harbor & Pine Realty", email: "partners@sample.yesdoor.test", licenceState: "AZ", licenceVerified: true, plan: "split", splitPercent: 25, trackingCode: "YD-402817", status: "active" },
    { id: "brk-2", name: "Desert Referral Co", company: "Desert Referral Co", email: "hello@sample.yesdoor.test", licenceState: null, licenceVerified: false, plan: "software", splitPercent: null, trackingCode: "YD-518306", status: "active" },
    { id: "brk-3", name: "Camille Duarte", company: "Duarte Homes", email: "camille@sample.yesdoor.test", licenceState: "AZ", licenceVerified: false, plan: "split", splitPercent: 25, trackingCode: "YD-640915", status: "applied" }
  ];

  var NAMED = [
    { key: "prime-1", firstName: "Priya", lastName: "Raman", story: "Software QA lead, steady salary, never missed a payment. A clean file.",
      address: { line1: "4410 N Example Way", city: "Scottsdale", state: "AZ", zip: "85251" },
      file: { credit_score: 771, collections_count: 0, eviction_count: 0, eviction_last_at: null, criminal_flags: [] }, monthly: 7200 },
    { key: "prime-2", firstName: "Daniel", lastName: "Okoro", story: "Nurse with a small freelance side income. Nothing negative on file.",
      address: { line1: "1822 W Sample Dr", city: "Tempe", state: "AZ", zip: "85281" },
      file: { credit_score: 728, collections_count: 0, eviction_count: 0, eviction_last_at: null, criminal_flags: [] }, monthly: 5900 },
    { key: "tier-b", firstName: "Marcus", lastName: "Bell", story: "Warehouse supervisor. One small utility collection and a nine-year-old misdemeanor. No evictions.",
      address: { line1: "960 S Example St", city: "Mesa", state: "AZ", zip: "85210" },
      file: { credit_score: 668, collections_count: 1, eviction_count: 0, eviction_last_at: null, criminal_flags: [{ category: "misdemeanor_nonviolent", years_ago: 9 }] }, monthly: 4850 },
    { key: "tier-c-old", firstName: "Tanya", lastName: "Whitfield", story: "Retail manager. One eviction in 2019 after a layoff, two small collections since. Steady job for four years.",
      address: { line1: "7305 E Sample Ave", city: "Chandler", state: "AZ", zip: "85225" },
      file: { credit_score: 612, collections_count: 2, eviction_count: 1, eviction_last_at: "2019-08-14", criminal_flags: [] }, monthly: 3700 },
    { key: "tier-c-recent", firstName: "Rosa", lastName: "Delgado", story: "Dental office assistant. One eviction in late 2023 when a roommate left, one medical collection. Pays everything on time now.",
      address: { line1: "2540 N Example Rd", city: "Glendale", state: "AZ", zip: "85301" },
      file: { credit_score: 655, collections_count: 1, eviction_count: 1, eviction_last_at: "2023-11-20", criminal_flags: [] }, monthly: 4100 },
    { key: "tier-d", firstName: "Jerome", lastName: "Castillo", story: "Gig and warehouse work. Two evictions (the latest in 2024), four collections and a six-year-old property felony.",
      address: { line1: "118 W Example Ln", city: "Phoenix", state: "AZ", zip: "85003" },
      file: { credit_score: 541, collections_count: 4, eviction_count: 2, eviction_last_at: "2024-03-02", criminal_flags: [{ category: "felony_property", years_ago: 6 }] }, monthly: 2950 },
    { key: "no-match", firstName: "Leah", lastName: "Brandt", story: "Recently moved, name spelled two ways on file. Clean report once matched by date of birth.",
      address: { line1: "3391 E Example Blvd", city: "Gilbert", state: "AZ", zip: "85234" },
      file: { credit_score: 689, collections_count: 0, eviction_count: 0, eviction_last_at: null, criminal_flags: [] }, monthly: 5200, noMatchUntilDob: true }
  ];

  var ARCH = [
    { s: 745, c: 0, e: 0, l: null, f: [], m: 6400 }, { s: 662, c: 1, e: 0, l: null, f: [], m: 4300 }, { s: 612, c: 2, e: 1, l: "2020-02-10", f: [], m: 3650 },
    { s: 716, c: 0, e: 0, l: null, f: [], m: 5300 }, { s: 648, c: 2, e: 0, l: null, f: [], m: 5100 }, { s: 596, c: 3, e: 0, l: null, f: [], m: 3300 },
    { s: 703, c: 0, e: 0, l: null, f: [], m: 4600 }, { s: 630, c: 1, e: 1, l: "2021-02-18", f: [], m: 3600 }, { s: 690, c: 0, e: 0, l: null, f: [], m: 3900 },
    { s: 572, c: 5, e: 1, l: "2025-03-05", f: [], m: 2600 }, { s: 676, c: 1, e: 0, l: null, f: [{ category: "misdemeanor_nonviolent", years_ago: 6 }], m: 4400 },
    { s: 598, c: 1, e: 2, l: "2024-06-11", f: [], m: 3100 }, { s: 735, c: 0, e: 0, l: null, f: [], m: 6900 }, { s: 654, c: 1, e: 0, l: null, f: [], m: 4000 }
  ];
  var FIRST = ["Ana", "Ben", "Chloe", "Dev", "Elena", "Frank", "Grace", "Hector", "Imani", "Jun", "Kara", "Luis", "Maya", "Noah", "Omar", "Pia", "Quinn", "Rhea", "Sam", "Tess", "Uri"];
  var LAST = ["Alvarez", "Brooks", "Chen", "Dunn", "Estrada", "Flores", "Grant", "Hill", "Ibarra", "Jones", "Kim", "Lopez", "Mills", "Nguyen", "Ortiz", "Park", "Quinn", "Reyes", "Shah", "Tran", "Usher"];
  var CITIES = [["Phoenix", "85016"], ["Tempe", "85283"], ["Mesa", "85203"], ["Chandler", "85226"], ["Scottsdale", "85254"], ["Glendale", "85302"]];
  var STAGE_CYCLE = ["registered", "registered", "toured", "applied", "approved", "lease_signed", "moved_in", "invoiced", "paid", "safe", "denied", "no_show", "applied", "toured", "registered", "invoiced", "paid", "cancelled", "safe", "approved"];
  // which building each seeded application prefers when the renter qualifies there (so the sample building user has a realistic list)
  var HOME = ["bld-pv", "bld-mr", "bld-pv", "bld-mr", "bld-pv", "bld-lh", "bld-mc", "bld-cw", "bld-pv", "bld-ac", "bld-mr", "bld-st"];
  var TERMINAL = { denied: 1, no_show: 1, cancelled: 1, moved_in: 1, invoiced: 1, paid: 1, safe: 1, refunded: 1 };

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z]/g, ""); }
  function ruleObj(b) {
    if (!b[17]) return null;
    var r = clone(b[17]); r.confirmedAt = iso(daysAgo(r.confirmedDaysAgo)); delete r.confirmedDaysAgo; r.version = 3; r.source = "portal";
    return r;
  }

  function seed() {
    var db = { counters: { inv: 101, lst: 25, rnt: 100, app: 100, tour: 100, evt: 0 }, events: [] };
    db.companies = clone(COMPANIES);
    db.buildings = BUILDINGS.map(function (b) {
      var r = ruleObj(b);
      return { id: b[0], name: b[1], companyId: b[2], city: b[3], state: "AZ", address: b[4], zip: b[5], unitsCount: b[6], secondChance: b[7],
        appFeeCents: b[8], appFeeWaived: b[9], status: b[10], software: b[11], connection: b[12], tourHours: b[13], feePercent: b[14],
        payerScore: b[15], mismatchCount: b[16], rules: r, rulesHistory: r ? [r] : [], isSample: true,
        agreementStatus: b[10] === "live" || b[10] === "signed" ? "signed" : b[10] === "agreement_sent" ? "sent" : "none" };
    });
    db.listings = LISTINGS.map(function (l, i) {
      var b = db.buildings[l[0]];
      return { id: "lst-" + (i + 1 < 10 ? "0" : "") + (i + 1), buildingId: b.id, unitLabel: l[1], beds: l[2], baths: l[3], sqft: l[4], rentCents: cents(l[5]),
        availableOn: ymd(NOW + (3 + (i * 5) % 40) * DAY), specials: l[6] ? [l[6]] : [], active: true, isSample: true };
    });
    db.brokers = clone(BROKERS);

    // renters: 7 named + 33 built from the same kinds of files
    db.renters = [];
    NAMED.forEach(function (n, i) {
      db.renters.push({ id: "rnt-" + (i + 1), key: n.key, firstName: n.firstName, lastName: n.lastName + "-Sample", email: slug(n.firstName) + "." + slug(n.lastName) + "@sample.yesdoor.test",
        address: n.address, file: n.file, income: { verified: false, monthly: cents(n.monthly) }, noMatchUntilDob: !!n.noMatchUntilDob, story: n.story,
        brokerId: null, source: { kind: "direct" }, stage: "lead", createdAt: iso(daysAgo(30 - i)), consent: null, isSample: true });
    });
    for (var i = 0; i < 33; i++) {
      var a = ARCH[i % ARCH.length];
      var city = CITIES[i % CITIES.length];
      var f = FIRST[i % FIRST.length]; var l = LAST[(i * 5 + 3 + Math.floor(i / 21) * 7) % LAST.length];
      var bump = ((i * 7) % 11) - 5;
      db.renters.push({ id: "rnt-" + (i + 8), key: "gen-" + i, firstName: f, lastName: l + "-Sample", email: slug(f) + "." + slug(l) + "@sample.yesdoor.test",
        address: { line1: (1000 + i * 137) + " N Example Pl", city: city[0], state: "AZ", zip: city[1] },
        file: { credit_score: a.s + bump, collections_count: a.c, eviction_count: a.e, eviction_last_at: a.l, criminal_flags: clone(a.f) },
        income: { verified: false, monthly: cents(a.m + bump * 20) }, brokerId: i % 4 === 0 ? "brk-1" : i % 9 === 4 ? "brk-2" : null,
        source: i % 4 === 0 ? { kind: "broker", brokerCode: "YD-402817" } : i % 3 === 0 ? { kind: "ad", adId: "43" } : { kind: "organic" },
        stage: "lead", createdAt: iso(daysAgo(1 + (i * 3) % 40)), consent: null, isSample: true });
    }
    // income verified for every seeded renter except the named funnel personas
    db.renters.forEach(function (r, idx) {
      var seeded = idx >= 7 || r.key === "tier-b"; // Marcus is the default renter-portal sample
      r.income.verified = seeded;
      r.consent = seeded ? { kind: "screening+recheck", version: "screening-recheck-2026-10-07-v1", capturedAt: r.createdAt } : null;
    });

    // applications
    db.applications = []; db.tours = []; db.invoices = []; db.feeLedger = []; db.brokerLedger = []; db.refunds = [];
    var nApp = 0;
    db.renters.forEach(function (r, idx) {
      if (idx < 7 && r.key !== "tier-b") return; // named funnel personas start fresh, except Marcus
      var bests = candidatesFor(db, r, null);
      var pool = bests.filter(function (c) { return c.result === "approved"; });
      if (!pool.length) pool = bests.filter(function (c) { return c.result === "likely"; });
      if (!pool.length) { r.stage = "screened"; return; }
      var want = r.key === "tier-b" ? "bld-pv" : HOME[nApp % HOME.length];
      // Mirage Row has stale rules, so it never reaches "approved": renters there are "likely"
      var from = want === "bld-mr" ? bests.filter(function (c) { return c.result !== "no"; }) : pool;
      var pick = from.filter(function (c) { return c.buildingId === want; })[0] || pool[nApp % pool.length];
      var stage = r.key === "tier-b" ? "registered" : STAGE_CYCLE[nApp % STAGE_CYCLE.length];
      nApp++;
      addSeedApp(db, r, pick, stage);
    });
    db.renters.forEach(function (r) {
      var mine = db.applications.filter(function (a) { return a.renterId === r.id; });
      if (!mine.length) { if (r.stage === "lead") r.stage = idxScreened(r) ? "screened" : "lead"; return; }
      var placed = mine.some(function (a) { return a.stage === "moved_in" || a.stage === "invoiced" || a.stage === "paid" || a.stage === "safe"; });
      r.stage = placed ? "placed" : "booked";
    });
    function idxScreened(r) { return r.income.verified; }

    db.disputes = [
      { id: "dsp-1", kind: "attribution", subject: "Mesquite Court says a renter already visited before Yesdoor registered them.", openedByKind: "building", openedAt: iso(daysAgo(6)), dueBy: iso(daysAgo(6) + 14 * DAY), status: "open", decision: null },
      { id: "dsp-2", kind: "denial", subject: "A renter told 'approved' was denied at Lantern Hill. Reason given: rental history could not be verified.", openedByKind: "renter", openedAt: iso(daysAgo(9)), dueBy: iso(daysAgo(9) + 14 * DAY), status: "open", decision: null },
      { id: "dsp-3", kind: "fee", subject: "Copper Wash Apartments questions the fee on a lease that started before registration expired.", openedByKind: "building", openedAt: iso(daysAgo(20)), dueBy: iso(daysAgo(20) + 14 * DAY), status: "decided", decision: "Fee stands. Registration was inside the 90-day window." }
    ];
    return db;
  }

  function timeline(final) {
    var order = ["registered", "toured", "applied", "approved", "lease_signed", "moved_in", "invoiced", "paid", "safe"];
    var days = {
      registered: [2], toured: [8, 5], applied: [12, 9, 7], approved: [16, 13, 11, 8], lease_signed: [24, 20, 17, 14, 10], moved_in: [30, 27, 24, 20, 16, 1],
      invoiced: [40, 37, 34, 30, 26, 12, 11], paid: [80, 77, 74, 70, 66, 50, 49, 20], safe: [150, 147, 144, 140, 136, 130, 129, 95, 35]
    };
    var key = final;
    if (!days[key]) key = final === "denied" ? "applied" : final === "no_show" ? "registered" : final === "cancelled" ? "registered" : "registered";
    var out = {}; var d = days[key];
    for (var i = 0; i < d.length; i++) out[order[i]] = iso(daysAgo(d[i]));
    return out;
  }

  function addSeedApp(db, r, c, stage) {
    var b = byId(db.buildings, c.buildingId); var l = byId(db.listings, c.listingId);
    var id = "app-" + (++db.counters.app);
    var t = timeline(stage);
    var app = { id: id, renterId: r.id, buildingId: b.id, listingId: l.id, brokerId: r.brokerId, matchResult: c.result, stage: stage, denialReason: null,
      registeredAt: t.registered || iso(daysAgo(10)), times: t, leaseStart: null, leaseEnd: null, rentCents: null };
    if (stage === "denied") { app.denialReason = "The building could not verify rental history."; app.times.denied = iso(daysAgo(4)); }
    if (["lease_signed", "moved_in", "invoiced", "paid", "safe"].indexOf(stage) !== -1) {
      var start = stage === "lease_signed" ? NOW + 14 * DAY : new Date(t.moved_in).getTime();
      app.leaseStart = ymd(start); app.leaseEnd = ymd(start + 365 * DAY); app.rentCents = l.rentCents;
    }
    db.applications.push(app);
    // tour
    var tid = "tour-" + (++db.counters.tour);
    if (stage === "registered") db.tours.push({ id: tid, applicationId: id, startsAt: iso(NOW + (1 + db.counters.tour % 5) * DAY - (NOW + (1 + db.counters.tour % 5) * DAY) % DAY + 17 * 3600000), status: "booked" });
    else if (stage === "no_show") db.tours.push({ id: tid, applicationId: id, startsAt: iso(daysAgo(3)), status: "noshow" });
    else if (stage === "cancelled") db.tours.push({ id: tid, applicationId: id, startsAt: iso(daysAgo(2)), status: "cancelled" });
    else db.tours.push({ id: tid, applicationId: id, startsAt: t.toured || iso(daysAgo(5)), status: "completed" });
    // money
    if (["moved_in", "invoiced", "paid", "safe"].indexOf(stage) !== -1) {
      var fee = Math.round(l.rentCents * b.feePercent / 100);
      var fl = { id: "fee-" + (db.feeLedger.length + 1), applicationId: id, buildingId: b.id, kind: "placement_fee", amountCents: fee,
        status: stage === "moved_in" ? "earned" : stage === "invoiced" ? "invoiced" : stage === "paid" ? "paid" : "safe",
        earnedAt: t.moved_in, invoicedAt: t.invoiced || null, paidAt: t.paid || null, safeAt: t.safe || null, invoiceId: null };
      if (t.invoiced) {
        var inv = makeInvoice(db, app, b, l, r, fee, t.invoiced);
        if (t.paid) { inv.status = "paid"; inv.paidAt = t.paid; inv.paymentMethod = ["ach", "wire", "paymode", "check"][db.invoices.length % 4]; inv.paymentRef = "REF-" + (4000 + db.invoices.length); }
        fl.invoiceId = inv.id;
      }
      db.feeLedger.push(fl);
      if (app.brokerId) {
        var bk = byId(db.brokers, app.brokerId);
        var split = bk.splitPercent || 0;
        if (split) {
          var st = fl.status === "earned" || fl.status === "invoiced" ? "earned" : fl.status === "paid" ? "held" : (db.brokerLedger.length % 2 ? "payable" : "paid");
          db.brokerLedger.push({ id: "bl-" + (db.brokerLedger.length + 1), brokerId: bk.id, feeLedgerId: fl.id, applicationId: id, amountCents: Math.round(fee * split / 100), status: st,
            holdUntil: t.paid ? iso(new Date(t.paid).getTime() + 60 * DAY) : null, paidAt: st === "paid" ? iso(daysAgo(10)) : null, payoutRef: st === "paid" ? "PAYOUT-" + (700 + db.brokerLedger.length) : null });
        }
      }
    }
    return app;
  }

  function makeInvoice(db, app, b, l, r, fee, issuedAt) {
    var inv = { id: "inv-" + db.counters.inv, number: "YD-INV-" + String(100000 + db.counters.inv), buildingId: b.id, companyId: b.companyId, totalCents: fee,
      issuedAt: issuedAt, dueAt: iso(new Date(issuedAt).getTime() + 30 * DAY), status: "open", paidAt: null, paymentMethod: null, paymentRef: null,
      lines: [{ applicationId: app.id, renterName: r.firstName + " " + r.lastName, unit: l.unitLabel, moveInDate: app.leaseStart, leaseTermMonths: 12, registrationAt: app.registeredAt, amountCents: fee }] };
    db.counters.inv++;
    db.invoices.push(inv);
    return inv;
  }

  /* =========================================================== helpers over db */
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  function renterIncome(r) { return { verified: !!r.income.verified, monthly: r.income.monthly }; }

  function candidatesFor(db, r, opts) {
    opts = opts || {};
    var perBuilding = {};
    db.listings.forEach(function (l) {
      if (!l.active) return;
      var b = byId(db.buildings, l.buildingId);
      if (!b || (b.status !== "live" && b.status !== "signed") || !b.rules) return;
      if (opts.city && b.city.toLowerCase().indexOf(String(opts.city).toLowerCase()) === -1 && b.zip !== String(opts.city).trim()) return;
      if (opts.beds !== undefined && opts.beds !== "" && opts.beds !== null && l.beds < Number(opts.beds)) return;
      if (opts.maxRent && l.rentCents > Number(opts.maxRent) * 100) return;
      var m = matchBuilding(r.file, renterIncome(r), b.rules, l.rentCents);
      var rank = { approved: 0, likely: 1, no: 2 }[m.result];
      var row = { buildingId: b.id, buildingName: b.name, listingId: l.id, unitLabel: l.unitLabel, beds: l.beds, baths: l.baths, city: b.city, state: b.state, address: b.address,
        rentCents: l.rentCents, result: m.result, reasons: m.reasons, rulesConfirmedAt: b.rules.confirmedAt, rulesStale: m.rulesStale, secondChance: b.secondChance,
        tourHours: b.tourHours, appFeeCents: b.appFeeCents, appFeeWaived: b.appFeeWaived, isBackup: false, isSample: true, _rank: rank, _tier: m.tier, _lane: m.lane, _max: m.maxRentCents };
      var cur = perBuilding[b.id];
      var preferred = opts.listingId && l.id === opts.listingId;
      if (!cur || preferred || (!cur._preferred && (rank < cur._rank || (rank === cur._rank && Math.abs(l.rentCents - (m.maxRentCents || l.rentCents)) < Math.abs(cur.rentCents - (m.maxRentCents || cur.rentCents)))))) {
        row._preferred = !!preferred; perBuilding[b.id] = row;
      }
    });
    var out = Object.keys(perBuilding).map(function (k) { return perBuilding[k]; });
    out.sort(function (a, b) { return a._rank - b._rank || a.rentCents - b.rentCents; });
    return out;
  }

  function publicMatch(row) {
    var o = clone(row); delete o._rank; delete o._tier; delete o._lane; delete o._max; delete o._preferred; return o;
  }

  function listingView(db, l, full) {
    var b = byId(db.buildings, l.buildingId);
    var v = { id: l.id, buildingId: b.id, buildingName: b.name, unitLabel: l.unitLabel, address: b.address, city: b.city, state: b.state, zip: b.zip, rentCents: l.rentCents,
      beds: l.beds, baths: l.baths, sqft: l.sqft, availableOn: l.availableOn, specials: l.specials, photos: [], isSample: !!l.isSample, buildingSecondChance: b.secondChance,
      appFeeCents: b.appFeeCents, appFeeWaived: b.appFeeWaived };
    if (full) {
      v.tourHours = b.tourHours;
      v.rules = b.rules ? { minScore: b.rules.minScore, incomeMultiple: b.rules.incomeMultiple, maxEvictions: b.rules.maxEvictions, evictionLookbackYears: b.rules.evictionLookbackYears,
        criminalPolicy: b.rules.criminalPolicy, acceptsSecondChance: b.rules.acceptsSecondChance, confirmedAt: b.rules.confirmedAt } : null;
      v.rulesStale = b.rules ? Math.floor((NOW - new Date(b.rules.confirmedAt).getTime()) / DAY) > D.staleDays : null;
    }
    return v;
  }

  function renterTier(r) { return riskTier(r.file, !!r.income.verified); }

  function openApps(db, renterId) {
    return db.applications.filter(function (a) { return a.renterId === renterId && !TERMINAL[a.stage]; });
  }

  /* =========================================================== persistence */
  var memDb = null;
  function load() {
    if (memDb) return memDb;
    try { var raw = window.localStorage.getItem(DB_KEY); if (raw) { memDb = JSON.parse(raw); return memDb; } } catch (e) { /* blocked */ }
    memDb = seed(); save();
    return memDb;
  }
  function save() { try { window.localStorage.setItem(DB_KEY, JSON.stringify(memDb)); } catch (e) { /* blocked: stays in memory for this page */ } }
  // One demo session per portal, so signing in to the broker portal does not sign you out of the building portal.
  var memSessions = {};
  function getSessions() {
    try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) || "{}") || {}; } catch (e) { return memSessions; }
  }
  function saveSessions(map) {
    memSessions = map;
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(map)); } catch (e) { /* blocked: stays in memory for this page */ }
  }
  function setSession(s) { var m = getSessions(); m[s.kind] = s; saveSessions(m); }
  function clearSession(kind) { var m = getSessions(); if (kind) delete m[kind]; else m = {}; saveSessions(m); }

  /* =========================================================== route handler */
  var ok = function (data) { return { status: 200, data: data }; };
  var err = function (status, message) { return { status: status, data: { error: message } }; };

  function needSession(kind) { return getSessions()[kind] || null; }

  function renterByToken(db, token, session) {
    if (token && String(token).indexOf("demo-") === 0) return byId(db.renters, String(token).slice(5));
    if (session && session.renterId) return byId(db.renters, session.renterId);
    return null;
  }

  function matchesForRenter(db, r) {
    return candidatesFor(db, r, {}).map(publicMatch);
  }

  function renterSummary(db, r) {
    var inc = renterIncome(r);
    var tier = renterTier(r);
    var cands = candidatesFor(db, r, {});
    var maxRent = inc.verified ? Math.floor(inc.monthly / 3) : null;
    // the max rent shown is the most generous multiple of the buildings that would take the renter
    if (inc.verified) {
      var best = null;
      cands.forEach(function (c) { if (c.result !== "no" && c._max !== null && (best === null || c._max > best)) best = c._max; });
      if (best !== null) maxRent = best;
    }
    return { id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, stage: r.stage, lane: laneOf(tier), incomeVerified: inc.verified, approvedMaxRentCents: maxRent,
      monthlyIncomeCents: inc.verified ? inc.monthly : null };
  }

  function appView(db, a, forBuilding) {
    var b = byId(db.buildings, a.buildingId); var l = byId(db.listings, a.listingId); var r = byId(db.renters, a.renterId);
    var tour = null;
    db.tours.forEach(function (t) { if (t.applicationId === a.id) tour = t; });
    var v = { id: a.id, applicationId: a.id, buildingId: b.id, buildingName: b.name, listingId: l.id, unitLabel: l.unitLabel, address: b.address, city: b.city,
      stage: a.stage, rentCents: l ? l.rentCents : null, registeredAt: a.registeredAt, tourAt: tour ? tour.startsAt : null, tourStatus: tour ? tour.status : null,
      denialReason: a.denialReason, leaseStart: a.leaseStart, leaseEnd: a.leaseEnd };
    if (forBuilding) {
      var m = matchBuilding(r.file, renterIncome(r), b.rules, l.rentCents);
      // The projection a building may see. No score, no counts, no flags, no reasons.
      v.renterName = r.firstName + " " + r.lastName; v.email = r.email; v.listingLabel = l.unitLabel + " · " + (l.beds === 0 ? "Studio" : l.beds + " bed");
      v.result = m.result; v.incomeVerified = !!r.income.verified; v.riskTier = m.tier; v.maxRentCents = m.maxRentCents;
      v.rulesVersion = b.rules.version; v.rulesConfirmedAt = b.rules.confirmedAt;
      delete v.address; delete v.city;
    }
    return v;
  }

  var NEXT = { registered: ["toured", "no_show"], toured: ["applied"], applied: ["approved", "denied"], approved: ["lease_signed"], lease_signed: ["moved_in"] };

  function event(db, name, entity, id, payload) { db.counters.evt++; db.events.push({ id: db.counters.evt, name: name, entity: entity, entityId: id, payload: payload || {}, at: iso(Date.now()) }); if (db.events.length > 200) db.events.shift(); }

  function parseCsv(text) {
    var lines = String(text || "").split(/\r?\n/).filter(function (x) { return x.trim(); });
    if (lines.length < 2) return { rows: [], errors: [{ row: 1, message: "Add a header row and at least one listing." }] };
    var head = lines[0].split(",").map(function (h) { return h.trim().toLowerCase(); });
    var rows = []; var errors = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split(",").map(function (c) { return c.trim(); });
      var o = {}; head.forEach(function (h, k) { o[h] = cells[k]; });
      var rent = Number(o.rent); var beds = Number(o.beds);
      if (!o.unit) errors.push({ row: i + 1, message: "Unit is missing." });
      else if (!(rent > 0)) errors.push({ row: i + 1, message: "Rent must be a number." });
      else if (isNaN(beds)) errors.push({ row: i + 1, message: "Beds must be a number." });
      else rows.push({ unit: o.unit, beds: beds, baths: Number(o.baths) || 1, sqft: Number(o.sqft) || null, rent: rent, available: o.available || null });
    }
    return { rows: rows, errors: errors };
  }

  function handle(method, route, q, body) {
    var db = load();
    var key = method + " " + route;
    var s, r, b, i;
    switch (key) {
      /* ------------------------------------------------ public */
      case "GET public/listings": {
        var page = Number(q.page) || 1; var size = Number(q.pageSize) || 12;
        var rows = db.listings.filter(function (l) {
          var bd = byId(db.buildings, l.buildingId);
          if (!l.active || (bd.status !== "live" && bd.status !== "signed")) return false;
          if (q.city && bd.city.toLowerCase().indexOf(String(q.city).toLowerCase().trim()) === -1 && bd.zip !== String(q.city).trim()) return false;
          if (q.beds !== undefined && q.beds !== "" && l.beds < Number(q.beds)) return false;
          if (q.maxRent && l.rentCents > Number(q.maxRent) * 100) return false;
          if (q.buildingId && l.buildingId !== q.buildingId) return false;
          return true;
        }).sort(function (a, c) { return a.rentCents - c.rentCents; });
        var cityCounts = {};
        db.listings.forEach(function (l) { var bd = byId(db.buildings, l.buildingId); if (bd.status === "live" || bd.status === "signed") cityCounts[bd.city] = (cityCounts[bd.city] || 0) + 1; });
        return ok({ listings: rows.slice((page - 1) * size, page * size).map(function (l) { return listingView(db, l, false); }), total: rows.length, page: page, pageSize: size,
          cities: Object.keys(cityCounts).map(function (k) { return { name: k, count: cityCounts[k] }; }) });
      }
      case "GET public/listing": {
        var lst = byId(db.listings, q.id);
        if (!lst) return err(404, "We could not find that listing. It may have been rented.");
        return ok({ listing: listingView(db, lst, true) });
      }
      case "POST public/lead": {
        if (!body.email || String(body.email).indexOf("@") < 1) return err(400, "Please enter a valid email address.");
        var email = String(body.email).trim().toLowerCase();
        r = null; db.renters.forEach(function (x) { if (x.email === email) r = x; });
        if (!r) {
          // an email we do not know gets one of five consistent sample files, chosen by the email itself
          var h = 0; for (i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
          var archIdx = [0, 1, 2, 3, 4, 6, 8][h % 7];
          var a = ARCH[archIdx];
          db.counters.rnt++;
          r = { id: "rnt-" + db.counters.rnt, key: "new", firstName: String(body.firstName || "").trim() || "Sample", lastName: String(body.lastName || "").trim() || "Renter",
            email: email, address: null, file: { credit_score: a.s, collections_count: a.c, eviction_count: a.e, eviction_last_at: a.l, criminal_flags: clone(a.f) },
            income: { verified: false, monthly: cents(a.m) }, brokerId: null, source: body.source || { kind: "direct" }, stage: "lead", createdAt: iso(Date.now()), consent: null, isSample: true,
            story: "A sample file chosen for this email. In demo mode no real check is run." };
          db.renters.push(r);
          event(db, "renter.lead", "renter", r.id, { source: r.source });
        }
        save();
        return ok({ renterToken: "demo-" + r.id, renterId: r.id, firstName: r.firstName, firstTouch: r.source });
      }
      case "POST public/prescreen": {
        var c = body.consent || {};
        if (!c.checked || !c.text || !c.version) return err(400, "Please agree to the screening permission to continue.");
        if (!body.address || !body.address.line1 || !body.address.city || !body.address.zip) return err(400, "Please enter your current home address.");
        r = null; db.renters.forEach(function (x) { if (x.email === String(body.email || "").trim().toLowerCase()) r = x; });
        if (!r) return err(404, "We could not find you. Start again from the first step.");
        r.address = body.address; r.consent = { kind: "screening+recheck", version: c.version, text: c.text, capturedAt: iso(Date.now()) };
        if (r.noMatchUntilDob && !body.dob) {
          save();
          return ok({ status: "no_match", needDob: true, message: "We could not match you on name and address alone. Add your date of birth and we will try once more." });
        }
        var cands = candidatesFor(db, r, { city: body.city, beds: body.beds, maxRent: body.maxRent, listingId: body.listingId });
        var all = candidatesFor(db, r, {});
        var shown = cands.length ? cands : all;
        var tier = renterTier(r);
        if (r.stage === "lead") r.stage = "screened";
        event(db, "renter.screened", "renter", r.id, { lane: laneOf(tier) });
        save();
        var sm = renterSummary(db, r);
        return ok({ status: "complete", screeningId: "scr-" + r.id, firstName: r.firstName, lane: laneOf(tier), incomeVerified: sm.incomeVerified, approvedMaxRentCents: sm.approvedMaxRentCents,
          widenedSearch: !cands.length && all.length > 0, matches: shown.map(publicMatch),
          notices: [{ key: "background_check_notice_required", text: "A criminal record can only count against you after the building sends you a written notice." }].slice(0, r.file.criminal_flags.length ? 1 : 0) });
      }
      case "POST public/book": {
        r = renterByToken(db, body.renterToken, needSession("renter"));
        if (!r) return err(401, "Please start from the first step so we know who is booking.");
        b = byId(db.buildings, body.buildingId); var bl = byId(db.listings, body.listingId);
        if (!b || !bl || bl.buildingId !== b.id) return err(404, "We could not find that apartment.");
        var mm = matchBuilding(r.file, renterIncome(r), b.rules, bl.rentCents);
        if (mm.result === "no") return err(409, "This building is not a match for you. Pick one of the approved or likely buildings.");
        var open = openApps(db, r.id);
        if (open.length >= 3) return err(409, "You already have 3 open applications. Cancel or finish one before booking another.");
        for (i = 0; i < open.length; i++) if (open[i].buildingId === b.id) return err(409, "You already have a tour booked at this building.");
        if (!body.startsAt || isNaN(new Date(body.startsAt).getTime())) return err(400, "Please pick a tour time.");
        db.counters.app++; db.counters.tour++;
        var app = { id: "app-" + db.counters.app, renterId: r.id, buildingId: b.id, listingId: bl.id, brokerId: r.brokerId, matchResult: mm.result, stage: "registered", denialReason: null,
          registeredAt: iso(Date.now()), times: { registered: iso(Date.now()) }, leaseStart: null, leaseEnd: null, rentCents: null };
        db.applications.push(app);
        db.tours.push({ id: "tour-" + db.counters.tour, applicationId: app.id, startsAt: new Date(body.startsAt).toISOString(), status: "booked" });
        r.stage = "booked";
        event(db, "application.registered", "application", app.id, { buildingId: b.id });
        save();
        return ok({ applicationId: app.id, tourId: "tour-" + db.counters.tour, startsAt: new Date(body.startsAt).toISOString(), buildingName: b.name, address: b.address + ", " + b.city + ", AZ",
          registrationQueued: true, registrationAt: app.registeredAt, openApplications: open.length + 1 });
      }
      case "POST auth/link": {
        if (!body.email || String(body.email).indexOf("@") < 1) return err(400, "Please enter a valid email address.");
        return ok({ sent: true, demo: true });
      }
      case "GET auth/verify": {
        var parts = String(q.token || "").split(":");
        if (parts[0] !== "demo") return err(400, "That sign-in link is not valid. Ask for a new one.");
        var kind = parts[1]; var em = (parts[2] || "").toLowerCase();
        if (kind === "renter") {
          r = null; db.renters.forEach(function (x) { if (x.email === em) r = x; });
          if (!r) r = byId(db.renters, "rnt-3"); // Marcus, who has a tour booked
          setSession({ kind: "renter", renterId: r.id, name: r.firstName });
        } else if (kind === "building") setSession({ kind: "building", buildingIds: ["bld-pv", "bld-mr"], name: "Leasing office, Palo Verde Flats" });
        else if (kind === "broker") setSession({ kind: "broker", brokerId: "brk-1", name: "Harbor & Pine Realty" });
        else if (kind === "staff") setSession({ kind: "staff", role: "owner", name: "Yesdoor owner" });
        else return err(400, "That sign-in link is not valid. Ask for a new one.");
        return ok({ session: needSession(kind) });
      }
      case "POST auth/logout": clearSession(body.kind); return ok({ ok: true });

      /* ------------------------------------------------ renter */
      case "GET me": {
        s = needSession("renter");
        r = renterByToken(db, q.renterToken, s);
        if (!r || (!q.renterToken && !s)) return err(401, "Sign in to see your Yesdoor.");
        var apps = db.applications.filter(function (a) { return a.renterId === r.id; });
        var tours = [];
        apps.forEach(function (a) { db.tours.forEach(function (t) { if (t.applicationId === a.id) { var bd = byId(db.buildings, a.buildingId); tours.push({ id: t.id, applicationId: a.id, buildingName: bd.name, address: bd.address + ", " + bd.city, startsAt: t.startsAt, status: t.status, tourHours: bd.tourHours }); } }); });
        tours.sort(function (x, y) { return new Date(x.startsAt) - new Date(y.startsAt); });
        return ok({ renter: renterSummary(db, r), matches: r.consent || r.income.verified ? matchesForRenter(db, r) : [], applications: apps.map(function (a) { return appView(db, a, false); }),
          tours: tours, consent: r.consent ? { version: r.consent.version, capturedAt: r.consent.capturedAt } : null, openApplications: openApps(db, r.id).length, maxOpenApplications: 3 });
      }
      case "POST me/income": {
        s = needSession("renter");
        r = renterByToken(db, body.renterToken, s);
        if (!r) return err(401, "Sign in to link your bank.");
        r.income.verified = true;
        event(db, "income.verified", "renter", r.id, { method: "plaid_sandbox" });
        save();
        var sm2 = renterSummary(db, r);
        return ok({ incomeVerified: true, monthlyIncomeCents: sm2.monthlyIncomeCents, approvedMaxRentCents: sm2.approvedMaxRentCents, lane: sm2.lane,
          matches: candidatesFor(db, r, { city: body.city, beds: body.beds, maxRent: body.maxRent, listingId: body.listingId }).map(publicMatch) });
      }
      case "POST me/tour": {
        s = needSession("renter");
        if (!s) return err(401, "Sign in to change a tour.");
        var tour = byId(db.tours, body.tourId);
        if (!tour) return err(404, "We could not find that tour.");
        var tapp = byId(db.applications, tour.applicationId);
        if (!tapp || tapp.renterId !== s.renterId) return err(403, "That tour is not yours.");
        if (body.action === "cancel") { tour.status = "cancelled"; tapp.stage = "cancelled"; event(db, "tour.cancelled", "tour", tour.id); }
        else if (body.action === "reschedule") {
          if (!body.startsAt || isNaN(new Date(body.startsAt).getTime())) return err(400, "Please pick a new time.");
          tour.startsAt = new Date(body.startsAt).toISOString(); tour.status = "booked"; event(db, "tour.rescheduled", "tour", tour.id);
        } else return err(400, "Choose cancel or reschedule.");
        save();
        return ok({ tourId: tour.id, status: tour.status, startsAt: tour.startsAt });
      }

      /* ------------------------------------------------ building user */
      case "GET building/renters": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to see your renters.");
        var mine = db.applications.filter(function (a) { return s.buildingIds.indexOf(a.buildingId) !== -1; }).sort(function (x, y) { return new Date(y.registeredAt) - new Date(x.registeredAt); });
        return ok({ buildings: s.buildingIds.map(function (id) { var bd = byId(db.buildings, id); return { id: bd.id, name: bd.name, appFeeCents: bd.appFeeCents, appFeeWaived: bd.appFeeWaived }; }),
          renters: mine.map(function (a) { return appView(db, a, true); }) });
      }
      case "POST building/update": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to update a renter.");
        var ap = byId(db.applications, body.applicationId);
        if (!ap || s.buildingIds.indexOf(ap.buildingId) === -1) return err(404, "We could not find that renter at your buildings.");
        var allowed = NEXT[ap.stage] || [];
        if (allowed.indexOf(body.stage) === -1) return err(409, "A renter cannot move from “" + ap.stage.replace(/_/g, " ") + "” to “" + String(body.stage).replace(/_/g, " ") + "”.");
        if (body.stage === "denied" && !String(body.reason || "").trim()) return err(400, "Please say why the renter was denied. We use it to keep your rules right.");
        var lb = byId(db.listings, ap.listingId); var bd2 = byId(db.buildings, ap.buildingId); var rr = byId(db.renters, ap.renterId);
        if (body.stage === "lease_signed") {
          var ls = body.lease || {};
          if (!ls.start || !ls.end || !(Number(ls.rentCents) > 0)) return err(400, "Add the lease start date, end date and monthly rent.");
          if (new Date(ls.end) <= new Date(ls.start)) return err(400, "The lease end date must be after the start date.");
          ap.leaseStart = ls.start; ap.leaseEnd = ls.end; ap.rentCents = Number(ls.rentCents);
        }
        var mismatch = false; var refundOwed = false; var backups = 0;
        ap.stage = body.stage; ap.times[body.stage] = iso(Date.now());
        if (body.stage === "denied") {
          ap.denialReason = String(body.reason).trim();
          if (ap.matchResult === "approved") {
            mismatch = true; bd2.mismatchCount++;
            if (!bd2.appFeeWaived) { db.refunds.push({ id: "ref-" + (db.refunds.length + 1), renterId: rr.id, applicationId: ap.id, reason: "app_fee_mismatch", amountCents: bd2.appFeeCents, status: "owed" }); refundOwed = true; }
          }
          backups = candidatesFor(db, rr, {}).filter(function (x) { return x.result === "approved" && x.buildingId !== bd2.id; }).slice(0, 5).length;
        }
        if (body.stage === "moved_in") {
          var fee = Math.round((ap.rentCents || lb.rentCents) * bd2.feePercent / 100);
          var inv = makeInvoice(db, ap, bd2, lb, rr, fee, iso(Date.now()));
          db.feeLedger.push({ id: "fee-" + (db.feeLedger.length + 1), applicationId: ap.id, buildingId: bd2.id, kind: "placement_fee", amountCents: fee, status: "invoiced",
            earnedAt: iso(Date.now()), invoicedAt: iso(Date.now()), paidAt: null, safeAt: null, invoiceId: inv.id });
          ap.stage = "invoiced";
          rr.stage = "placed";
        }
        event(db, "application." + body.stage, "application", ap.id, { reason: body.reason || null });
        save();
        return ok({ application: appView(db, ap, true), mismatch: mismatch, refundOwed: refundOwed, backupsOffered: backups });
      }
      case "GET building/rules": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to see your rules.");
        b = byId(db.buildings, q.buildingId || s.buildingIds[0]);
        if (!b || s.buildingIds.indexOf(b.id) === -1) return err(404, "We could not find that building.");
        return ok({ buildingId: b.id, buildingName: b.name, rules: b.rules, history: b.rulesHistory.slice().reverse() });
      }
      case "POST building/rules": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to save your rules.");
        b = byId(db.buildings, body.buildingId);
        if (!b || s.buildingIds.indexOf(b.id) === -1) return err(404, "We could not find that building.");
        var nr = body.rules || {};
        if (!(Number(nr.minScore) >= 300 && Number(nr.minScore) <= 850)) return err(400, "Minimum credit score must be between 300 and 850.");
        if (!(Number(nr.incomeMultiple) >= 1 && Number(nr.incomeMultiple) <= 6)) return err(400, "Income multiple must be between 1 and 6 times the rent.");
        var ver = (b.rules ? b.rules.version : 0) + 1;
        var rules = { minScore: Number(nr.minScore), incomeMultiple: Number(nr.incomeMultiple), maxEvictions: Number(nr.maxEvictions) || 0, evictionLookbackYears: Number(nr.evictionLookbackYears) || 0,
          criminalPolicy: nr.criminalPolicy || {}, acceptsSecondChance: !!nr.acceptsSecondChance, confirmedAt: iso(Date.now()), version: ver, source: "portal" };
        b.rules = rules; b.rulesHistory.push(rules); b.secondChance = rules.acceptsSecondChance;
        event(db, "rules.saved", "building", b.id, { version: ver });
        save();
        return ok({ buildingId: b.id, rules: rules, history: b.rulesHistory.slice().reverse() });
      }
      case "POST building/listings": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to add a listing.");
        b = byId(db.buildings, body.buildingId);
        if (!b || s.buildingIds.indexOf(b.id) === -1) return err(404, "We could not find that building.");
        if (!String(body.unitLabel || "").trim()) return err(400, "Add the unit number or name.");
        if (!(Number(body.rentCents) > 0)) return err(400, "Add the monthly rent.");
        db.counters.lst++;
        var nl = { id: "lst-" + db.counters.lst, buildingId: b.id, unitLabel: String(body.unitLabel).trim(), beds: Number(body.beds) || 0, baths: Number(body.baths) || 1, sqft: Number(body.sqft) || null,
          rentCents: Number(body.rentCents), availableOn: body.availableOn || ymd(NOW + 14 * DAY), specials: body.specials ? [String(body.specials)] : [], active: true, isSample: true };
        db.listings.push(nl); save();
        return ok({ listing: listingView(db, nl, false) });
      }
      case "POST building/import": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to import listings.");
        b = byId(db.buildings, body.buildingId);
        if (!b || s.buildingIds.indexOf(b.id) === -1) return err(404, "We could not find that building.");
        if (body.format !== "csv") return err(400, "Demo mode reads spreadsheet (CSV) files only.");
        var pc = parseCsv(body.content);
        pc.rows.forEach(function (row) {
          db.counters.lst++;
          db.listings.push({ id: "lst-" + db.counters.lst, buildingId: b.id, unitLabel: row.unit, beds: row.beds, baths: row.baths, sqft: row.sqft, rentCents: cents(row.rent),
            availableOn: row.available || ymd(NOW + 14 * DAY), specials: [], active: true, isSample: true });
        });
        save();
        return ok({ imported: pc.rows.length, errors: pc.errors });
      }
      case "GET building/invoices": {
        s = needSession("building");
        if (!s) return err(401, "Sign in to see your invoices.");
        return ok({ invoices: db.invoices.filter(function (v) { return s.buildingIds.indexOf(v.buildingId) !== -1; }).sort(function (x, y) { return new Date(y.issuedAt) - new Date(x.issuedAt); }) });
      }

      /* ------------------------------------------------ broker */
      case "GET broker/renters": {
        s = needSession("broker");
        if (!s) return err(401, "Sign in to see your renters.");
        var bkRenters = db.renters.filter(function (x) { return x.brokerId === s.brokerId; });
        return ok({ renters: bkRenters.map(function (x) {
          var latest = null; db.applications.forEach(function (a) { if (a.renterId === x.id) latest = a; });
          return { id: x.id, name: x.firstName + " " + x.lastName, stage: latest ? latest.stage : x.stage, referredAt: x.createdAt };
        }) });
      }
      case "GET broker/money": {
        s = needSession("broker");
        if (!s) return err(401, "Sign in to see your money.");
        var rowsM = db.brokerLedger.filter(function (x) { return x.brokerId === s.brokerId; }).map(function (x) {
          var a = byId(db.applications, x.applicationId); var rt = byId(db.renters, a.renterId); var fl = byId(db.feeLedger, x.feeLedgerId);
          return { id: x.id, renterName: rt.firstName + " " + rt.lastName, status: x.status, amountCents: x.amountCents, buildingPaidAt: fl ? fl.paidAt : null, holdUntil: x.holdUntil, paidAt: x.paidAt, payoutRef: x.payoutRef };
        });
        var tot = { earned: 0, held: 0, payable: 0, paid: 0 };
        rowsM.forEach(function (x) { if (tot[x.status] !== undefined) tot[x.status] += x.amountCents; });
        return ok({ earnedCents: tot.earned, heldCents: tot.held, payableCents: tot.payable, paidCents: tot.paid, rows: rowsM, holdDays: 60 });
      }
      case "GET broker/link": {
        s = needSession("broker");
        if (!s) return err(401, "Sign in to see your link.");
        b = byId(db.brokers, s.brokerId);
        return ok({ trackingCode: b.trackingCode, url: window.location.origin + "/yesdoor/index.html?broker=" + b.trackingCode, plan: b.plan, splitPercent: b.splitPercent, status: b.status, licenceVerified: b.licenceVerified, licenceState: b.licenceState, name: b.name });
      }

      /* ------------------------------------------------ staff */
      case "GET staff/pipeline": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        var byStage = {}; var lanes = { verified: 0, second_chance: 0, not_screened: 0 };
        db.applications.forEach(function (a) { byStage[a.stage] = (byStage[a.stage] || 0) + 1; });
        db.renters.forEach(function (x) { if (x.stage === "lead" && !x.income.verified) lanes.not_screened++; else lanes[laneOf(renterTier(x))]++; });
        var appRows = db.applications.map(function (a) {
          var x = byId(db.renters, a.renterId); var bd = byId(db.buildings, a.buildingId); var tr = renterTier(x);
          var when = a.times[a.stage] || a.registeredAt;
          return { applicationId: a.id, renterName: x.firstName + " " + x.lastName, buildingName: bd.name, stage: a.stage, lane: laneOf(tr), riskTier: tr, source: x.source.kind, brokerId: a.brokerId, since: when,
            ageDays: Math.max(0, Math.floor((NOW - new Date(when).getTime()) / DAY)), matchResult: a.matchResult };
        }).sort(function (x, y) { return new Date(y.since) - new Date(x.since); });
        var needs = {
          toDay: appRows.filter(function (x) { return x.stage === "denied" && x.ageDays < 7; }).length,
          noShow: appRows.filter(function (x) { return x.stage === "no_show"; }).length,
          waitingOnBuilding: appRows.filter(function (x) { return (x.stage === "registered" || x.stage === "toured") && x.ageDays >= 3; }).length
        };
        return ok({ byStage: byStage, renterLanes: lanes, applications: appRows, totalRenters: db.renters.length, needsAttention: needs, role: s.role });
      }
      case "GET staff/buildings": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        return ok({ buildings: db.buildings.map(function (bd) {
          var co = byId(db.companies, bd.companyId);
          return { id: bd.id, name: bd.name, company: co ? co.name : "", companyTier: co ? co.tier : null, city: bd.city, status: bd.status, software: bd.software, connection: bd.connection, agreementStatus: bd.agreementStatus,
            listingsCount: db.listings.filter(function (l) { return l.buildingId === bd.id; }).length, mismatchCount: bd.mismatchCount, rulesConfirmedAt: bd.rules ? bd.rules.confirmedAt : null,
            rulesStale: bd.rules ? Math.floor((NOW - new Date(bd.rules.confirmedAt).getTime()) / DAY) > D.staleDays : null, payerScore: bd.payerScore, isSample: true,
            leases: db.applications.filter(function (a) { return a.buildingId === bd.id && ["lease_signed", "moved_in", "invoiced", "paid", "safe"].indexOf(a.stage) !== -1; }).length };
        }) });
      }
      case "POST staff/agreement": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        b = byId(db.buildings, body.buildingId);
        if (!b) return err(404, "We could not find that building.");
        if (b.status !== "target" && b.status !== "pitched") return err(409, "This building already has an agreement in motion.");
        b.status = "agreement_sent"; b.agreementStatus = "sent"; event(db, "agreement.sent", "building", b.id); save();
        return ok({ buildingId: b.id, status: b.status, agreementStatus: b.agreementStatus });
      }
      case "GET staff/ledger": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        var feeTot = { earned: 0, invoiced: 0, paid: 0, safe: 0 };
        db.feeLedger.forEach(function (f) { if (feeTot[f.status] !== undefined) feeTot[f.status] += f.amountCents; });
        return ok({ totals: feeTot,
          invoices: db.invoices.map(function (v) { var bd = byId(db.buildings, v.buildingId); var o = clone(v); o.buildingName = bd.name; return o; }).sort(function (x, y) { return new Date(y.issuedAt) - new Date(x.issuedAt); }),
          brokerLedger: db.brokerLedger.map(function (x) { var bk = byId(db.brokers, x.brokerId); var a = byId(db.applications, x.applicationId); var rt = byId(db.renters, a.renterId); var o = clone(x); o.brokerName = bk.name; o.renterName = rt.firstName + " " + rt.lastName; return o; }),
          refunds: db.refunds });
      }
      case "POST staff/payment": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        var inv2 = byId(db.invoices, body.invoiceId);
        if (!inv2) return err(404, "We could not find that invoice.");
        if (inv2.status !== "open") return err(409, "That invoice is already paid.");
        if (["ach", "wire", "check", "paymode"].indexOf(body.method) === -1) return err(400, "Choose how the building paid.");
        inv2.status = "paid"; inv2.paidAt = iso(Date.now()); inv2.paymentMethod = body.method; inv2.paymentRef = String(body.ref || "").trim() || null;
        db.feeLedger.forEach(function (f) {
          if (f.invoiceId === inv2.id) {
            f.status = "paid"; f.paidAt = inv2.paidAt;
            var a2 = byId(db.applications, f.applicationId); if (a2) { a2.stage = "paid"; a2.times.paid = inv2.paidAt; }
            db.brokerLedger.forEach(function (x) { if (x.feeLedgerId === f.id && x.status === "earned") { x.status = "held"; x.holdUntil = iso(Date.now() + 60 * DAY); } });
          }
        });
        event(db, "invoice.paid", "invoice", inv2.id); save();
        return ok({ invoiceId: inv2.id, status: inv2.status });
      }
      case "POST staff/broker-payout": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        var bl2 = byId(db.brokerLedger, body.brokerLedgerId);
        if (!bl2) return err(404, "We could not find that payout.");
        if (bl2.status !== "payable") return err(409, "That payout is not ready. It is paid only after the 60-day hold.");
        bl2.status = "paid"; bl2.paidAt = iso(Date.now()); bl2.payoutRef = String(body.ref || "").trim() || "PAYOUT-" + (700 + db.brokerLedger.length);
        event(db, "broker.paid", "broker_ledger", bl2.id); save();
        return ok({ id: bl2.id, status: bl2.status });
      }
      case "GET staff/disputes": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        return ok({ disputes: db.disputes.map(function (d) { var o = clone(d); o.daysLeft = Math.ceil((new Date(d.dueBy).getTime() - NOW) / DAY); return o; }) });
      }
      case "POST staff/disputes": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        var ds = byId(db.disputes, body.id);
        if (!ds) return err(404, "We could not find that dispute.");
        if (ds.status !== "open") return err(409, "That dispute is already decided.");
        if (!String(body.decision || "").trim()) return err(400, "Write the decision so the record says why.");
        ds.status = "decided"; ds.decision = String(body.decision).trim(); ds.decidedAt = iso(Date.now()); event(db, "dispute.decided", "dispute", ds.id); save();
        return ok({ id: ds.id, status: ds.status });
      }
      case "GET staff/scoreboard": {
        s = needSession("staff");
        if (!s) return err(401, "Sign in with your staff account.");
        var cnt = function (stages) { return db.applications.filter(function (a) { return stages.indexOf(a.stage) !== -1; }).length; };
        var paidInv = db.invoices.filter(function (v) { return v.status === "paid"; });
        var feesIn = 0; paidInv.forEach(function (v) { feesIn += v.totalCents; });
        var days = 0; paidInv.forEach(function (v) { days += (new Date(v.paidAt) - new Date(v.issuedAt)) / DAY; });
        var live = db.buildings.filter(function (x) { return x.status === "live"; }).length;
        var signed = db.buildings.filter(function (x) { return x.status === "live" || x.status === "signed"; }).length;
        var M = function (key, label, value, previous, unit, better) { return { key: key, label: label, value: value, previous: previous, unit: unit || "count", better: better || "up" }; };
        return ok({ weekOf: ymd(NOW - ((new Date(NOW).getUTCDay() + 6) % 7) * DAY), comparison: "vs last week (sample figures)", metrics: [
          M("leads", "Renter leads", db.renters.length, Math.round(db.renters.length * 0.82)),
          M("pulled", "Screened", db.renters.filter(function (x) { return x.stage !== "lead"; }).length, Math.round(db.renters.length * 0.55)),
          M("registered", "Registered with a building", db.applications.length, Math.round(db.applications.length * 0.8)),
          M("leases", "Leases signed", cnt(["lease_signed", "moved_in", "invoiced", "paid", "safe"]), Math.max(0, cnt(["lease_signed", "moved_in", "invoiced", "paid", "safe"]) - 1)),
          M("moved_in", "Moved in", cnt(["moved_in", "invoiced", "paid", "safe"]), Math.max(0, cnt(["moved_in", "invoiced", "paid", "safe"]) - 1)),
          M("fees_in", "Fees paid to Yesdoor", feesIn, Math.round(feesIn * 0.7), "money"),
          M("days_to_pay", "Days from invoice to payment", paidInv.length ? Math.round(days / paidInv.length) : null, paidInv.length ? Math.round(days / paidInv.length) + 3 : null, "days", "down"),
          M("refunds", "Refunds owed to renters", db.refunds.length, Math.max(0, db.refunds.length), "count", "down"),
          M("buildings_signed", "Buildings signed", signed, Math.max(0, signed - 1)),
          M("buildings_live", "Buildings live", live, Math.max(0, live - 1)),
          M("partners_signed", "Broker partners signed", db.brokers.filter(function (x) { return x.status !== "applied"; }).length, 1),
          M("partners_active", "Broker partners active", db.brokers.filter(function (x) { return x.status === "active"; }).length, 1)
        ] });
      }
      default:
        return err(404, "Not found");
    }
  }

  YD.demo = {
    handle: handle,
    reset: function () {
      memDb = null; memSessions = {};
      try { window.localStorage.removeItem(DB_KEY); window.localStorage.removeItem(SESSION_KEY); } catch (e) { /* blocked */ }
    },
    signIn: function (kind, email) { return handle("GET", "auth/verify", { token: "demo:" + kind + ":" + String(email || "").toLowerCase() }, {}); },
    sampleRenters: function () {
      var db = load();
      return db.renters.slice(0, 7).map(function (r) {
        var tier = renterTier(r);
        return { email: r.email, firstName: r.firstName, lastName: r.lastName, address: r.address, story: r.story, lane: laneOf(tier), needsDob: !!r.noMatchUntilDob };
      });
    }
  };
})();
