// src/ads/fh-events.test.mjs — step opens and button presses on /watch and /roadmap.
//
// public/funnel/fh-events.js is loaded on every step of both funnels and talks
// to api/public/slo-interest.mjs (kind "page" / "click"). This test runs the
// real script against a tiny fake page and holds it to the real door.
//
// WHAT THIS CANNOT TEST: a real browser, ClickFunnels, or Clarity. The live
// check is the Playwright / view-source walk recorded on the board.
//
// npm test's glob is src/** and scripts/** only (CLAUDE.md §12).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { recordInterest } from "../../api/public/slo-interest.mjs";
import {
  PUSH_MANIFEST,
  FH_EVENTS_SRC,
  CLARITY_SRC,
  VSL_WATCH_BEACON_SRC,
  wrapCustomHtmlDocument,
  clarityHeadHtml,
  ga4HeadHtml,
  nextFooterCode,
} from "../../clickfunnels-fragments/tracking-manifest.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = fs.readFileSync(path.join(ROOT, "public/funnel/fh-events.js"), "utf8");

// ── a tiny page: just enough DOM for the script ─────────────────────────────

function el({ tag = "a", text = "", cls = [], id = "", attrs = {}, parent = null, src = "" } = {}) {
  const node = {
    tagName: tag.toUpperCase(), id, textContent: text, value: "", parentNode: parent,
    currentSrc: src, src,
    classList: { contains: (c) => cls.includes(c) },
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    hasAttribute: (n) => n in attrs,
    matches(sel) {
      return sel.split(",").some((raw) => {
        const s = raw.trim();
        if (s.startsWith("#")) return node.id === s.slice(1);
        if (s.startsWith(".")) return cls.includes(s.slice(1));
        if (s === "a[href]") return node.tagName === "A" && "href" in attrs;
        if (s === "button") return node.tagName === "BUTTON";
        if (s === '[role="button"]') return attrs.role === "button";
        if (s === 'input[type="submit"]') return node.tagName === "INPUT" && attrs.type === "submit";
        if (s === 'input[type="button"]') return node.tagName === "INPUT" && attrs.type === "button";
        if (s === "[data-pay]") return "data-pay" in attrs;
        return false;
      });
    },
  };
  return node;
}

function runPage({ pathname, nodes = [], framed = false, clarity = true, webdriver = false }) {
  const sent = [];
  const listeners = {};
  const store = {};
  const document = {
    readyState: "complete",
    addEventListener: (n, fn) => { (listeners[n] ||= []).push(fn); },
    getElementById: (id) => nodes.find((x) => x.id === id) || null,
    querySelectorAll: () => nodes.filter((x) => x.matches('a[href],button,[role="button"],input[type="submit"],input[type="button"],[data-pay]')),
  };
  const win = {
    location: { pathname },
    navigator: { webdriver, sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; } },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    Blob: class { constructor(parts) { this.text = parts.join(""); } },
    fetch: () => ({ catch() {} }),
    JSON, Math, Date, String, Array, Object,
  };
  win.self = win;
  win.top = framed ? {} : win;
  win.document = document;
  const calls = [];
  if (clarity) win.clarity = (...a) => calls.push(a);
  vm.runInNewContext(SRC, { ...win, window: win, document, location: win.location, navigator: win.navigator, sessionStorage: win.sessionStorage, Blob: win.Blob, fetch: win.fetch });
  const bodies = () => sent.map((s) => JSON.parse(s.blob.text));
  return {
    sent, calls, store, bodies,
    click: (target) => (listeners.click || []).forEach((fn) => fn({ target })),
    play: (target) => (listeners.play || []).forEach((fn) => fn({ target })),
  };
}

