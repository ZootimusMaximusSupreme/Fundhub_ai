/* Yesdoor API client. Calls the spec section 8 endpoints at /api/yesdoor/...
   If the API cannot be reached (static host, 404 page, network error, 5xx) it falls
   back to the sample data in demo-data.js so every click-path still works on a
   preview deploy. Fallback is decided once per browser tab by a probe, then stays
   the same, so a page never mixes real rows with sample rows. Add ?demo=1 to any
   page URL to force demo mode, ?demo=0 to go back to automatic.

   Request bodies are camelCase (as in the spec). Responses are accepted in camelCase
   or snake_case; keys are converted to camelCase here. Values under criminalPolicy,
   byStage and tourHours keep their own keys (category and weekday names). */
(function () {
  "use strict";
  var YD = (window.YD = window.YD || {});
  var api = (YD.api = {});
  var BASE = "/api/yesdoor/";
  var MODE_KEY = "yd-mode";

  var forcedDemo = false;
  var probePromise = null;

  function ui() { return YD.ui; }
  function getMode() { return ui() ? ui().sstore.get(MODE_KEY) : null; }
  function announceMode() {
    try { window.dispatchEvent(new CustomEvent("yd:mode", { detail: { demo: forcedDemo } })); } catch (e) { /* old browser */ }
  }

  api.isDemo = function () { return forcedDemo; };
  api.setMode = function (mode) {
    if (mode === "demo") { forcedDemo = true; if (ui()) ui().sstore.set(MODE_KEY, "demo"); }
    else { forcedDemo = false; probePromise = null; if (ui()) ui().sstore.del(MODE_KEY); }
    announceMode();
  };

  (function readUrlMode() {
    var p = "";
    try { p = new URLSearchParams(window.location.search).get("demo"); } catch (e) { /* none */ }
    if (p === "1") api.setMode("demo");
    else if (p === "0") api.setMode("auto");
    else if (getMode() === "demo") forcedDemo = true;
  })();

  /* ---------------------------------------------------------- helpers */
  var KEEP = { criminalPolicy: 1, criminal_policy: 1, byStage: 1, by_stage: 1, tourHours: 1, tour_hours: 1 };
  function camelKey(k) { return k.replace(/_([a-z0-9])/g, function (m, c) { return c.toUpperCase(); }); }
  function camelize(v) {
    if (Array.isArray(v)) return v.map(camelize);
    if (v && typeof v === "object") {
      var out = {};
      Object.keys(v).forEach(function (k) { out[camelKey(k)] = KEEP[k] ? v[k] : camelize(v[k]); });
      return out;
    }
    return v;
  }
  function qs(query) {
    var parts = [];
    Object.keys(query || {}).forEach(function (k) {
      var v = query[k];
      if (v !== undefined && v !== null && v !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }
  function fail(status, data) {
    var e = new Error((data && (data.error || data.message)) || "Request failed");
    e.status = status; e.data = data;
    e.auth = status === 401 || status === 403;
    e.userFacing = !e.auth && status >= 400 && status < 500 && !!(data && (data.error || data.message));
    return e;
  }

  function demoCall(method, route, query, body) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        var r;
        try { r = YD.demo.handle(method, route, query || {}, body || {}); }
        catch (err) { reject(err); return; }
        if (r.status >= 400) reject(fail(r.status, r.data));
        else resolve(camelize(r.data));
      }, 120);
    });
  }

  function realCall(method, route, query, body) {
    var opts = { method: method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (method !== "GET") { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body || {}); }
    return fetch(BASE + route + qs(query), opts).then(function (res) {
      var type = res.headers.get("content-type") || "";
      var isJson = type.indexOf("json") !== -1;
      return (isJson ? res.json() : Promise.resolve(null)).catch(function () { return null; }).then(function (data) {
        return { status: res.status, data: data, isJson: isJson };
      });
    });
  }

  /* One probe per tab: is the real API there? */
  function ready() {
    if (forcedDemo) return Promise.resolve();
    if (!probePromise) {
      probePromise = realCall("GET", "public/listings", { pageSize: 1 }).then(function (r) {
        if (!(r.status >= 200 && r.status < 300 && r.isJson)) api.setMode("demo");
      }, function () { api.setMode("demo"); });
    }
    return probePromise;
  }
  api.ready = ready;

  function call(method, route, query, body) {
    return ready().then(function () {
      if (forcedDemo) return demoCall(method, route, query, body);
      return realCall(method, route, query, body).then(function (r) {
        if (r.status >= 200 && r.status < 300 && r.isJson) return camelize(r.data);
        if (r.status === 401 || r.status === 403) throw fail(r.status, r.data);
        if (r.isJson && r.status >= 400 && r.status < 500) throw fail(r.status, r.data);
        // 5xx, or a non-JSON answer from a static host: use sample data from now on.
        api.setMode("demo");
        return demoCall(method, route, query, body);
      }, function () {
        api.setMode("demo");
        return demoCall(method, route, query, body);
      });
    });
  }
  api.call = call;

  /* ---------------------------------------------------------- public */
  api.listings = function (q) { return call("GET", "public/listings", q); };
  api.listing = function (id) { return call("GET", "public/listing", { id: id }); };
  api.lead = function (b) { return call("POST", "public/lead", null, b); };
  api.prescreen = function (b) { return call("POST", "public/prescreen", null, b); };
  api.book = function (b) { return call("POST", "public/book", null, b); };
  api.authLink = function (b) { return call("POST", "auth/link", null, b); };
  api.authVerify = function (token) { return call("GET", "auth/verify", { token: token }); };
  api.logout = function (kind) { return call("POST", "auth/logout", null, { kind: kind }); };

  /* ---------------------------------------------------------- renter */
  api.me = function () { return call("GET", "me"); };
  api.meIncome = function (b) { return call("POST", "me/income", null, b); };
  api.meTour = function (b) { return call("POST", "me/tour", null, b); };

  /* ---------------------------------------------------------- building user */
  api.buildingRenters = function () { return call("GET", "building/renters"); };
  api.buildingUpdate = function (b) { return call("POST", "building/update", null, b); };
  api.buildingRules = function (buildingId) { return call("GET", "building/rules", { buildingId: buildingId }); };
  api.buildingSaveRules = function (b) { return call("POST", "building/rules", null, b); };
  api.buildingAddListing = function (b) { return call("POST", "building/listings", null, b); };
  api.buildingImport = function (b) { return call("POST", "building/import", null, b); };
  api.buildingInvoices = function () { return call("GET", "building/invoices"); };

  /* ---------------------------------------------------------- broker */
  api.brokerRenters = function () { return call("GET", "broker/renters"); };
  api.brokerMoney = function () { return call("GET", "broker/money"); };
  api.brokerLink = function () { return call("GET", "broker/link"); };

  /* ---------------------------------------------------------- staff */
  api.staffPipeline = function () { return call("GET", "staff/pipeline"); };
  api.staffBuildings = function () { return call("GET", "staff/buildings"); };
  api.staffAgreement = function (b) { return call("POST", "staff/agreement", null, b); };
  api.staffLedger = function () { return call("GET", "staff/ledger"); };
  api.staffPayment = function (b) { return call("POST", "staff/payment", null, b); };
  api.staffBrokerPayout = function (b) { return call("POST", "staff/broker-payout", null, b); };
  api.staffDisputes = function () { return call("GET", "staff/disputes"); };
  api.staffDecideDispute = function (b) { return call("POST", "staff/disputes", null, b); };
  api.staffScoreboard = function () { return call("GET", "staff/scoreboard"); };

  /* ---------------------------------------------------------- session helpers */
  var RENTER_KEY = "yd-renter";
  api.rememberRenter = function (r) { if (ui()) ui().store.set(RENTER_KEY, JSON.stringify(r)); };
  api.renter = function () {
    try { return JSON.parse(ui().store.get(RENTER_KEY) || "null"); } catch (e) { return null; }
  };
})();
