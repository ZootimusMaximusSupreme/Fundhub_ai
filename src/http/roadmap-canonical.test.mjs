// /roadmap has ONE address: https://apply.fundhub.ai/roadmap (owner ask 2026-10-02 —
// /roadmap and /roadmap/ were splitting tracking and Clarity).
//
// Two halves, both pinned here:
//   1. Netlify (netlify.toml): the old fundhub.ai/roadmap copy 301s to the ClickFunnels
//      page. pay.html and pull.html stay live — pull.html is SLO_PULL_PATH.
//   2. ClickFunnels serves /roadmap/ as a 200 and has no redirect API, and a custom HTML
//      page refuses head_code. So the slo-297-sales row carries a marked head block
//      (slo-canonical-head.html) that the push puts first in <head>: it rewrites
//      /roadmap/ to /roadmap with history.replaceState before the pixel, Clarity and
//      fh-attribution.js load.
//
// npm test's glob is src/** only, so this sits here and reads the repo files.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  PUSH_MANIFEST,
  wrapCustomHtmlDocument,
  headBlocksHtml,
  FH_ATTRIBUTION_SRC,
  FH_EVENTS_SRC,
  CLARITY_SRC,
} from "../../marketing/landing-pages/tracking-manifest.mjs";
import { SLO_PULL_PATH } from "../slo/offer.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const CANONICAL = "https://apply.fundhub.ai/roadmap";
const FRAGMENT = "marketing/landing-pages/slo/slo-canonical-head.html";
const ROW = Object.fromEntries(PUSH_MANIFEST.map((r) => [r.key, r]));

// ── 1. Netlify ────────────────────────────────────────────────────────────────