describe("fh-events.js, the page", () => {
  test("opening a step sends one page event, once per session", () => {
    const p = runPage({ pathname: "/watch/" });
    assert.equal(p.sent.length, 1);
    assert.equal(p.sent[0].url, "https://fundhub.ai/api/public/slo-interest");
    const b = p.bodies()[0];
    assert.equal(b.kind, "page");
    assert.equal(b.page, "/watch");
    assert.match(b.session_id, /^[A-Za-z0-9_-]{8,80}$/);
  });

  test("a page that is not a funnel step sends nothing", () => {
    assert.equal(runPage({ pathname: "/somewhere-else" }).sent.length, 0);
  });

  test("the /funding-book-call calendar inside the /roadmap-book frame stays quiet", () => {
    const p = runPage({ pathname: "/funding-book-call", framed: true });
    assert.equal(p.sent.length, 0);
  });

  test("an automated browser says so", () => {
    assert.equal(runPage({ pathname: "/watch", webdriver: true }).bodies()[0].webdriver, true);
  });
});

describe("fh-events.js, the presses", () => {
  test("the VSL 'Tap for sound' is named vsl:unmute and sent once", () => {
    const overlay = el({ tag: "div", id: "fh-unmute", cls: ["unmute"] });
    const pill = el({ tag: "span", parent: overlay });
    const p = runPage({ pathname: "/watch", nodes: [overlay, pill] });
    p.click(pill); p.click(pill);
    const clicks = p.bodies().filter((b) => b.kind === "click");
    assert.deepEqual(clicks.map((c) => c.target), ["vsl:unmute"]);
    assert.deepEqual(p.calls, [["event", "vsl:unmute"]], "Clarity hears the same press");
  });

  test("a click on the VSL itself counts only while the sound overlay is showing", () => {
    const overlay = el({ tag: "div", id: "fh-unmute", cls: ["unmute", "hidden"] });
    const video = el({ tag: "video", id: "fh-vsl", attrs: { autoplay: "" } });
    const p = runPage({ pathname: "/watch", nodes: [overlay, video] });
    p.click(video);
    assert.equal(p.bodies().filter((b) => b.kind === "click").length, 0);
  });

  test("a testimonial started by hand is video:play:<file>; the VSL's own autoplay is not a press", () => {
    const gene = el({ tag: "video", src: "https://fundhub.ai/funnel/slo-testimonial-gene.mp4" });
    const vsl = el({ tag: "video", id: "fh-vsl", attrs: { autoplay: "" }, src: "https://fundhub.ai/funnel/slo-vsl.mp4" });
    const p = runPage({ pathname: "/roadmap", nodes: [gene, vsl] });
    p.play(vsl); p.play(gene); p.play(gene);
    assert.deepEqual(
      p.bodies().filter((b) => b.kind === "click").map((c) => c.target),
      ["video:play:slo-testimonial-gene"]
    );
  });

  test("the sticky roadmap bar is cta:sticky, not a second copy of the same words", () => {
    const bar = el({ tag: "div", id: "fh-sticky" });
    const a = el({
      tag: "a", cls: ["btn"], text: "Get My $297 Funding Roadmap",
      attrs: { href: "#fh-order" }, parent: bar,
    });
    const p = runPage({ pathname: "/roadmap", nodes: [bar, a] });
    p.click(a);
    assert.equal(p.bodies().find((x) => x.kind === "click").target, "cta:sticky");
  });

  test("the testimonial Play button is left to the video's own play event", () => {
    const btn = el({ tag: "button", cls: ["tplay"], text: "Play" });
    const p = runPage({ pathname: "/roadmap", nodes: [btn] });
    p.click(btn);
    assert.equal(p.bodies().filter((b) => b.kind === "click").length, 0);
  });

  test("a CTA button is cta:<words>; two with the same words are told apart by order", () => {
    const a = el({ tag: "a", cls: ["btn"], text: "Get Started", attrs: { href: "/apply" } });
    const b = el({ tag: "a", cls: ["btn"], text: "Get Started", attrs: { href: "/apply" } });
    const p = runPage({ pathname: "/watch", nodes: [a, b] });
    p.click(a); p.click(b);
    assert.deepEqual(
      p.bodies().filter((x) => x.kind === "click").map((c) => c.target),
      ["cta:get-started", "cta:get-started-2"]
    );
  });

  test("a plain link is click:<words>; a pay button is a cta", () => {
    const link = el({ tag: "a", text: "Talk to us first", attrs: { href: "https://apply.fundhub.ai/roadmap-book" } });
    const pay = el({ tag: "button", text: "Pay $297", attrs: { "data-pay": "" } });
    const p = runPage({ pathname: "/roadmap", nodes: [link, pay] });
    p.click(link); p.click(pay);
    assert.deepEqual(
      p.bodies().filter((x) => x.kind === "click").map((c) => c.target),
      ["click:talk-to-us-first", "cta:pay-297"]
    );
  });

  test("data-fh-track names a button on purpose", () => {
    const b = el({ tag: "button", text: "Go", attrs: { "data-fh-track": "Book Call Top" } });
    const p = runPage({ pathname: "/thank-you", nodes: [b] });
    p.click(b);
    assert.equal(p.bodies().find((x) => x.kind === "click").target, "click:book-call-top");
  });

  test("a click on something that is not a button sends nothing", () => {
    const para = el({ tag: "p", text: "Some words" });
    const p = runPage({ pathname: "/watch", nodes: [para] });
    p.click(para);
    assert.equal(p.bodies().filter((b) => b.kind === "click").length, 0);
  });
});

