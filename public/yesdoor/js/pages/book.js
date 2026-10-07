/* Yesdoor book a tour: choose a time from the building's tour hours, then a confirmation. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ active: "prescreen" });
  ui.captureSource();

  var P = ui.params();
  var el = document.getElementById("book");
  var renter = YD.api.renter();
  var pick = { day: null, iso: null };

  function needRenter() {
    el.innerHTML = ui.emptyState("Check your approval first", "We book tours only after the 60-second check, so you only tour buildings that will approve you.",
      '<a class="btn" href="prescreen.html' + (P.listing ? "?listing=" + encodeURIComponent(P.listing) : "") + '">See if you&rsquo;re approved</a>');
  }

  function confirmation(res) {
    el.innerHTML = '<div class="card stack" style="max-width:640px"><div><span class="eyebrow">Tour booked</span><h1 id="conf-h">You are booked at ' + ui.esc(res.buildingName) + "</h1>" +
      '<p class="big-number" style="font-size:20px">' + ui.esc(ui.dateTime(res.startsAt)) + ' <span class="caption">Arizona time</span></p><p class="muted">' + ui.esc(res.address) + "</p></div>" +
      '<div class="group"><h2>What happens next</h2><ol><li>We registered you with the building, with Yesdoor as your source. That is your proof the tour is yours.</li>' +
      "<li>The building confirms your tour. You do not need to do anything.</li><li>After the tour, the building tells us if you applied. We keep you posted in My Yesdoor.</li></ol></div>" +
      '<p class="caption">You have ' + ui.plural(res.openApplications || 1, "open application", "open applications") + " of 3 allowed. If this building says no after we said approved, we find you another one right away.</p>" +
      '<div class="row"><a class="btn" href="renter.html">Go to My Yesdoor</a><a class="btn-secondary" href="search.html">Keep looking</a></div></div>';
    var h = document.getElementById("conf-h"); h.setAttribute("tabindex", "-1"); h.focus();
  }

  function picker(l) {
    var days = ui.tourSlots(l.tourHours, 7);
    if (!days.length) {
      el.innerHTML = ui.emptyState("No tour times yet", "This building has not set its tour hours. Check back soon, or pick another building.", '<a class="btn-secondary" href="search.html">Find apartments</a>');
      return;
    }
    pick.day = days[0].date;
    el.innerHTML = '<div class="split"><div class="card stack"><div><h1>Book a tour</h1><p class="muted">' + ui.esc(ui.bedsLabel(l.beds)) + " at " + ui.esc(l.buildingName) + " · " + ui.money(l.rentCents) + " a month</p>" +
      (l.isSample ? ui.sampleTag("Sample listing") : "") + "</div>" +
      '<fieldset style="border:0;padding:0;margin:0"><legend class="label" style="font-weight:700;margin-bottom:8px">1. Pick a day</legend><div class="slot-grid" id="days"></div></fieldset>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend class="label" style="font-weight:700;margin-bottom:8px">2. Pick a time (Arizona time)</legend><div class="slot-grid" id="times"></div></fieldset>' +
      '<div id="book-err" class="notice warn" role="alert" hidden></div>' +
      '<div><button class="btn" type="button" id="confirm" disabled>Confirm my tour</button></div></div>' +
      '<aside class="card stack"><h2>Before you go</h2><p>Tour hours: ' + ui.esc(ui.hoursText(l.tourHours)) + '.</p><p class="caption">' + ui.esc(l.address) + ", " + ui.esc(l.city) + ", " + ui.esc(l.state) +
      "</p><p class=\"caption\">Booking is free. We register you with the building before the tour.</p></aside></div>";
    var daysEl = document.getElementById("days"); var timesEl = document.getElementById("times"); var btn = document.getElementById("confirm");
    function paintDays() {
      daysEl.innerHTML = days.map(function (d) { return '<button type="button" class="slot" data-day="' + d.date + '" aria-pressed="' + (d.date === pick.day) + '">' + ui.esc(d.label) + "</button>"; }).join("");
    }
    function paintTimes() {
      var d = days.filter(function (x) { return x.date === pick.day; })[0];
      timesEl.innerHTML = d.slots.map(function (s) { return '<button type="button" class="slot" data-iso="' + s.iso + '" aria-pressed="' + (s.iso === pick.iso) + '">' + ui.esc(s.label) + "</button>"; }).join("");
    }
    paintDays(); paintTimes();
    ui.on(daysEl, "click", "[data-day]", function (e, b) { pick.day = b.getAttribute("data-day"); pick.iso = null; btn.disabled = true; paintDays(); paintTimes(); });
    ui.on(timesEl, "click", "[data-iso]", function (e, b) { pick.iso = b.getAttribute("data-iso"); btn.disabled = false; paintTimes(); ui.announce("Selected " + b.textContent); });
    btn.addEventListener("click", function () {
      var err = document.getElementById("book-err"); err.hidden = true;
      ui.busy(btn, true);
      YD.api.book({ renterToken: renter.token, buildingId: l.buildingId, listingId: l.id, startsAt: pick.iso }).then(function (res) { confirmation(res); }, function (e) {
        ui.busy(btn, false); err.textContent = ui.errMessage(e); err.hidden = false;
      });
    });
  }

  function load() {
    if (!renter || !renter.token) { needRenter(); return; }
    if (!P.listing) { el.innerHTML = ui.emptyState("Pick an apartment first", "Open an apartment and choose See if you are approved.", '<a class="btn-secondary" href="search.html">Find apartments</a>'); return; }
    el.innerHTML = ui.skeletonLines(6);
    YD.api.listing(P.listing).then(function (r) { picker(r.listing); }, function (e) {
      el.innerHTML = e && e.status === 404 ? ui.emptyState("That apartment is no longer listed", "It may have been rented.", '<a class="btn-secondary" href="search.html">Find apartments</a>') : ui.errorState(ui.errMessage(e));
      var rt = el.querySelector("[data-retry]"); if (rt) rt.addEventListener("click", load);
    });
  }
  load();
})();
