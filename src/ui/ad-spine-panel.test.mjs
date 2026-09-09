// src/ui/ad-spine-panel.test.mjs — the CM-11 panel on the campaign manager
// screen, proved against the file the browser actually loads.
//
// WHY THIS TEST READS AN HTML FILE. public/app/campaign-manager.html is a
// single page with its script inline. There is no module to import and no
// build step, so the only honest thing to read is the file itself. The repo
// already does exactly this from a test — src/http/crm-html.test.mjs:316-318
// reads this same file as text.
//
// npm test's glob is src/** and scripts/** only (CLAUDE.md §12), which is why
// this sits here and not beside the page.
//
// THE ONE RULE THIS GUARDS: A DASH IS NOT A ZERO. The read hands back null for
// "nobody told us" and a real number for a real zero. If someone "tidies up" a
// cell with `|| 0`, an unknown silently becomes a counted zero and every other
// check in the repo still passes. That is what these assertions stop.
//
// WHAT THIS CANNOT TEST, said plainly rather than faked: nothing here runs the
// page. Whether the table fits, whether a stale answer really is dropped, and
// whether the dash renders grey are all browser questions. No assertion below
// pretends to answer one. No database is touched, so this runs anywhere.

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PAGE = path.join(ROOT, "public", "app", "campaign-manager.html");
const ENDPOINT = path.join(ROOT, "api", "read", "ad-spine.mjs");

const HTML = fs.readFileSync(PAGE, "utf8");
const SPINE_SRC = fs.readFileSync(ENDPOINT, "utf8");

/* The CM-11 script block: from its own banner comment down to the next panel's.
   Sliced rather than line-numbered, so an edit above it does not break this. */
function block() {
  const a = HTML.indexOf("/* ══ CM-11 · WHICH ANGLE AND WHICH HOOK ARE WORKING");
  const b = HTML.indexOf("/* ══ CM-07 · CONNECTIONS", a);
  assert.ok(a > -1, "the CM-11 script banner is gone from campaign-manager.html");
  assert.ok(b > a, "the CM-07 banner that ends the CM-11 block is gone");
  return HTML.slice(a, b);
}

/* The same block with every comment removed. Assertions about CODE run against
   this, so a sentence in a comment can never satisfy or break one. */
function code() {
  return block()
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

/* The markup for the card, which is above the script and separate from it. */
function card() {
  const a = HTML.indexOf('<div class="card" id="secAdSpine">');
  const b = HTML.indexOf("</table>", a);
  assert.ok(a > -1, "the CM-11 card #secAdSpine is gone from campaign-manager.html");
  assert.ok(b > a, "the CM-11 table is gone from the card");
  return HTML.slice(a, b);
}

describe("CM-11 ad spine panel — a dash is never turned into a zero", () => {
  test("no cell coalesces an unknown into a number", () => {
    const src = code();
    for (const bad of ["|| 0", "||0", "?? 0", "??0", "coalesce", "COALESCE"]) {
      assert.ok(
        !src.includes(bad),
        `CM-11 contains "${bad}". That turns "nobody told us" into a counted zero.`
      );
    }
    assert.ok(!/Number\([^)]*\)\s*\|\|/.test(src), "CM-11 falls back off a Number() — an unknown would become a number");
  });

  test("every nullable figure is tested for null before it is formatted", () => {
    const src = code();
    /* The four the endpoint can return null for, plus the two rate objects that
       carry a status instead of a bare number. */
    for (const f of ["spend_cents", "people", "people_booked", "cost_cents"]) {
      /* Either direction counts — the guard is written as "is null → dash" for
         some fields and "is not null → format" for others. */
      const re = new RegExp(`${f}\\s*[!=]==\\s*null`);
      assert.ok(re.test(src), `CM-11 never asks whether ${f} is null before formatting it`);
    }
    assert.ok(/status\s*===\s*'MEASURED'/.test(src), "CM-11 no longer checks a rate's MEASURED status");
    assert.ok(/unknownCell\(/.test(src), "unknownCell — the grey dash that carries the reason — is gone");
  });

  test("the sample-size rule is the server's, never a number typed into the screen", () => {
    /* costPerBooked refuses to divide under its own minimum and says so
       (src/ops/meta-marketing.mjs). The screen prints that refusal. If a
       threshold is ever typed in here the two can disagree silently. */
    const src = code();
    assert.ok(!/(?:[<>]=?|[=!]==?)\s*10\b/.test(src), "CM-11 compares something against 10 — the sample-size rule belongs on the server");
    assert.ok(!/\b10\s*(?:[<>]=?|[=!]==?)/.test(src), "CM-11 compares 10 against something — the sample-size rule belongs on the server");
  });

  test("the header count, the cell count and the empty row's span all agree", () => {
    const head = card();
    const headers = head.match(/<th>/g) || [];
    assert.strictEqual(headers.length, 8, "the CM-11 table no longer has eight headers");

    const src = code();
    const row = src.slice(src.indexOf("return '<tr>'"), src.indexOf("'</tr>'"));
    const cells = row.match(/<td/g) || [];
    assert.strictEqual(cells.length, 8, "the CM-11 row does not draw eight cells");

    assert.ok(/panelRow\(8, 'adspine'/.test(src), "the CM-11 empty row does not span all eight columns");
  });

  test("the wide cost cell is not held on one line", () => {
    /* .mnum sets white-space:nowrap. The refusal sentence printed in the cost
       cell is long, so the CELL must not carry that class — only the figure. */
    const src = code();
    const row = src.slice(src.indexOf("return '<tr>'"), src.indexOf("'</tr>'"));
    assert.ok(row.includes("'<td>' + cost + '</td>'"), "the cost cell carries a class again — a long sentence in it cannot wrap");
    assert.ok(/<span class="mnum"><b>' \+ cents\(c\.cost_cents\)/.test(src), "the cost figure is no longer the thing wearing .mnum");
  });

  test("a slower answer cannot land under a newer heading", () => {
    const src = code();
    assert.ok(/var seq = \+\+SPINE_SEQ;/.test(src), "readAdSpine no longer claims a sequence number");
    assert.ok(/if\(seq !== SPINE_SEQ\) return res;/.test(src), "readAdSpine no longer drops a stale answer");
    assert.ok(/var SPINE_SEQ = 0;/.test(HTML), "SPINE_SEQ is not declared on the page");
  });

  test("the picker's five groups are exactly the five the endpoint accepts", () => {
    /* Read as text, not imported: importing the handler pulls in the database
       module. GROUPS is Object.keys(LABELS), so the keys of LABELS are it. */
    assert.ok(
      /export const GROUPS = Object\.freeze\(Object\.keys\(LABELS\)\);/.test(SPINE_SRC),
      "GROUPS is no longer the keys of LABELS — this test reads the wrong thing now"
    );
    const labels = SPINE_SRC.slice(
      SPINE_SRC.indexOf("export const LABELS = Object.freeze({"),
      SPINE_SRC.indexOf("export const GROUPS")
    );
    const server = [...labels.matchAll(/^\s{2}(\w+):\s*Object\.freeze\(/gm)].map((m) => m[1]);
    assert.strictEqual(server.length, 5, "api/read/ad-spine.mjs no longer declares five labels");

    const picked = HTML.match(/var SPINE_GROUPS = \[([^\]]*)\];/);
    assert.ok(picked, "SPINE_GROUPS is gone from campaign-manager.html");
    const screen = [...picked[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepStrictEqual(
      screen,
      server,
      "the label buttons and the endpoint's groups disagree — a renamed group would draw an empty table"
    );
  });
});
