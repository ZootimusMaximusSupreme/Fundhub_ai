/* Yesdoor renter portal: status, matches, tours. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;

  function meQuery() { return YD.api.me(); }

  function overview(el, ctx) {
    var d = ctx.data; var r = d.renter;
    var next = (d.tours || []).filter(function (t) { return (t.status === "booked" || t.status === "rescheduled") && new Date(t.startsAt) > new Date(); })[0];
    var money = r.incomeVerified && r.approvedMaxRentCents ? ui.money(r.approvedMaxRentCents) : "Link your bank";
    var html = '<div class="page-head"><div><h1>Hi, ' + ui.esc(r.firstName) + "</h1><p class=\"muted\">Here is where you stand.</p></div></div>" +
      '<div class="kpis">' + ui.kpi("Approved up to (rent a month)", r.incomeVerified && r.approvedMaxRentCents ? ui.esc(money) : '<span style="font-size:20px">' + ui.esc(money) + "</span>", r.incomeVerified ? "From your verified income, credit and background" : "Your top rent shows once income is verified") +
      ui.kpi("Your path", '<span style="font-size:20px">' + ui.esc(ui.laneName(r.lane)) + "</span>", "Decided by your 60-second check") +
      ui.kpi("Open applications", ui.esc(d.openApplications) + '<span class="caption"> of ' + ui.esc(d.maxOpenApplications || 3) + "</span>", "Cancel one to book another when you are at the limit") + "</div>";
    if (!r.incomeVerified) {
      html += '<div class="card stack" style="margin-bottom:24px"><h2>Link your bank to lock in your number</h2><p class="prose">Until your income is verified the best answer from any building is &ldquo;likely.&rdquo; We confirm income from repeat deposits and cannot move money.</p>' +
        '<div><button class="btn" type="button" id="link-bank">Link my bank</button></div><p class="caption">This preview uses a sandbox bank link.</p></div>';
    }
    html += '<div class="card stack" style="margin-bottom:24px"><h2>Your next step</h2>' +
      (next
        ? "<p><strong>Tour at " + ui.esc(next.buildingName) + "</strong><br>" + ui.esc(ui.dateTime(next.startsAt)) + " (Arizona time)<br><span class=\"muted\">" + ui.esc(next.address) + "</span></p>" +
          '<div><a class="btn-secondary" href="#tours">Change or cancel this tour</a></div>'
        : "<p>You do not have a tour booked. Pick one of your matches and we will register you with the building.</p>" +
          '<div><a class="' + (r.incomeVerified ? "btn" : "btn-secondary") + '" href="#matches">See my matches</a></div>') + "</div>";
    html += '<section aria-labelledby="apps-h"><h2 id="apps-h">Your applications</h2><div id="apps"></div></section>';
    el.innerHTML = html;
    ui.paged(document.getElementById("apps"), { caption: "Your applications", rows: d.applications || [],
      cols: [
        { label: "Building", render: function (a) { return "<strong>" + ui.esc(a.buildingName) + "</strong>"; } },
        { label: "Unit", render: function (a) { return ui.esc(a.unitLabel); } },
        { label: "Rent", n: true, render: function (a) { return ui.money(a.rentCents); } },
        { label: "Where it stands", render: function (a) { return '<span class="tag">' + ui.esc(ui.stageLabel(a.stage)) + "</span>"; } }
      ],
      empty: ["No applications yet", "When you book a tour, it shows up here with each step.", '<a class="btn-secondary" href="#matches">See my matches</a>'] });
    var lb = document.getElementById("link-bank");
    if (lb) lb.addEventListener("click", function () {
      ui.busy(lb, true);
      YD.api.meIncome({ publicToken: "sandbox-public-token" }).then(function () { ui.toast("Income verified. Your results are updated."); ctx.reload(); }, function (e) { ui.busy(lb, false); ui.toast(ui.errMessage(e)); });
    });
  }

  function matches(el, ctx) {
    var d = ctx.data; var ms = d.matches || [];
    var atLimit = d.openApplications >= (d.maxOpenApplications || 3);
    var good = ms.filter(function (m) { return m.result !== "no"; });
    var no = ms.filter(function (m) { return m.result === "no"; });
    var html = '<div class="page-head"><div><h1>My matches</h1><p class="muted">Buildings checked against your file. The date is when each building last confirmed its rules.</p></div></div>';
    if (atLimit) html += '<div class="notice warn" style="margin-bottom:24px">You have ' + ui.esc(d.openApplications) + " open applications, the most allowed. Cancel one on the Tours page to book another.</div>";
    if (!ms.length) {
      el.innerHTML = html + ui.emptyState("No matches yet", "Take the 60-second check and your matches appear here.", '<a class="btn" href="prescreen.html">See if you&rsquo;re approved</a>');
      return;
    }
    html += '<div class="card"><ul style="padding:0;margin:0">' + good.map(function (m) {
      return '<li class="result-row" style="list-style:none"><div><strong>' + ui.esc(m.buildingName) + '</strong><div class="muted">' + ui.esc(ui.bedsLabel(m.beds)) + " · " + ui.money(m.rentCents) + " · " + ui.esc(m.city) + "</div>" +
        '<div class="caption">Rules confirmed ' + ui.esc(ui.date(m.rulesConfirmedAt)) + "</div>" + (m.isSample ? ui.sampleTag("Sample listing") : "") + "</div><div>" + ui.statusChip(m.result) + "</div>" +
        "<div>" + (atLimit ? "" : '<a class="btn-secondary" href="book.html?building=' + encodeURIComponent(m.buildingId) + "&amp;listing=" + encodeURIComponent(m.listingId) + '">Book a tour</a>') + "</div></li>";
    }).join("") + "</ul></div>";
    if (!good.length) html += ui.emptyState("No building will approve you today", "We re-check for you on our own, and email you if one opens up.", "");
    if (no.length) html += '<details class="card" style="margin-top:24px"><summary><strong>Not this one (' + no.length + ")</strong></summary><ul style=\"padding:0;margin:16px 0 0\">" + no.map(function (m) {
      return '<li class="result-row" style="list-style:none"><div><strong>' + ui.esc(m.buildingName) + '</strong><div class="muted">' + ui.esc(ui.bedsLabel(m.beds)) + " · " + ui.money(m.rentCents) + "</div>" +
        '<details class="why"><summary>Why</summary><ul class="reasons">' + (m.reasons || []).filter(function (x) { return x.result === "fail"; }).map(function (x) { return "<li>" + ui.esc(x.reason) + "</li>"; }).join("") + "</ul></details></div><div>" + ui.statusChip("no") + "</div><div></div></li>";
    }).join("") + "</ul></details>";
    el.innerHTML = html;
  }

  function tours(el, ctx) {
    var d = ctx.data; var list = d.tours || [];
    el.innerHTML = '<div class="page-head"><div><h1>My tours</h1><p class="muted">Times are Arizona time.</p></div></div><div id="tours"></div>';
    var root = document.getElementById("tours");
    ui.paged(root, { caption: "Your tours", rows: list,
      cols: [
        { label: "Building", render: function (t) { return "<strong>" + ui.esc(t.buildingName) + "</strong><div class=\"caption\">" + ui.esc(t.address) + "</div>"; }, cls: "wrap-ok" },
        { label: "When", render: function (t) { return ui.esc(ui.dateTime(t.startsAt)); } },
        { label: "Status", render: function (t) { return '<span class="tag">' + ui.esc({ booked: "Booked", rescheduled: "Rescheduled", cancelled: "Cancelled", noshow: "No-show", completed: "Done" }[t.status] || t.status) + "</span>"; } },
        { label: "", cls: "actions", render: function (t) {
          return (t.status === "booked" || t.status === "rescheduled") && new Date(t.startsAt) > new Date()
            ? '<button class="btn-secondary sm" type="button" data-resched="' + ui.esc(t.id) + '">Reschedule</button> <button class="btn-secondary sm btn-danger" type="button" data-cancel="' + ui.esc(t.id) + '" style="margin-left:16px">Cancel tour</button>' : "";
        } }
      ],
      empty: ["No tours yet", "Book a tour from your matches and it shows up here.", '<a class="btn-secondary" href="#matches">See my matches</a>'] });

    ui.on(root, "click", "[data-resched]", function (e, b) {
      var t = list.filter(function (x) { return x.id === b.getAttribute("data-resched"); })[0];
      var days = ui.tourSlots(t.tourHours, 7);
      if (!days.length) { ui.toast("This building has no open tour times right now."); return; }
      ui.openDialog("Move your tour", '<form id="rs" class="stack"><p>' + ui.esc(t.buildingName) + ". Now: " + ui.esc(ui.dateTime(t.startsAt)) + '</p><div class="field"><label for="rs-day">Day</label><select class="input" id="rs-day">' +
        days.map(function (x, i) { return '<option value="' + i + '">' + ui.esc(x.label) + "</option>"; }).join("") + '</select></div><div class="field"><label for="rs-time">Time (Arizona)</label><select class="input" id="rs-time"></select></div>' +
        '<div class="actions"><button class="btn-secondary" type="button" data-close>Keep my time</button><button class="btn" type="submit" id="rs-go">Move my tour</button></div></form>', function (dlg, close) {
        var dayEl = dlg.querySelector("#rs-day"); var timeEl = dlg.querySelector("#rs-time");
        function fill() { timeEl.innerHTML = days[Number(dayEl.value)].slots.map(function (s) { return '<option value="' + s.iso + '">' + ui.esc(s.label) + "</option>"; }).join(""); }
        fill(); dayEl.addEventListener("change", fill);
        dlg.querySelector("#rs").addEventListener("submit", function (ev) {
          ev.preventDefault(); var go = dlg.querySelector("#rs-go"); ui.busy(go, true);
          YD.api.meTour({ tourId: t.id, action: "reschedule", startsAt: timeEl.value }).then(function () { close(); ui.toast("Your tour was moved."); ctx.reload(); }, function (er) { ui.busy(go, false); ui.toast(ui.errMessage(er)); });
        });
      });
    });
    ui.on(root, "click", "[data-cancel]", function (e, b) {
      var t = list.filter(function (x) { return x.id === b.getAttribute("data-cancel"); })[0];
      ui.openDialog("Cancel this tour?", "<p>Cancel your tour at " + ui.esc(t.buildingName) + " on " + ui.esc(ui.dateTime(t.startsAt)) + "? We will tell the building and free up one of your 3 open applications.</p>" +
        '<div class="actions"><button class="btn-secondary" type="button" data-close>Keep my tour</button><button class="btn-secondary btn-danger" type="button" id="cx-go">Cancel tour</button></div>', function (dlg, close) {
        dlg.querySelector("#cx-go").addEventListener("click", function () {
          var go = this; ui.busy(go, true);
          YD.api.meTour({ tourId: t.id, action: "cancel" }).then(function () { close(); ui.toast("Your tour was cancelled."); ctx.reload(); }, function (er) { ui.busy(go, false); ui.toast(ui.errMessage(er)); });
        });
      });
    });
  }

  YD.portal.start({
    kind: "renter", title: "My Yesdoor", intro: "We email you a sign-in link. No password to remember.",
    nav: [{ id: "overview", label: "Overview" }, { id: "matches", label: "My matches" }, { id: "tours", label: "My tours" }],
    probe: meQuery, views: { overview: overview, matches: matches, tours: tours },
    who: function (d) { return d.renter.firstName + " " + d.renter.lastName; }
  });
})();
