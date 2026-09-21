(function () {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var EXTRA = ["landing_path", "referrer_domain"];
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
      KEYS.concat(EXTRA).forEach(function (k) { ensure(forms[i], k, data[k] || ""); });
    }
  }
  stamp();
  if (document.readyState !== "complete") window.addEventListener("load", stamp);
  var tries = 0;
  var t = setInterval(function () { stamp(); if (++tries > 20) clearInterval(t); }, 500);
})();
