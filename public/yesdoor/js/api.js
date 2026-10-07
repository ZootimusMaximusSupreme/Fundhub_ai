/* Yesdoor API client. Calls the spec section 8 endpoints at /api/yesdoor/...
   If the API cannot be reached (static host, 404 page, network error, 5xx) it falls
   back to the sample data in demo-data.js so every click-path still works on a
   preview deploy. Fallback is decided once per browser tab by a probe, then stays
   the same, so a page never mixes real rows with sample rows. Add ?demo=1 to any
   page URL to force demo mode, ?demo=0 to go back to automatic.

   The pages are written against one set of shapes (the sample data's). The real
   API answers in its own shapes, so every real call goes through an adapter here
   (I1, 2026-10-07): `toReal` rewrites the request, `fromReal` rewrites the answer
   into the shape the page reads. Demo calls skip both. Request bodies are camelCase;
   responses are accepted in camelCase or snake_case (keys are converted here).
   Values under criminalPolicy, byStage and tourHours keep their own keys.

   Sessions. The real API takes a session token as `Authorization: Bearer`. This
   browser keeps one per portal (renter, building, broker), so signing in to one
   portal does not sign you out of another. Staff use the Fundhub staff login and
   its token (fh_token). The renter's token comes from the pre-screen. */
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
  var KEEP = { criminalPolicy: 1, criminal_policy: 1, byStage: 1, by_stage: 1, tourHours: 1, tour_hours: 1, applicationStages: 1, renterStages: 1 };
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
  // The real API answers {error: "code", message: "words"}; the sample data answers
  // {error: "words"}. The words are what a person should read.
  function fail(status, data) {
    var e = new Error((data && (data.message || data.error)) || "Request failed");
    e.status = status; e.data = data;
    e.auth = status === 401 || status === 403;
    e.userFacing = !e.auth && status >= 400 && status < 500 && !!(data && (data.message || data.error));
    return e;
  }
  api.fail = fail;

  /* ---------------------------------------------------------- sessions */
  var TOKEN_KEY = { renter: "yd-tok-renter", building: "yd-tok-building", broker: "yd-tok-broker", staff: "yd-tok-staff" };
  var KIND_OF = { renter: "renter", building_user: "building", building: "building", broker: "broker", staff: "staff" };
  function getToken(kind) {
    var u = ui(); if (!u) return null;
    if (kind === "renter") {
      var r = api.renter();
      if (r && r.token && String(r.token).indexOf("demo-") !== 0) return r.token;
    }
    var t = u.store.get(TOKEN_KEY[kind]);
    if (!t && kind === "staff") t = u.store.get("fh_token"); // the Fundhub staff login
    return t || null;
  }
  function setToken(kind, token) { var u = ui(); if (u && TOKEN_KEY[kind]) { if (token) u.store.set(TOKEN_KEY[kind], token); else u.store.del(TOKEN_KEY[kind]); } }
  function kindForRoute(route) {
    if (route === "me" || route.indexOf("me/") === 0 || route === "public/book" || route === "public/prescreen") return "renter";
    if (route.indexOf("building/") === 0) return "building";
    if (route.indexOf("broker/") === 0) return "broker";
    if (route.indexOf("staff/") === 0) return "staff";
    return null;
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
    var kind = kindForRoute(route);
    var token = kind ? getToken(kind) : null;
    if (token) opts.headers.Authorization = "Bearer " + token;
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
      probePromise = realCall("GET", "public/listings", {}).then(function (r) {
        if (!(r.status >= 200 && r.status < 300 && r.isJson)) api.setMode("demo");
      }, function () { api.setMode("demo"); });
    }
    return probePromise;
  }
  api.ready = ready;

  /* call(method, route, query, body, adapter)
     adapter.toReal(query, body) -> {query, body} (or a Promise of it)
     adapter.fromReal(data, query, body) -> the page's shape (or a Promise of it) */
  function call(method, route, query, body, adapter) {
    adapter = adapter || {};
    return ready().then(function () {
      if (forcedDemo) return demoCall(method, route, query, body);
      return Promise.resolve(adapter.toReal ? adapter.toReal(query || {}, body || {}) : { query: query, body: body }).then(function (req) {
        return realCall(method, route, req.query, req.body).then(function (r) {
          if (r.status >= 200 && r.status < 300 && r.isJson) {
            var data = camelize(r.data);
            return adapter.fromReal ? adapter.fromReal(data, query || {}, body || {}) : data;
          }
          if (r.status === 401 || r.status === 403) {
            if (r.status === 401) { var k = kindForRoute(route); if (k && k !== "staff") setToken(k, null); }
            throw fail(r.status, r.data);
          }
          if (r.isJson && r.status >= 400 && r.status < 500) throw fail(r.status, r.data);
          // 5xx, or a non-JSON answer from a static host: use sample data from now on.
          api.setMode("demo");
          return demoCall(method, route, query, body);
        }, function () {
          api.setMode("demo");
          return demoCall(method, route, query, body);
        });
      });
    });
  }
  api.call = call;

  /* ---------------------------------------------------------- shape helpers (real -> page) */
  var DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  /* The API's tour hours are {"mon-fri": "09:00-17:00", "sat": ["10:00-12:00", "13:00-16:00"]}.
     The pages read {mon: ["09:00", "17:00"], ...}: one window a day, from the first
     opening to the last closing. An empty object means the building has not set hours
     and the booking door accepts any future time, so business hours are offered. */
  function hoursToUi(h) {
    if (!h || typeof h !== "object") return null;
    var keys = Object.keys(h);
    var out = {};
    if (!keys.length) { DAYS.forEach(function (d) { out[d] = ["09:00", "17:00"]; }); return out; }
    function daysOf(key) {
      var parts = String(key).trim().toLowerCase().split("-");
      var idx = function (d) { return DAYS.indexOf(String(d).trim().slice(0, 3)); };
      if (parts.length === 1) { var i = idx(parts[0]); return i === -1 ? [] : [i]; }
      var a = idx(parts[0]); var b = idx(parts[1]); var list = [];
      if (a === -1 || b === -1) return [];
      for (var j = a; ; j = (j + 1) % 7) { list.push(j); if (j === b) break; }
      return list;
    }
    keys.forEach(function (k) {
      var wins = Array.isArray(h[k]) ? h[k] : [h[k]];
      wins.forEach(function (w) {
        var m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(String(w || "").trim());
        if (!m) return;
        var pad = function (t) { return t.length === 4 ? "0" + t : t; };
        var s = pad(m[1]); var e = pad(m[2]);
        daysOf(k).forEach(function (di) {
          var d = DAYS[di]; var cur = out[d];
          out[d] = cur ? [s < cur[0] ? s : cur[0], e > cur[1] ? e : cur[1]] : [s, e];
        });
      });
    });
    return out;
  }
  api.hoursToUi = hoursToUi;

  function specialsList(s) { return Array.isArray(s) ? s : (s ? [String(s)] : []); }

  function listingFlat(l) {
    var b = l.building || {};
    return {
      id: l.id, buildingId: b.id, buildingName: b.name, unitLabel: l.unit, address: b.address, city: b.city, state: b.state, zip: b.zip,
      rentCents: l.rentCents, beds: l.beds, baths: l.baths === null || l.baths === undefined ? "" : Number(l.baths), sqft: l.sqft,
      availableOn: l.availableOn, specials: specialsList(l.specials), photos: l.photos || [], isSample: !!l.isSample
    };
  }
  function listingDetail(l) {
    var v = listingFlat(l);
    v.tourHours = hoursToUi(l.tourHours);
    var r = l.rules;
    v.rules = r ? { minScore: r.minScore, incomeMultiple: r.incomeMultiple, maxEvictions: r.maxEvictions, evictionLookbackYears: r.evictionLookbackYears,
      criminalPolicy: r.criminalPolicy || {}, acceptsSecondChance: !!r.acceptsSecondChance, confirmedAt: r.confirmedAt } : null;
    v.rulesStale = r ? !!r.stale : null;
    v.buildingSecondChance = !!(r && r.acceptsSecondChance);
    return v;
  }
  function citiesOf(list) {
    var seen = {}; var out = [];
    list.forEach(function (l) { if (l.city && !seen[l.city]) { seen[l.city] = 1; out.push({ name: l.city, count: 0 }); } if (l.city) seen[l.city]++; });
    out.forEach(function (c) { c.count = seen[c.name] - 1; });
    return out;
  }
  function matchFlat(m, isBackup) {
    var b = m.building || {}; var l = m.listing || {};
    return {
      buildingId: b.id, buildingName: b.name, address: b.address, city: b.city, state: b.state,
      listingId: l.id || null, unitLabel: l.unit, beds: l.beds, rentCents: l.rentCents,
      result: m.result, maxRentCents: m.maxRentCents, reasons: m.reasons || [],
      rulesConfirmedAt: m.rulesConfirmedAt, rulesStale: !!m.rulesStale, isSample: !!b.isSample, isBackup: !!isBackup
    };
  }
  /* The pre-screen and the income check answer {renter, search, results, backups}. */
  function answerFlat(d) {
    var results = (d.results || []).map(function (m) { return matchFlat(m, false); });
    var have = {}; results.forEach(function (m) { have[m.buildingId] = 1; });
    (d.backups || []).forEach(function (m) { var f = matchFlat(m, true); if (!have[f.buildingId]) { have[f.buildingId] = 1; results.push(f); } });
    var notices = []; var noticeSeen = {};
    (d.results || []).forEach(function (m) { (m.notices || []).forEach(function (n) { if (!noticeSeen[n.key]) { noticeSeen[n.key] = 1; notices.push(n); } }); });
    var r = d.renter || {};
    return { lane: r.lane, incomeVerified: !!r.incomeVerified, approvedMaxRentCents: r.approvedMaxRentCents, stage: r.stage,
      matches: results.filter(function (m) { return m.listingId; }), widenedSearch: false, notices: notices };
  }

  var OPEN_STAGES = ["booked", "registered", "toured", "applied", "approved", "lease_signed"];
  function daysSince(iso) { var t = new Date(iso).getTime(); return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000)); }

  /* ---------------------------------------------------------- public */
  api.listings = function (q) {
    q = q || {};
    // The building portal's own table: read every page and keep this building's units.
    if (q.buildingId && !forcedDemo) {
      return ready().then(function () {
        if (forcedDemo) return call("GET", "public/listings", q);
        var all = [];
        function page(n) {
          return call("GET", "public/listings", { page: n }).then(function (res) {
            all = all.concat((res.listings || []).map(function (l) { return l.building ? listingFlat(l) : l; }));
            if (n * (res.pageSize || 24) < (res.total || 0) && n < 20) return page(n + 1);
            return { listings: all.filter(function (l) { return l.buildingId === q.buildingId; }), total: all.length, page: 1, pageSize: all.length, cities: citiesOf(all) };
          });
        }
        return page(1);
      });
    }
    return call("GET", "public/listings", q, null, {
      toReal: function (query) { return { query: { city: query.city, beds: query.beds, maxRent: query.maxRent, page: query.page } }; },
      fromReal: function (d, query) {
        var list = (d.listings || []).map(listingFlat);
        if (q.buildingId) list = list.filter(function (l) { return l.buildingId === q.buildingId; });
        // The home page asks for a handful; the API pages by its own size.
        if (query.pageSize && !query.page) list = list.slice(0, Number(query.pageSize));
        return { listings: list, total: d.total, page: d.page, pageSize: d.pageSize, cities: citiesOf(list) };
      }
    });
  };
  api.listing = function (id) {
    return call("GET", "public/listing", { id: id }, null, { fromReal: function (d) { return { listing: listingDetail(d.listing) }; } });
  };
  api.lead = function (b) {
    // The real lead door answers the same thing for every email; the session comes later, from the pre-screen.
    return call("POST", "public/lead", null, b, { fromReal: function () { return { renterToken: null, status: "received" }; } });
  };
  api.prescreen = function (b) {
    return call("POST", "public/prescreen", null, b, {
      toReal: function (query, body) {
        var saved = api.renter() || {};
        var out = {
          email: body.email, firstName: body.firstName || saved.firstName, lastName: body.lastName || saved.lastName,
          address: body.address, consent: body.consent, dob: body.dob || undefined, source: body.source || (ui() ? ui().captureSource() : undefined),
          search: { city: body.city || undefined, beds: body.beds === "" ? undefined : body.beds, maxRent: body.maxRent || undefined }
        };
        // A renter who came from one apartment is checked in that apartment's city.
        if (body.listingId && !body.city) {
          return realCall("GET", "public/listing", { id: body.listingId }).then(function (r) {
            var c = r.data && r.data.listing && r.data.listing.building ? r.data.listing.building.city : null;
            if (c) out.search.city = c;
            return { body: out };
          }, function () { return { body: out }; });
        }
        return { body: out };
      },
      fromReal: function (d, query, body) {
        if (d.status === "needs_dob") return { status: "no_match", needDob: true, message: d.message };
        if (d.status === "no_match") throw fail(422, { message: d.message || "We could not find a credit file for you, even with your date of birth." });
        if (d.status === "signin_required") throw fail(409, { message: d.message || "You already started with this email. Check your inbox for a sign-in link." });
        if (d.renterToken) {
          var saved = api.renter() || {};
          api.rememberRenter({ token: d.renterToken, email: body.email || saved.email, firstName: saved.firstName || body.firstName });
        }
        var out = answerFlat(d);
        out.status = "complete";
        return out;
      }
    });
  };
  api.book = function (b) {
    return call("POST", "public/book", null, b, {
      toReal: function (query, body) { return { body: { renterToken: getToken("renter") || body.renterToken, buildingId: body.buildingId, listingId: body.listingId, startsAt: body.startsAt } }; }
    });
  };
  /* The agreement signing page (I2). The signed link is the credential: id, exp and sig
     go to the read, and to the signing call with the typed name. No session. */
  api.agreement = function (q) {
    return call("GET", "public/agreement", { id: q.id, exp: q.exp, sig: q.sig });
  };
  api.signAgreement = function (b) {
    return call("POST", "webhooks/esign", null, { id: b.id, exp: b.exp, sig: b.sig, signerName: b.signerName });
  };
  api.authLink = function (b) { return call("POST", "auth/link", null, b, { toReal: function (q, body) { return { body: { email: body.email } }; } }); };
  // Real mode POSTs the token (a mail scanner that follows every link cannot spend it
  // by GET) and keeps the session for that portal. Demo mode reads its sample session.
  api.authVerify = function (token) {
    return ready().then(function () {
      if (forcedDemo) return demoCall("GET", "auth/verify", { token: token }, {});
      return realCall("POST", "auth/verify", null, { token: token }).then(function (r) {
        if (!(r.status >= 200 && r.status < 300 && r.isJson)) throw fail(r.status, r.data || { message: "That sign-in link is not valid. Ask for a new one." });
        var d = camelize(r.data);
        var kind = KIND_OF[d.principal && d.principal.kind] || null;
        if (kind) setToken(kind, d.token);
        return { session: { kind: kind, email: d.principal && d.principal.email, buildingIds: d.principal && d.principal.buildingIds } };
      });
    });
  };
  // Sign out. A renter, building or broker session is revoked on the server
  // (POST auth/logout) and then forgotten in this browser, even if the call cannot
  // be made. Staff sign in through the Fundhub staff login, which this does not touch:
  // for staff only the desk's own token is forgotten here, as before.
  api.logout = function (kind) {
    if (forcedDemo) return demoCall("POST", "auth/logout", null, { kind: kind });
    var token = kind === "staff" ? null : getToken(kind);
    function forget() {
      setToken(kind, null);
      if (kind === "renter" && ui()) ui().store.del(RENTER_KEY);
      return { ok: true };
    }
    if (!token) return Promise.resolve(forget());
    return fetch(BASE + "auth/logout", {
      method: "POST", credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}"
    }).then(forget, forget);
  };

  /* ---------------------------------------------------------- renter */
  function meFlat(d) {
    var apps = d.applications || [];
    var tours = [];
    apps.forEach(function (a) {
      var b = a.building || {};
      if (a.tour) tours.push({ id: a.tour.id, applicationId: a.id, buildingName: b.name, address: [b.address, b.city].filter(Boolean).join(", "),
        startsAt: a.tour.startsAt, status: a.tour.status, tourHours: hoursToUi(b.tourHours) });
    });
    tours.sort(function (x, y) { return new Date(x.startsAt) - new Date(y.startsAt); });
    return {
      renter: d.renter,
      matches: (d.matches || []).map(function (m) { return matchFlat(m, m.isBackup); }).filter(function (m) { return m.listingId; }),
      applications: apps.map(function (a) {
        var b = a.building || {}; var l = a.listing || {};
        return { id: a.id, applicationId: a.id, buildingId: b.id, buildingName: b.name, listingId: l.id, unitLabel: l.unit, city: b.city,
          stage: a.stage, rentCents: l.rentCents, registeredAt: a.registeredAt, tourAt: a.tour ? a.tour.startsAt : null, tourStatus: a.tour ? a.tour.status : null,
          denialReason: a.denialReason, leaseStart: a.leaseStart, leaseEnd: a.leaseEnd };
      }),
      tours: tours,
      openApplications: apps.filter(function (a) { return OPEN_STAGES.indexOf(a.stage) !== -1; }).length,
      maxOpenApplications: 3
    };
  }
  api.me = function () { return call("GET", "me", null, null, { fromReal: meFlat }); };
  api.meIncome = function (b) {
    return call("POST", "me/income", null, b, {
      toReal: function (q, body) { return { body: { method: "plaid", publicToken: body.publicToken } }; },
      fromReal: function (d) {
        if (d.status !== "verified") return { incomeVerified: false, message: d.message };
        var out = answerFlat(d);
        out.monthlyIncomeCents = d.income ? d.income.monthlyIncomeCents : null;
        return out;
      }
    });
  };
  api.meTour = function (b) { return call("POST", "me/tour", null, b); };

  /* ---------------------------------------------------------- building user */
  api.buildingRenters = function () {
    return call("GET", "building/renters", null, null, {
      fromReal: function (d) {
        return {
          buildings: d.buildings || [],
          renters: (d.renters || []).map(function (r) {
            var b = r.building || {}; var who = r.renter || {};
            return { id: r.applicationId, applicationId: r.applicationId, buildingId: b.id, buildingName: b.name, stage: r.stage,
              renterName: [who.firstName, who.lastName].filter(Boolean).join(" "), email: who.email, listingLabel: r.unit,
              result: r.result, incomeVerified: !!r.incomeVerified, riskTier: r.riskTier, maxRentCents: r.maxRentCents,
              registeredAt: r.registeredAt, denialReason: r.denialReason, leaseStart: r.lease ? r.lease.start : null, leaseEnd: r.lease ? r.lease.end : null,
              tourAt: r.tour ? r.tour.startsAt : null, tourStatus: r.tour ? r.tour.status : null };
          })
        };
      }
    });
  };
  api.buildingUpdate = function (b) {
    return call("POST", "building/update", null, b, {
      fromReal: function (d) { d.backupsOffered = Array.isArray(d.backupsOffered) ? d.backupsOffered.length : (d.backupsOffered || 0); return d; }
    });
  };
  function rulesFlat(d, buildingId) {
    var list = d.buildings || [];
    var one = list.filter(function (x) { return x.building && x.building.id === buildingId; })[0] || list[0] || {};
    var versions = (one.versions || []).map(function (v) {
      var o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k]; });
      o.incomeMultiple = v.incomeMultiple === null || v.incomeMultiple === undefined ? v.incomeMultiple : Number(v.incomeMultiple);
      return o;
    });
    return { buildingId: one.building ? one.building.id : buildingId, buildingName: one.building ? one.building.name : "", rules: versions[0] || null, history: versions, stale: one.stale };
  }
  api.buildingRules = function (buildingId) {
    return call("GET", "building/rules", { buildingId: buildingId }, null, { fromReal: function (d) { return rulesFlat(d, buildingId); } });
  };
  api.buildingSaveRules = function (b) {
    return call("POST", "building/rules", null, b, {
      // The save answers the new version only; the page also shows the history.
      fromReal: function () { return api.buildingRules(b.buildingId); }
    });
  };
  api.buildingAddListing = function (b) { return call("POST", "building/listings", null, b); };
  api.buildingImport = function (b) {
    return call("POST", "building/import", null, b, {
      fromReal: function (d) {
        d.errors = (d.errors || []).map(function (x) { return { row: x.row || x.unit || "", message: x.message }; });
        return d;
      }
    });
  };
  api.buildingInvoices = function () {
    return call("GET", "building/invoices", null, null, {
      fromReal: function (d) {
        (d.invoices || []).forEach(function (v) { (v.lines || []).forEach(function (l) { l.registrationAt = l.registeredAt; }); });
        return d;
      }
    });
  };

  /* ---------------------------------------------------------- broker */
  api.brokerRenters = function () {
    return call("GET", "broker/renters", null, null, {
      fromReal: function (d) {
        return { renters: (d.renters || []).map(function (r) {
          var apps = r.applications || [];
          return { id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" "), stage: apps.length ? apps[0].stage : r.stage, referredAt: r.firstTouchAt };
        }) };
      }
    });
  };
  api.brokerMoney = function () {
    return call("GET", "broker/money", null, null, {
      fromReal: function (d) {
        var s = d.summary || {};
        return { earnedCents: s.earnedCents, heldCents: s.heldCents, payableCents: s.payableCents, paidCents: s.paidCents, rows: d.rows || [], holdDays: 60 };
      }
    });
  };
  api.brokerLink = function () {
    return call("GET", "broker/link", null, null, {
      fromReal: function (d) {
        var lic = d.licence || {};
        d.licenceVerified = !!lic.verifiedAt; d.licenceState = lic.state || null; d.url = d.url || "";
        return d;
      }
    });
  };

  /* ---------------------------------------------------------- staff */
  api.staffPipeline = function () {
    return call("GET", "staff/pipeline", null, null, {
      fromReal: function (d) {
        var lanes = { verified: 0, secondChance: 0, notScreened: 0 };
        (d.renters || []).forEach(function (r) { if (r.lane === "verified") lanes.verified++; else if (r.lane === "second_chance") lanes.secondChance++; else lanes.notScreened++; });
        var total = 0; Object.keys(d.renterStages || {}).forEach(function (k) { total += Number(d.renterStages[k]) || 0; });
        var rows = (d.applications || []).map(function (a) {
          return { applicationId: a.id, renterName: a.renterName, buildingName: a.buildingName, stage: a.stage, lane: a.lane, riskTier: a.riskTier || "not set",
            source: a.source, since: a.updatedAt, ageDays: daysSince(a.updatedAt) };
        });
        return {
          byStage: d.applicationStages || {}, renterLanes: lanes, applications: rows, totalRenters: total,
          needsAttention: {
            toDay: rows.filter(function (x) { return x.stage === "denied" && x.ageDays < 7; }).length,
            noShow: rows.filter(function (x) { return x.stage === "no_show"; }).length,
            waitingOnBuilding: rows.filter(function (x) { return (x.stage === "registered" || x.stage === "toured") && x.ageDays >= 3; }).length
          }
        };
      }
    });
  };
  api.staffBuildings = function () {
    return call("GET", "staff/buildings", null, null, {
      fromReal: function (d) {
        return { buildings: (d.buildings || []).map(function (b) {
          return { id: b.id, name: b.name, company: b.company ? b.company.name : "", companyTier: null, city: b.city, status: b.status,
            software: b.software || "", connection: b.connection || "", listingsCount: b.activeListings, leases: null, openApplications: b.openApplications,
            mismatchCount: b.mismatchCount, rulesConfirmedAt: b.rules ? b.rules.confirmedAt : null, rulesStale: b.rules ? !!b.rules.stale : null,
            payerScore: null, isSample: !!b.isSample };
        }) };
      }
    });
  };
  api.staffAddBuilding = function (b) { return call("POST", "staff/buildings", null, b); };
  api.staffAgreement = function (b) {
    return call("POST", "staff/agreement", null, b, {
      toReal: function (q, body) { return { body: { partyKind: "building", partyId: body.buildingId, action: body.action || "send" } }; }
    });
  };
  /* Brokers and logins (I2). The real API nests the licence; the page reads it flat. */
  function brokerFlat(b) {
    var lic = b.licence || {};
    return { id: b.id, name: b.name, company: b.company, email: b.email, plan: b.plan, splitPercent: b.splitPercent,
      licenceState: lic.state || b.licenceState || null, licenceNumber: lic.number || b.licenceNumber || null,
      licenceVerified: lic.verifiedAt ? true : !!b.licenceVerified, trackingCode: b.trackingCode, status: b.status, hasAccount: !!b.hasAccount };
  }
  api.staffBrokers = function () {
    return call("GET", "staff/brokers", null, null, { fromReal: function (d) { return { brokers: (d.brokers || []).map(brokerFlat) }; } });
  };
  api.staffAddBroker = function (b) {
    return call("POST", "staff/brokers", null, b, { fromReal: function (d) { return { broker: brokerFlat(d.broker) }; } });
  };
  // {kind: "building_user", email, buildingIds, role?} or {kind: "broker", brokerId, email?}
  api.staffCreateAccount = function (b) { return call("POST", "staff/accounts", null, b); };
  api.staffLedger = function () {
    return call("GET", "staff/ledger", null, null, {
      fromReal: function (d) {
        var ft = d.feeTotals || {};
        var c = function (k) { return ft[k] ? ft[k].cents : 0; };
        var feeByInvoice = {}; var feeById = {};
        (d.fees || []).forEach(function (f) { feeById[f.id] = f; if (f.invoice && f.invoice.id && !feeByInvoice[f.invoice.id]) feeByInvoice[f.invoice.id] = f; });
        var refunds = [];
        Object.keys(d.renterRefunds || {}).forEach(function (st) { var g = d.renterRefunds[st]; refunds.push({ reason: "app_fee_mismatch", status: st, amountCents: g.cents, count: g.count }); });
        return {
          totals: { earned: c("earned"), invoiced: c("invoiced"), paid: c("paid"), safe: c("safe") },
          invoices: (d.invoices || []).map(function (v) { var f = feeByInvoice[v.id]; v.lines = f ? [{ renterName: f.renterName }] : []; return v; }),
          brokerLedger: (d.brokerRows || []).map(function (x) { var f = feeById[x.feeLedgerId]; x.renterName = f ? f.renterName : ""; return x; }),
          refunds: refunds
        };
      }
    });
  };
  api.staffPayment = function (b) { return call("POST", "staff/payment", null, b); };
  api.staffBrokerPayout = function (b) {
    return call("POST", "staff/broker-payout", null, b, {
      toReal: function (q, body) { return { body: { brokerId: body.brokerId, payoutRef: body.ref, ledgerIds: body.brokerLedgerId ? [body.brokerLedgerId] : undefined } }; }
    });
  };
  api.staffDisputes = function () {
    return call("GET", "staff/disputes", null, null, {
      fromReal: function (d) {
        return { disputes: (d.disputes || []).map(function (x) {
          x.daysLeft = Math.ceil((new Date(x.dueBy).getTime() - Date.now()) / 86400000);
          if (typeof x.subject !== "string") x.subject = x.subject ? (x.subject.note || x.subject.summary || "A " + x.kind + " dispute") : "A " + x.kind + " dispute";
          return x;
        }) };
      }
    });
  };
  api.staffDecideDispute = function (b) {
    return call("POST", "staff/disputes", null, b, {
      toReal: function (q, body) { return { body: { disputeId: body.id, decision: body.outcome || "rejected", note: body.decision } }; }
    });
  };
  api.staffScoreboard = function () {
    var WEEK = 7 * 86400000;
    function metrics(cur, prev) {
      var M = function (key, label, get, unit, better, standing) {
        return { key: key, label: label, value: get(cur), previous: standing || !prev ? null : get(prev), unit: unit || "count", better: better || "up" };
      };
      return [
        M("leads", "Renter leads", function (s) { return s.leads; }),
        M("pulled", "Screened", function (s) { return s.pulled; }),
        M("registered", "Registered with a building", function (s) { return s.registered; }),
        M("leases", "Leases signed", function (s) { return s.leases; }),
        M("moved_in", "Moved in", function (s) { return s.movedIn; }),
        M("fees_in", "Fees paid to Yesdoor", function (s) { return s.feesInCents; }, "money"),
        M("days_to_pay", "Days from invoice to payment", function (s) { return s.avgDaysToPay; }, "days", "down"),
        M("refunds", "Refunds", function (s) { return (s.refunds.feeRefundsCount || 0) + (s.refunds.renterRefundsCount || 0); }, "count", "down"),
        M("buildings_signed", "Buildings signed", function (s) { return s.buildings.signed; }, "count", "up", true),
        M("buildings_live", "Buildings live", function (s) { return s.buildings.live; }, "count", "up", true),
        M("partners_signed", "Broker partners signed", function (s) { return s.partners.signed; }, "count", "up", true),
        M("partners_active", "Broker partners active", function (s) { return s.partners.active; }, "count", "up", true)
      ];
    }
    return ready().then(function () {
      if (forcedDemo) return call("GET", "staff/scoreboard");
      var now = Date.now();
      var iso = function (t) { return new Date(t).toISOString(); };
      return call("GET", "staff/scoreboard", { from: iso(now - WEEK), to: iso(now) }).then(function (cur) {
        return call("GET", "staff/scoreboard", { from: iso(now - 2 * WEEK), to: iso(now - WEEK) }).then(function (prev) {
          return { weekOf: cur.window ? cur.window.from.slice(0, 10) : iso(now - WEEK).slice(0, 10), comparison: "Compared with the 7 days before.", metrics: metrics(cur, prev) };
        }, function () {
          return { weekOf: cur.window ? cur.window.from.slice(0, 10) : null, comparison: "", metrics: metrics(cur, null) };
        });
      });
    });
  };

  /* ---------------------------------------------------------- session helpers */
  var RENTER_KEY = "yd-renter";
  api.rememberRenter = function (r) {
    if (!ui()) return;
    var cur = api.renter() || {};
    var out = {};
    Object.keys(cur).forEach(function (k) { out[k] = cur[k]; });
    // A new email is a new person: do not carry the old token over.
    if (r && r.email && cur.email && r.email !== cur.email) out = {};
    Object.keys(r || {}).forEach(function (k) { if (r[k] !== undefined && r[k] !== null) out[k] = r[k]; });
    ui().store.set(RENTER_KEY, JSON.stringify(out));
  };
  api.renter = function () {
    try { return JSON.parse(ui().store.get(RENTER_KEY) || "null"); } catch (e) { return null; }
  };
})();
