// Pure tests for the request-body readers. No database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { YdError } from "./http.mjs";
import {
  bodyOf, reqString, optString, reqUuid, optUuid, optBool, optInt, reqInt, optNumber, optEnum, reqEnum,
  emailOf, optEmail, dateOnly, optDateOnly, timestampOf, stateCode, optStateCode
} from "./validate.mjs";

const refuses = (fn, code) => assert.throws(fn, (e) => e instanceof YdError && e.status === 400 && (code ? e.code === code : true));
const UUID = "11111111-1111-4111-8111-111111111111";

test("body: an object, a JSON string, or nothing; never an array or a number", () => {
  assert.deepEqual(bodyOf({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(bodyOf({ body: '{"a":1}' }), { a: 1 });
  assert.deepEqual(bodyOf({}), {});
  assert.deepEqual(bodyOf({ body: null }), {});
  refuses(() => bodyOf({ body: "{nope" }), "invalid_body");
  refuses(() => bodyOf({ body: [1] }), "invalid_body");
  refuses(() => bodyOf({ body: 5 }), "invalid_body");
});

test("strings: required trims and limits; optional tells 'not sent' from 'cleared'", () => {
  assert.equal(reqString({ n: "  Ann  " }, "n"), "Ann");
  refuses(() => reqString({}, "n", "the name"), "n_required");
  refuses(() => reqString({ n: "   " }, "n"), "n_required");
  refuses(() => reqString({ n: 5 }, "n"), "n_required");
  refuses(() => reqString({ n: "x".repeat(201) }, "n"), "too_long");
  assert.equal(optString({}, "n"), undefined);
  assert.equal(optString({ n: null }, "n"), null);
  assert.equal(optString({ n: "  " }, "n"), null);
  assert.equal(optString({ n: " a " }, "n"), "a");
  refuses(() => optString({ n: 4 }, "n"));
});

test("ids: a real uuid or a 400", () => {
  assert.equal(reqUuid({ id: UUID }, "id"), UUID);
  refuses(() => reqUuid({}, "id"), "id_required");
  refuses(() => reqUuid({ id: "nope" }, "id"), "invalid_parameter");
  assert.equal(optUuid({}, "id"), undefined);
  assert.equal(optUuid({ id: null }, "id"), null);
  refuses(() => optUuid({ id: "x" }, "id"));
});

test("numbers: whole numbers must be JSON numbers (a quoted number is refused), within range", () => {
  assert.equal(optInt({ n: 5 }, "n"), 5);
  assert.equal(optInt({}, "n"), undefined);
  assert.equal(optInt({ n: null }, "n"), null);
  refuses(() => optInt({ n: "5" }, "n"));
  refuses(() => optInt({ n: 5.5 }, "n"));
  refuses(() => optInt({ n: 11 }, "n", "n", { max: 10 }));
  refuses(() => optInt({ n: -1 }, "n", "n", { min: 0 }));
  assert.equal(reqInt({ n: 0 }, "n"), 0);
  refuses(() => reqInt({}, "n"), "n_required");
  refuses(() => reqInt({ n: null }, "n"), "n_required");
  assert.equal(optNumber({ n: 1.5 }, "n"), 1.5);
  refuses(() => optNumber({ n: "1.5" }, "n"));
  refuses(() => optNumber({ n: NaN }, "n"));
  refuses(() => optNumber({ n: 200 }, "n", "n", { max: 100 }));
});

test("booleans and choices", () => {
  assert.equal(optBool({ b: false }, "b"), false);
  assert.equal(optBool({}, "b"), undefined);
  refuses(() => optBool({ b: "true" }, "b"));
  assert.equal(optEnum({ k: "a" }, "k", ["a", "b"]), "a");
  assert.equal(optEnum({}, "k", ["a"]), undefined);
  assert.equal(optEnum({ k: "" }, "k", ["a"]), null);
  refuses(() => optEnum({ k: "z" }, "k", ["a", "b"]));
  assert.equal(reqEnum({ k: "b" }, "k", ["a", "b"]), "b");
  refuses(() => reqEnum({}, "k", ["a"]), "k_required");
});

test("emails, dates, times, states", () => {
  assert.equal(emailOf("  Pat@Example.TEST "), "pat@example.test");
  refuses(() => emailOf("pat"), "invalid_email");
  refuses(() => emailOf(null));
  assert.equal(optEmail({}, "e"), undefined);
  assert.equal(optEmail({ e: "" }, "e"), null);
  refuses(() => optEmail({ e: "x" }, "e"));

  assert.equal(dateOnly("2026-02-28"), "2026-02-28");
  assert.equal(dateOnly("2028-02-29"), "2028-02-29");
  for (const bad of ["2026-02-30", "2026-13-01", "26-01-01", "2026/01/01", "", null, 5, "1800-01-01"]) refuses(() => dateOnly(bad), "invalid_date");
  assert.equal(optDateOnly({}, "d"), undefined);
  assert.equal(optDateOnly({ d: null }, "d"), null);

  assert.equal(timestampOf("2026-10-07T12:00:00Z").toISOString(), "2026-10-07T12:00:00.000Z");
  refuses(() => timestampOf("whenever"), "invalid_time");
  refuses(() => timestampOf(undefined), "invalid_time");
  refuses(() => timestampOf(12345), "invalid_time");

  assert.equal(stateCode(" az "), "AZ");
  refuses(() => stateCode("Arizona"), "invalid_state");
  assert.equal(optStateCode({}, "s"), undefined);
  assert.equal(optStateCode({ s: "" }, "s"), null);
});
