// Straight-line distance for backup ranking. Pure: no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { centroid, milesBetween, toPoint } from "./geo.mjs";

const PHOENIX = { lat: 33.4484, lng: -112.0740 };
const TEMPE = { lat: 33.4255, lng: -111.9400 };
const LA = { lat: 34.0522, lng: -118.2437 };

test("the same point is zero miles away", () => {
  assert.equal(milesBetween(PHOENIX, PHOENIX), 0);
});

test("Phoenix to Tempe is about eight miles, Phoenix to Los Angeles about 360", () => {
  const near = milesBetween(PHOENIX, TEMPE);
  assert.ok(near > 7 && near < 9, `got ${near}`);
  const far = milesBetween(PHOENIX, LA);
  assert.ok(far > 340 && far < 380, `got ${far}`);
});

test("distance is symmetric", () => {
  assert.equal(milesBetween(PHOENIX, TEMPE), milesBetween(TEMPE, PHOENIX));
});

test("a missing or impossible coordinate is null, never zero", () => {
  assert.equal(milesBetween(PHOENIX, { lat: null, lng: null }), null);
  assert.equal(milesBetween(PHOENIX, {}), null);
  assert.equal(milesBetween(PHOENIX, { lat: 95, lng: 0 }), null);
  assert.equal(milesBetween(PHOENIX, { lat: 0, lng: 181 }), null);
  assert.equal(toPoint({ lat: "", lng: "" }), null);
});

test("numeric strings (how pg returns numeric) are read as numbers", () => {
  assert.deepEqual(toPoint({ lat: "33.448400", lng: "-112.074000" }), PHOENIX);
});

test("centroid averages the points that have coordinates and ignores the rest", () => {
  assert.equal(centroid([]), null);
  assert.equal(centroid([{ lat: null, lng: null }]), null);
  const c = centroid([{ lat: 10, lng: 20 }, { lat: 20, lng: 40 }, {}]);
  assert.deepEqual(c, { lat: 15, lng: 30 });
});
