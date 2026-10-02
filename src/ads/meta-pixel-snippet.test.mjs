// src/ads/meta-pixel-snippet.test.mjs — the Meta pixel head snippet (Phase 4, page side).
//
// Contract: docs/tracking/meta-events.md "Phase 4 contract":
//   PageView: the head pixel snippet sets window.__fhPv = "pv.<fh_sid>.<random>" and fires
//   fbq('track','PageView',{}, {eventID: window.__fhPv}); the tracker's page_view carries
//   meta_event_id = window.__fhPv.
//   META_PIXEL_ID env (fallback 2403674420141513).
//
// Every page must fire exactly ONE PageView, and it must carry that event id. The
// sources: the ClickFunnels funnel head of 968281 (builder steps), the custom HTML
// wrapper (/apply, /roadmap, /roadmap-book, /roadmap-thank-you), and the fundhub.ai
// homepage (public/index.html). The snippet's own script is RUN here in a vm.
//
// npm test's glob is src/** and scripts/** only (CLAUDE.md §12).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  META_PIXEL_FALLBACK_ID,
  metaPixelId,
  metaPixelHeadHtml,
  nextFunnelHeadCode,
  nextHeadCode,
  wrapCustomHtmlDocument,
  headBlocksHtml,
  PUSH_MANIFEST,
} from "../../marketing/landing-pages/tracking-manifest.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const count = (hay, needle) => String(hay).split(needle).length - 1;

const BARE_PAGEVIEW = "fbq('track', 'PageView');";
const ID_PAGEVIEW = "fbq('track', 'PageView', {}, {eventID: window.__fhPv});";

/** Run the snippet's <script> the way a browser would: a window with sessionStorage,
    a document the fbevents loader can insert into. Returns the window. */
function runSnippet(html, { storage = {}, storageThrows = false, win = null } = {}) {
  const scripts = [...String(html).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1, "a script block");
  const w = win || (() => {
    const inserted = [];
    const sessionStorage = {
      getItem(k) { if (storageThrows) throw new Error("blocked"); return Object.hasOwn(storage, k) ? storage[k] : null; },
      setItem(k, v) { if (storageThrows) throw new Error("blocked"); storage[k] = String(v); },
    };
    const document = {
      createElement: (tag) => ({ tagName: tag.toUpperCase() }),
      getElementsByTagName: () => [{ parentNode: { insertBefore: (n) => inserted.push(n) } }],
    };
    const ctx = { sessionStorage, document, Math, Date, __inserted: inserted, __storage: storage };
    ctx.window = ctx;
    return vm.createContext(ctx);
  })();
  for (const code of scripts) vm.runInContext(code, w);
  return w;
}

/** The fbq calls the page made, as plain arrays (the stub queues them until fbevents.js loads). */
const calls = (w) => JSON.parse(JSON.stringify((w.fbq?.queue || []).map((a) => Array.from(a))));
const pageViews = (w) => calls(w).filter((c) => c[0] === "track" && c[1] === "PageView");

const SID = "abc123def456ghi789";
const PV_RE = new RegExp(`^pv\\.${SID}\\.[a-z0-9]{1,8}$`);

describe("pixel id: META_PIXEL_ID env, fallback when missing", () => {
  test("META_PIXEL_ID wins", () => {
    assert.deepEqual(metaPixelId({ META_PIXEL_ID: " 1234567890 " }), { id: "1234567890", envName: "META_PIXEL_ID" });
  });

  test("missing: the pixel that has always been live, named as a fallback", () => {
    assert.equal(META_PIXEL_FALLBACK_ID, "2403674420141513");
    const r = metaPixelId({});
    assert.equal(r.id, "2403674420141513");
    assert.match(r.envName, /^fallback/);
  });

  test("not digits: fallback, never a broken pixel", () => {
    const r = metaPixelId({ META_PIXEL_ID: "abc-not-a-pixel" });
    assert.equal(r.id, META_PIXEL_FALLBACK_ID);
    assert.match(r.envName, /not digits/);
  });

  test("only META_PIXEL_ID counts, the same name the server sender reads", () => {
    for (const name of ["FACEBOOK_PIXEL_ID", "FB_PIXEL_ID", "PIXEL_ID", "META_PIXEL", "FB_PIXEL"]) {
      assert.equal(metaPixelId({ [name]: "999999999" }).id, META_PIXEL_FALLBACK_ID, name);
    }
  });

  test("the snippet carries whatever id it is given", () => {
    const html = metaPixelHeadHtml(metaPixelId({ META_PIXEL_ID: "1234567890" }).id);
    assert.ok(html.includes("fbq('init', '1234567890');"));
    assert.ok(html.includes("tr?id=1234567890&ev=PageView&noscript=1"));
    assert.equal(html.includes(META_PIXEL_FALLBACK_ID), false);
  });
});

