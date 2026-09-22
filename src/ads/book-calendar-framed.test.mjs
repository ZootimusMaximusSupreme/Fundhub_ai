// The $297 booking page (/roadmap-book) frames the live /funding-book-call
// calendar. 04c-book-framed.html is pushed into that native page's head_code and
// strips it down to the scheduler ONLY when framed; the booking page sizes the
// frame from the height it posts. The standalone calendar must not change.
//
// npm test's glob is src/** only, so this sits here and reads the fragment files.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUSH_MANIFEST,
  upsertMarkedBlock,
} from "../../clickfunnels-fragments/tracking-manifest.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const FRAMED = "clickfunnels-fragments/04c-book-framed.html";
const BOOKING = "clickfunnels-fragments/slo/slo-02-booking.html";

function cssSelectors(html) {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{/g, "");
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) =>
    m[1].split(",").map((s) => s.trim()).filter(Boolean),
  );
}

test("framed layer is one marked block that does nothing on the standalone page", () => {
  const html = read(FRAMED).trim();
  assert.ok(html.startsWith("<!-- fh-framed:start"), "starts with the start marker");
  assert.ok(html.endsWith("<!-- fh-framed:end -->"), "ends with the end marker");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 2);
  for (const s of scripts) {
    assert.match(s, /if\(window\.self===window\.top\) return;/, "every script bails out when not framed");
  }
  const selectors = cssSelectors(html);
  assert.ok(selectors.length > 10);
  for (const sel of selectors) {
    assert.ok(sel.startsWith("html.fh-framed"), `selector must be framed-only: ${sel}`);
  }
});

test("framed layer hides the page chrome and posts its height to the booking page only", () => {
  const html = read(FRAMED);
  assert.match(html, /html\.fh-framed \.fh-root,/, "04a hero/logo and 04b marquee/footer hide");
  assert.match(html, /\[data-page-element="SectionContainer\/V1"\]:not\(:has\(\[data-page-element="AppointmentScheduler\/V1"\]\)\)/);
  assert.match(html, /#calContainer > div:first-child img/, "scheduler logo hides");
  assert.match(html, /postMessage\(\{type:'fh-book-height',h:h\},PARENT\)/);
  assert.match(html, /var PARENT='https:\/\/apply\.fundhub\.ai';/);
  assert.doesNotMatch(html, /postMessage\([^)]*'\*'\)/, "never posts to any origin");
});

test("booking page sizes the frame from fh-book-height and keeps the booked redirect", () => {
  const html = read(BOOKING);
  assert.match(
    html,
    /<iframe id="fh-book-frame"[^>]*src="https:\/\/apply\.fundhub\.ai\/funding-book-call"[^>]*min-height:600px/,
  );
  assert.match(html, /e\.origin!==ORIGIN\|\|e\.source!==f\.contentWindow/, "only the calendar frame may resize it");
  assert.match(html, /var ORIGIN='https:\/\/apply\.fundhub\.ai',MIN=600/);
  assert.match(html, /d\.type!=='fh-book-height'/);
  assert.match(html, /var KEY='fh_booking_v1',TY='\/roadmap-thank-you'/, "booked -> /roadmap-thank-you stays");
});

test("manifest pushes the framed layer as a head_code block on the native calendar page", () => {
  const row = PUSH_MANIFEST.find((r) => r.key === "apply-book-framed");
  assert.ok(row);
  assert.equal(row.strategy, "code_block_upsert");
  assert.equal(row.codeSlot, "head_code");
  assert.equal(row.marker, "fh-framed");
  assert.equal(row.fragment, FRAMED);
  const book = PUSH_MANIFEST.find((r) => r.key === "apply-book");
  assert.equal(row.pageId, book.pageId, "same native page as apply-book");
  assert.equal(book.strategy, "head_footer_append_only", "apply-book itself is unchanged");
});

test("upsertMarkedBlock appends, swaps only its own block, and skips when unchanged", () => {
  const v1 = "<!-- fh-x:start v1 -->\n<style>a{}</style>\n<!-- fh-x:end -->";
  const v2 = "<!-- fh-x:start v2 -->\n<style>b{}</style>\n<!-- fh-x:end -->";
  const pixel = "<script>fbq('init','1')</script>";

  const empty = upsertMarkedBlock("", v1, "fh-x");
  assert.deepEqual([empty.changed, empty.mode, empty.send], [true, "append", v1]);

  const add = upsertMarkedBlock(pixel, `\n${v1}\n`, "fh-x");
  assert.equal(add.mode, "append");
  assert.equal(add.send, v1, "append sends only the block, never the live code");
  assert.equal(add.next, `${pixel}\n${v1}`);

  const live = `${pixel}\n${v1}\n<script>after()</script>`;
  const same = upsertMarkedBlock(live, v1, "fh-x");
  assert.deepEqual([same.changed, same.mode, same.send], [false, "none", ""]);

  const swap = upsertMarkedBlock(live, v2, "fh-x");
  assert.equal(swap.mode, "replace");
  assert.equal(swap.send, `${pixel}\n${v2}\n<script>after()</script>`);

  assert.throws(() => upsertMarkedBlock("", "<style></style>", "fh-x"), /must start with/);
  assert.throws(() => upsertMarkedBlock("<!-- fh-x:start v1 -->", v2, "fh-x"), /no "<!-- fh-x:end -->"/);
  assert.throws(() => upsertMarkedBlock(`${v1}\n${v1}`, v2, "fh-x"), /twice/);
});