describe("the door accepts exactly what the script sends", () => {
  const capture = () => {
    const events = [];
    return { events, emit: async (_d, name, payload, opts) => { events.push({ name, payload, opts }); return { id: "e", deduped: false }; } };
  };
  const deps = (cap) => ({ emit: cap.emit, orgId: "org-1", db: { query: async () => ({ rows: [{ n: 0 }] }) }, userAgent: "Mozilla/5.0" });

  test("every page the script knows is a page the door accepts", async () => {
    const listed = [...SRC.match(/var PAGES = \{([\s\S]*?)\};/)[1].matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]);
    assert.ok(listed.length >= 7, "the script lists the /watch and /roadmap steps");
    for (const page of listed) {
      const cap = capture();
      const out = await recordInterest({ kind: "page", session_id: "sess-abcdef12", page }, deps(cap));
      assert.equal(out.ok, true, page);
      assert.equal(cap.events[0].name, "funnel.page");
      assert.equal(cap.events[0].opts.idempotencyKey, `funnel-page:sess-abcdef12:${page}`);
      assert.equal(cap.events[0].opts.skipInngest, true, "page opens stay local-only");
    }
  });

  test("a click is one row per session, page and button", async () => {
    const cap = capture();
    const out = await recordInterest({
      kind: "click", session_id: "sess-abcdef12", page: "/roadmap/", target: "VSL:Unmute",
      utm_content: "42-phase", utm_source: "fb", webdriver: false,
    }, deps(cap));
    assert.equal(out.ok, true);
    assert.equal(out.actor, "person");
    assert.equal(cap.events[0].name, "funnel.click");
    assert.equal(cap.events[0].opts.idempotencyKey, "funnel-click:sess-abcdef12:/roadmap:vsl:unmute");
    assert.equal(cap.events[0].payload.target, "vsl:unmute");
    assert.equal(cap.events[0].payload.page, "/roadmap");
    assert.equal(cap.events[0].payload.attribution.utm_content, "42-phase");
    assert.equal(cap.events[0].payload.email, undefined);
  });

  test("a made-up page or a junk label is refused and writes nothing", async () => {
    const cap = capture();
    const bad = [
      { kind: "page", session_id: "sess-abcdef12", page: "/admin" },
      { kind: "click", session_id: "sess-abcdef12", page: "/watch", target: "" },
      { kind: "click", session_id: "sess-abcdef12", page: "/watch", target: "has space" },
      { kind: "click", session_id: "sess-abcdef12", page: "/watch", target: "x".repeat(65) },
      { kind: "click", page: "/watch", target: "cta:go" },
    ];
    for (const b of bad) {
      const out = await recordInterest(b, deps(cap));
      assert.equal(out.ok, false, JSON.stringify(b));
    }
    assert.equal(cap.events.length, 0);
  });

  test("a session that has pressed 60 things is not saved a 61st", async () => {
    const cap = capture();
    const out = await recordInterest(
      { kind: "click", session_id: "sess-abcdef12", page: "/watch", target: "cta:one-more" },
      { ...deps(cap), db: { query: async () => ({ rows: [{ n: 60 }] }) } }
    );
    assert.equal(out.ok, true);
    assert.equal(out.saved, false);
    assert.equal(cap.events.length, 0);
  });

  test("a repeat press is not saved twice", async () => {
    const out = await recordInterest(
      { kind: "click", session_id: "sess-abcdef12", page: "/watch", target: "cta:get-started" },
      { ...deps(capture()), emit: async () => ({ id: null, deduped: true }) }
    );
    assert.equal(out.saved, false);
  });
});