describe("the head snippet: one PageView, with eventID window.__fhPv", () => {
  const html = metaPixelHeadHtml(META_PIXEL_FALLBACK_ID);

  test("source: one init, one PageView call, and it carries the event id; no bare PageView", () => {
    assert.equal(count(html, "fbq('init'"), 1);
    assert.equal(count(html, "fbq('track'"), 1);
    assert.equal(count(html, ID_PAGEVIEW), 1);
    assert.equal(count(html, BARE_PAGEVIEW), 0);
    assert.ok(html.startsWith("<!-- Meta Pixel (Fundhub) -->\n<script>"), "the comment the push uses to find it");
  });

  test("an existing session id: __fhPv = pv.<fh_sid>.<random>, and that is the PageView's eventID", () => {
    const w = runSnippet(html, { storage: { fh_sid: SID } });
    assert.match(w.__fhPv, PV_RE);
    assert.deepEqual(calls(w), [
      ["init", META_PIXEL_FALLBACK_ID],
      ["track", "PageView", {}, { eventID: w.__fhPv }],
    ]);
    assert.equal(w.__storage.fh_sid, SID, "the session id is left alone");
    assert.equal(w.__inserted.length, 1, "fbevents.js is requested once");
    assert.equal(w.__inserted[0].src, "https://connect.facebook.net/en_US/fbevents.js");
  });

  test("no session id yet: one is made and saved as fh_sid, the way fh-events.js makes it", () => {
    const w = runSnippet(html);
    const sid = w.__storage.fh_sid;
    assert.match(sid, /^[A-Za-z0-9_-]{8,40}$/);
    assert.ok(w.__fhPv.startsWith(`pv.${sid}.`));
    assert.equal(pageViews(w).length, 1);
    // fh-events.js keeps a stored id that passes this exact check, so both agree.
    const tracker = read("public/funnel/fh-events.js");
    assert.ok(tracker.includes('sessionStorage.getItem("fh_sid")'));
    assert.ok(tracker.includes("/^[A-Za-z0-9_-]{8,80}$/"));
  });

  test("a junk stored id is replaced, like the tracker does", () => {
    const w = runSnippet(html, { storage: { fh_sid: "x" } });
    assert.notEqual(w.__storage.fh_sid, "x");
    assert.ok(w.__fhPv.startsWith(`pv.${w.__storage.fh_sid}.`));
  });

  test("storage blocked (private mode, some in-app browsers): still one PageView with an id", () => {
    const w = runSnippet(html, { storageThrows: true });
    assert.match(w.__fhPv, /^pv\.[A-Za-z0-9_-]{8,40}\.[a-z0-9]{1,8}$/);
    assert.equal(pageViews(w).length, 1);
    assert.deepEqual(pageViews(w)[0][3], { eventID: w.__fhPv });
  });

  test("two page loads get two different ids in the same session", () => {
    const storage = { fh_sid: SID };
    const a = runSnippet(html, { storage }).__fhPv;
    const b = runSnippet(html, { storage }).__fhPv;
    assert.notEqual(a, b);
    assert.ok(a.startsWith(`pv.${SID}.`) && b.startsWith(`pv.${SID}.`));
  });

  test("the block twice on one page still fires ONE PageView and one init", () => {
    const w = runSnippet(html, { storage: { fh_sid: SID } });
    const id = w.__fhPv;
    runSnippet(html, { win: w });
    assert.equal(w.__fhPv, id, "the id is not replaced");
    assert.equal(pageViews(w).length, 1);
    assert.equal(calls(w).filter((c) => c[0] === "init").length, 1);
  });

  test("noscript: on by default, off on request (the funnel head keeps its own in the funnel footer)", () => {
    assert.equal(count(html, "<noscript>"), 1);
    const bare = metaPixelHeadHtml(META_PIXEL_FALLBACK_ID, { noscript: false });
    assert.equal(count(bare, "<noscript>"), 0);
    assert.ok(html.startsWith(bare));
  });

  test("the push's page-head cleanup still finds the new block (one kept, or dropped under a funnel pixel)", () => {
    const two = `${html}\n${html}`;
    assert.equal(nextHeadCode(two, { funnelHead: "" }).next, html);
    assert.equal(nextHeadCode(html, { funnelHead: html }).next, "");
  });
});

