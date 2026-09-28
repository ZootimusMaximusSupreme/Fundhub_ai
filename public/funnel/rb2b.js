/**
 * RB2B visitor ID pixel (Retention.com network).
 *
 * Official snippet source:
 *   https://support.rb2b.com/en/articles/9117086-rb2b-install-guide-for-react-js
 * Install overview:
 *   https://support.rb2b.com/en/articles/8795874-rb2b-install-guide-for-your-website-via-code
 *
 * Public account id (not a secret) — env name: RB2B_ID
 * Leave RB2B_ID unset until Chris creates an RB2B account and pastes the id
 * from the dashboard Script section. This loader no-ops when the id is missing.
 *
 * Page-safe sources (first match wins):
 *   1. window.RB2B_ID
 *   2. data-rb2b-id on this script tag
 */
(function () {
  var id = "";
  try {
    if (typeof window !== "undefined" && window.RB2B_ID) {
      id = String(window.RB2B_ID).trim();
    }
  } catch (e) {}
  if (!id) {
    try {
      var tag = document.currentScript;
      if (tag) id = String(tag.getAttribute("data-rb2b-id") || "").trim();
    } catch (e) {}
  }
  if (!id || id === "YOUR-UNIQUE-ID") return;

  /* Published RB2B snippet — do not invent the script URL. */
  !function () {
    var reb2b = window.reb2b = window.reb2b || [];
    if (reb2b.invoked) return;
    reb2b.invoked = true;
    reb2b.methods = ["identify", "collect"];
    reb2b.factory = function (method) {
      return function () {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(method);
        reb2b.push(args);
        return reb2b;
      };
    };
    for (var i = 0; i < reb2b.methods.length; i++) {
      var key = reb2b.methods[i];
      reb2b[key] = reb2b.factory(key);
    }
    reb2b.load = function (key) {
      var script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = "https://s3-us-west-2.amazonaws.com/b2bjsstore/b/" + key + "/reb2b.js.gz";
      var first = document.getElementsByTagName("script")[0];
      first.parentNode.insertBefore(script, first);
    };
    reb2b.SNIPPET_VERSION = "1.0.1";
    reb2b.load(id);
  }();
})();
