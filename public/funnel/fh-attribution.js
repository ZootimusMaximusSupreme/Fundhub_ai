(function () {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var EXTRA = ["landing_path", "referrer_domain"];
  /* Affiliate referral codes. Same names AF-02 and the ClickFunnels adapter
     read (a1 / a2). ?ref= and ?code= mean a1 — share links use all three.
     Kept off ATTRIBUTION_KEYS on purpose: that list is ad UTMs only. */
  var AFF = ["a1", "a2"];
  var STORE = "fh_attribution";

  function read() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; }
  }
  function save(o) {
    try { sessionStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {}
  }

  // 1. Capture from the URL, once, first touch wins.
  var saved = read();
  var qs = new URLSearchParams(location.search);
  var seen = false;
  KEYS.forEach(function (k) {
    var v = (qs.get(k) || "").trim();
    if (v && !saved[k]) { saved[k] = v.slice(0, 200); seen = true; }
  });
  var a1 = (qs.get("a1") || qs.get("ref") || qs.get("code") || "").trim();
  if (a1 && !saved.a1) { saved.a1 = a1.slice(0, 64); seen = true; }
  var a2 = (qs.get("a2") || "").trim();
  if (a2 && !saved.a2) { saved.a2 = a2.slice(0, 64); seen = true; }
  if (seen || !saved.landing_path) {
    if (!saved.landing_path) saved.landing_path = location.pathname;
    if (!saved.referrer_domain && document.referrer) {
      try { saved.referrer_domain = new URL(document.referrer).hostname; } catch (e) {}
    }
  }
  save(saved);

  // 2. Stamp hidden inputs on every form. Re-run when CF re-renders the form.
  function ensure(form, name, value) {
    var el = form.querySelector('input[name="' + name + '"]');
    if (!el) {
      el = document.createElement("input");
      el.type = "hidden";
      el.name = name;
      form.appendChild(el);
    }
    if (value && !el.value) el.value = value;
  }
  function stamp() {
    var data = read();
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) {
      KEYS.concat(EXTRA).concat(AFF).forEach(function (k) { ensure(forms[i], k, data[k] || ""); });
    }
  }
  stamp();
  if (document.readyState !== "complete") window.addEventListener("load", stamp);
  var tries = 0;
  var t = setInterval(function () { stamp(); if (++tries > 20) clearInterval(t); }, 500);

  // /roadmap only. Step 1 (name, email, phone) is saved when the email is
  // real, even if they never press Pay. Pressing Pay tells Meta, unless this
  // browser or this email is one of us. Rules match src/slo/visitor.mjs.
  var nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (url, opt) {
      var next = opt;
      try {
        var u = typeof url === "string" ? url : "";
        if (next && typeof next.body === "string" && u.indexOf("slo-checkout") !== -1) {
          var parsed = JSON.parse(next.body);
          if (parsed && typeof parsed === "object") {
            parsed.webdriver = navigator.webdriver === true;
            next = {};
            for (var k in opt) next[k] = opt[k];
            next.body = JSON.stringify(parsed);
          }
        }
      } catch (e) {}
      return next === opt ? nativeFetch.apply(this, arguments) : nativeFetch.call(this, url, next);
    };
  }

  function widget() { return document.getElementById("fhw"); }
  function step1() {
    var w = widget();
    return w ? w.querySelector("form.s1") : null;
  }
  function field(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || "").trim() : "";
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isAgent(email) {
    if (navigator.webdriver === true) return true;
    var ua = navigator.userAgent || "";
    if (/HeadlessChrome|Playwright|Puppeteer|PhantomJS|Headless|bot|crawler|spider/i.test(ua)) return true;
    email = String(email || "").trim().toLowerCase();
    var at = email.lastIndexOf("@");
    if (at < 1) return false;
    var local = email.slice(0, at);
    var domain = email.slice(at + 1);
    if (domain === "fundhub.ai" || domain === "example.com" || domain === "example.net" || domain === "example.org") return true;
    return /(^|[.+_-])(e2e|sim|test)([.+_-]|$)/.test(local);
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
  function postInterest(kind, extra, beacon) {
    if (typeof nativeFetch !== "function") return;
    var body = { kind: kind, session_id: sid(), webdriver: navigator.webdriver === true };
    var data = read();
    KEYS.concat(EXTRA).forEach(function (k) { if (data[k]) body[k] = data[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k]) body[k] = extra[k]; });
    var payload = JSON.stringify(body);
    var url = "https://fundhub.ai/api/public/slo-interest";
    if (beacon && navigator.sendBeacon) {
      try { navigator.sendBeacon(url, new Blob([payload], { type: "text/plain" })); return; } catch (e) {}
    }
    try {
      nativeFetch.call(window, url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: payload,
        keepalive: true
      }).catch(function () {});
    } catch (e3) {}
  }
  function sendContact(beacon) {
    var form = step1();
    if (!form) return;
    var email = field(form, "email").toLowerCase();
    if (!emailOk(email)) return;
    var sent = "";
    try { sent = sessionStorage.getItem("fh_contact_email") || ""; } catch (e) {}
    if (sent === email) return;
    try { sessionStorage.setItem("fh_contact_email", email); } catch (e2) {}
    postInterest("contact", {
      email: email,
      first_name: field(form, "c_first"),
      last_name: field(form, "c_last"),
      phone: field(form, "phone")
    }, beacon);
  }
  if (widget()) {
    try {
      if (!sessionStorage.getItem("fh_visit_sent")) {
        sessionStorage.setItem("fh_visit_sent", "1");
        postInterest("visit", {}, false);
      }
    } catch (e) {}
    var contactTimer = null;
    document.addEventListener("input", function (ev) {
      var form = step1();
      if (!form || !form.contains(ev.target)) return;
      clearTimeout(contactTimer);
      contactTimer = setTimeout(function () { sendContact(false); }, 1500);
    });
    document.addEventListener("submit", function (ev) {
      var form = step1();
      if (form && ev.target === form) sendContact(false);
    }, true);
    window.addEventListener("pagehide", function () { sendContact(true); });
    document.addEventListener("click", function (ev) {
      var node = ev.target;
      var btn = null;
      while (node && node !== document) {
        if (node.getAttribute && node.getAttribute("data-pay") != null) { btn = node; break; }
        node = node.parentNode;
      }
      if (!btn || !widget() || !widget().contains(btn)) return;
      var form = step1();
      var email = form ? field(form, "email") : "";
      if (isAgent(email)) return;
      try { if (sessionStorage.getItem("fh_ic_sent")) return; sessionStorage.setItem("fh_ic_sent", "1"); } catch (e) {}
      if (typeof window.fbq !== "function") return;
      var total = widget().querySelector("[data-total]");
      var n = total ? Number(String(total.textContent || "").replace(/[^0-9.]/g, "")) : 297;
      window.fbq("track", "InitiateCheckout", { value: n > 0 ? n : 297, currency: "USD" });
    }, true);
  }
})();