function redirectRules(toml) {
  return toml
    .split(/^\[\[redirects\]\]\s*$/m)
    .slice(1)
    .map((block) => {
      const body = block.split(/^\[/m)[0];
      const get = (k) => (body.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m")) || [])[1];
      return {
        from: get("from"),
        to: get("to"),
        status: Number((body.match(/^\s*status\s*=\s*(\d+)/m) || [])[1]),
        force: /^\s*force\s*=\s*true/m.test(body),
      };
    })
    .filter((r) => r.from);
}

const RULES = redirectRules(read("netlify.toml"));

/* Netlify's matching, as its docs state it: rules in file order, first match wins;
   /path and /path/ match the same rule; a rule whose `from` is a full URL only matches
   that host, a path-only rule matches every host; /x/* matches below /x/. A file at
   the path shadows the rule unless force = true. */
const trim = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
function netlifyMatch(url, { fileExists = false } = {}) {
  const u = new URL(url);
  const p = trim(u.pathname);
  for (const r of RULES) {
    let host = null;
    let from = r.from;
    if (/^https?:\/\//.test(from)) {
      const f = new URL(from);
      host = f.host;
      from = f.pathname;
    }
    if (host && host !== u.host) continue;
    let hit = false;
    if (from.endsWith("/*")) {
      const base = from.slice(0, -2);
      hit = p === base || p.startsWith(`${base}/`);
    } else {
      hit = p === trim(from);
    }
    if (!hit) continue;
    if (fileExists && !r.force) return null;
    return r;
  }
  return null;
}

describe("netlify.toml — the old fundhub.ai/roadmap goes to the one address", () => {
  for (const url of [
    "https://fundhub.ai/roadmap",
    "https://fundhub.ai/roadmap/",
    "https://fundhub.ai/roadmap/index.html",
  ]) {
    test(`${url} → 301 ${CANONICAL}, even though the folder exists`, () => {
      const r = netlifyMatch(url, { fileExists: true });
      assert.ok(r, `${url} must hit a rule`);
      assert.equal(r.to, CANONICAL);
      assert.equal(r.status, 301);
      assert.equal(r.force, true, "public/roadmap/index.html exists, so the rule must force");
    });
  }

  test("/slo goes straight to the one address (one hop, not via /roadmap/)", () => {
    const r = netlifyMatch("https://fundhub.ai/slo");
    assert.equal(r?.to, CANONICAL);
    assert.equal(r?.status, 301);
  });

  test("the rules carry no query string of their own, so Netlify passes UTMs, fbclid, ref and client_id through", () => {
    for (const r of RULES.filter((x) => x.to === CANONICAL)) {
      assert.ok(!r.to.includes("?") && !r.from.includes("?"), `${r.from} must not pin a query`);
    }
  });

  test("pay.html and pull.html still serve — pull.html is where Commas returns a payer", () => {
    assert.equal(SLO_PULL_PATH, "/roadmap/pull.html");
    for (const p of [SLO_PULL_PATH, "/roadmap/pay.html"]) {
      assert.equal(netlifyMatch(`https://fundhub.ai${p}`, { fileExists: true }), null, `${p} must not be redirected`);
    }
    assert.equal(netlifyMatch("https://fundhub.ai/slo/pull.html")?.to, "/roadmap/:splat", "old /slo/* links still reach them");
  });

  test("no rule still sends anyone to the old /roadmap/ page", () => {
    assert.deepEqual(RULES.filter((r) => r.to === "/roadmap/"), []);
  });

  test("apply.fundhub.ai (still a Netlify alias) is never redirected to itself", () => {
    for (const p of ["/roadmap", "/roadmap/"]) {
      const r = netlifyMatch(`https://apply.fundhub.ai${p}`, { fileExists: true });
      assert.equal(r, null, `apply.fundhub.ai${p} must not hit a rule — it would loop`);
    }
  });
});

// ── 2. ClickFunnels head block ───────────────────────────────────────────────

const BLOCK = read(FRAGMENT);
const BLOCK_JS = [...BLOCK.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

function runBlock(pathname, { search = "", hash = "", history = "ok" } = {}) {
  const calls = [];
  const win = {
    location: { pathname, search, hash },
  };
  if (history === "ok") {
    win.history = { state: { s: 1 }, replaceState: (...a) => calls.push(a) };
  } else if (history === "throws") {
    win.history = { state: null, replaceState: () => { throw new Error("SecurityError"); } };
  }
  win.window = win;
  vm.runInNewContext(BLOCK_JS[0], win);
  return calls;
}

describe("slo-canonical-head.html — /roadmap/ becomes /roadmap in the address bar", () => {
  test("one marked block, one script, one canonical link", () => {
    assert.ok(BLOCK.trim().startsWith("<!-- fh-canonical:start"));
    assert.ok(BLOCK.trim().endsWith("<!-- fh-canonical:end -->"));
    assert.equal(BLOCK_JS.length, 1);
    const links = [...BLOCK.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(links, [CANONICAL]);
  });

  test("an ad click on /roadmap/ keeps every parameter and the #fhw anchor", () => {
    const search = "?utm_source=fb_ad&utm_content=43-x&fbclid=abc&ref=pl_1&client_id=c-1&offer=197";
    const calls = runBlock("/roadmap/", { search, hash: "#fhw" });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], { s: 1 }, "the history state is kept");
    assert.equal(calls[0][2], `/roadmap${search}#fhw`);
  });

  test("/roadmap// collapses too; /roadmap and / are left alone", () => {
    assert.equal(runBlock("/roadmap//")[0][2], "/roadmap");
    assert.equal(runBlock("/roadmap").length, 0);
    assert.equal(runBlock("/").length, 0);
  });

  test("no history, or a history that throws, never breaks the page", () => {
    assert.doesNotThrow(() => runBlock("/roadmap/", { history: "none" }));
    assert.doesNotThrow(() => runBlock("/roadmap/", { history: "throws" }));
  });

  test("it never reloads or navigates", () => {
    assert.doesNotMatch(BLOCK_JS[0], /location\s*\.\s*(replace|assign|href\s*=|reload)/);
  });
});

describe("tracking-manifest.mjs — slo-297-sales carries the block first in <head>", () => {
  test("the row names the fragment and its marker; the other roadmap rows do not", () => {
    assert.deepEqual(ROW["slo-297-sales"].headBlocks, [{ fragment: FRAGMENT, marker: "fh-canonical" }]);
    assert.equal(ROW["slo-297-sales"].strategy, "custom_html_put", "whole-page write, same as before");
    for (const k of ["slo-297-booking", "slo-297-thank-you"]) assert.equal(ROW[k].headBlocks, undefined, k);
  });

  test("headBlocksHtml reads the block whole and refuses a block without its markers", () => {
    assert.equal(headBlocksHtml(ROW["slo-297-sales"], read), BLOCK.trim());
    assert.equal(headBlocksHtml(ROW["slo-297-booking"], read), "");
    assert.throws(() => headBlocksHtml({ headBlocks: [{ fragment: "x", marker: "fh-canonical" }] }, () => "<script></script>"));
  });

  test("the rewrite runs before the pixel, Clarity, the SDK and every body script, once", () => {
    const html = wrapCustomHtmlDocument({
      bodyHtml: "<div id=\"fhw\"></div>",
      pageToken: "cfp_x",
      pixelId: "2403674420141513",
      includeVslBeacon: true,
      headFirstHtml: headBlocksHtml(ROW["slo-297-sales"], read),
      env: { CLARITY_PROJECT_ID: "p1" },
    });
    const at = (s) => html.indexOf(s);
    const rewrite = at("replaceState");
    assert.ok(rewrite > at('<meta charset="utf-8">'), "charset stays first");
    for (const later of ["fbq('init'", CLARITY_SRC, "sdk.myclickfunnels.com", FH_ATTRIBUTION_SRC, FH_EVENTS_SRC]) {
      assert.ok(at(later) > rewrite, `${later} must load after the rewrite`);
    }
    assert.ok(rewrite < at("</head>"));
    assert.equal(html.split("fh-canonical:start").length - 1, 1);
    assert.equal(html.split('rel="canonical"').length - 1, 1);
  });

  test("a row without head blocks wraps exactly as before", () => {
    const opts = { bodyHtml: "<p>x</p>", pixelId: "1", includeVslBeacon: false, env: {} };
    assert.equal(wrapCustomHtmlDocument({ ...opts, headFirstHtml: "" }), wrapCustomHtmlDocument(opts));
    assert.doesNotMatch(wrapCustomHtmlDocument(opts), /canonical/);
  });

  test("the push script hands the row's head blocks to the wrapper", () => {
    const src = read("scripts/cf-push-custom-html.mjs");
    assert.match(src, /wrapCustomHtmlDocument\(\{[\s\S]*?headFirstHtml:\s*headBlocksHtml\(row, readFragment\)[\s\S]*?\}\)/);
  });
});
