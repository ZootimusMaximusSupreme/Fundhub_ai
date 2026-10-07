/* Yesdoor search: filters and a grid of listing cards. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ active: "search" });
  ui.captureSource();

  var PER = 12;
  var p = ui.params();
  var state = { city: p.city || "", beds: p.beds || "", maxRent: p.maxRent || "", page: Number(p.page) || 1 };
  var form = document.getElementById("filters");
  var results = document.getElementById("results");
  var count = document.getElementById("count");
  var pager = document.getElementById("pager");

  form.city.value = state.city; form.beds.value = state.beds; form.maxRent.value = state.maxRent;

  function approvalHref() {
    var q = [];
    if (state.city) q.push("city=" + encodeURIComponent(state.city));
    if (state.beds !== "") q.push("beds=" + encodeURIComponent(state.beds));
    if (state.maxRent) q.push("maxRent=" + encodeURIComponent(state.maxRent));
    return "prescreen.html" + (q.length ? "?" + q.join("&") : "");
  }

  function load() {
    document.getElementById("approval-link").setAttribute("href", approvalHref());
    results.innerHTML = ui.skeletonCards(6);
    count.textContent = "Loading apartments";
    pager.innerHTML = "";
    YD.api.listings({ city: state.city, beds: state.beds, maxRent: state.maxRent, page: state.page, pageSize: PER }).then(function (res) {
      var cities = document.getElementById("f-cities");
      cities.innerHTML = (res.cities || []).map(function (c) { return '<option value="' + ui.esc(c.name) + '"></option>'; }).join("");
      count.textContent = res.total === 1 ? "1 apartment" : res.total + " apartments";
      if (!res.listings.length) {
        results.innerHTML = ui.emptyState("No apartments match those filters", "Try a bigger city, more bedrooms, or a higher rent.",
          '<button class="btn-secondary" type="button" id="clear">Clear the filters</button>');
        document.getElementById("clear").addEventListener("click", function () { state = { city: "", beds: "", maxRent: "", page: 1 }; form.reset(); load(); });
        return;
      }
      results.innerHTML = '<div class="grid cols-3">' + res.listings.map(ui.listingCard).join("") + "</div>";
      pager.innerHTML = ui.pager(res.total, res.page || state.page, res.pageSize || PER);
    }, function (e) {
      count.textContent = "";
      results.innerHTML = ui.errorState(ui.errMessage(e));
      var r = results.querySelector("[data-retry]"); if (r) r.addEventListener("click", load);
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    state = { city: form.city.value.trim(), beds: form.beds.value, maxRent: form.maxRent.value, page: 1 };
    try {
      var q = []; if (state.city) q.push("city=" + encodeURIComponent(state.city)); if (state.beds !== "") q.push("beds=" + state.beds); if (state.maxRent) q.push("maxRent=" + state.maxRent);
      window.history.replaceState(null, "", "search.html" + (q.length ? "?" + q.join("&") : ""));
    } catch (err) { /* ignore */ }
    load();
  });
  ui.on(pager, "click", "[data-page]", function (e, el) {
    state.page = Number(el.getAttribute("data-page")); load(); window.scrollTo(0, 0);
  });
  load();
})();
