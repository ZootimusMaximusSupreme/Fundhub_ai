import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER, SANDBOX, listListings, parseCsv, parseListingsCsv } from "./csv.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const parse = (text, opts = {}) => parseListingsCsv(text, { now: NOW, ...opts });

test("it is a sandbox connector", () => {
  assert.equal(PROVIDER, "csv");
  assert.equal(SANDBOX, true);
});

describe("parseCsv", () => {
  test("plain rows, LF and CRLF and CR", () => {
    for (const nl of ["\n", "\r\n", "\r"]) {
      assert.deepEqual(parseCsv(`a,b${nl}1,2${nl}`).rows, [["a", "b"], ["1", "2"]]);
    }
  });
  test("quoted fields hold commas, quotes and line breaks", () => {
    const { rows } = parseCsv('a,b\n"x, y","say ""hi"""\n"two\nlines",z');
    assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  });
  test("drops a byte-order mark and blank lines, keeps empty cells", () => {
    assert.deepEqual(parseCsv("﻿a,b\n\n1,\n,\n3,4").rows, [["a", "b"], ["1", ""], ["3", "4"]]);
  });
  test("a last row without a newline is kept", () => {
    assert.deepEqual(parseCsv("a\n1").rows, [["a"], ["1"]]);
  });
  test("reports a quote that never closes", () => {
    assert.equal(parseCsv('a,b\n"oops,2').unterminatedQuote, true);
    assert.equal(parseCsv('a,b\n"fine",2').unterminatedQuote, false);
  });
  test("empty input", () => {
    assert.deepEqual(parseCsv("").rows, []);
    assert.deepEqual(parseCsv(null).rows, []);
  });
});

describe("a clean file", () => {
  const text = [
    "Unit,Beds,Baths,Sq Ft,Rent,Available,Specials",
    "101,1,1,710,\"$1,525\",11/1/2026,One month free",
    "214,2,2,\"1,040\",1895.00,2026-11-15,",
    "305,Studio,1,520,$1299,now,"
  ].join("\n");

  test("every row becomes a listing in cents, with dates as ISO", () => {
    const out = parse(text);
    assert.deepEqual(out.errors, []);
    assert.equal(out.rowCount, 3);
    assert.deepEqual(out.listings, [
      { unit_label: "101", beds: 1, baths: 1, sqft: 710, rent_cents: 152500, available_on: "2026-11-01", specials: "One month free", source: "csv" },
      { unit_label: "214", beds: 2, baths: 2, sqft: 1040, rent_cents: 189500, available_on: "2026-11-15", specials: null, source: "csv" },
      { unit_label: "305", beds: 0, baths: 1, sqft: 520, rent_cents: 129900, available_on: "2026-10-07", specials: null, source: "csv" }
    ]);
  });
  test("reports which header each field was read from", () => {
    assert.deepEqual(parse(text).columns, {
      unit_label: "Unit", rent: "Rent", beds: "Beds", baths: "Baths", sqft: "Sq Ft", available_on: "Available", specials: "Specials"
    });
  });
});

describe("column names and mapping", () => {
  test("usual spellings are found without a mapping", () => {
    const out = parse("Apt #,Bedrooms,Bathrooms,Square Feet,Monthly Rent,Date Available\nB12,3 BR,2 BA,1380 sq ft,2395,12/1/26");
    assert.deepEqual(out.errors, []);
    assert.deepEqual(out.listings[0], {
      unit_label: "B12", beds: 3, baths: 2, sqft: 1380, rent_cents: 239500, available_on: "2026-12-01", specials: null, source: "csv"
    });
  });
  test("an explicit mapping overrides the aliases", () => {
    const out = parse("Door,Asking\n7,\"$1,100\"", { mapping: { unit_label: "Door", rent: "Asking" } });
    assert.deepEqual(out.errors, []);
    assert.equal(out.listings[0].unit_label, "7");
    assert.equal(out.listings[0].rent_cents, 110000);
  });
  test("a mapped name matches ignoring case, spaces and punctuation", () => {
    const out = parse("DOOR NO.,Asking Rent\n7,1100", { mapping: { unit_label: "door no", rent: "asking-rent" } });
    assert.equal(out.listings.length, 1);
  });
  test("a mapping to a column that is not there leaves the field unmapped, which fails if it is required", () => {
    const out = parse("Unit,Rent\n1,1000", { mapping: { rent: "Nope" } });
    assert.equal(out.listings.length, 0);
    assert.match(out.errors[0].message, /rent column/);
  });
  test("rent_cents is read as whole cents", () => {
    const out = parse("Unit,Rent Cents\n1,\"152,500\"\n2,12.5");
    assert.equal(out.listings[0].rent_cents, 152500);
    assert.equal(out.errors.length, 1);
    assert.equal(out.errors[0].field, "rent_cents");
  });
});

