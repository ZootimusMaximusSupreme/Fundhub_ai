/* Yesdoor portal shell: sign-in screen, left rail, hash-routed views.
   Used by renter.html, building.html, broker.html and staff.html.

   YD.portal.start({
     kind: "renter" | "building" | "broker" | "staff",
     title: "My Yesdoor",
     intro: "one sentence shown on the sign-in screen",
     nav: [{ id, label }],            // role-scoped, 7 items at most
     probe: function () -> Promise,   // an API read that needs the session; 401 shows the sign-in screen
     views: { id: function (el, ctx) },   // render a view into el; ctx = { data, reload(), go(id) }
     who: function (data) -> string
   }) */
(function () {
  "use strict";
  var YD = (window.YD = window.YD || {});
  var ui = YD.ui;
  var portal = (YD.portal = {});

  function main() { return document.getElementById("app"); }

  function loginView(cfg) {
    var el = main();
    var isStaff = cfg.kind === "staff";
    var demo = YD.api.isDemo();
    var saved = cfg.kind === "renter" && YD.api.renter() ? YD.api.renter().email : "";
    el.innerHTML = '<div class="portal-main"><section class="card login-card stack" aria-labelledby="login-h">' +
      '<h1 id="login-h">' + ui.esc(cfg.title) + " sign in</h1>" +
      "<p>" + ui.esc(cfg.intro) + "</p>" +
      (isStaff
        ? '<div id="login-out"></div>'
        : '<form id="login-form" novalidate><div class="field"><label for="login-email">Email address</label>' +
          '<input class="input" id="login-email" name="email" type="email" autocomplete="email" required value="' + ui.esc(saved) + '"><div class="field-error" id="login-err" role="alert" hidden></div></div>' +
          '<div style="margin-top:16px"><button class="btn" type="submit" id="login-send">Email me a sign-in link</button></div></form><div id="login-out"></div>') +
      "</section></div>";
    var out = document.getElementById("login-out");

    function demoButton(label) {
      out.innerHTML = '<div class="notice warn" role="status"><p><strong>Demo mode.</strong> No email is sent in this preview. Use the sample ' + ui.esc(cfg.title.toLowerCase()) +
        ' to click through.</p><button class="btn" type="button" id="demo-open">' + ui.esc(label) + "</button></div>";
      document.getElementById("demo-open").addEventListener("click", function () {
        var em = (document.getElementById("login-email") || {}).value || "";
        YD.api.authVerify("demo:" + cfg.kind + ":" + em.trim().toLowerCase()).then(function () { portal.start(cfg); }, function (e) {
          ui.toast(ui.errMessage(e));
        });
      });
      document.getElementById("demo-open").focus();
    }

    if (isStaff) {
      if (demo) demoButton("Open the sample staff desk");
      else out.innerHTML = '<a class="btn" href="/login.html?next=' + encodeURIComponent("/yesdoor/staff.html") + '">Sign in with your staff account</a><p class="caption" style="margin-top:16px"><button class="link-btn" type="button" id="use-sample">Use sample data instead</button></p>';
      var us = document.getElementById("use-sample");
      if (us) us.addEventListener("click", function () { YD.api.setMode("demo"); window.location.reload(); });
      return;
    }
    if (demo) { /* the sign-in link step still runs, then the sample button appears */ }
    document.getElementById("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("login-email"); var err = document.getElementById("login-err");
      var email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        err.textContent = "Enter the email address you signed up with."; err.hidden = false; input.setAttribute("aria-invalid", "true"); input.focus(); return;
      }
      err.hidden = true; input.removeAttribute("aria-invalid");
      var btn = document.getElementById("login-send"); ui.busy(btn, true);
      YD.api.authLink({ email: email, kind: cfg.kind }).then(function () {
        ui.busy(btn, false);
        if (YD.api.isDemo()) demoButton("Open the sample " + cfg.title.toLowerCase());
        else {
          out.innerHTML = '<div class="notice" role="status"><p><strong>Check your email.</strong> We sent a sign-in link to ' + ui.esc(email) + ". It works for 15 minutes.</p>" +
            '<p class="caption"><button class="link-btn" type="button" id="use-sample">Use sample data instead</button></p></div>';
          document.getElementById("use-sample").addEventListener("click", function () { YD.api.setMode("demo"); window.location.reload(); });
        }
      }, function (e2) { ui.busy(btn, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
    });
    input_focus();
    function input_focus() { var i = document.getElementById("login-email"); if (i) i.focus(); }
  }

  function shell(cfg, data) {
    var el = main();
    var hash = function () { var h = (window.location.hash || "").replace("#", ""); return cfg.nav.some(function (n) { return n.id === h; }) ? h : cfg.nav[0].id; };
    var ctx = { data: data, reload: null, go: function (id) { window.location.hash = id; } };
    el.innerHTML = '<div class="portal"><aside class="rail" id="rail"><button class="menu-btn" type="button" id="menu-btn" aria-expanded="false" aria-controls="rail-nav">' +
      '<span id="menu-current">Menu</span><span aria-hidden="true">☰</span></button>' +
      '<div class="who"><div class="caption">' + ui.esc(cfg.title) + '</div><strong id="who-name"></strong></div>' +
      '<nav id="rail-nav" aria-label="' + ui.esc(cfg.title) + '">' +
      cfg.nav.map(function (n) { return '<a href="#' + n.id + '" data-nav="' + n.id + '">' + ui.esc(n.label) + "</a>"; }).join("") +
      '<a href="#signout" id="signout" style="margin-top:16px">Sign out</a></nav></aside>' +
      '<div class="portal-main" id="view" tabindex="-1"></div></div>';
    document.getElementById("who-name").textContent = cfg.who ? cfg.who(data) : "";

    var rail = document.getElementById("rail");
    document.getElementById("menu-btn").addEventListener("click", function () {
      var open = rail.classList.toggle("open");
      this.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.getElementById("signout").addEventListener("click", function (e) {
      e.preventDefault();
      YD.api.logout(cfg.kind).then(function () { window.location.href = window.location.pathname; }, function () { window.location.href = window.location.pathname; });
    });

    function render() {
      var id = hash();
      var links = el.querySelectorAll("[data-nav]");
      for (var i = 0; i < links.length; i++) {
        if (links[i].getAttribute("data-nav") === id) { links[i].setAttribute("aria-current", "page"); document.getElementById("menu-current").textContent = links[i].textContent; }
        else links[i].removeAttribute("aria-current");
      }
      rail.classList.remove("open");
      document.getElementById("menu-btn").setAttribute("aria-expanded", "false");
      var view = document.getElementById("view");
      view.innerHTML = ui.skeletonLines(5);
      var label = cfg.nav.filter(function (n) { return n.id === id; })[0].label;
      document.title = label + " | " + cfg.title + " | Yesdoor";
      Promise.resolve(cfg.views[id](view, ctx)).then(function () {
        var h = view.querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); }
      }, function (e) {
        if (e && e.auth) { loginView(cfg); return; }
        view.innerHTML = ui.errorState(ui.errMessage(e));
        var retry = view.querySelector("[data-retry]"); if (retry) retry.addEventListener("click", render);
      });
    }
    ctx.reload = function () {
      return cfg.probe().then(function (d) { ctx.data = d; render(); }, function (e) { if (e && e.auth) loginView(cfg); else ui.toast(ui.errMessage(e)); });
    };
    window.addEventListener("hashchange", render);
    render();
  }

  portal.start = function (cfg) {
    ui.mountChrome({ portal: true });
    var el = main();
    el.innerHTML = '<div class="portal-main">' + ui.skeletonLines(4) + "</div>";
    // ?t= is the emailed sign-in link (the backend's login path); ?token= is the older form.
    var token = ui.params().t || ui.params().token;
    var begin = token
      ? YD.api.authVerify(token).then(function () {
        try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (e) { /* ignore */ }
      }, function () { /* an old link: fall through to sign-in */ })
      : Promise.resolve();
    begin.then(function () { return cfg.probe(); }).then(function (data) { shell(cfg, data); }, function (e) {
      if (e && e.auth) loginView(cfg);
      else { el.innerHTML = '<div class="portal-main">' + ui.errorState(ui.errMessage(e)) + "</div>"; var r = el.querySelector("[data-retry]"); if (r) r.addEventListener("click", function () { portal.start(cfg); }); }
    });
  };
})();