describe("custom HTML pages: the wrapper puts in the one PageView", () => {
  const roadmapRows = PUSH_MANIFEST.filter((r) => r.strategy === "custom_html_put");

  test("/roadmap, /roadmap-book, /roadmap-thank-you, built from their real fragments", () => {
    assert.deepEqual(roadmapRows.map((r) => r.key).sort(), ["slo-297-booking", "slo-297-sales", "slo-297-thank-you"]);
    for (const row of roadmapRows) {
      const doc = wrapCustomHtmlDocument({
        bodyHtml: read(row.fragment),
        pageToken: "cfp_x",
        pixelId: metaPixelId({}).id,
        includeVslBeacon: !!row.vslBeacon,
        headFirstHtml: headBlocksHtml(row, read),
        env: { CLARITY_PROJECT_ID: "p1" },
      });
      assert.equal(count(doc, "fbq('init'"), 1, `${row.key} init`);
      assert.equal(count(doc, "'PageView'"), 1, `${row.key} PageView`);
      assert.equal(count(doc, ID_PAGEVIEW), 1, `${row.key} eventID`);
      assert.equal(count(doc, BARE_PAGEVIEW), 0, `${row.key} no bare PageView`);
    }
  });

  test("/apply: the fragment carries no pixel and no fbq call; the push adds the one snippet", () => {
    const frag = read("marketing/landing-pages/apply-survey.html");
    assert.equal(frag.includes("fbq("), false);
    const script = read("scripts/cf-push-custom-html.mjs");
    const at = script.indexOf("function injectApplySurveyRuntime");
    const body = script.slice(at, script.indexOf("async function pageOnApplyStep"));
    assert.match(body, /if \(pixelId && !out\.includes\("fbq\('init'"\)\) head\.push\(metaPixelHeadHtml\(pixelId\)\);/);
    assert.match(script, /const pixel = metaPixelId\(process\.env\);\n\s*const baseHtml = readFragment\(row\.fragment\);/);
  });
});

