// verifyStreetAddress (src/climate/connectors.mjs) — the address check the
// $297 pull form uses. The global fetch is stubbed; nothing leaves the machine.
// Every case uses its own address because answers are cached in memory.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { verifyStreetAddress, geocode } from "./connectors.mjs";

const realFetch = globalThis.fetch;
const KEYS = ["GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_BROWSER_KEY"];
let savedKeys = {};
let calls = [];

function stubFetch(answer) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    return answer(String(url), opts);
  };
}

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const census = (matches) => json({ result: { addressMatches: matches } });

beforeEach(() => {
  savedKeys = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) {
    if (savedKeys[k] === undefined) delete process.env[k];
    else process.env[k] = savedKeys[k];
  }
});

test("no Google key: the Census geocoder answers — a match", async () => {
  stubFetch(() => census([{ matchedAddress: "1 A ST, X, TX, 75001" }]));
  assert.equal(await verifyStreetAddress("1 Census Match St, Dallas, TX 75001"), "match");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/geocoding\.geo\.census\.gov\//);
});

test("no Google key: Census finds nothing — no_match", async () => {
  stubFetch(() => census([]));
  assert.equal(await verifyStreetAddress("2 Nowhere Fake Ln, Dallas, TX 75001"), "no_match");
});

test("geocoder down (HTTP 500, a throw, a bad body): unavailable, never no_match", async () => {
  stubFetch(() => json({}, 500));
  assert.equal(await verifyStreetAddress("3 Down St, Dallas, TX 75001"), "unavailable");
  stubFetch(() => { throw new Error("ECONNRESET"); });
  assert.equal(await verifyStreetAddress("4 Down St, Dallas, TX 75001"), "unavailable");
  stubFetch(() => json({ nope: true }));
  assert.equal(await verifyStreetAddress("5 Down St, Dallas, TX 75001"), "unavailable");
});

test("Google key set: a street-level Google hit is a match without asking Census", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  stubFetch(() => json({ status: "OK", results: [{ types: ["street_address"], address_components: [] }] }));
  assert.equal(await verifyStreetAddress("6 Google St, Dallas, TX 75001"), "match");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/maps\.googleapis\.com\//);
});

test("Google key set: a road-only Google guess is not a match; Census gets the last word", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  stubFetch((url) => (url.includes("googleapis")
    ? json({ status: "OK", results: [{ types: ["route"], address_components: [] }] })
    : census([])));
  assert.equal(await verifyStreetAddress("7 Guess St, Dallas, TX 75001"), "no_match");
  assert.equal(calls.length, 2);
});

test("Google ZERO_RESULTS and Census down: Google's answer stands — no_match", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  stubFetch((url) => (url.includes("googleapis") ? json({ status: "ZERO_RESULTS", results: [] }) : json({}, 503)));
  assert.equal(await verifyStreetAddress("8 Zero St, Dallas, TX 75001"), "no_match");
});

test("never a state-centroid fallback: a miss stays a miss even with a state in the text", async () => {
  stubFetch(() => census([]));
  assert.equal(await verifyStreetAddress("9 Centroid Fake Rd, Phoenix, AZ 85001"), "no_match");
});

test("geocode() keeps its old answers after the shared-lookup refactor", async () => {
  stubFetch(() => census([{ addressComponents: { state: "TX" }, coordinates: { x: -97, y: 33 }, matchedAddress: "10 A ST" }]));
  const hit = await geocode("10 Refactor St, Denton, TX 76205");
  assert.equal(hit.provider, "census");
  assert.equal(hit.lat, 33);
  stubFetch(() => census([]));
  const fallback = await geocode("11 Refactor Miss Road, Denton, TX 76205");
  assert.equal(fallback.provider, "centroid");
  assert.equal(fallback.stateCode, "TX");
});