describe("every step of /watch and /roadmap carries the tracking", () => {
  const ROW = Object.fromEntries(PUSH_MANIFEST.map((r) => [r.key, r]));
  const watchRows = ["apply-watch", "apply-survey", "apply-book", "apply-thank-you"];
  const roadmapRows = ["slo-297-sales", "slo-297-booking", "slo-297-thank-you"];

  test("watch builder steps list the events script and Clarity as footer scripts", () => {
    for (const k of ["apply-watch", "apply-book", "apply-thank-you"]) {
      assert.ok(ROW[k].extraFooterScripts.includes(FH_EVENTS_SRC), `${k} events`);
      assert.ok(ROW[k].extraFooterScripts.includes(CLARITY_SRC), `${k} clarity`);
    }
    assert.equal(ROW["apply-watch"].vslBeacon, true);
  });

  test("the watch survey step gets the events script and Clarity at push time", () => {
    const script = fs.readFileSync(path.join(ROOT, "scripts/cf-push-custom-html.mjs"), "utf8");
    const at = script.indexOf("function injectApplySurveyRuntime");
    const body = script.slice(at, script.indexOf("async function pageOnApplyStep"));
    assert.match(body, /FH_EVENTS_SRC/);
    assert.match(body, /CLARITY_SRC/);
    assert.ok(watchRows.every((k) => ROW[k]));
  });

  test("roadmap custom HTML steps are wrapped with events, Clarity and the video beacon", () => {
    for (const k of ["slo-297-sales", "slo-297-booking"]) {
      assert.equal(ROW[k].vslBeacon, true, `${k} has a film on it`);
    }
    for (const k of roadmapRows) {
      const html = wrapCustomHtmlDocument({
        bodyHtml: "<p>x</p>", pageToken: "cfp_x", pixelId: "123", includeVslBeacon: ROW[k].vslBeacon,
        env: { CLARITY_PROJECT_ID: "p1" },
      });
      assert.ok(html.includes(FH_EVENTS_SRC), `${k} events`);
      assert.ok(html.includes(CLARITY_SRC), `${k} clarity`);
      assert.equal(html.includes(VSL_WATCH_BEACON_SRC), !!ROW[k].vslBeacon, `${k} beacon`);
    }
  });

  test("the events script is not added twice, and Clarity is deferred like its head tag", () => {
    const html = wrapCustomHtmlDocument({
      bodyHtml: `<script src="${FH_EVENTS_SRC}"></script>`, pixelId: "1", includeVslBeacon: false, env: {},
    });
    assert.equal(html.split(FH_EVENTS_SRC).length - 1, 1);
    assert.ok(clarityHeadHtml({ CLARITY_PROJECT_ID: "p" }).includes(`${CLARITY_SRC}" defer`));
    assert.equal(ga4HeadHtml({}), "", "no measurement id means no GA4 tag");
    assert.ok(ga4HeadHtml({ GA_MEASUREMENT_ID: "G-TEST1234" }).includes("G-TEST1234"));
    assert.equal(ga4HeadHtml({ GA_MEASUREMENT_ID: "not-an-id" }), "");
    const next = nextFooterCode("", { extraSrcs: [FH_EVENTS_SRC, CLARITY_SRC] }).next;
    assert.ok(next.includes(`<script src="${CLARITY_SRC}" defer></script>`));
    assert.equal(nextFooterCode(next, { extraSrcs: [FH_EVENTS_SRC, CLARITY_SRC] }).changed, false, "second push adds nothing");
  });

  test("Clarity stays quiet inside the booking frame", () => {
    const clarity = fs.readFileSync(path.join(ROOT, "public/js/clarity.js"), "utf8");
    assert.match(clarity, /window\.self !== window\.top/);
  });
});
