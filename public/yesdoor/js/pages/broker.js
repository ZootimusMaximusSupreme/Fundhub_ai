/* Yesdoor broker portal: renters' stage only, and the broker's own money. Never credit details. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;

  var STATUS = { earned: "Earned", held: "Held", payable: "Payable", paid: "Paid" };

  function overview(el, ctx) {
    var m = ctx.data;
    el.innerHTML = '<div class="page-head"><div><h1>Your money</h1><p class="muted">You earn when a renter you sent signs a lease and moves in. Money is held until the building has paid and the renter has stayed ' + ui.esc(m.holdDays || 60) + " days.</p></div></div>" +
      '<div class="kpis">' + ui.kpi("Paid to you", ui.esc(ui.money(m.paidCents)), "Already sent") + ui.kpi("Payable now", ui.esc(ui.money(m.payableCents)), "Hold is over, payout is next") +
      ui.kpi("Held", ui.esc(ui.money(m.heldCents)), "The building paid, the hold is still running") + ui.kpi("Earned", ui.esc(ui.money(m.earnedCents)), "Waiting for the building to pay") + "</div>" +
      '<div id="money"></div>';
    ui.paged(document.getElementById("money"), { caption: "Your earnings, one row per renter", rows: m.rows || [],
      cols: [
        { label: "Renter", render: function (r) { return "<strong>" + ui.esc(r.renterName) + "</strong>"; } },
        { label: "Status", render: function (r) { return '<span class="tag">' + ui.esc(STATUS[r.status] || r.status) + "</span>"; } },
        { label: "Your share", n: true, render: function (r) { return ui.money(r.amountCents); } },
        { label: "Building paid Yesdoor", render: function (r) { return r.buildingPaidAt ? ui.esc(ui.date(r.buildingPaidAt)) : "Not yet"; } },
        { label: "Held until", render: function (r) { return r.holdUntil ? ui.esc(ui.date(r.holdUntil)) : "Not set yet"; } },
        { label: "Paid to you", render: function (r) { return r.paidAt ? ui.esc(ui.date(r.paidAt)) + (r.payoutRef ? '<div class="caption">' + ui.esc(r.payoutRef) + "</div>" : "") : "Not yet"; } }
      ],
      empty: ["No earnings yet", "When a renter you sent moves in, the row shows up here with each step of the money.", '<a class="btn-secondary" href="#link">Get your link</a>'] });
  }

  function renters(el) {
    el.innerHTML = '<div class="page-head"><div><h1>Your renters</h1><p class="muted">You see each renter&rsquo;s name and stage. Credit details are private to the renter.</p></div></div><div id="rt">' + ui.skeletonLines(4) + "</div>";
    return YD.api.brokerRenters().then(function (res) {
      ui.paged(document.getElementById("rt"), { caption: "Renters you sent", rows: res.renters || [],
        cols: [
          { label: "Renter", render: function (r) { return "<strong>" + ui.esc(r.name) + "</strong>"; } },
          { label: "Where they are", render: function (r) { return '<span class="tag">' + ui.esc(ui.stageLabel(r.stage)) + "</span>"; } },
          { label: "Sent on", render: function (r) { return ui.esc(ui.date(r.referredAt)); } }
        ],
        empty: ["No renters yet", "Share your link. Renters who start from it are tagged to you.", '<a class="btn-secondary" href="#link">Get your link</a>'] });
    });
  }

  function link(el) {
    el.innerHTML = '<div class="page-head"><div><h1>Your link</h1><p class="muted">Renters who start from this link are tagged to you the moment they arrive. First touch wins.</p></div></div><div id="lk">' + ui.skeletonLines(3) + "</div>";
    return YD.api.brokerLink().then(function (b) {
      document.getElementById("lk").innerHTML = '<div class="card stack" style="max-width:640px"><div class="field"><label for="lk-url">Your link</label><input class="input" id="lk-url" readonly value="' + ui.esc(b.url) + '"></div>' +
        '<div><button class="btn" type="button" id="copy">Copy my link</button></div><dl class="key-val"><dt>Your code</dt><dd class="num"><strong>' + ui.esc(b.trackingCode) + "</strong></dd><dt>Plan</dt><dd>" +
        ui.esc(b.plan === "split" ? "Placement split (" + b.splitPercent + "% of the fee)" : "Software only") + "</dd><dt>Status</dt><dd>" + ui.esc(b.status) + "</dd>" +
        (b.plan === "split" ? "<dt>Licence</dt><dd>" + (b.licenceVerified ? "Verified" + (b.licenceState ? " (" + ui.esc(b.licenceState) + ")" : "") : "Not verified yet") + "</dd>" : "") + "</dl></div>";
      document.getElementById("copy").addEventListener("click", function () {
        var input = document.getElementById("lk-url");
        function done() { ui.toast("Link copied."); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(b.url).then(done, function () { input.select(); ui.toast("Press Ctrl+C or Cmd+C to copy."); });
        else { input.select(); try { document.execCommand("copy"); done(); } catch (e) { ui.toast("Press Ctrl+C or Cmd+C to copy."); } }
      });
    });
  }

  YD.portal.start({
    kind: "broker", title: "Broker portal", intro: "For brokers and partners. We email you a sign-in link.",
    nav: [{ id: "money", label: "My money" }, { id: "renters", label: "My renters" }, { id: "link", label: "My link" }],
    probe: function () { return YD.api.brokerMoney(); },
    views: { money: overview, renters: renters, link: link },
    who: function () { return "Partner"; }
  });
})();
