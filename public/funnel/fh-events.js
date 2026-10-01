/* fh-events.js — which step a visitor opened and which buttons they pressed,
   on the /watch path and the /roadmap path.

   Loaded on every step of both funnels (clickfunnels-fragments/tracking-manifest.mjs
   puts it there). It sends two things to https://fundhub.ai/api/public/slo-interest:

     kind "page"   one per session per step    -> events row funnel.page
     kind "click"  first press of each button  -> events row funnel.click

   Video watch depth (play, unmute, how far) is NOT here. That is
   vsl-watch-beacon.js and /api/public/vsl-watch. This file only names the
   presses: the "Tap for sound" tap on the VSL, a testimonial or other video the
   visitor started by hand, and every link or button.

   It reads no form field and sends no typed text. A label is the visible words
   of the button or link, lowercased. Nothing here can throw into the page. */
(function () {
  /* The /funding-book-call calendar also sits inside the /roadmap-book frame.
     The parent page counts that step; the frame must not count it again as a
     /watch step. */
  try { if (window.self !== window.top) return; } catch (e) { return; }

  var ENDPOINT = "https://fundhub.ai/api/public/slo-interest";
  var PAGES = {
    "/watch": 1, "/apply": 1, "/funding-book-call": 1, "/thank-you": 1,
    "/roadmap": 1, "/roadmap-book": 1, "/roadmap-thank-you": 1
  };
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_path", "referrer_domain"];
  var PRESSABLE = 'a[href],button,[role="button"],input[type="submit"],input[type="button"],[data-pay]';

  function slug(s, n) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n || 32);
  }

  function pagePath() {
    try { return location.pathname.toLowerCase().replace(/\/+$/, ""); } catch (e) { return ""; }
  }

  function sid() {
    var s = "";
    try { s = sessionStorage.getItem("fh_sid") || ""; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(s)) {
      s = (Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      try { sessionStorage.setItem("fh_sid", s); } catch (e2) {}
    }
    return s;
  }

  function attribution() {
    try { return JSON.parse(sessionStorage.getItem("fh_attribution") || "{}") || {}; } catch (e) { return {}; }
  }

  function post(body) {
    try {
      body.session_id = sid();
      body.page = pagePath();
      body.webdriver = navigator.webdriver === true;
      var saved = attribution();
      KEYS.forEach(function (k) { if (saved[k]) body[k] = saved[k]; });
      var payload = JSON.stringify(body);
      if (navigator.sendBeacon) {
        try {
          if (navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "text/plain" }))) return;
        } catch (e) {}
      }
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: payload,
        keepalive: true
      })["catch"](function () {});
    } catch (e) {}
  }

  var pressed = {};
  function sendClick(target) {
    if (!target || pressed[target]) return;
    pressed[target] = 1;
    post({ kind: "click", target: target });
    try {
      if (typeof window.clarity === "function") window.clarity("event", target);
      if (typeof window.gtag === "function") window.gtag("event", target, { page: pagePath() });
    } catch (e) {}
  }

  function closest(node, sel) {
    while (node && node !== document) {
      if (node.matches && node.matches(sel)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function videoName(v) {
    var src = "";
    try { src = String(v.currentSrc || v.src || ""); } catch (e) {}
    var file = src.split("#")[0].split("?")[0].split("/").pop() || "";
    return slug(file.replace(/\.[a-z0-9]+$/i, ""), 40) || "video";
  }

  /* The label for a pressed element, or null when it is not a button press. */
  function labelFor(node) {
    // "Tap for sound" on the VSL is the press that starts it with sound.
    // The booking page's second film uses #fh-vsl2 / #fh-unmute2.
    if (closest(node, "#fh-unmute")) return "vsl:unmute";
    if (closest(node, "#fh-unmute2")) return "vsl2:unmute";
    var film = closest(node, "#fh-vsl") ? ["vsl", "fh-unmute"] : closest(node, "#fh-vsl2") ? ["vsl2", "fh-unmute2"] : null;
    if (film) {
      var o = document.getElementById(film[1]);
      return o && !o.classList.contains("hidden") ? film[0] + ":unmute" : null;
    }
    // The phone bar at the bottom of /roadmap. Same words as the buttons above it,
    // so the words alone cannot tell them apart.
    if (closest(node, "#fh-sticky")) return "cta:sticky";
    // Testimonial Play buttons: the video's own play event names them.
    if (closest(node, ".tplay")) return null;

    var el = closest(node, PRESSABLE);
    if (!el) return null;
    var own = el.getAttribute("data-fh-track");
    if (own) { var named = slug(own, 56); return named ? "click:" + named : null; }

    var text = el.getAttribute("aria-label") || el.textContent || el.value || "";
    var base = slug(text, 32);
    if (!base) {
      var href = el.getAttribute("href") || "";
      base = slug(href.replace(/^https?:\/\/[^\/]+/i, "").split("?")[0], 32);
    }
    if (!base) return null;
    var prefix = (el.classList && el.classList.contains("btn")) || el.hasAttribute("data-pay") ? "cta:" : "click:";
    base = prefix + base;

    // Two buttons with the same words (top and bottom "Get Started") are
    // told apart by their order on the page.
    var nth = 1;
    try {
      var all = document.querySelectorAll(PRESSABLE);
      for (var i = 0; i < all.length; i++) {
        if (all[i] === el) break;
        var t2 = all[i].getAttribute("aria-label") || all[i].textContent || all[i].value || "";
        if (prefix + slug(t2, 32) === base) nth++;
      }
    } catch (e) {}
    return nth > 1 ? base + "-" + nth : base;
  }

  try {
    document.addEventListener("click", function (ev) {
      try { sendClick(labelFor(ev.target)); } catch (e) {}
    }, true);

    // A video the visitor started by hand. The VSL autoplays muted, so its own
    // start is not a press; its press is the tap for sound above.
    document.addEventListener("play", function (ev) {
      try {
        var v = ev && ev.target;
        if (!v || v.tagName !== "VIDEO" || v.hasAttribute("autoplay")) return;
        sendClick("video:play:" + videoName(v));
      } catch (e) {}
    }, true);

    var here = pagePath();
    if (PAGES[here]) {
      var flag = "fh_pg_" + here;
      var seen = false;
      try { seen = !!sessionStorage.getItem(flag); if (!seen) sessionStorage.setItem(flag, "1"); } catch (e) {}
      if (!seen) post({ kind: "page" });
    }
  } catch (e) {}
})();
