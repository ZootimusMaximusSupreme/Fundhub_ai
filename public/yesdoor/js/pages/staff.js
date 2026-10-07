/* Yesdoor staff desk: pipeline by stage, buildings, money, disputes, scoreboard.
   Credit details are not on this desk: only owner and ops may read them, through their own endpoints. */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;

  var STAGE_ORDER = ["registered", "toured", "applied", "approved", "lease_signed", "moved_in", "invoiced", "paid", "safe", "denied", "no_show", "cancelled"];
  var SUPPLY = { target: "Target", pitched: "Pitched", agreement_sent: "Agreement sent", signed: "Signed", live: "Live", paused: "Paused", churned: "Churned" };

  /* ------------------------------------------------------------ pipeline */
  function pipeline(el, ctx) {
    var d = ctx.data; var rows = d.applications || [];
    var needs = d.needsAttention || {};
    var attention = (needs.toDay || 0) + (needs.noShow || 0) + (needs.waitingOnBuilding || 0);
    var open = rows.filter(function (r) { return ["registered", "toured", "applied", "approved", "lease_signed"].indexOf(r.stage) !== -1; }).length;
    var leased = rows.filter(function (r) { return ["lease_signed", "moved_in", "invoiced", "paid", "safe"].indexOf(r.stage) !== -1; }).length;
    var lanes = d.renterLanes || {};
    var filter = "";
    var counts = d.byStage || {};
    el.innerHTML = '<div class="page-head"><div><h1>Pipeline</h1><p class="muted">Who needs a nudge today, and where every renter is.</p></div></div>' +
      '<div class="kpis">' + ui.kpi("Needs attention", ui.esc(attention), ui.esc((needs.toDay || 0) + " denied this week, " + (needs.noShow || 0) + " no-shows, " + (needs.waitingOnBuilding || 0) + " waiting 3+ days")) +
      ui.kpi("Open applications", ui.esc(open), "Booked through lease signed") + ui.kpi("Leases signed", ui.esc(leased), "Includes moved in and paid") +
      ui.kpi("Renters", ui.esc(d.totalRenters), ui.esc((lanes.verified || 0) + " Verified, " + (lanes.secondChance || 0) + " Second Chance, " + (lanes.notScreened || 0) + " not screened")) + "</div>" +
      '<div class="row" id="chips" role="group" aria-label="Filter by stage" style="margin-bottom:16px;gap:8px"></div><div id="ptbl"></div>';
    var chipsEl = document.getElementById("chips");
    function chips() {
      var all = [["", "All (" + rows.length + ")"]].concat(STAGE_ORDER.filter(function (s) { return counts[s]; }).map(function (s) { return [s, ui.stageLabel(s) + " (" + counts[s] + ")"]; }));
      chipsEl.innerHTML = all.map(function (c) { return '<button class="slot" type="button" style="min-height:40px;padding:0 16px" data-stage="' + c[0] + '" aria-pressed="' + (filter === c[0]) + '">' + ui.esc(c[1]) + "</button>"; }).join("");
    }
    chips();
    var t = ui.paged(document.getElementById("ptbl"), { caption: "Applications by stage, newest first", rows: rows,
      cols: [
        { label: "Renter", render: function (r) { return "<strong>" + ui.esc(r.renterName) + "</strong>"; } },
        { label: "Building", render: function (r) { return ui.esc(r.buildingName); } },
        { label: "Stage", render: function (r) { return '<span class="tag">' + ui.esc(ui.stageLabel(r.stage)) + "</span>"; } },
        { label: "Path", render: function (r) { return ui.esc(r.lane === "second_chance" ? "Second Chance" : "Verified") + ' <span class="caption">Tier ' + ui.esc(r.riskTier) + "</span>"; } },
        { label: "Source", render: function (r) { return ui.esc({ ad: "Ad", broker: "Broker", organic: "Search", direct: "Direct", referral: "Referral" }[r.source] || r.source); } },
        { label: "In this stage", n: true, render: function (r) { return r.ageDays === 0 ? "Today" : r.ageDays + " d"; } }
      ],
      empty: ["Nothing in the pipeline yet", "When a renter books a tour, the application shows up here.", ""] });
    ui.on(chipsEl, "click", "[data-stage]", function (e, b) {
      filter = b.getAttribute("data-stage"); chips();
      t.setRows(filter ? rows.filter(function (r) { return r.stage === filter; }) : rows);
      ui.announce((filter ? ui.stageLabel(filter) : "All stages") + " selected");
    });
  }

  /* ------------------------------------------------------------ buildings */
  function buildings(el, ctx) {
    el.innerHTML = '<div class="page-head"><div><h1>Buildings</h1><p class="muted">Supply from first pitch to live. A building gets renters only after its agreement is signed and its rules are fresh.</p></div></div><div id="b">' + ui.skeletonLines(4) + "</div>";
    return YD.api.staffBuildings().then(function (res) {
      var list = res.buildings || [];
      var n = function (s) { return list.filter(function (b) { return b.status === s; }).length; };
      var root = document.getElementById("b");
      if (!root) return; // moved to another tab before the list came back
      root.innerHTML = '<div class="kpis">' + ui.kpi("Live", ui.esc(n("live")), "Taking renters now") + ui.kpi("Signed", ui.esc(n("signed")), "Agreement signed") +
        ui.kpi("In talks", ui.esc(n("target") + n("pitched") + n("agreement_sent")), "Target, pitched or agreement sent") + ui.kpi("Paused", ui.esc(n("paused")), "Rules stale or too many mismatches") + '</div>' +
        '<div class="row" style="margin-bottom:16px"><button class="btn" type="button" id="add-b">Add a building</button></div><div id="bt"></div>';
      document.getElementById("add-b").addEventListener("click", function () { addBuilding(el, ctx); });
      ui.paged(document.getElementById("bt"), { caption: "Buildings", rows: list,
        cols: [
          { label: "Building", render: function (b) { return "<strong>" + ui.esc(b.name) + "</strong>" + (b.isSample ? " " + ui.sampleTag("Sample data") : "") + '<div class="caption">' + ui.esc(b.company) + (b.companyTier ? ", tier " + ui.esc(b.companyTier) : "") + "</div>"; } },
          { label: "City", render: function (b) { return ui.esc(b.city); } },
          { label: "Status", render: function (b) { return '<span class="tag">' + ui.esc(SUPPLY[b.status] || b.status) + "</span>"; } },
          { label: "Connection", render: function (b) { return ui.esc(b.software) + ' <span class="caption">' + ui.esc(String(b.connection).replace(/_/g, " ")) + "</span>"; } },
          { label: "Listings", n: true, render: function (b) { return ui.esc(b.listingsCount); } },
          { label: "Leases", n: true, render: function (b) { return b.leases === null || b.leases === undefined ? "Not counted yet" : ui.esc(b.leases); } },
          { label: "We said yes, they said no", n: true, render: function (b) { return ui.esc(b.mismatchCount) + (b.mismatchCount >= 3 ? " (paused)" : ""); } },
          { label: "Rules", render: function (b) { return b.rulesConfirmedAt ? ui.esc(ui.date(b.rulesConfirmedAt)) + (b.rulesStale ? ' <span class="tag">Stale</span>' : "") : "None on file"; } },
          { label: "Pays on time", n: true, render: function (b) { return b.payerScore === null || b.payerScore === undefined ? "No history" : ui.esc(b.payerScore) + " / 100"; } },
          { label: "", cls: "actions", render: function (b) { return b.status === "target" || b.status === "pitched" ? '<button class="btn-secondary sm" type="button" data-agree="' + ui.esc(b.id) + '">Send agreement</button>' : ""; } }
        ],
        empty: ["No buildings yet", "Add the first target building to start the supply pipeline.", ""] });
      ui.on(document.getElementById("bt"), "click", "[data-agree]", function (e, btn) {
        var b = list.filter(function (x) { return x.id === btn.getAttribute("data-agree"); })[0];
        ui.openDialog("Send the fee agreement?", "<p>Send the fee agreement to " + ui.esc(b.name) + "? Nothing goes to this building's renters until it signs.</p>" +
          '<div class="actions"><button class="btn-secondary" type="button" data-close>Not yet</button><button class="btn" type="button" id="ag-go">Send agreement</button></div>', function (dlg, close) {
          dlg.querySelector("#ag-go").addEventListener("click", function () {
            var go = this; ui.busy(go, true);
            YD.api.staffAgreement({ buildingId: b.id, action: "send" }).then(function () { close(); ui.toast("Agreement sent to " + b.name + "."); buildings(el, ctx); }, function (er) { ui.busy(go, false); ui.toast(ui.errMessage(er)); });
          });
        });
      });
    });
  }

  /* A new building starts as a target. It gets renters only after it signs. */
  function addBuilding(el, ctx) {
    var f = function (id, label, attrs) { return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" ' + (attrs || "") + "></div>"; };
    ui.openDialog("Add a building", '<form id="ab" class="stack" novalidate>' + f("ab-name", "Building name", 'required') + f("ab-addr", "Street address", 'required') +
      '<div class="form-grid three">' + f("ab-city", "City", 'required') + f("ab-state", "State", 'maxlength="2" value="AZ" required') + f("ab-zip", "ZIP code", 'inputmode="numeric" maxlength="5"') + "</div>" +
      f("ab-email", "Leasing office email", 'type="email" required') + '<p class="caption">The fee agreement and renter registrations go to this address.</p>' +
      '<div class="field-error" id="ab-err" role="alert" hidden></div><div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="ab-go">Add building</button></div></form>', function (dlg, close) {
      dlg.querySelector("#ab").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var v = function (id) { return dlg.querySelector("#" + id).value.trim(); };
        var err = dlg.querySelector("#ab-err"); err.hidden = true;
        var body = { name: v("ab-name"), address: v("ab-addr"), city: v("ab-city"), state: v("ab-state").toUpperCase(), zip: v("ab-zip") || undefined, leasingEmail: v("ab-email") };
        if (!body.name || !body.address || !body.city || !/^[A-Z]{2}$/.test(body.state) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.leasingEmail)) {
          err.textContent = "Add the name, street, city, 2-letter state and the leasing office email."; err.hidden = false; return;
        }
        var go = dlg.querySelector("#ab-go"); ui.busy(go, true);
        YD.api.staffAddBuilding(body).then(function () { close(); ui.toast(body.name + " added as a target."); buildings(el, ctx); }, function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
      });
    });
  }

  /* ------------------------------------------------------------ brokers and logins (I2) */
  var PLAN = { split: "Placement split", software: "Software only" };
  var BSTATUS_NAME = { applied: "Applied", active: "Active", paused: "Paused" };
  var EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function people(el, ctx) {
    el.innerHTML = '<div class="page-head"><div><h1>Brokers and logins</h1><p class="muted">Add a broker partner, then give them, or a building\'s leasing office, a login. Each login gets a sign-in link by email.</p></div></div>' +
      '<div class="row" style="margin-bottom:16px;gap:8px"><button class="btn" type="button" id="add-k">Add a broker</button><button class="btn-secondary" type="button" id="add-bu">Add a building login</button></div><div id="pk">' + ui.skeletonLines(4) + "</div>";
    document.getElementById("add-k").addEventListener("click", function () { addBroker(el, ctx); });
    document.getElementById("add-bu").addEventListener("click", function () { addBuildingLogin(el, ctx); });
    return YD.api.staffBrokers().then(function (res) {
      var list = res.brokers || [];
      var root = document.getElementById("pk");
      if (!root) return; // moved to another tab before the list came back
      ui.paged(root, { caption: "Brokers", rows: list,
        cols: [
          { label: "Broker", render: function (k) { return "<strong>" + ui.esc(k.name) + "</strong>" + (k.company ? '<div class="caption">' + ui.esc(k.company) + "</div>" : "") + '<div class="caption">' + ui.esc(k.email) + "</div>"; } },
          { label: "Plan", render: function (k) { return ui.esc(PLAN[k.plan] || k.plan) + (k.plan === "split" && k.splitPercent !== null && k.splitPercent !== undefined ? ' <span class="caption">' + ui.esc(k.splitPercent) + "%</span>" : ""); } },
          { label: "Licence", render: function (k) { return k.licenceState ? ui.esc(k.licenceState) + (k.licenceNumber ? ' <span class="caption">' + ui.esc(k.licenceNumber) + "</span>" : "") + (k.licenceVerified ? ' <span class="tag">✓ Checked</span>' : ' <span class="tag">Not checked</span>') : "None on file"; } },
          { label: "Link code", render: function (k) { return "<code>" + ui.esc(k.trackingCode) + "</code>"; } },
          { label: "Status", render: function (k) { return '<span class="tag">' + ui.esc(BSTATUS_NAME[k.status] || k.status) + "</span>"; } },
          { label: "Login", cls: "actions", render: function (k) { return k.hasAccount ? '<span class="tag">✓ Has a login</span>' : '<button class="btn-secondary sm" type="button" data-login="' + ui.esc(k.id) + '">Give a login</button>'; } }
        ],
        empty: ["No brokers yet", "Add the first broker partner. They get a link code the moment they are added.", ""] });
      ui.on(root, "click", "[data-login]", function (e, btn) {
        var k = list.filter(function (x) { return x.id === btn.getAttribute("data-login"); })[0];
        giveBrokerLogin(el, ctx, k);
      });
    });
  }

  function addBroker(el, ctx) {
    var f = function (id, label, attrs) { return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" ' + (attrs || "") + "></div>"; };
    ui.openDialog("Add a broker", '<form id="kf" class="stack" novalidate>' + f("k-name", "Name", "required") + f("k-email", "Email address", 'type="email" required') + f("k-co", "Brokerage (optional)") +
      '<div class="form-grid two"><div class="field"><label for="k-plan">Plan</label><select class="input" id="k-plan"><option value="split">Placement split</option><option value="software">Software only</option></select></div>' +
      f("k-split", "Split percent", 'type="number" min="0" max="100" value="25"') + "</div>" +
      '<div class="form-grid two"><div class="field"><label for="k-lst">Licence state</label><select class="input" id="k-lst"><option value="">None</option><option value="AZ">AZ</option><option value="CA">CA</option><option value="FL">FL</option></select></div>' +
      f("k-lno", "Licence number") + "</div>" +
      '<div class="check"><input type="checkbox" id="k-ver"><label for="k-ver">I checked this licence with the state</label></div>' +
      '<p class="caption" id="k-hint">A placement-split partner needs a licence state and number. The broker starts as Applied and becomes Active when the partner agreement is signed and the licence is checked.</p>' +
      '<div class="field-error" id="k-err" role="alert" hidden></div><div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="k-go">Add broker</button></div></form>', function (dlg, close) {
      var v = function (id) { return dlg.querySelector("#" + id).value.trim(); };
      var plan = dlg.querySelector("#k-plan");
      function sync() { dlg.querySelector("#k-split").disabled = plan.value !== "split"; }
      plan.addEventListener("change", sync); sync();
      dlg.querySelector("#kf").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var err = dlg.querySelector("#k-err"); err.hidden = true;
        var body = { name: v("k-name"), email: v("k-email"), plan: plan.value };
        if (v("k-co")) body.company = v("k-co");
        if (v("k-lst")) body.licenceState = v("k-lst");
        if (v("k-lno")) body.licenceNumber = v("k-lno");
        if (plan.value === "split" && v("k-split") !== "") body.splitPercent = Number(v("k-split"));
        if (dlg.querySelector("#k-ver").checked) body.licenceVerified = true;
        var problem = !body.name ? "Add the broker's name." : !EMAIL_OK.test(body.email) ? "Add the broker's email address."
          : plan.value === "split" && (!body.licenceState || !body.licenceNumber) ? "A placement-split partner needs a licence state and number."
          : body.licenceVerified && (!body.licenceState || !body.licenceNumber) ? "Add the licence state and number before saying you checked it."
          : plan.value === "split" && !(body.splitPercent >= 0 && body.splitPercent <= 100) ? "The split must be a number from 0 to 100." : "";
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        var go = dlg.querySelector("#k-go"); ui.busy(go, true);
        YD.api.staffAddBroker(body).then(function (res) { close(); ui.toast(body.name + " added. Link code " + res.broker.trackingCode + "."); people(el, ctx); },
          function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
      });
    });
  }

  function giveBrokerLogin(el, ctx, k) {
    ui.openDialog("Give " + k.name + " a login", '<form id="lf" class="stack" novalidate><p>We email a sign-in link to the address below. It works once and expires in 15 minutes; they can ask for a new one from the broker page.</p>' +
      '<div class="field"><label for="l-email">Sign-in email</label><input class="input" id="l-email" type="email" value="' + ui.esc(k.email) + '" required></div>' +
      '<div class="field-error" id="l-err" role="alert" hidden></div><div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="l-go">Give a login</button></div></form>', function (dlg, close) {
      dlg.querySelector("#lf").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var err = dlg.querySelector("#l-err"); err.hidden = true;
        var email = dlg.querySelector("#l-email").value.trim();
        if (!EMAIL_OK.test(email)) { err.textContent = "Add the email address this person signs in with."; err.hidden = false; return; }
        var go = dlg.querySelector("#l-go"); ui.busy(go, true);
        YD.api.staffCreateAccount({ kind: "broker", brokerId: k.id, email: email }).then(function (res) {
          close(); ui.toast("Login made. Sign-in link sent to " + res.account.email + "."); people(el, ctx);
        }, function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
      });
    });
  }

  function addBuildingLogin(el, ctx) {
    ui.openDialog("Add a building login", '<form id="bf" class="stack" novalidate><div class="field"><label for="bu-email">Email address</label><input class="input" id="bu-email" type="email" required></div>' +
      '<div class="field"><label for="bu-role">Role</label><select class="input" id="bu-role"><option value="leasing">Leasing office</option><option value="manager">Manager</option></select></div>' +
      '<fieldset class="field" id="bu-list" style="border:0;padding:0;margin:0"><legend>Buildings this login can see</legend><div id="bu-boxes">' + ui.skeletonLines(3) + "</div></fieldset>" +
      '<div class="field-error" id="bu-err" role="alert" hidden></div><div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="bu-go">Add login</button></div></form>', function (dlg, close) {
      var boxes = dlg.querySelector("#bu-boxes");
      YD.api.staffBuildings().then(function (res) {
        var list = res.buildings || [];
        boxes.innerHTML = list.length ? '<div class="stack" style="max-height:220px;overflow:auto">' + list.map(function (b, i) {
          return '<div class="check"><input type="checkbox" id="bu-b' + i + '" value="' + ui.esc(b.id) + '"><label for="bu-b' + i + '">' + ui.esc(b.name) + ' <span class="caption">' + ui.esc(b.city) + "</span></label></div>";
        }).join("") + "</div>" : '<p class="caption">No buildings yet. Add a building first.</p>';
      }, function (e) { boxes.innerHTML = '<p class="caption">' + ui.esc(ui.errMessage(e)) + "</p>"; });
      dlg.querySelector("#bf").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var err = dlg.querySelector("#bu-err"); err.hidden = true;
        var email = dlg.querySelector("#bu-email").value.trim();
        var ids = Array.prototype.map.call(boxes.querySelectorAll("input:checked"), function (x) { return x.value; });
        if (!EMAIL_OK.test(email)) { err.textContent = "Add the email address this person signs in with."; err.hidden = false; return; }
        if (!ids.length) { err.textContent = "Choose at least one building."; err.hidden = false; return; }
        var go = dlg.querySelector("#bu-go"); ui.busy(go, true);
        YD.api.staffCreateAccount({ kind: "building_user", email: email, buildingIds: ids, role: dlg.querySelector("#bu-role").value }).then(function (res) {
          close(); ui.toast("Login made. Sign-in link sent to " + res.account.email + "."); people(el, ctx);
        }, function (e2) { ui.busy(go, false); err.textContent = ui.errMessage(e2); err.hidden = false; });
      });
    });
  }

  /* ------------------------------------------------------------ money */
  var METHODS = [["ach", "ACH"], ["wire", "Wire"], ["paymode", "Paymode-X"], ["check", "Check"]];
  var BSTATUS = { earned: "Earned", held: "Held", payable: "Payable", paid: "Paid", void: "Void" };

  function money(el, ctx) {
    el.innerHTML = '<div class="page-head"><div><h1>Money</h1><p class="muted">Every fee is earned, then invoiced, then paid, then safe after the refund window.</p></div></div><div id="m">' + ui.skeletonLines(5) + "</div>";
    return YD.api.staffLedger().then(function (res) {
      var t = res.totals || {};
      var root = document.getElementById("m");
      root.innerHTML = '<div class="kpis">' + ui.kpi("Invoiced, unpaid", ui.esc(ui.money(t.invoiced)), "Waiting on buildings") + ui.kpi("Paid", ui.esc(ui.money(t.paid)), "Inside the 60-day window") +
        ui.kpi("Safe", ui.esc(ui.money(t.safe)), "Past the window, no refund owed") + ui.kpi("Earned, not invoiced", ui.esc(ui.money(t.earned)), "Moved in, invoice next") + "</div>" +
        '<section aria-labelledby="inv-h"><h2 id="inv-h">Invoices</h2><div id="mi"></div></section>' +
        '<section aria-labelledby="bl-h" style="margin-top:32px"><h2 id="bl-h">Broker payouts</h2><div id="mb"></div></section>' +
        '<section aria-labelledby="rf-h" style="margin-top:32px"><h2 id="rf-h">Renter refunds owed</h2><div id="mr"></div></section>';
      ui.paged(document.getElementById("mi"), { caption: "Invoices", rows: res.invoices || [],
        cols: [
          { label: "Invoice", render: function (v) { return "<strong>" + ui.esc(v.number) + "</strong>"; } },
          { label: "Building", render: function (v) { return ui.esc(v.buildingName); } },
          { label: "Renter", render: function (v) { return ui.esc(((v.lines || [])[0] || {}).renterName || ""); } },
          { label: "Amount", n: true, render: function (v) { return ui.money(v.totalCents); } },
          { label: "Issued", render: function (v) { return ui.esc(ui.date(v.issuedAt)); } },
          { label: "Due", render: function (v) { return ui.esc(ui.date(v.dueAt)); } },
          { label: "Status", render: function (v) { return '<span class="tag">' + (v.status === "paid" ? "✓ Paid " + ui.esc(ui.date(v.paidAt)) + " by " + ui.esc(String(v.paymentMethod || "").toUpperCase()) : "Open") + "</span>"; } },
          { label: "", cls: "actions", render: function (v) { return v.status === "open" ? '<button class="btn-secondary sm" type="button" data-pay="' + ui.esc(v.id) + '">Log payment</button>' : ""; } }
        ],
        empty: ["No invoices yet", "An invoice is created when a building confirms a move-in.", ""] });
      ui.paged(document.getElementById("mb"), { caption: "Broker payouts", rows: res.brokerLedger || [],
        cols: [
          { label: "Broker", render: function (x) { return "<strong>" + ui.esc(x.brokerName) + "</strong>"; } },
          { label: "Renter", render: function (x) { return ui.esc(x.renterName); } },
          { label: "Amount", n: true, render: function (x) { return ui.money(x.amountCents); } },
          { label: "Status", render: function (x) { return '<span class="tag">' + ui.esc(BSTATUS[x.status] || x.status) + "</span>"; } },
          { label: "Held until", render: function (x) { return x.holdUntil ? ui.esc(ui.date(x.holdUntil)) : "Not set yet"; } },
          { label: "", cls: "actions", render: function (x) { return x.status === "payable" ? '<button class="btn-secondary sm" type="button" data-payout="' + ui.esc(x.id) + '">Mark paid</button>' : ""; } }
        ],
        empty: ["No broker payouts yet", "A payout row appears when a fee from a broker's renter is earned.", ""] });
      ui.paged(document.getElementById("mr"), { caption: "Renter refunds owed", rows: res.refunds || [],
        cols: [
          { label: "Reason", render: function (x) { return ui.esc(x.reason === "app_fee_mismatch" ? "We said approved, the building said no" : x.reason); } },
          { label: "Amount", n: true, render: function (x) { return ui.money(x.amountCents); } },
          { label: "Status", render: function (x) { return '<span class="tag">' + ui.esc(x.status === "owed" ? "Owed" : x.status) + "</span>"; } }
        ],
        empty: ["No refunds owed", "When a building denies a renter we said was approved and does not waive its application fee, the refund shows here.", ""] });

      ui.on(root, "click", "[data-pay]", function (e, btn) {
        var v = (res.invoices || []).filter(function (x) { return x.id === btn.getAttribute("data-pay"); })[0];
        ui.openDialog("Log a payment", '<form id="pf" class="stack"><p>' + ui.esc(v.number) + " from " + ui.esc(v.buildingName) + ": <strong>" + ui.money(v.totalCents) + '</strong></p>' +
          '<div class="field"><label for="pm">How did they pay?</label><select class="input" id="pm">' + METHODS.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + "</option>"; }).join("") + "</select></div>" +
          '<div class="field"><label for="pr">Reference (check number, wire or ACH id)</label><input class="input" id="pr" required></div><div class="field-error" id="pe" role="alert" hidden></div><div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="pgo">Log payment</button></div></form>', function (dlg, close) {
          dlg.querySelector("#pf").addEventListener("submit", function (ev) {
            ev.preventDefault(); var pe = dlg.querySelector("#pe"); var ref = dlg.querySelector("#pr").value.trim();
            if (!ref) { pe.textContent = "Add the reference so the record shows which payment this was."; pe.hidden = false; dlg.querySelector("#pr").focus(); return; }
            var go = dlg.querySelector("#pgo"); ui.busy(go, true);
            YD.api.staffPayment({ invoiceId: v.id, method: dlg.querySelector("#pm").value, ref: ref }).then(function () { close(); ui.toast("Payment logged for " + v.number + "."); money(el, ctx); }, function (er) { ui.busy(go, false); pe.textContent = ui.errMessage(er); pe.hidden = false; });
          });
        });
      });
      ui.on(root, "click", "[data-payout]", function (e, btn) {
        var x = (res.brokerLedger || []).filter(function (y) { return y.id === btn.getAttribute("data-payout"); })[0];
        ui.openDialog("Mark payout paid?", "<p>Mark " + ui.money(x.amountCents) + " to " + ui.esc(x.brokerName) + " as paid? Do this only after you have sent the money.</p>" +
          '<div class="field"><label for="po-ref">Transfer or check number</label><input class="input" id="po-ref" required></div><div class="field-error" id="po-err" role="alert" hidden></div>' +
          '<div class="actions"><button class="btn-secondary" type="button" data-close>Not yet</button><button class="btn" type="button" id="po-go">Mark paid</button></div>', function (dlg, close) {
          dlg.querySelector("#po-go").addEventListener("click", function () {
            var ref = dlg.querySelector("#po-ref").value.trim(); var perr = dlg.querySelector("#po-err");
            if (!ref) { perr.textContent = "Add the transfer or check number."; perr.hidden = false; dlg.querySelector("#po-ref").focus(); return; }
            var go = this; ui.busy(go, true);
            YD.api.staffBrokerPayout({ brokerLedgerId: x.id, brokerId: x.brokerId, ref: ref }).then(function () { close(); ui.toast("Payout marked paid."); money(el, ctx); }, function (er) { ui.busy(go, false); perr.textContent = ui.errMessage(er); perr.hidden = false; });
          });
        });
      });
    });
  }

  /* ------------------------------------------------------------ disputes */
  var KIND = { attribution: "Who sent the renter", denial: "Approved, then denied", fee: "Fee" };

  function disputes(el, ctx) {
    el.innerHTML = '<div class="page-head"><div><h1>Disputes</h1><p class="muted">The owner or ops decides each one within 14 days. First touch wins unless the evidence says otherwise.</p></div></div><div id="d">' + ui.skeletonLines(4) + "</div>";
    return YD.api.staffDisputes().then(function (res) {
      var list = res.disputes || [];
      ui.paged(document.getElementById("d"), { caption: "Disputes", rows: list,
        cols: [
          { label: "Kind", render: function (x) { return ui.esc(KIND[x.kind] || x.kind); } },
          { label: "What happened", cls: "wrap-ok", render: function (x) { return ui.esc(x.subject) + (x.decision ? '<div class="caption">Decision: ' + ui.esc(x.decision) + "</div>" : ""); } },
          { label: "Opened", render: function (x) { return ui.esc(ui.date(x.openedAt)); } },
          { label: "Decide by", render: function (x) { return x.status === "decided" ? "Decided" : ui.esc(ui.date(x.dueBy)) + (x.daysLeft < 0 ? ' <span class="tag">Overdue</span>' : ' <span class="caption">' + ui.esc(x.daysLeft) + " d left</span>"); } },
          { label: "", cls: "actions", render: function (x) { return x.status === "open" ? '<button class="btn-secondary sm" type="button" data-decide="' + ui.esc(x.id) + '">Decide</button>' : '<span class="tag">✓ Decided</span>'; } }
        ],
        empty: ["No disputes", "A dispute opens when a building claims it already knew a renter, or a renter says a denial was wrong.", ""] });
      ui.on(document.getElementById("d"), "click", "[data-decide]", function (e, btn) {
        var x = list.filter(function (y) { return y.id === btn.getAttribute("data-decide"); })[0];
        ui.openDialog("Decide this dispute", '<form id="df" class="stack"><p>' + ui.esc(x.subject) + '</p>' +
          '<div class="field"><label for="do">Decision</label><select class="input" id="do"><option value="upheld">Upheld: the person who opened it was right</option><option value="rejected">Rejected: it stays as it was</option></select></div>' +
          '<div class="field"><label for="dd">Why</label><textarea class="input" id="dd" required></textarea>' +
          '<span class="hint">This is saved with the record and cannot be changed later.</span></div><div class="field-error" id="de" role="alert" hidden></div>' +
          '<div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="dgo">Record decision</button></div></form>', function (dlg, close) {
          dlg.querySelector("#df").addEventListener("submit", function (ev) {
            ev.preventDefault(); var txt = dlg.querySelector("#dd").value.trim(); var er = dlg.querySelector("#de");
            if (!txt) { er.textContent = "Write the decision so the record says why."; er.hidden = false; return; }
            var go = dlg.querySelector("#dgo"); ui.busy(go, true);
            YD.api.staffDecideDispute({ id: x.id, outcome: dlg.querySelector("#do").value, decision: txt }).then(function () { close(); ui.toast("Decision recorded."); disputes(el, ctx); }, function (e2) { ui.busy(go, false); er.textContent = ui.errMessage(e2); er.hidden = false; });
          });
        });
      });
    });
  }

  /* ------------------------------------------------------------ scoreboard */
  function scoreboard(el) {
    el.innerHTML = '<div class="page-head"><div><h1>Scoreboard</h1><p class="muted" id="sb-sub">The weekly numbers.</p></div></div><div id="sb">' + ui.skeletonLines(4) + "</div>";
    return YD.api.staffScoreboard().then(function (res) {
      document.getElementById("sb-sub").textContent = "Week of " + ui.date(res.weekOf) + ". " + (res.comparison || "");
      function fmt(m, v) { return v === null || v === undefined ? "No data yet" : m.unit === "money" ? ui.money(v) : m.unit === "days" ? v + " days" : String(v); }
      function cmp(m) {
        if (m.previous === null || m.previous === undefined || m.value === null || m.value === undefined) return "No comparison yet";
        var diff = m.value - m.previous;
        if (diff === 0) return "Same as last week (" + fmt(m, m.previous) + ")";
        var good = m.better === "down" ? diff < 0 : diff > 0;
        return (diff > 0 ? "▲ Up " : "▼ Down ") + (m.unit === "money" ? ui.money(Math.abs(diff)) : Math.abs(diff)) + " from " + fmt(m, m.previous) + (good ? " (better)" : " (worse)");
      }
      document.getElementById("sb").innerHTML = '<div class="grid cols-4">' + (res.metrics || []).map(function (m) {
        return ui.kpi(m.label, ui.esc(fmt(m, m.value)), cmp(m));
      }).join("") + "</div>";
    });
  }

  YD.portal.start({
    kind: "staff", title: "Staff desk", intro: "For Yesdoor staff. Use your staff account.",
    nav: [{ id: "pipeline", label: "Pipeline" }, { id: "buildings", label: "Buildings" }, { id: "people", label: "Brokers and logins" }, { id: "money", label: "Money" }, { id: "disputes", label: "Disputes" }, { id: "scoreboard", label: "Scoreboard" }],
    probe: function () { return YD.api.staffPipeline(); },
    views: { pipeline: pipeline, buildings: buildings, people: people, money: money, disputes: disputes, scoreboard: scoreboard },
    who: function (d) { return "Staff" + (d.role ? " (" + d.role + ")" : ""); }
  });
})();
