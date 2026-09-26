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
})();
