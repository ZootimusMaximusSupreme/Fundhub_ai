/* Yesdoor agreement signing page: /yesdoor/agreement.html?id=<agreementId>&exp=<unix>&sig=<hex>.
   The link in the signing email lands here. The link is the whole credential: no login.
   The page reads the terms (GET public/agreement), takes a typed full name and an agree box,
   and posts them to the sandbox e-sign callback (POST webhooks/esign). A link that is wrong,
   expired or unknown looks the same on purpose (the server answers one 404), so this page
   says one thing for all of them. Signing here is a stand-in for a real e-signature: the page
   says so. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ portal: true });

  var el = document.getElementById("app");
  var q = ui.params();
  var link = { id: q.id, exp: q.exp, sig: q.sig };

  function card(title, bodyHtml) {
    el.innerHTML = '<div class="portal-main"><section class="card login-card stack" aria-labelledby="ag-h"><h1 id="ag-h">' + ui.esc(title) + "</h1>" + bodyHtml + "</section></div>";
    var h = document.getElementById("ag-h"); h.setAttribute("tabindex", "-1"); h.focus();
  }
  function bad(title, text) { card(title, "<p>" + ui.esc(text) + "</p>"); }

  /* The terms, in plain words. Only what the agreement holds: a missing number is left out, never guessed. */
  function termLines(a) {
    var t = a.terms || {}; var out = [];
    if (a.kind === "broker_partner") {
      if (t.plan === "split") {
        out.push("Plan: placement split.");
        if (t.splitPercent !== null && t.splitPercent !== undefined) out.push("You earn " + t.splitPercent + "% of each placement fee Yesdoor collects for a renter you sent. Your share is held until the building's refund window has passed, then it becomes payable.");
      } else if (t.plan === "software") out.push("Plan: software only. This plan has no placement split.");
      return out;
    }
    if (t.feeKind === "flat" && t.feeFlatCents !== null && t.feeFlatCents !== undefined) out.push("The fee: " + ui.money(t.feeFlatCents) + " for each renter Yesdoor places who moves in.");
    else if (t.feePercent !== null && t.feePercent !== undefined) out.push("The fee: " + t.feePercent + "% of the first month's rent" + (Number(t.feePercent) === 100 ? " (one full month)" : "") + ", for each renter Yesdoor places who moves in.");
    if (t.paymentTermsDays !== null && t.paymentTermsDays !== undefined) out.push("Each invoice is due " + ui.plural(t.paymentTermsDays, "day", "days") + " after it is issued.");
    if (t.refundDays !== null && t.refundDays !== undefined) out.push("Refund window: if a renter leaves within " + ui.plural(t.refundDays, "day", "days") + " of the fee being paid, the fee is refunded.");
    return out;
  }

  function titleOf(a) { return a.kind === "broker_partner" ? "Yesdoor partner agreement" : "Yesdoor placement fee agreement"; }

  function signedView(a, name) {
    card("Signed", '<div class="notice" role="status"><p><strong>' + ui.esc(a.partyName) + "</strong> has signed the " + ui.esc(titleOf(a).toLowerCase()) +
      (a.signedAt ? " on " + ui.esc(ui.date(a.signedAt)) : "") + (name ? ". Thank you, " + ui.esc(name) : "") + ".</p></div>" +
      "<p>You can close this page. If anything about the terms below looks wrong, tell your Yesdoor contact.</p>" + termsHtml(a));
  }

  function termsHtml(a) {
    var lines = termLines(a);
    return '<h2>Terms</h2>' + (lines.length ? '<ul class="stack" style="padding-left:16px">' + lines.map(function (l) { return "<li>" + ui.esc(l) + "</li>"; }).join("") + "</ul>"
      : '<p class="caption">No terms are on file for this agreement. Ask your Yesdoor contact.</p>');
  }

  function formView(a) {
    el.innerHTML = '<div class="portal-main"><section class="card login-card stack" aria-labelledby="ag-h"><h1 id="ag-h">' + ui.esc(titleOf(a)) + "</h1>" +
      "<p>This agreement is with <strong>" + ui.esc(a.partyName) + "</strong>.</p>" + termsHtml(a) +
      '<div class="notice warn" role="note"><p><strong>Practice signing.</strong> Yesdoor is not live yet, so this signature is a stand-in for a real e-signature. Your typed name is saved with the time you signed.</p></div>' +
      '<form id="ag-form" class="stack" novalidate><div class="field"><label for="ag-name">Type your full name to sign</label>' +
      '<input class="input" id="ag-name" name="name" autocomplete="name" required><div class="field-error" id="ag-name-err" role="alert" hidden></div></div>' +
      '<div class="check"><input type="checkbox" id="ag-agree" aria-describedby="ag-agree-err"><label for="ag-agree">I have read these terms and I agree to them.</label></div>' +
      '<div class="field-error" id="ag-agree-err" role="alert" hidden></div><div class="field-error" id="ag-err" role="alert" hidden></div>' +
      '<div><button class="btn" type="submit" id="ag-go">Sign the agreement</button></div>' +
      '<p class="caption">This link works only for this agreement' + (a.expiresAt ? " and expires " + ui.esc(ui.date(a.expiresAt)) : "") + ".</p></form></section></div>";
    var h = document.getElementById("ag-h"); h.setAttribute("tabindex", "-1");
    var name = document.getElementById("ag-name"); name.focus();
    document.getElementById("ag-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nameErr = document.getElementById("ag-name-err"); var agreeErr = document.getElementById("ag-agree-err"); var err = document.getElementById("ag-err");
      var box = document.getElementById("ag-agree");
      nameErr.hidden = agreeErr.hidden = err.hidden = true; name.removeAttribute("aria-invalid"); box.removeAttribute("aria-invalid");
      var typed = name.value.trim(); var ok = true;
      if (typed.length < 2 || typed.indexOf(" ") === -1) {
        nameErr.textContent = "Type your first and last name."; nameErr.hidden = false; name.setAttribute("aria-invalid", "true"); name.focus(); ok = false;
      }
      if (!box.checked) {
        agreeErr.textContent = "Check the box to agree to the terms."; agreeErr.hidden = false; box.setAttribute("aria-invalid", "true"); if (ok) box.focus(); ok = false;
      }
      if (!ok) return;
      var go = document.getElementById("ag-go"); ui.busy(go, true);
      YD.api.signAgreement({ id: link.id, exp: link.exp, sig: link.sig, signerName: typed }).then(function (res) {
        signedView({ kind: a.kind, partyName: a.partyName, signedAt: new Date().toISOString(), terms: a.terms }, typed);
        if (res && res.alreadySigned) ui.toast("This agreement was already signed.");
      }, function (e2) {
        ui.busy(go, false);
        if (e2 && e2.status === 404) { bad("This signing link did not work", "It may have expired, or it may not be a real link. Ask your Yesdoor contact for a new one."); return; }
        if (e2 && e2.status === 409) { err.textContent = "This agreement can no longer be signed. Ask your Yesdoor contact."; err.hidden = false; return; }
        err.textContent = ui.errMessage(e2); err.hidden = false;
      });
    });
  }

  if (!link.id || !link.exp || !link.sig) {
    bad("Open the link from your email", "This page opens from the signing link in your email. If you do not have it, ask your Yesdoor contact to send it again.");
    return;
  }

  el.innerHTML = '<div class="portal-main"><section class="card login-card stack" aria-busy="true"><h1>Opening your agreement</h1>' + ui.skeletonLines(3) + "</section></div>";
  YD.api.agreement(link).then(function (res) {
    var a = res && res.agreement;
    if (!a) { bad("This signing link did not work", "It may have expired, or it may not be a real link. Ask your Yesdoor contact for a new one."); return; }
    if (a.status === "signed") { signedView(a, null); return; }
    if (a.status === "void") { bad("This agreement was withdrawn", "Yesdoor has withdrawn this agreement, so it cannot be signed. Ask your Yesdoor contact if a new one is coming."); return; }
    formView(a);
  }, function (e) {
    if (e && e.status === 404) { bad("This signing link did not work", "It may have expired, or it may not be a real link. Ask your Yesdoor contact for a new one."); return; }
    el.innerHTML = '<div class="portal-main">' + ui.errorState(ui.errMessage(e)) + "</div>";
    var r = el.querySelector("[data-retry]"); if (r) r.addEventListener("click", function () { window.location.reload(); });
  });
})();
