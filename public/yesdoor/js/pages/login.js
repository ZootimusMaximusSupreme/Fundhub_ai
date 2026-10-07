/* Yesdoor sign-in link page: /yesdoor/login.html?t=<token>.
   The emailed link lands here (the backend's YD_AUTH.loginPath). The page POSTs the
   token to auth/verify, keeps the session for that portal, and opens the portal the
   account belongs to. A link works once; a used, expired or forged one shows a way
   to ask for a new link. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ portal: true });

  var el = document.getElementById("app");
  var PORTAL = { renter: "renter.html", building: "building.html", broker: "broker.html", staff: "staff.html" };
  var token = ui.params().t || ui.params().token;

  function bad(title, text) {
    el.innerHTML = '<div class="portal-main"><section class="card login-card stack" aria-labelledby="login-h"><h1 id="login-h">' + ui.esc(title) + "</h1><p>" + ui.esc(text) + "</p>" +
      '<div class="row"><a class="btn" href="renter.html">Renter sign in</a><a class="btn-secondary" href="building.html">Building sign in</a><a class="btn-secondary" href="broker.html">Broker sign in</a></div></section></div>';
    var h = document.getElementById("login-h"); h.setAttribute("tabindex", "-1"); h.focus();
  }

  if (!token) { bad("Open the link from your email", "This page signs you in from the link we email you. Ask for a new link from your portal."); return; }

  el.innerHTML = '<div class="portal-main"><section class="card login-card stack" aria-busy="true"><h1>Signing you in</h1>' + ui.skeletonLines(2) + "</section></div>";
  YD.api.authVerify(token).then(function (res) {
    var kind = res && res.session ? res.session.kind : null;
    try { window.history.replaceState(null, "", window.location.pathname); } catch (e) { /* ignore */ }
    window.location.replace(PORTAL[kind] || "renter.html");
  }, function () {
    bad("That sign-in link did not work", "Links work once and expire after 15 minutes. Ask for a new one and use it right away.");
  });
})();
