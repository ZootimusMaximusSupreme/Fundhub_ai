/* Yesdoor home: hero search and a few starter listings. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ active: "home" });
  ui.captureSource();

  var featured = document.getElementById("featured");

  function load() {
    featured.innerHTML = ui.skeletonCards(6);
    YD.api.listings({ pageSize: 6 }).then(function (res) {
      var cities = document.getElementById("q-cities");
      cities.innerHTML = (res.cities || []).map(function (c) { return '<option value="' + ui.esc(c.name) + '"></option>'; }).join("");
      if (!res.listings.length) {
        featured.innerHTML = ui.emptyState("No apartments listed yet", "Buildings are still joining. Check back soon, or take the 60-second check and we will tell you when one fits.",
          '<a class="btn-secondary" href="prescreen.html">Start the 60-second check</a>');
        return;
      }
      featured.innerHTML = '<div class="grid cols-3">' + res.listings.map(ui.listingCard).join("") + "</div>";
    }, function (e) {
      featured.innerHTML = ui.errorState(ui.errMessage(e));
      var r = featured.querySelector("[data-retry]"); if (r) r.addEventListener("click", load);
    });
  }
  load();
})();
