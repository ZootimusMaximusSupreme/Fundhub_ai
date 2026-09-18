// N20 — the inquiry upload box must let a client name proof of address.
//
// WHY THIS FILE EXISTS. Live look 2026-09-18 on #13 Thirteen-NoBook, an
// inquiry-only client: the portal note read "We still need proof of your
// address — a bank statement counts. Send them through the inquiry documents
// door below." That box was the only upload box on her screen, and its type
// list offered FTC report, Photo ID and "Something else". No address choice.
// And even a hand-typed proof_of_address would have been filed as "other",
// because src/documents/kinds.mjs did not list it for kind inquiry_doc — so the
// identity packet (src/inquiry-ops/doc-gate.mjs) could never see it arrive.
//
// Reads the shipped HTML the way the rest of the portal tests do, and checks
// each choice against the same list api/documents-upload.mjs files by.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownSubtype } from "../documents/kinds.mjs";
import { checkDocPacket } from "../inquiry-ops/doc-gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL = path.resolve(HERE, "../../public/app/client-portal.html");
const html = fs.readFileSync(PORTAL, "utf8");

/** Every upload box on the page: its kind and the values in its type list. */
function doors() {
  const out = [];
  const re = /<div class="upload-door[^"]*" data-kind="([a-z_]+)">([\s\S]*?)<\/select>/g;
  let m;
  while ((m = re.exec(html))) {
    const values = [...m[2].matchAll(/<option value="([^"]*)">/g)].map((o) => o[1]);
    out.push({ kind: m[1], values });
  }
  return out;
}

/** What api/documents-upload.mjs stores for a chosen type (line: subtype = …). */
function filedAs(kind, chosen) {
  return chosen && isKnownSubtype(kind, chosen) ? chosen : "other";
}

describe("N20 — the inquiry documents box offers proof of address", () => {
  const all = doors();
  const inquiry = all.find((d) => d.kind === "inquiry_doc");

  test("the page has the inquiry documents box", () => {
    assert.ok(inquiry, "no upload box with data-kind=\"inquiry_doc\" in client-portal.html");
    assert.match(html, /the inquiry documents door below/,
      "the note that points clients at this box is gone — re-read N20 before changing this test");
  });

  test("its type list has Proof of address and Bank statement — the two papers the note asks for", () => {
    assert.ok(inquiry.values.includes("proof_of_address"),
      "the note asks for proof of address and this box has no choice for it");
    assert.ok(inquiry.values.includes("bank_statement"),
      "the note says a bank statement counts and this box has no choice for it");
    assert.ok(inquiry.values.includes("id_document"),
      "the note asks for a photo ID through this box too");
  });

  test("a proof of address sent through that box is filed as proof_of_address, not 'other'", () => {
    assert.equal(filedAs("inquiry_doc", "proof_of_address"), "proof_of_address");
    assert.equal(filedAs("inquiry_doc", "bank_statement"), "bank_statement");
  });

  test("every choice in every upload box is filed under the name the client picked", () => {
    assert.ok(all.length >= 3, `expected three upload boxes, found ${all.length}`);
    for (const d of all) {
      for (const v of d.values.filter(Boolean)) {
        assert.equal(filedAs(d.kind, v), v,
          `box ${d.kind}: choice "${v}" would be stored as "other"`);
      }
    }
  });

  test("the identity packet counts an address paper that came through that box", () => {
    for (const subtype of ["proof_of_address", "bank_statement"]) {
      const packet = checkDocPacket([
        { kind: "inquiry_doc", subtype: "id_document" },
        { kind: "inquiry_doc", subtype: filedAs("inquiry_doc", subtype) }
      ], { signedAuthorization: true });
      assert.equal(packet.present.proof_of_address, true, `${subtype} not counted`);
      assert.equal(packet.complete, true, `${subtype}: packet still says ${packet.missing.join(", ")}`);
    }
  });
});