describe("per-row errors never sink the file", () => {
  const text = [
    "Unit,Beds,Baths,Sqft,Rent,Available",
    "101,1,1,700,1500,2026-11-01", // ok
    ",1,1,700,1500,2026-11-01", // no unit
    "103,1,1,700,,2026-11-01", // no rent
    "104,1,1,700,cheap,2026-11-01", // bad rent
    "105,lots,1,700,1500,2026-11-01", // bad beds
    "106,1,1,huge,1500,2026-11-01", // bad sqft
    "107,1,1,700,1500,2026-02-30", // bad date
    "101,1,1,700,1500,2026-11-01", // duplicate unit
    "109,1,1.5,700,1500,11/30/2026" // ok
  ].join("\n");

  test("good rows still import and each bad row is reported with its row number", () => {
    const out = parse(text);
    assert.deepEqual(out.listings.map((l) => l.unit_label), ["101", "109"]);
    assert.equal(out.rowCount, 9);
    assert.deepEqual(out.errors.map((e) => [e.row, e.field]), [
      [3, "unit_label"], [4, "rent"], [5, "rent"], [6, "beds"], [7, "sqft"], [8, "available_on"], [9, "unit_label"]
    ]);
    for (const e of out.errors) assert.ok(e.message.length > 5);
    assert.match(out.errors.find((e) => e.row === 9).message, /already listed/);
    assert.match(out.errors.find((e) => e.row === 5).message, /"cheap"/);
  });
  test("a row can have several problems, all reported", () => {
    const out = parse("Unit,Beds,Rent\n1,x,y");
    assert.deepEqual(out.errors.map((e) => e.field).sort(), ["beds", "rent"]);
  });
  test("duplicate units are found whatever the case", () => {
    const out = parse("Unit,Rent\nA1,1000\na1,1100");
    assert.equal(out.listings.length, 1);
    assert.equal(out.errors[0].row, 3);
  });
  test("a zero rent is an error", () => {
    assert.equal(parse("Unit,Rent\n1,0").errors[0].field, "rent");
    assert.equal(parse("Unit,Rent\n1,$0.00").errors[0].field, "rent");
  });
  test("short rows are padded and extra cells ignored", () => {
    const out = parse("Unit,Rent,Beds\n1,1000\n2,1100,2,extra,more");
    assert.deepEqual(out.errors, []);
    assert.deepEqual(out.listings.map((l) => l.beds), [null, 2]);
  });
});

describe("whole-file problems", () => {
  test("a missing required column is one clear error and no listings", () => {
    const noUnit = parse("Beds,Rent\n1,1000");
    assert.equal(noUnit.listings.length, 0);
    assert.equal(noUnit.errors.length, 1);
    assert.match(noUnit.errors[0].message, /unit column/);
    const neither = parse("Beds,Baths\n1,1");
    assert.match(neither.errors[0].message, /unit column.*and.*rent column/);
  });
  test("empty file, header-only file, and an unterminated quote", () => {
    assert.match(parse("").errors[0].message, /empty/);
    const headerOnly = parse("Unit,Rent");
    assert.deepEqual(headerOnly.errors, []);
    assert.deepEqual(headerOnly.listings, []);
    assert.equal(headerOnly.rowCount, 0);
    assert.match(parse('Unit,Rent\n"1,1000').errors[0].message, /never closes/);
  });
});

describe("cell formats", () => {
  const one = (cells, header = "Unit,Rent,Beds,Baths,Sqft,Available") => parse(`${header}\n${cells}`);

  test("rent: dollars, symbols, commas, cents", () => {
    for (const [raw, cents] of [["1550", 155000], ["$1,550", 155000], ["1550.5", 155050], ["$1,550.55", 155055], [" 900 ", 90000]]) {
      assert.equal(one(`1,"${raw}"`).listings[0]?.rent_cents, cents, raw);
    }
    for (const raw of ["abc", "-5", "12.345", "$"]) assert.equal(one(`1,"${raw}"`).listings.length, 0, raw);
  });
  test("beds: numbers, studio, br suffixes", () => {
    for (const [raw, beds] of [["0", 0], ["Studio", 0], ["studio", 0], ["2", 2], ["2BR", 2], ["3 bed", 3], ["4 Bedrooms", 4]]) {
      assert.equal(one(`1,1000,${raw}`).listings[0].beds, beds, raw);
    }
    assert.equal(one("1,1000,").listings[0].beds, null);
  });
  test("baths: halves allowed", () => {
    assert.equal(one("1,1000,1,1.5").listings[0].baths, 1.5);
    assert.equal(one("1,1000,1,2 BA").listings[0].baths, 2);
    assert.equal(one("1,1000,1,many").errors[0].field, "baths");
  });
  test("dates: ISO, month/day/year, two-digit year, now, and impossible days", () => {
    const d = (raw) => one(`1,1000,1,1,700,${raw}`);
    assert.equal(d("2026-11-01").listings[0].available_on, "2026-11-01");
    assert.equal(d("2026-1-5").listings[0].available_on, "2026-01-05");
    assert.equal(d("1/5/2027").listings[0].available_on, "2027-01-05");
    assert.equal(d("1/5/27").listings[0].available_on, "2027-01-05");
    assert.equal(d("Available Now").listings[0].available_on, "2026-10-07");
    assert.equal(d("immediately").listings[0].available_on, "2026-10-07");
    for (const bad of ["2026-02-30", "13/1/2026", "soon", "2026/11/01"]) assert.equal(d(bad).errors[0].field, "available_on", bad);
  });
  test("optional columns can be missing entirely", () => {
    const out = parse("Unit,Rent\n1,1000");
    assert.deepEqual(out.listings[0], {
      unit_label: "1", beds: null, baths: null, sqft: null, rent_cents: 100000, available_on: null, specials: null, source: "csv"
    });
  });
});

describe("connector methods", () => {
  test("listListings returns listings and errors", async () => {
    const out = await listListings({ csvText: "Unit,Rent\n1,1000\n2,x", now: NOW });
    assert.equal(out.listings.length, 1);
    assert.equal(out.errors.length, 1);
  });
  test("pushGuestCard builds the registration email and getLeaseStatus defers to the portal", async () => {
    const { pushGuestCard, getLeaseStatus } = await import("./csv.mjs");
    const push = await pushGuestCard({ renter: { email: "r@example.com" }, building: { leasing_email: "l@example.com" }, registrationSentAt: NOW });
    assert.equal(push.ok, true);
    assert.equal((await getLeaseStatus()).known, false);
  });
});
