/* Yesdoor building portal: renters (safe fields only), stage updates, rules, listings, invoices.
   A building never sees a credit score, an eviction count, background flags or a report.
   It sees: our answer (approved / likely / no), income verified, risk tier and max rent. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;

  var OPEN = ["registered", "toured", "applied", "approved", "lease_signed"];
  var NEXT = { registered: ["toured", "no_show"], toured: ["applied"], applied: ["approved", "denied"], approved: ["lease_signed"], lease_signed: ["moved_in"] };
  var NEXT_LABEL = { toured: "Toured", no_show: "No-show", applied: "Applied", approved: "Approved by us", denied: "Denied", lease_signed: "Lease signed", moved_in: "Moved in" };
  var LEASED = ["lease_signed", "moved_in", "invoiced", "paid", "safe"];

  function buildingSelect(ctx, id, allLabel) {
    var b = ctx.data.buildings || [];
    if (b.length < 2) return "";
    return '<div class="field" style="min-width:220px"><label for="' + id + '">Building</label><select class="input" id="' + id + '">' + (allLabel ? '<option value="">' + allLabel + "</option>" : "") +
      b.map(function (x) { return '<option value="' + ui.esc(x.id) + '">' + ui.esc(x.name) + "</option>"; }).join("") + "</select></div>";
  }

  /* ------------------------------------------------------------ renters */
  function renters(el, ctx) {
    var rows = ctx.data.renters || [];
    var buildings = ctx.data.buildings || [];
    var fb = ""; var fs = "";
    function filtered() {
      return rows.filter(function (r) { return (!fb || r.buildingId === fb) && (!fs || (fs === "open" ? OPEN.indexOf(r.stage) !== -1 : r.stage === fs)); });
    }
    var toUpdate = rows.filter(function (r) { return OPEN.indexOf(r.stage) !== -1 && NEXT[r.stage]; }).length;
    var approved = rows.filter(function (r) { return r.result === "approved" && OPEN.indexOf(r.stage) !== -1; }).length;
    var leased = rows.filter(function (r) { return LEASED.indexOf(r.stage) !== -1; }).length;
    var stages = []; rows.forEach(function (r) { if (stages.indexOf(r.stage) === -1) stages.push(r.stage); });

    el.innerHTML = '<div class="page-head"><div><h1>Renters sent to you</h1><p class="muted">Every renter here was checked by Yesdoor. You see our answer, not a credit report.</p></div></div>' +
      '<div class="kpis">' + ui.kpi("Renters to update", ui.esc(toUpdate), "Move each one to its next step") + ui.kpi("Open and approved", ui.esc(approved), "Our answer is approved") +
      ui.kpi("Leases", ui.esc(leased), "Signed or moved in") + ui.kpi("Renters in all", ui.esc(rows.length), buildings.length > 1 ? "Across " + buildings.length + " buildings" : "At " + (buildings[0] ? buildings[0].name : "your building")) + "</div>" +
      '<div class="row" style="margin-bottom:16px;align-items:flex-end">' + buildingSelect(ctx, "fb", "All my buildings") +
      '<div class="field" style="min-width:220px"><label for="fs">Stage</label><select class="input" id="fs"><option value="">All stages</option><option value="open">Open (needs a step)</option>' +
      stages.map(function (s) { return '<option value="' + s + '">' + ui.esc(ui.stageLabel(s)) + "</option>"; }).join("") + '</select></div></div>' +
      '<div id="tbl"></div><p class="caption" style="margin-top:16px">Risk tier runs from A (lowest risk) to D (highest). Max rent is the most this renter can carry. Both come from Yesdoor&rsquo;s checks. We never share the report itself.</p>';

    var t = ui.paged(document.getElementById("tbl"), { caption: "Renters sent to your buildings", rows: filtered(),
      cols: [
        { label: "Renter", cls: "wrap-ok", render: function (r) { return "<strong>" + ui.esc(r.renterName) + '</strong><div class="caption">' + ui.esc(r.email) + "</div>"; } },
        { label: "Unit", render: function (r) { return ui.esc(r.listingLabel); } },
        { label: "Our answer", render: function (r) { return ui.statusChip(r.result, "No"); } },
        { label: "Income", render: function (r) { return r.incomeVerified ? '<span class="tag">✓ Verified</span>' : '<span class="tag">Not verified</span>'; } },
        { label: "Risk tier", render: function (r) { return '<span class="tag">Tier ' + ui.esc(r.riskTier) + "</span>"; } },
        { label: "Max rent", n: true, render: function (r) { return r.maxRentCents === null || r.maxRentCents === undefined ? "Not known yet" : ui.money(r.maxRentCents); } },
        { label: "Stage", render: function (r) { return '<span class="tag">' + ui.esc(ui.stageLabel(r.stage)) + "</span>" + (r.stage === "denied" && r.denialReason ? '<div class="caption cell-trunc" title="' + ui.esc(r.denialReason) + '">' + ui.esc(r.denialReason) + "</div>" : ""); } },
        { label: "Tour", render: function (r) { return r.tourAt ? ui.esc(ui.dateTime(r.tourAt)) : "None"; } },
        { label: "Lease", render: function (r) { return r.leaseStart ? ui.esc(ui.date(r.leaseStart)) + " to " + ui.esc(ui.date(r.leaseEnd)) : "None"; } },
        { label: "", cls: "actions", render: function (r) { return NEXT[r.stage] ? '<button class="btn-secondary sm" type="button" data-update="' + ui.esc(r.applicationId) + '">Update</button>' : ""; } }
      ],
      empty: ["No renters yet", "When a renter books a tour at your building, they appear here. Add your listings so renters can find you.", '<a class="btn-secondary" href="#listings">Add a listing</a>'] });

    var fbEl = document.getElementById("fb"); if (fbEl) fbEl.addEventListener("change", function () { fb = fbEl.value; t.setRows(filtered()); });
    document.getElementById("fs").addEventListener("change", function () { fs = this.value; t.setRows(filtered()); });

    ui.on(document.getElementById("tbl"), "click", "[data-update]", function (e, b) {
      var r = rows.filter(function (x) { return x.applicationId === b.getAttribute("data-update"); })[0];
      openUpdate(r, ctx);
    });
  }

  function openUpdate(r, ctx) {
    var opts = NEXT[r.stage] || [];
    ui.openDialog("Update " + r.renterName, '<form id="up" class="stack" novalidate><p class="muted">' + ui.esc(r.listingLabel) + ". Now: <strong>" + ui.esc(ui.stageLabel(r.stage)) + "</strong></p>" +
      '<div class="field"><label for="up-stage">New stage</label><select class="input" id="up-stage">' + opts.map(function (s) { return '<option value="' + s + '">' + ui.esc(NEXT_LABEL[s]) + "</option>"; }).join("") + "</select></div>" +
      '<div id="up-extra"></div><div class="field-error" id="up-err" role="alert" hidden></div>' +
      '<div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="up-go">Save update</button></div></form>', function (dlg, close) {
      var stageEl = dlg.querySelector("#up-stage"); var extra = dlg.querySelector("#up-extra"); var err = dlg.querySelector("#up-err");
      function paint() {
        var s = stageEl.value;
        if (s === "denied") extra.innerHTML = '<div class="field"><label for="up-reason">Why was this renter denied?</label><textarea class="input" id="up-reason" required></textarea><span class="hint">We use the reason to keep your rules right. The renter is offered other buildings right away.</span></div>';
        else if (s === "lease_signed") extra.innerHTML = '<div class="form-grid two"><div class="field"><label for="up-start">Lease start</label><input class="input" type="date" id="up-start" required></div><div class="field"><label for="up-end">Lease end</label><input class="input" type="date" id="up-end" required></div></div>' +
          '<div class="field"><label for="up-rent">Monthly rent ($)</label><input class="input num" type="number" id="up-rent" min="1" step="1" required></div>';
        else if (s === "moved_in") extra.innerHTML = '<div class="notice">Confirming a move-in sends your invoice for the placement fee. Only confirm after the renter has moved in.</div>';
        else extra.innerHTML = "";
      }
      stageEl.addEventListener("change", paint); paint();
      dlg.querySelector("#up").addEventListener("submit", function (ev) {
        ev.preventDefault(); err.hidden = true;
        var body = { applicationId: r.applicationId, stage: stageEl.value };
        if (body.stage === "denied") {
          body.reason = dlg.querySelector("#up-reason").value.trim();
          if (!body.reason) { err.textContent = "Say why the renter was denied."; err.hidden = false; return; }
        }
        if (body.stage === "lease_signed") {
          var s = dlg.querySelector("#up-start").value; var en = dlg.querySelector("#up-end").value; var rent = Number(dlg.querySelector("#up-rent").value);
          if (!s || !en || !(rent > 0)) { err.textContent = "Add the lease start, the lease end and the monthly rent."; err.hidden = false; return; }
          if (en <= s) { err.textContent = "The lease end must be after the start."; err.hidden = false; return; }
          body.lease = { start: s, end: en, rentCents: Math.round(rent * 100) };
        }
        var go = dlg.querySelector("#up-go"); ui.busy(go, true);
        YD.api.buildingUpdate(body).then(function (res) {
          close();
          ui.toast(body.stage === "denied" ? "Marked denied. The renter was offered " + ui.plural(res.backupsOffered || 0, "other building", "other buildings") + "."
            : body.stage === "moved_in" ? "Move-in confirmed. Your invoice is on the way." : "Renter updated.");
          ctx.reload();
        }, function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
      });
    });
  }

  /* ------------------------------------------------------------ rules */
  var CATS = [["felony_violent", "Violent felony"], ["felony_property", "Property felony"], ["misdemeanor_nonviolent", "Non-violent misdemeanor"]];

  function rules(el, ctx) {
    var buildings = ctx.data.buildings || [];
    var current = buildings[0] ? buildings[0].id : null;
    el.innerHTML = '<div class="page-head"><div><h1>Your rules</h1><p class="muted">Tell us who you accept. Saving makes a new dated version. Renters see these rules in plain words, never as numbers about a person.</p></div></div>' +
      '<div class="row" style="margin-bottom:16px">' + buildingSelect(ctx, "rb") + '</div><div id="rules-body">' + ui.skeletonLines(5) + "</div>";
    var rb = document.getElementById("rb");
    function load() {
      var body = document.getElementById("rules-body"); body.innerHTML = ui.skeletonLines(5);
      YD.api.buildingRules(current).then(function (res) { paint(res); }, function (e) {
        body.innerHTML = ui.errorState(ui.errMessage(e)); var rt = body.querySelector("[data-retry]"); if (rt) rt.addEventListener("click", load);
      });
    }
    function modeOf(v) { return v === "never" ? "never" : v === "case_by_case" ? "case" : "years"; }
    function paint(res) {
      var r = res.rules || {}; var pol = r.criminalPolicy || {};
      var body = document.getElementById("rules-body");
      body.innerHTML = '<div class="split"><form id="rf" class="card stack" novalidate>' +
        '<div class="form-grid two"><div class="field"><label for="r-score">Minimum credit score</label><input class="input num" id="r-score" type="number" min="300" max="850" value="' + ui.esc(r.minScore === undefined ? "" : r.minScore) + '" required></div>' +
        '<div class="field"><label for="r-mult">Income needed (times the rent)</label><input class="input num" id="r-mult" type="number" min="1" max="6" step="0.5" value="' + ui.esc(r.incomeMultiple === undefined ? "" : r.incomeMultiple) + '" required></div>' +
        '<div class="field"><label for="r-ev">Evictions allowed</label><input class="input num" id="r-ev" type="number" min="0" max="5" value="' + ui.esc(r.maxEvictions === undefined ? 0 : r.maxEvictions) + '" required></div>' +
        '<div class="field"><label for="r-look">Look back how many years</label><input class="input num" id="r-look" type="number" min="0" max="15" value="' + ui.esc(r.evictionLookbackYears === undefined ? 5 : r.evictionLookbackYears) + '" required></div></div>' +
        "<h2>Criminal records</h2>" + CATS.map(function (c) {
          var v = pol[c[0]]; var m = v === undefined ? "never" : modeOf(v);
          return '<div class="form-grid two" data-cat="' + c[0] + '"><div class="field"><label for="c-' + c[0] + '">' + c[1] + '</label><select class="input" id="c-' + c[0] + '"><option value="never"' + (m === "never" ? " selected" : "") + '>Never accept</option><option value="case"' + (m === "case" ? " selected" : "") + '>Review one by one</option><option value="years"' + (m === "years" ? " selected" : "") + '>Accept if older than a number of years</option></select></div>' +
            '<div class="field"><label for="y-' + c[0] + '">Years</label><input class="input num" id="y-' + c[0] + '" type="number" min="1" max="30" value="' + ui.esc(typeof v === "number" ? v : 7) + '"></div></div>';
        }).join("") +
        '<div class="check"><input type="checkbox" id="r-sc"' + (r.acceptsSecondChance ? " checked" : "") + '><label for="r-sc">We welcome Second Chance renters</label></div>' +
        '<div class="field-error" id="r-err" role="alert" hidden></div><div><button class="btn" type="submit" id="r-go">Save rules</button></div></form>' +
        '<aside class="card stack"><h2>Version history</h2><p class="caption">Current: version ' + ui.esc(r.version || "none") + (r.confirmedAt ? ", confirmed " + ui.esc(ui.date(r.confirmedAt)) : "") + ".</p>" +
        '<p class="caption">Rules older than 30 days are marked stale, and we can only answer &ldquo;likely&rdquo; for your building until you confirm them again.</p>' +
        '<ul class="stack" style="padding-left:16px">' + (res.history || []).map(function (h) { return "<li>Version " + ui.esc(h.version) + " · " + ui.esc(ui.date(h.confirmedAt)) + " · score " + ui.esc(h.minScore) + "+</li>"; }).join("") + "</ul></aside></div>";
      var f = document.getElementById("rf");
      function sync() { CATS.forEach(function (c) { document.getElementById("y-" + c[0]).disabled = document.getElementById("c-" + c[0]).value !== "years"; }); }
      CATS.forEach(function (c) { document.getElementById("c-" + c[0]).addEventListener("change", sync); }); sync();
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = document.getElementById("r-err"); err.hidden = true;
        var policy = {};
        CATS.forEach(function (c) {
          var m = document.getElementById("c-" + c[0]).value;
          policy[c[0]] = m === "never" ? "never" : m === "case" ? "case_by_case" : Number(document.getElementById("y-" + c[0]).value) || 7;
        });
        var payload = { buildingId: current, rules: { minScore: Number(document.getElementById("r-score").value), incomeMultiple: Number(document.getElementById("r-mult").value),
          maxEvictions: Number(document.getElementById("r-ev").value), evictionLookbackYears: Number(document.getElementById("r-look").value), criminalPolicy: policy, acceptsSecondChance: document.getElementById("r-sc").checked } };
        if (!(payload.rules.minScore >= 300 && payload.rules.minScore <= 850)) { err.textContent = "Minimum credit score must be between 300 and 850."; err.hidden = false; return; }
        if (!(payload.rules.incomeMultiple >= 1 && payload.rules.incomeMultiple <= 6)) { err.textContent = "Income multiple must be between 1 and 6."; err.hidden = false; return; }
        var go = document.getElementById("r-go"); ui.busy(go, true);
        YD.api.buildingSaveRules(payload).then(function (res2) { ui.toast("Rules saved as version " + res2.rules.version + "."); paint(res2); }, function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
      });
    }
    if (rb) rb.addEventListener("change", function () { current = rb.value; load(); });
    load();
  }

  /* ------------------------------------------------------------ listings */
  function listings(el, ctx) {
    var buildings = ctx.data.buildings || [];
    var current = buildings[0] ? buildings[0].id : null;
    el.innerHTML = '<div class="page-head"><div><h1>Your listings</h1><p class="muted">Renters only see units you list here.</p></div></div>' +
      '<div class="row" style="margin-bottom:16px">' + buildingSelect(ctx, "lb") + '</div><div id="ltbl"></div>' +
      '<div class="split" style="margin-top:24px"><form id="lf" class="card stack" novalidate><h2>Add a listing</h2><div class="form-grid two">' +
      '<div class="field"><label for="l-unit">Unit</label><input class="input" id="l-unit" required></div><div class="field"><label for="l-rent">Monthly rent ($)</label><input class="input num" id="l-rent" type="number" min="1" required></div>' +
      '<div class="field"><label for="l-beds">Bedrooms (0 is a studio)</label><input class="input num" id="l-beds" type="number" min="0" max="6" value="1" required></div><div class="field"><label for="l-baths">Bathrooms</label><input class="input num" id="l-baths" type="number" min="1" max="6" step="0.5" value="1"></div>' +
      '<div class="field"><label for="l-sqft">Square feet</label><input class="input num" id="l-sqft" type="number" min="100"></div><div class="field"><label for="l-date">Available on</label><input class="input" id="l-date" type="date"></div></div>' +
      '<div class="field"><label for="l-sp">Special (optional)</label><input class="input" id="l-sp" placeholder="One month free on a 13-month lease"></div>' +
      '<div class="field-error" id="l-err" role="alert" hidden></div><div><button class="btn" type="submit" id="l-go">Add listing</button></div></form>' +
      '<div class="card stack"><h2>Import a spreadsheet</h2><p class="caption">A CSV file with these columns in the first row: unit, beds, baths, sqft, rent, available. Rows with a problem are listed so you can fix them.</p>' +
      '<div class="field"><label for="imp-file">CSV file</label><input class="input" id="imp-file" type="file" accept=".csv,text/csv" style="padding-top:8px"></div>' +
      '<div><button class="btn-secondary" type="button" id="imp-go">Import listings</button></div><div id="imp-out" role="status"></div></div></div>';
    var lb = document.getElementById("lb");

    function loadTable() {
      var root = document.getElementById("ltbl"); root.innerHTML = ui.skeletonLines(4);
      YD.api.listings({ buildingId: current, pageSize: 100 }).then(function (res) {
        var mine = res.listings.filter(function (l) { return l.buildingId === current; });
        ui.paged(root, { caption: "Your listings", rows: mine,
          cols: [
            { label: "Unit", render: function (l) { return "<strong>" + ui.esc(l.unitLabel) + "</strong> " + (l.isSample ? ui.sampleTag("Sample listing") : ""); } },
            { label: "Bedrooms", render: function (l) { return ui.esc(ui.bedsLabel(l.beds)); } },
            { label: "Rent", n: true, render: function (l) { return ui.money(l.rentCents); } },
            { label: "Available", render: function (l) { return ui.esc(ui.date(l.availableOn)); } },
            { label: "Special", render: function (l) { return ui.esc((l.specials || [])[0] || "None"); } }
          ],
          empty: ["No listings yet", "Add your first unit below, or import a spreadsheet.", ""] });
      }, function (e) { root.innerHTML = ui.errorState(ui.errMessage(e)); var rt = root.querySelector("[data-retry]"); if (rt) rt.addEventListener("click", loadTable); });
    }
    if (lb) lb.addEventListener("change", function () { current = lb.value; loadTable(); });
    loadTable();

    document.getElementById("lf").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = document.getElementById("l-err"); err.hidden = true;
      var unit = document.getElementById("l-unit").value.trim(); var rent = Number(document.getElementById("l-rent").value);
      if (!unit) { err.textContent = "Add the unit number or name."; err.hidden = false; document.getElementById("l-unit").focus(); return; }
      if (!(rent > 0)) { err.textContent = "Add the monthly rent."; err.hidden = false; document.getElementById("l-rent").focus(); return; }
      var go = document.getElementById("l-go"); ui.busy(go, true);
      YD.api.buildingAddListing({ buildingId: current, unitLabel: unit, rentCents: Math.round(rent * 100), beds: Number(document.getElementById("l-beds").value), baths: Number(document.getElementById("l-baths").value) || 1,
        sqft: Number(document.getElementById("l-sqft").value) || undefined, availableOn: document.getElementById("l-date").value || undefined, specials: document.getElementById("l-sp").value.trim() || undefined }).then(function () {
        ui.busy(go, false); ui.toast("Listing added."); document.getElementById("lf").reset(); loadTable();
      }, function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
    });

    document.getElementById("imp-go").addEventListener("click", function () {
      var out = document.getElementById("imp-out"); var file = document.getElementById("imp-file").files[0]; var btn = this;
      if (!file) { out.innerHTML = '<p class="field-error">Choose a CSV file first.</p>'; return; }
      var reader = new FileReader();
      reader.onload = function () {
        ui.busy(btn, true);
        YD.api.buildingImport({ buildingId: current, format: "csv", content: String(reader.result) }).then(function (res) {
          ui.busy(btn, false);
          out.innerHTML = "<p><strong>" + ui.plural(res.imported || 0, "listing", "listings") + " imported.</strong></p>" +
            ((res.errors && res.errors.length) ? '<p class="field-error">Fix these rows and import again:</p><ul>' + res.errors.map(function (x) { return "<li>Row " + ui.esc(x.row) + ": " + ui.esc(x.message) + "</li>"; }).join("") + "</ul>" : "");
          loadTable();
        }, function (e3) { ui.busy(btn, false); out.innerHTML = '<p class="field-error">' + ui.esc(ui.errMessage(e3)) + "</p>"; });
      };
      reader.readAsText(file);
    });
  }

  /* ------------------------------------------------------------ invoices */
  function invoices(el) {
    el.innerHTML = '<div class="page-head"><div><h1>Invoices</h1><p class="muted">One invoice per move-in. Each line carries the proof: when Yesdoor registered the renter, the unit, the move-in date and the lease term.</p></div></div><div id="inv">' + ui.skeletonLines(4) + "</div>";
    return YD.api.buildingInvoices().then(function (res) {
      var lines = [];
      (res.invoices || []).forEach(function (v) { (v.lines || [{}]).forEach(function (l) { lines.push({ v: v, l: l }); }); });
      var open = 0; var paid = 0;
      (res.invoices || []).forEach(function (v) { if (v.status === "paid") paid += v.totalCents; else open += v.totalCents; });
      document.getElementById("inv").innerHTML = '<div class="kpis">' + ui.kpi("Open to pay", ui.esc(ui.money(open)), "Due " + (res.invoices && res.invoices.length ? "within 30 days of the invoice" : "when you have one")) + ui.kpi("Paid so far", ui.esc(ui.money(paid)), "") + "</div><div id=\"inv-t\"></div>";
      ui.paged(document.getElementById("inv-t"), { caption: "Invoices", rows: lines,
        cols: [
          { label: "Invoice", render: function (x) { return "<strong>" + ui.esc(x.v.number) + "</strong>"; } },
          { label: "Renter", render: function (x) { return ui.esc(x.l.renterName); } },
          { label: "Unit", render: function (x) { return ui.esc(x.l.unit); } },
          { label: "Registered by Yesdoor", render: function (x) { return ui.esc(ui.dateTime(x.l.registrationAt)); } },
          { label: "Move-in", render: function (x) { return ui.esc(ui.date(x.l.moveInDate)); } },
          { label: "Lease term", render: function (x) { return ui.esc(x.l.leaseTermMonths) + " months"; } },
          { label: "Amount", n: true, render: function (x) { return ui.money(x.v.totalCents); } },
          { label: "Due", render: function (x) { return ui.esc(ui.date(x.v.dueAt)); } },
          { label: "Status", render: function (x) { return '<span class="tag">' + (x.v.status === "paid" ? "✓ Paid " + ui.esc(ui.date(x.v.paidAt)) : "Open") + "</span>"; } }
        ],
        empty: ["No invoices yet", "An invoice appears when you confirm that a renter moved in.", '<a class="btn-secondary" href="#renters">See your renters</a>'] });
    });
  }

  YD.portal.start({
    kind: "building", title: "Building portal", intro: "For leasing offices and property managers. We email you a sign-in link.",
    nav: [{ id: "renters", label: "Renters" }, { id: "rules", label: "Rules" }, { id: "listings", label: "Listings" }, { id: "invoices", label: "Invoices" }],
    probe: function () { return YD.api.buildingRenters(); },
    views: { renters: renters, rules: rules, listings: listings, invoices: invoices },
    who: function (d) { return (d.buildings || []).map(function (b) { return b.name; }).join(", "); }
  });
})();