describe("ClickFunnels funnel head (builder steps of 968281)", () => {
  // GET /funnels/968281?expand[]=head_code, 2026-10-02: a bare pixel with no comment.
  const LIVE_968281 = `<link rel="preconnect" href="https://use.fontawesome.com" crossorigin>
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '2403674420141513');
fbq('track', 'PageView');
</script>

<script async src="https://app.directroas.com/api/hub/v1/cmsdutl8e00mukv041vwuo39w"></script>`;
  const PRE = '<link rel="preconnect" href="https://use.fontawesome.com" crossorigin>\n';
  const ROAS = '\n\n<script async src="https://app.directroas.com/api/hub/v1/cmsdutl8e00mukv041vwuo39w"></script>';

  test("the bare pixel becomes the snippet; preconnect and Direct ROAS stay byte for byte", () => {
    const plan = nextFunnelHeadCode(LIVE_968281, META_PIXEL_FALLBACK_ID);
    assert.equal(plan.changed, true);
    assert.equal(plan.next, PRE + metaPixelHeadHtml(META_PIXEL_FALLBACK_ID, { noscript: false }) + ROAS);
    assert.equal(count(plan.next, "fbq('init'"), 1);
    assert.equal(count(plan.next, ID_PAGEVIEW), 1);
    assert.equal(count(plan.next, BARE_PAGEVIEW), 0);
    assert.equal(count(plan.next, "<noscript>"), 0, "the funnel footer already has the no-JavaScript image");
    const w = runSnippet(plan.next, { storage: { fh_sid: SID } });
    assert.equal(pageViews(w).length, 1);
    assert.match(w.__fhPv, PV_RE);
  });

  test("a second push changes nothing", () => {
    const once = nextFunnelHeadCode(LIVE_968281, META_PIXEL_FALLBACK_ID).next;
    assert.deepEqual(nextFunnelHeadCode(once, META_PIXEL_FALLBACK_ID), { next: once, changed: false });
  });

  test("a new env pixel id swaps in on the next push", () => {
    const once = nextFunnelHeadCode(LIVE_968281, META_PIXEL_FALLBACK_ID).next;
    const moved = nextFunnelHeadCode(once, "1234567890");
    assert.equal(moved.changed, true);
    assert.ok(moved.next.includes("fbq('init', '1234567890');"));
    assert.equal(count(moved.next, "fbq('init'"), 1);
  });

  test("a marked block with its noscript keeps its noscript", () => {
    const live = `${PRE}${metaPixelHeadHtml("1234567890")}${ROAS}`;
    const plan = nextFunnelHeadCode(live, META_PIXEL_FALLBACK_ID);
    assert.equal(plan.next, `${PRE}${metaPixelHeadHtml(META_PIXEL_FALLBACK_ID)}${ROAS}`);
  });

  test("no pixel, or two, is refused: nothing is written blind", () => {
    assert.throws(() => nextFunnelHeadCode(PRE + ROAS, META_PIXEL_FALLBACK_ID), /0 pixel init/);
    assert.throws(() => nextFunnelHeadCode("", META_PIXEL_FALLBACK_ID), /0 pixel init/);
    assert.throws(() => nextFunnelHeadCode(`${LIVE_968281}\n${LIVE_968281}`, META_PIXEL_FALLBACK_ID), /2 pixel init/);
  });

  test("the manifest row and the push branch: PUT /funnels/{id}, whole head, replace, read back", () => {
    const row = PUSH_MANIFEST.find((r) => r.key === "funnel-968281-pixel");
    assert.ok(row);
    assert.equal(row.funnelId, "968281");
    assert.equal(row.strategy, "funnel_head_pixel");
    assert.equal(PUSH_MANIFEST.filter((r) => r.strategy === "funnel_head_pixel").length, 1, "984178 has no funnel head code");
    const script = read("scripts/cf-push-custom-html.mjs");
    const at = script.indexOf('if (row.strategy === "funnel_head_pixel")');
    assert.ok(at > -1 && at < script.indexOf("if (!row.path && !row.pageId)"), "branch runs before the page lookup");
    assert.match(script.slice(at, at + 300), /pushFunnelHeadPixel\(creds, row, pixel\.id, ctx, dryRun, snapDir\)/);
    const fn = script.slice(script.indexOf("async function pushFunnelHeadPixel"), script.indexOf("async function getPageCode"));
    assert.match(fn, /nextFunnelHeadCode\(live, pixelId\)/);
    assert.match(fn, /if \(dryRun\) return/);
    assert.match(fn, /\/funnels\/\$\{row\.funnelId\}`/);
    assert.match(fn, /method: "PUT"/);
    assert.match(fn, /funnel: \{ head_code: plan\.next, head_code_mode: "replace" \}/);
    assert.match(fn, /after\.trim\(\) === plan\.next\.trim\(\)/);
    assert.ok(fn.indexOf("writeFileSync(snapshot, live") < fn.indexOf('method: "PUT"'), "snapshot before the write");
  });
});

describe("fundhub.ai homepage (public/index.html)", () => {
  const HOME = read("public/index.html");

  test("carries the same snippet, once, in <head>, with the fallback pixel id written in", () => {
    const block = metaPixelHeadHtml(META_PIXEL_FALLBACK_ID);
    assert.equal(count(HOME, block), 1);
    assert.ok(HOME.indexOf(block) < HOME.indexOf("</head>"));
    assert.equal(count(HOME, "fbq('init'"), 1);
    assert.equal(count(HOME, "fbq("), 2, "init and PageView only: the homepage sends no other Meta event itself");
    assert.equal(count(HOME, BARE_PAGEVIEW), 0);
  });

  test("the homepage's snippet runs: one PageView with eventID", () => {
    const head = HOME.slice(HOME.indexOf("<!-- Meta Pixel (Fundhub) -->"), HOME.indexOf("</head>"));
    const w = runSnippet(head, { storage: { fh_sid: SID } });
    assert.equal(pageViews(w).length, 1);
    assert.deepEqual(pageViews(w)[0], ["track", "PageView", {}, { eventID: w.__fhPv }]);
  });
});

test("inside a frame the pixel snippet fires no PageView (the parent page counts that visit)", async () => {
  const { metaPixelHeadHtml } = await import("../../marketing/landing-pages/tracking-manifest.mjs");
  const h = metaPixelHeadHtml("2403674420141513");
  assert.match(h, /if\(!window\.__fhPv&&window\.self===window\.top\)\{/);
});
