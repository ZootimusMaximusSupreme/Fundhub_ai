/* Yesdoor shared UI helpers: formatting, header/footer, states, dialog, toast.
   Plain browser script. No framework. Loaded on every page after api.js. */
(function () {
  "use strict";
  var YD = (window.YD = window.YD || {});
  var ui = (YD.ui = {});

  /* ------------------------------------------------ safe storage */
  var mem = {};
  var smem = {};
  ui.store = {
    get: function (k) {
      try { var v = window.localStorage.getItem(k); if (v !== null) return v; } catch (e) { /* blocked */ }
      return mem[k] === undefined ? null : mem[k];
    },
    set: function (k, v) { mem[k] = v; try { window.localStorage.setItem(k, v); } catch (e) { /* blocked */ } },
    del: function (k) { delete mem[k]; try { window.localStorage.removeItem(k); } catch (e) { /* blocked */ } }
  };
  ui.sstore = {
    get: function (k) {
      try { var v = window.sessionStorage.getItem(k); if (v !== null) return v; } catch (e) { /* blocked */ }
      return smem[k] === undefined ? null : smem[k];
    },
    set: function (k, v) { smem[k] = v; try { window.sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } },
    del: function (k) { delete smem[k]; try { window.sessionStorage.removeItem(k); } catch (e) { /* blocked */ } }
  };

  /* ------------------------------------------------ formatting */
  ui.esc = function (s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  ui.money = function (cents) {
    if (cents === null || cents === undefined || isNaN(Number(cents))) return "Not known yet";
    return "$" + Math.round(Number(cents) / 100).toLocaleString("en-US");
  };
  var TZ = "America/Phoenix";
  ui.date = function (iso) {
    if (!iso) return "Not set";
    var d = new Date(String(iso).length === 10 ? iso + "T12:00:00-07:00" : iso);
    if (isNaN(d)) return "Not set";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ });
  };
  ui.dateTime = function (iso) {
    if (!iso) return "Not set";
    var d = new Date(iso);
    if (isNaN(d)) return "Not set";
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });
  };
  ui.relative = function (iso) {
    if (!iso) return "";
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return "";
    if (ms < 0 || ms >= 86400000) return ui.date(iso);
    var h = Math.floor(ms / 3600000);
    if (h < 1) return Math.max(1, Math.floor(ms / 60000)) + "m ago";
    return h + "h ago";
  };
  ui.params = function () {
    var out = {};
    try {
      new URLSearchParams(window.location.search).forEach(function (v, k) { out[k] = v; });
    } catch (e) { /* old browser */ }
    return out;
  };
  ui.plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
  ui.bedsLabel = function (b) { return Number(b) === 0 ? "Studio" : b + " bed"; };

  ui.STAGES = {
    lead: "New", screened: "Screened", matched: "Matched", booked: "Tour booked", registered: "Registered with building",
    toured: "Toured", applied: "Applied", approved: "Approved by building", denied: "Denied", lease_signed: "Lease signed",
    moved_in: "Moved in", invoiced: "Invoiced", paid: "Paid", safe: "Safe", refunded: "Refunded", no_show: "No-show",
    cancelled: "Cancelled", placed: "Placed", lifetime: "Lifetime", inactive: "Inactive"
  };
  ui.stageLabel = function (s) { return ui.STAGES[s] || String(s || "").replace(/_/g, " "); };
  ui.laneName = function (lane) {
    return lane === "second_chance" ? "Yesdoor Second Chance" : lane === "verified" ? "Yesdoor Verified" : "Not screened yet";
  };

  /* A status is never colour alone: each one has a glyph and a word. */
  ui.statusChip = function (result, noWord) {
    var map = {
      approved: ["approved", "✓", "Approved"],
      likely: ["likely", "◐", "Likely"],
      no: ["no", "✕", noWord || "Not this one"]
    };
    var m = map[result] || map.no;
    return '<span class="status ' + m[0] + '"><span aria-hidden="true">' + m[1] + "</span> " + ui.esc(m[2]) + "</span>";
  };
  ui.sampleTag = function (text) { return '<span class="tag sample">' + ui.esc(text || "Sample listing") + "</span>"; };

  ui.hoursText = function (hours) {
    if (!hours || typeof hours !== "object") return "";
    var order = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
    var parts = [];
    order.forEach(function (d) {
      var h = hours[d[0]];
      if (h && h.length === 2) parts.push(d[1] + " " + clock(h[0]) + "–" + clock(h[1]));
    });
    return parts.join(", ");
  };
  function clock(hhmm) {
    var p = String(hhmm).split(":");
    var h = Number(p[0]); var m = p[1] || "00";
    var ap = h >= 12 ? "pm" : "am";
    h = h % 12 === 0 ? 12 : h % 12;
    return h + (m === "00" ? "" : ":" + m) + ap;
  }
  ui.clock = clock;

  /* Tour slots from a building's tour hours: hourly, Arizona time (no daylight saving),
     starting at least 2 hours from now. Returns up to `maxDays` days that have slots. */
  ui.tourSlots = function (hours, maxDays) {
    var keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var out = [];
    if (!hours) return out;
    var az = Date.now() - 7 * 3600000;
    for (var i = 0; i < 21 && out.length < (maxDays || 7); i++) {
      var d = new Date(az + i * 86400000);
      var wd = d.getUTCDay();
      var h = hours[keys[wd]];
      if (!h || h.length !== 2) continue;
      var y = d.getUTCFullYear(); var m = String(d.getUTCMonth() + 1).padStart(2, "0"); var day = String(d.getUTCDate()).padStart(2, "0");
      var start = Number(String(h[0]).split(":")[0]); var end = Number(String(h[1]).split(":")[0]);
      var slots = [];
      for (var hr = start; hr < end; hr++) {
        var stamp = y + "-" + m + "-" + day + "T" + String(hr).padStart(2, "0") + ":00:00-07:00";
        if (new Date(stamp).getTime() < Date.now() + 2 * 3600000) continue;
        slots.push({ iso: stamp, label: clock(String(hr) + ":00") });
      }
      if (slots.length) out.push({ date: y + "-" + m + "-" + day, label: names[wd] + " " + months[d.getUTCMonth()] + " " + d.getUTCDate(), slots: slots });
    }
    return out;
  };

  /* Building rules, in plain words (never a credit number about a person). */
  ui.rulesInWords = function (r) {
    if (!r) return [];
    var out = [];
    var n = function (v) { return v === null || v === undefined || v === "" ? null : Number(v); };
    if (n(r.minScore) !== null) out.push("Looks for a credit score of " + r.minScore + " or higher.");
    if (n(r.incomeMultiple) !== null) out.push("Wants verified income of about " + r.incomeMultiple + " times the monthly rent.");
    if (n(r.maxEvictions) !== null) {
      var yrs = n(r.evictionLookbackYears);
      out.push(r.maxEvictions === 0
        ? "No evictions" + (yrs ? " in the last " + yrs + " years." : ".")
        : "Allows up to " + ui.plural(r.maxEvictions, "eviction", "evictions") + (yrs ? " in the last " + yrs + " years." : "."));
    }
    var pol = r.criminalPolicy;
    if (pol && typeof pol === "object") {
      Object.keys(pol).forEach(function (cat) {
        var label = cat.replace(/_/g, " ");
        var v = pol[cat];
        if (v === "never") out.push("Does not accept " + label + " records.");
        else if (v === "case_by_case") out.push("Reviews " + label + " records one by one.");
        else if (n(v) !== null) out.push("Accepts " + label + " records older than " + v + " years.");
      });
    }
    if (r.acceptsSecondChance) out.push("Open to Second Chance renters.");
    return out;
  };

  /* ------------------------------------------------ states */
  ui.skeletonCards = function (n) {
    var s = "";
    for (var i = 0; i < (n || 6); i++) s += '<div class="skeleton skel-card" aria-hidden="true"></div>';
    return '<div class="grid cols-3" role="status" aria-label="Loading">' + s + "</div>";
  };
  ui.skeletonLines = function (n) {
    var s = "";
    for (var i = 0; i < (n || 4); i++) s += '<div class="skeleton skel-line" style="width:' + (96 - i * 9) + '%"></div>';
    return '<div role="status" aria-label="Loading" aria-busy="true">' + s + "</div>";
  };
  ui.emptyState = function (title, text, actionHtml) {
    return '<div class="empty"><h3>' + ui.esc(title) + "</h3><p>" + ui.esc(text) + "</p>" + (actionHtml || "") + "</div>";
  };
  ui.errorState = function (message, retry) {
    return '<div class="error-box" role="alert"><h3>That did not load</h3><p>' + ui.esc(message || "Something went wrong on our side.") +
      "</p>" + (retry === false ? "" : '<button class="btn-secondary" type="button" data-retry>Try again</button>') + "</div>";
  };
  ui.errMessage = function (e) {
    if (e && e.message && e.userFacing) return e.message;
    if (e && e.status === 409 && e.message) return e.message;
    return "We could not reach Yesdoor just now. Please try again in a moment.";
  };

  /* ------------------------------------------------ toast, dialog */
  ui.announce = function (msg) {
    var live = document.getElementById("yd-live");
    if (!live) {
      live = document.createElement("div");
      live.id = "yd-live"; live.className = "sr-only"; live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
      document.body.appendChild(live);
    }
    live.textContent = "";
    setTimeout(function () { live.textContent = msg; }, 20);
  };
  var toastTimer;
  ui.toast = function (msg) {
    var t = document.getElementById("yd-toast");
    if (!t) { t = document.createElement("div"); t.id = "yd-toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    ui.announce(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  };

  /* A small modal. Esc closes, focus returns to the opener. */
  ui.openDialog = function (title, bodyHtml, onMount) {
    var opener = document.activeElement;
    var back = document.createElement("div");
    back.className = "dialog-back";
    back.innerHTML = '<div class="card dialog" role="dialog" aria-modal="true" aria-labelledby="yd-dlg-title"><h2 id="yd-dlg-title">' +
      ui.esc(title) + "</h2>" + bodyHtml + "</div>";
    document.body.appendChild(back);
    var dlg = back.firstChild;
    function close() {
      document.removeEventListener("keydown", onKey);
      if (back.parentNode) back.parentNode.removeChild(back);
      if (opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        var f = dlg.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        var first = f[0]; var last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    var cancel = dlg.querySelectorAll("[data-close]");
    for (var i = 0; i < cancel.length; i++) cancel[i].addEventListener("click", close);
    if (onMount) onMount(dlg, close);
    var focusable = dlg.querySelector("input,select,textarea,button");
    if (focusable) focusable.focus();
    return { close: close, el: dlg };
  };

  ui.pager = function (total, page, per) {
    var pages = Math.max(1, Math.ceil(total / per));
    if (pages <= 1) return "";
    return '<nav class="pager" aria-label="Pages"><button class="btn-secondary sm" type="button" data-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") +
      '>Previous</button><span class="caption">Page ' + page + " of " + pages + " (" + total + ' rows)</span><button class="btn-secondary sm" type="button" data-page="' +
      (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">Next</button></nav>";
  };

  /* A table that paginates at 25 rows. cfg = { caption, cols: [{ label, n, cls, render(row) }], rows, per, empty: [title, text, actionHtml] }
     render() returns HTML, so the caller escapes. Returns { setRows(rows) }. */
  ui.paged = function (root, cfg) {
    var page = 1; var per = cfg.per || 25;
    function draw() {
      if (!cfg.rows.length) { root.innerHTML = ui.emptyState(cfg.empty[0], cfg.empty[1], cfg.empty[2]); return; }
      var slice = cfg.rows.slice((page - 1) * per, page * per);
      root.innerHTML = '<div class="table-wrap" tabindex="0" role="region" aria-label="' + ui.esc(cfg.caption) + '"><table><caption class="sr-only">' + ui.esc(cfg.caption) + "</caption><thead><tr>" +
        cfg.cols.map(function (c) { return '<th scope="col"' + (c.n ? ' class="n"' : "") + ">" + ui.esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        slice.map(function (row) {
          return "<tr>" + cfg.cols.map(function (c) { return "<td" + (c.n || c.cls ? ' class="' + (c.n ? "n " : "") + (c.cls || "") + '"' : "") + ">" + c.render(row) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>" + ui.pager(cfg.rows.length, page, per);
    }
    root.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-page]") : null;
      if (b && root.contains(b) && !b.disabled) { page = Number(b.getAttribute("data-page")); draw(); }
    });
    draw();
    return { setRows: function (rows) { cfg.rows = rows; page = 1; draw(); } };
  };

  ui.kpi = function (label, value, cmp) {
    return '<div class="card kpi"><span class="kpi-label">' + ui.esc(label) + '</span><div class="kpi-value">' + value + "</div>" + (cmp ? '<div class="kpi-cmp">' + ui.esc(cmp) + "</div>" : "") + "</div>";
  };

  ui.busy = function (btn, on) {
    if (!btn) return;
    if (on) { btn.setAttribute("data-label", btn.innerHTML); btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Working'; }
    else { btn.disabled = false; if (btn.getAttribute("data-label") !== null) btn.innerHTML = btn.getAttribute("data-label"); }
  };

  /* ------------------------------------------------ chrome */
  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="3" y="3" width="26" height="26" rx="8" fill="var(--yd-brand)"/><path d="M11 25V13a5 5 0 0 1 10 0v12z" fill="var(--yd-brand-ink)"/><circle cx="18.5" cy="19.5" r="1.4" fill="var(--yd-brand)"/></svg>';
  ui.logo = LOGO;

  function applyTheme() {
    var t = ui.store.get("yd-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  }
  applyTheme();

  function nav(active) {
    var items = [
      ["search", "search.html", "Find apartments"],
      ["prescreen", "prescreen.html", "Am I approved?"],
      ["building", "building.html", "For buildings"],
      ["broker", "broker.html", "For brokers"],
      ["renter", "renter.html", "My Yesdoor"]
    ];
    return items.map(function (i) {
      return '<a href="' + i[1] + '"' + (i[0] === active ? ' aria-current="page"' : "") + ">" + i[2] + "</a>";
    }).join("");
  }

  ui.mountChrome = function (opts) {
    opts = opts || {};
    var banner = document.getElementById("yd-banner");
    if (banner) {
      banner.innerHTML = '<div class="demo-banner" id="yd-demo-banner" role="status" hidden>Demo mode — sample data. Nothing here is real and nothing is sent. ' +
        '<button type="button" id="yd-demo-reset">Reset the demo</button><button type="button" id="yd-demo-live">Try live data</button></div>';
      var showBanner = function () {
        var b = document.getElementById("yd-demo-banner");
        if (b) b.hidden = !(YD.api && YD.api.isDemo());
      };
      window.addEventListener("yd:mode", showBanner);
      showBanner();
      document.getElementById("yd-demo-reset").addEventListener("click", function () {
        if (YD.demo && YD.demo.reset) YD.demo.reset();
        ui.store.del("yd-renter");
        window.location.href = "index.html";
      });
      document.getElementById("yd-demo-live").addEventListener("click", function () {
        if (YD.api) YD.api.setMode("auto");
        window.location.reload();
      });
    }
    var header = document.getElementById("yd-header");
    if (header) {
      header.innerHTML = '<header class="site-header"><div class="wrap"><a class="brand" href="index.html">' + LOGO + "<span>Yesdoor</span></a>" +
        '<nav class="site-nav" aria-label="Main">' + (opts.portal ? '<a href="index.html">Back to Yesdoor</a>' : nav(opts.active)) +
        '<button class="theme-toggle" type="button" id="yd-theme" aria-label="Switch between light and dark">Light / dark</button></nav></div></header>';
      document.getElementById("yd-theme").addEventListener("click", function () {
        var cur = document.documentElement.getAttribute("data-theme");
        var dark = cur ? cur === "dark" : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        var next = dark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        ui.store.set("yd-theme", next);
      });
    }
    var footer = document.getElementById("yd-footer");
    if (footer) {
      footer.innerHTML = '<footer class="site-footer"><div class="wrap"><div class="cols"><div>' +
        '<a class="brand" href="index.html">' + LOGO + "<span>Yesdoor</span></a>" +
        '<p class="prose" style="margin-top:16px"><strong>Who pays Yesdoor?</strong> The buildings do. A building pays us a fee only after a renter signs a lease and moves in. ' +
        "It is free for renters to use Yesdoor. A building may charge its own application fee, and we tell you when it does.</p>" +
        '<p class="caption">Listings and data marked &ldquo;Sample&rdquo; are made up for this preview. Arizona first.</p></div>' +
        '<div><h3>Renters</h3><ul><li><a href="search.html">Find apartments</a></li><li><a href="prescreen.html">See if you are approved</a></li><li><a href="renter.html">My Yesdoor</a></li></ul></div>' +
        '<div><h3>Partners</h3><ul><li><a href="building.html">Building sign in</a></li><li><a href="broker.html">Broker sign in</a></li><li><a href="staff.html">Yesdoor staff</a></li></ul></div>' +
        "</div></div></footer>";
    }
    if (!document.getElementById("yd-skip")) {
      var a = document.createElement("a");
      a.id = "yd-skip"; a.className = "skip"; a.href = "#main"; a.textContent = "Skip to main content";
      document.body.insertBefore(a, document.body.firstChild);
    }
  };

  /* Event delegation: ui.on(root, "click", "[data-x]", fn(event, matchedEl)) */
  ui.on = function (root, type, selector, fn) {
    root.addEventListener(type, function (e) {
      var el = e.target.closest ? e.target.closest(selector) : null;
      if (el && root.contains(el)) fn(e, el);
    });
  };

  ui.photoClass = function (id) {
    var h = 0; var s = String(id || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return "p" + ((h % 6) + 1);
  };

  /* A listing card, used on the home page and on search. */
  ui.listingCard = function (l) {
    var href = "listing.html?id=" + encodeURIComponent(l.id);
    var special = (l.specials && l.specials[0]) ? '<div class="special">' + ui.esc(l.specials[0]) + "</div>" : "";
    return '<a class="card listing-card" href="' + href + '"><div class="ph ' + ui.photoClass(l.id) + '" role="img" aria-label="Photo placeholder for ' + ui.esc(l.buildingName) + '">' +
      (l.isSample ? ui.sampleTag("Sample listing") : "") + "</div>" +
      '<div class="listing-body"><div class="price">' + ui.money(l.rentCents) + '<span class="caption"> /mo</span></div>' +
      "<div><strong>" + ui.esc(ui.bedsLabel(l.beds)) + " · " + ui.esc(l.baths) + " bath</strong>" + (l.sqft ? ' <span class="muted">· ' + Number(l.sqft).toLocaleString("en-US") + " sq ft</span>" : "") + "</div>" +
      '<div class="muted">' + ui.esc(l.buildingName) + " · " + ui.esc(l.city) + ", " + ui.esc(l.state) + "</div>" + special +
      (l.buildingSecondChance ? '<div><span class="tag lane">Second Chance friendly</span></div>' : "") +
      "</div></a>";
  };

  /* First touch wins: the first ad id or broker code a visitor arrives with is the source. */
  ui.captureSource = function () {
    var cur = null;
    try { cur = JSON.parse(ui.store.get("yd-source") || "null"); } catch (e) { cur = null; }
    if (!cur) {
      var p = ui.params();
      // The broker portal hands out /yesdoor/?b=<code>; older links used ?broker=.
      if (p.b || p.broker) cur = { kind: "broker", brokerCode: p.b || p.broker };
      else if (p.ad || p.utm_content) cur = { kind: "ad", adId: p.ad || p.utm_content };
      if (cur) ui.store.set("yd-source", JSON.stringify(cur));
    }
    return cur || { kind: "direct" };
  };

  ui.consent = {
    version: "screening-recheck-2026-10-07-v1",
    text: "I allow Yesdoor and its screening partners to run a soft credit check (it does not lower my score), an eviction check and a criminal background check using my name and current address. " +
      "I also allow Yesdoor to run these checks again on its own while I am searching and about 90 days before my lease ends, without asking me again. " +
      "I understand Yesdoor shares only my approval answer, income-verified status, risk tier and maximum rent with buildings, never my credit report. " +
      "I can take back this permission any time by emailing support."
  };
})();
