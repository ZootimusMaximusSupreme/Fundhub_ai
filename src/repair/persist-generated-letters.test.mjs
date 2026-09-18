import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { letterHtml, persistGeneratedLetters } from "./persist-generated-letters.mjs";
import { makeFakeDb } from "../documents/fake-db.mjs";
import { createStore, memoryProvider } from "../documents/store.mjs";

describe("letterHtml", () => {
  it("is the letter body, escaped, not a second draft", () => {
    const html = letterHtml("Dear Experian\nI dispute <bad> & stuff.", {
      bureau: "EX",
      round: "R1",
      target: "bureau"
    });
    assert.match(html, /Dear Experian/);
    assert.match(html, /&lt;bad&gt; &amp; stuff/);
    assert.match(html, /Experian R1/);
  });
});

describe("persistGeneratedLetters", () => {
  it("refuses without a store — never invents a second writer", async () => {
    const out = await persistGeneratedLetters({}, null, {
      orgId: "org-1",
      clientId: "client-1",
      letters: [{ bureau: "EX", body_text: "Dear Experian", letterId: "L1" }]
    });
    assert.deepEqual(out.stored, []);
    assert.equal(out.skipped, "missing_args");
  });

  it("saves the same body the bureau row already holds", async () => {
    const db = makeFakeDb();
    const store = createStore({ provider: memoryProvider() });
    const body = "Dear Equifax\nPlease delete the Midland collection.";
    const out = await persistGeneratedLetters(db, store, {
      orgId: "org-1",
      clientId: "client-1",
      round: "R1",
      letters: [{
        bureau: "EQ",
        round: "R1",
        target: "bureau",
        letterId: "letter-eq",
        body_text: body
      }]
    });
    assert.equal(out.stored.length, 1);
    assert.equal(out.stored[0].bureau, "EQ");
    const row = db._documents[0];
    assert.ok(row, "a document row was registered");
    assert.equal(row.kind, "deliverable");
    assert.equal(row.subtype, "metro2_dispute_letter_pack");
    assert.equal(row.mime_type, "text/html");
    assert.match(row.title, /Equifax/);
    const got = await store.get(row.storage_key);
    assert.match(got.body.toString("utf8"), /Please delete the Midland collection/);
  });
});
