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
      root.innerHTML = '<div class="kpis">' + ui.kpi("Live", ui.esc(n("live")), "Taking renters now") + ui.kpi("Signed", ui.esc(n("signed")), "Agreement signed") +
        ui.kpi("In talks", ui.esc(n("target") + n("pitched") + n("agreement_sent")), "Target, pitched or agreement sent") + ui.kpi("Paused", ui.esc(n("paused")), "Rules stale or too many mismatches") + '</div><div id="bt"></div>';
      ui.paged(document.getElementById("bt"), { caption: "Buildings", rows: list,
        cols: [
          { label: "Building", render: function (b) { return "<strong>" + ui.esc(b.name) + "</strong>" + (b.isSample ? " " + ui.sampleTag("Sample data") : "") + '<div class="caption">' + ui.esc(b.company) + (b.companyTier ? ", tier " + ui.esc(b.companyTier) : "") + "</div>"; } },
          { label: "City", render: function (b) { return ui.esc(b.city); } },
          { label: "Status", render: function (b) { return '<span class="tag">' + ui.esc(SUPPLY[b.status] || b.status) + "</span>"; } },
          { label: "Connection", render: function (b) { return ui.esc(b.software) + ' <span class="caption">' + ui.esc(String(b.connection).replace(/_/g, " ")) + "</span>"; } },
          { label: "Listings", n: true, render: function (b) { return ui.esc(b.listingsCount); } },
          { label: "Leases", n: true, render: function (b) { return ui.esc(b.leases); } },
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
          '<div class="field"><label for="pr">Reference (optional)</label><input class="input" id="pr"></div><div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="pgo">Log payment</button></div></form>', function (dlg, close) {
          dlg.querySelector("#pf").addEventListener("submit", function (ev) {
            ev.preventDefault(); var go = dlg.querySelector("#pgo"); ui.busy(go, true);
            YD.api.staffPayment({ invoiceId: v.id, method: dlg.querySelector("#pm").value, ref: dlg.querySelector("#pr").value }).then(function () { close(); ui.toast("Payment logged for " + v.number + "."); money(el, ctx); }, function (er) { ui.busy(go, false); ui.toast(ui.errMessage(er)); });
          });
        });
      });
      ui.on(root, "click", "[data-payout]", function (e, btn) {
        var x = (res.brokerLedger || []).filter(function (y) { return y.id === btn.getAttribute("data-payout"); })[0];
        ui.openDialog("Mark payout paid?", "<p>Mark " + ui.money(x.amountCents) + " to " + ui.esc(x.brokerName) + " as paid? Do this only after you have sent the money.</p>" +
          '<div class="actions"><button class="btn-secondary" type="button" data-close>Not yet</button><button class="btn" type="button" id="po-go">Mark paid</button></div>', function (dlg, close) {
          dlg.querySelector("#po-go").addEventListener("click", function () {
            var go = this; ui.busy(go, true);
            YD.api.staffBrokerPayout({ brokerLedgerId: x.id }).then(function () { close(); ui.toast("Payout marked paid."); money(el, ctx); }, function (er) { ui.busy(go, false); ui.toast(ui.errMessage(er)); });
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
        ui.openDialog("Decide this dispute", '<form id="df" class="stack"><p>' + ui.esc(x.subject) + '</p><div class="field"><label for="dd">Your decision and why</label><textarea class="input" id="dd" required></textarea>' +
          '<span class="hint">This is saved with the record and cannot be changed later.</span></div><div class="field-error" id="de" role="alert" hidden></div>' +
          '<div class="actions"><button class="btn-secondary" type="button" data-close>Cancel</button><button class="btn" type="submit" id="dgo">Record decision</button></div></form>', function (dlg, close) {
          dlg.querySelector("#df").addEventListener("submit", function (ev) {
            ev.preventDefault(); var txt = dlg.querySelector("#dd").value.trim(); var er = dlg.querySelector("#de");
            if (!txt) { er.textContent = "Write the decision so the record says why."; er.hidden = false; return; }
            var go = dlg.querySelector("#dgo"); ui.busy(go, true);
            YD.api.staffDecideDispute({ id: x.id, decision: txt }).then(function () { close(); ui.toast("Decision recorded."); disputes(el, ctx); }, function (e2) { ui.busy(go, false); er.textContent = ui.errMessage(e2); er.hidden = false; });
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
    nav: [{ id: "pipeline", label: "Pipeline" }, { id: "buildings", label: "Buildings" }, { id: "money", label: "Money" }, { id: "disputes", label: "Disputes" }, { id: "scoreboard", label: "Scoreboard" }],
    probe: function () { return YD.api.staffPipeline(); },
    views: { pipeline: pipeline, buildings: buildings, money: money, disputes: disputes, scoreboard: scoreboard },
    who: function (d) { return "Staff" + (d.role ? " (" + d.role + ")" : ""); }
  });
})();
