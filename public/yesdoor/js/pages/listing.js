/* Yesdoor listing detail. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ active: "search" });
  ui.captureSource();

  var detail = document.getElementById("detail");
  var id = ui.params().id;

  function view(l) {
    var rules = ui.rulesInWords(l.rules);
    var feeLine = l.appFeeWaived
      ? "This building waives its application fee for renters Yesdoor screens."
      : (l.appFeeCents ? "Application fee: " + ui.money(l.appFeeCents) + ". If Yesdoor says you are approved and the building says no, we refund it." : "Ask the building about its application fee.");
    var hours = ui.hoursText(l.tourHours);
    document.title = ui.bedsLabel(l.beds) + " at " + l.buildingName + " | Yesdoor";
    detail.innerHTML = '<div class="split"><div class="stack">' +
      '<div class="card flush"><div class="ph tall ' + ui.photoClass(l.id) + '" role="img" aria-label="Photo placeholder for ' + ui.esc(l.buildingName) + '">' +
      (l.isSample ? ui.sampleTag("Sample listing") : "") + '</div></div>' +
      '<div><h1>' + ui.esc(ui.bedsLabel(l.beds)) + " at " + ui.esc(l.buildingName) + '</h1><p class="muted">' + ui.esc(l.address) + ", " + ui.esc(l.city) + ", " + ui.esc(l.state) + " " + ui.esc(l.zip || "") +
      (l.unitLabel ? " · Unit " + ui.esc(l.unitLabel) : "") + "</p></div>" +
      '<dl class="key-val card"><dt>Rent</dt><dd class="num"><strong>' + ui.money(l.rentCents) + " a month</strong></dd><dt>Bedrooms</dt><dd>" + ui.esc(ui.bedsLabel(l.beds)) + "</dd><dt>Bathrooms</dt><dd>" + ui.esc(l.baths) + "</dd>" +
      (l.sqft ? "<dt>Size</dt><dd class=\"num\">" + Number(l.sqft).toLocaleString("en-US") + " sq ft</dd>" : "") +
      (l.availableOn ? "<dt>Available</dt><dd>" + ui.esc(ui.date(l.availableOn)) + "</dd>" : "") +
      "<dt>Application fee</dt><dd>" + ui.esc(feeLine) + "</dd></dl>" +
      (l.specials && l.specials.length ? '<section class="card" aria-labelledby="sp-h"><h2 id="sp-h">Specials</h2>' + l.specials.map(function (s) { return '<p class="special">' + ui.esc(s) + "</p>"; }).join("") + "</section>" : "") +
      '<section class="card" aria-labelledby="rules-h"><h2 id="rules-h">What this building looks for</h2>' +
      (rules.length
        ? '<ul>' + rules.map(function (r) { return "<li>" + ui.esc(r) + "</li>"; }).join("") + "</ul>" +
          '<p class="caption">' + (l.rules && l.rules.confirmedAt ? "The building confirmed these rules on " + ui.esc(ui.date(l.rules.confirmedAt)) + "." : "") +
          (l.rulesStale ? " That was a while ago, so the best answer you can get today is &ldquo;likely.&rdquo;" : "") + "</p>"
        : "<p>This building has not shared its rules yet. The 60-second check tells you where you stand.</p>") +
      (l.buildingSecondChance ? '<p><span class="tag lane">Second Chance friendly</span> This building looks at more than a score.</p>' : "") +
      "</section></div>" +
      '<aside class="stack"><div class="card stack sticky"><div class="price">' + ui.money(l.rentCents) + '<span class="caption"> /mo</span></div>' +
      "<p>Find out if you are approved before you pay a fee or take a tour. It takes about 60 seconds and does not lower your credit score.</p>" +
      '<a class="btn" id="cta" href="prescreen.html?listing=' + encodeURIComponent(l.id) + '">See if you&rsquo;re approved</a>' +
      (hours ? '<p class="caption">Tour hours: ' + ui.esc(hours) + " (Arizona time)</p>" : "") +
      '<p class="caption">Free for renters. The building pays Yesdoor when a lease is signed.</p></div></aside></div>';
  }

  function load() {
    if (!id) { detail.innerHTML = ui.emptyState("Pick an apartment first", "Open an apartment from the search page.", '<a class="btn-secondary" href="search.html">Find apartments</a>'); return; }
    detail.innerHTML = ui.skeletonLines(6);
    YD.api.listing(id).then(function (res) { view(res.listing); }, function (e) {
      if (e && e.status === 404) {
        detail.innerHTML = ui.emptyState("That apartment is no longer listed", "It may have been rented. Here are others that are open now.", '<a class="btn-secondary" href="search.html">Find apartments</a>');
        return;
      }
      detail.innerHTML = ui.errorState(ui.errMessage(e));
      var r = detail.querySelector("[data-retry]"); if (r) r.addEventListener("click", load);
    });
  }
  load();
})();
