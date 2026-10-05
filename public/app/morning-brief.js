/* morning-brief.js — the full report behind the morning text.
 *
 * Reads GET /api/read/morning-brief?date=&kind= through FHData.read and paints
 * the stored row. It never computes a number of its own: what the row says is
 * what shows, and a section the brief left as a "waiting" line shows that line.
 *
 * kind = morning | evening. Chris added an end-of-day brief ("Good evening,
 * Chris.") on 2026-10-05; MB6 adds kind to the endpoint. Until MB6 lands the
 * endpoint ignores kind and always answers with the morning row — so an
 * evening ask is only painted when the row itself says it is the evening one.
 * Otherwise the page says there is no evening brief, rather than showing the
 * morning brief under an Evening label.
 *
 * Every time is shown in Arizona (America/Phoenix). The default day is today
 * in Arizona, not in the browser's own zone.
 */
(function () {
  "use strict";

  var KINDS = ["morning", "evening"];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Arizona dates and times ---------- */

  function arizonaToday() {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    function get(t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value; return ""; }
    return get("year") + "-" + get("month") + "-" + get("day");
  }

  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return false;
    var d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function longDate(s) {
    // Noon UTC is the same calendar day in Arizona, so the label cannot slip.
    var d = new Date(s + "T12:00:00Z");
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric", year: "numeric"
    }).format(d);
  }

  function azTime(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Phoenix", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short"
    }).format(d);
  }

  /* ---------- numbers ---------- */

  function money(cents) {
    if (cents == null || cents === "" || !isFinite(Number(cents))) return null;
    return (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function count(n) {
    if (n == null || n === "" || !isFinite(Number(n))) return null;
    return Number(n).toLocaleString("en-US");
  }
  function pct(r) {
    if (r == null || r === "" || !isFinite(Number(r))) return null;
    var n = Number(r);
    return Math.round(n <= 1 ? n * 100 : n) + "%";
  }

  /* ---------- small pieces ---------- */

  function src(text) {
    return '<p class="src">From: <b>' + esc(text) + "</b></p>";
  }
  function waitLines(arr) {
    if (!Array.isArray(arr) || !arr.length) return "";
    return arr.map(function (l) { return '<p class="wait">' + esc(l) + "</p>"; }).join("");
  }
  function line(text) { return text ? '<p class="line">' + esc(text) + "</p>" : ""; }
  function kpi(label, value, sub, cls) {
    return '<div class="kpi' + (cls ? " " + cls : "") + '"><div class="lb">' + esc(label) + "</div>" +
      '<div class="vl">' + (value == null ? "—" : esc(value)) + "</div>" +
      (sub ? '<div class="sb">' + esc(sub) + "</div>" : "") + "</div>";
  }
  function statusWord(st) {
    if (st === "red") return '<span class="st red"><i></i>Red</span>';
    if (st === "green") return '<span class="st green"><i></i>Green</span>';
    return '<span class="st nc"><i></i>Not checked</span>';
  }
  function body(id, html) {
    var el = $("#" + id + " .body");
    if (el) el.innerHTML = html;
  }

  /* ---------- 1. Systems ---------- */

  var GROUP_WORDS = {
    front_doors: "Front doors", backend: "Back end", jobs: "Scheduled jobs",
    messages: "Messages", money_in: "Money in", tracking: "Tracking",
    outside: "Outside services", site: "Site", mac: "The Mac"
  };
  var ORDER = { red: 0, not_checked: 1, green: 2 };

  function paintSystems(sys) {
    if (!sys || sys.status === "missing" || !sys.scorecard || !Array.isArray(sys.scorecard.checks)) {
      body("sec-systems", line((sys && sys.line) || "Systems: the morning check did not run, so nothing was checked."));
      return;
    }
    var card = sys.scorecard;
    var checks = card.checks.slice().sort(function (a, b) {
      var oa = ORDER[a.status] == null ? 1 : ORDER[a.status];
      var ob = ORDER[b.status] == null ? 1 : ORDER[b.status];
      return oa - ob;
    });
    var total = count(sys.total != null ? sys.total : checks.length);
    var head = '<div class="hero">' +
      kpi("Checks green", (count(sys.green) || "0") + " of " + total, sys.line || null, "lead") +
      kpi("Red", count(sys.red) || "0", Number(sys.red) ? "Listed first below" : "None red") +
      kpi("Not checked", count(sys.not_checked) || "0", "Never counted as green") +
      "</div>";

    var rows = checks.map(function (c) {
      var st = c.status === "red" || c.status === "green" ? c.status : "not_checked";
      var detail;
      if (st === "red") {
        var parts = [];
        parts.push("<b>What a customer sees:</b> " + esc(c.customer_sees || "Not recorded yet."));
        if (c.proof) parts.push("<b>Check said:</b> " + esc(c.proof));
        parts.push("<b>Fastest fix:</b> " + esc(c.fix || "Not recorded yet."));
        detail = parts.join("<br>");
      } else if (st === "green") {
        detail = "<b>Proof:</b> " + esc(c.proof || "—");
      } else {
        detail = c.proof ? "<b>Why:</b> " + esc(c.proof) : "Not run.";
      }
      var since = "—";
      if (st === "red") {
        var bits = [];
        if (c.day_count) bits.push("Day " + esc(c.day_count));
        if (c.since) bits.push("since " + esc(c.since));
        since = bits.length ? bits.join(", ") : "Not recorded yet";
      }
      return '<tr class="' + (st === "red" ? "red" : "") + '" data-status="' + st + '">' +
        "<td>" + statusWord(st) + "</td>" +
        "<td>" + esc(c.id) + "</td>" +
        "<td>" + esc(GROUP_WORDS[c.group] || c.group || "—") + "</td>" +
        '<td class="why">' + detail + "</td>" +
        "<td>" + since + "</td>" +
        "</tr>";
    }).join("");

    var ran = azTime(card.ran_at);
    var from = "the " + (card.source === "runDailyPulse" ? "6:00 a.m. daily check (Recon AG-07)" : "stored systems scorecard") +
      (ran ? ", ran " + ran : "");
    body("sec-systems", head +
      '<div class="card" style="margin-top:16px"><div class="scroll"><table class="tbl" id="mb-checks">' +
      "<thead><tr><th>Status</th><th>Check</th><th>Area</th><th>Proof, or what is wrong</th><th>How long</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" + src(from) + "</div>");
  }

  /* ---------- 2. Marketing ---------- */

  function safeLink(u) {
    if (!u) return "";
    var s = String(u);
    if (/^https:\/\//i.test(s) || /^\/[^/]/.test(s) || /^[a-z0-9-]+\.html(\?.*)?$/i.test(s)) return s;
    return "";
  }

  function paintMarketing(m) {
    if (!m) { body("sec-marketing", line("Marketing: nothing was saved for this part.")); return; }
    if (m.status === "error") { body("sec-marketing", line(m.line)); return; }
    var html = "";
    if (m.spend_line) {
      var spend = money(m.spend_cents);
      html += '<div class="grid">' +
        kpi("Ad spend" + (m.spend_day ? ", " + m.spend_day : ""), spend, spend == null ? m.spend_line : null) +
        "</div>" + src(m.spend_source ? "ad spend synced from Meta (" + m.spend_source + ")" : "ad spend rows");
    }
    html += '<div class="card" style="margin-top:16px">' + waitLines(m.waiting);
    var dash = safeLink(m.dashboard_url);
    html += dash
      ? '<p class="line"><a class="out" href="' + esc(dash) + '">Open the marketing dashboard</a></p>'
      : (m.dashboard_line ? '<p class="wait">' + esc(m.dashboard_line) + "</p>" : "");
    html += "</div>";
    body("sec-marketing", html);
  }

  /* ---------- 3. Money ---------- */

  function paintMoney(m) {
    if (!m) { body("sec-money", line("Money: nothing was saved for this part.")); return; }
    if (m.status !== "ok") {
      body("sec-money", '<div class="card">' + line(m.line || "Money: not connected yet.") +
        (m.reason ? '<p class="note">Why: ' + esc(m.reason) + "</p>" : "") + "</div>");
      return;
    }
    var html = '<div class="grid">' +
      kpi("Cash in" + (m.day ? ", " + m.day : ""), money(m.in_cents)) +
      kpi("Cash out" + (m.day ? ", " + m.day : ""), money(m.out_cents)) +
      kpi("Cash in, month to date", money(m.mtd_in_cents)) +
      kpi("Cash out, month to date", money(m.mtd_out_cents)) +
      "</div>" + src(m.source || "bank transactions");
    if (m.waiting && m.waiting.length) html += '<div class="card" style="margin-top:16px">' + waitLines(m.waiting) + "</div>";
    body("sec-money", html);
  }

  /* ---------- 4. Team ---------- */

  function c8(team, key) {
    var v = team && team.company_8 && team.company_8[key];
    return v ? v.value : null;
  }

  function paintTeam(t) {
    if (!t) { body("sec-team", line("Team: nothing was saved for this part.")); return; }
    var html = "";
    if (t.line) html += '<p class="line">' + esc(t.line) + "</p>";

    if (t.company_8) {
      html += '<div class="grid" style="margin-top:8px">' +
        kpi("Cash collected", money(c8(t, "cash_cents"))) +
        kpi("Booked calls", count(c8(t, "booked_calls"))) +
        kpi("Show rate", pct(c8(t, "show_rate"))) +
        kpi("Close rate", pct(c8(t, "close_rate"))) +
        kpi("New clients", count(c8(t, "new_clients"))) +
        kpi("Files funded", count(c8(t, "funded_count"))) +
        kpi("Funded dollars", money(c8(t, "funded_dollars_cents"))) +
        kpi("Cost per funded file", money(c8(t, "cost_per_funded_cents"))) +
        "</div>" + src("company numbers for today (the same read as the Ops pulse)");
    } else if (t.company_error) {
      html += line(t.company_error);
    }

    html += '<div class="card" style="margin-top:16px">';
    if (Array.isArray(t.closers)) {
      if (t.closers.length) {
        html += '<div class="scroll"><table class="tbl" id="mb-closers"><thead><tr><th>Closer</th>' +
          '<th class="num">Calls held</th><th class="num">No-shows</th><th class="num">Deposits</th><th class="num">Downsells</th></tr></thead><tbody>' +
          t.closers.map(function (r) {
            return "<tr><td>" + esc(r.name || "—") + '</td><td class="num">' + esc(count(r.calls_held) || "0") +
              '</td><td class="num">' + esc(count(r.no_shows) || "0") + '</td><td class="num">' + esc(count(r.deposits) || "0") +
              '</td><td class="num">' + esc(count(r.downsells) || "0") + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      } else {
        html += '<p class="line">No calls logged by any closer in this window.</p>';
      }
      html += src("the call log, " + (t.window || "last 24 hours"));
    } else if (t.closers_error) {
      html += line(t.closers_error);
    }
    html += "</div>";

    html += '<div class="grid" style="margin-top:16px">';
    html += t.csm_overdue != null
      ? kpi("CSM tasks overdue", count(t.csm_overdue), "From: open CSM tasks past their due time")
      : kpi("CSM tasks overdue", null, t.csm_error || "Could not be read");
    html += t.unrecorded_calls != null
      ? kpi("Unrecorded calls", count(t.unrecorded_calls), "From: calls with no recording on file")
      : kpi("Unrecorded calls", null, t.unrecorded_error || "Could not be read");
    html += "</div>";

    if (t.waiting && t.waiting.length) html += '<div class="card" style="margin-top:16px">' + waitLines(t.waiting) + "</div>";
    body("sec-team", html);
  }

  /* ---------- 5. Suggestions, 6. Today ---------- */

  function paintSuggestions(list) {
    if (!Array.isArray(list) || !list.length) {
      body("sec-suggestions", '<div class="card"><p class="wait">Suggestions: none yet. They start when the cadence rules are approved (MB4).</p></div>');
      return;
    }
    body("sec-suggestions", '<div class="card">' + list.slice(0, 3).map(function (s, i) {
      var text = s.text || s.line || s.title || s.summary || "";
      var rule = s.rule ? '<p class="note">Rule: ' + esc(s.rule) + "</p>" : "";
      var nums = s.numbers ? '<p class="note">Numbers: ' + esc(typeof s.numbers === "string" ? s.numbers : JSON.stringify(s.numbers)) + "</p>" : "";
      return '<div class="line"><b>' + (i + 1) + ".</b> " + esc(text) + rule + nums + "</div>";
    }).join("") + "</div>");
  }

  function paintToday(t) {
    var text = t && (t.line || t.text);
    body("sec-today", '<div class="card"><p class="' + (t && t.status === "waiting" ? "wait" : "line") + '">' +
      esc(text || "Today: nothing was saved for this part.") + "</p></div>");
  }

  /* ---------- header ---------- */

  function paintDelivery(b) {
    var chip = $("#mb-delivery");
    if (!chip) return;
    var st = b && b.delivery_status;
    var words = {
      sent: "Texted" + (b && b.sent_to_last4 ? " to …" + b.sent_to_last4 : "") + (b && azTime(b.sent_at) ? ", " + azTime(b.sent_at) : ""),
      dry_run: "Not texted (dry run)",
      no_number: "Not texted (no number set)",
      failed: "Text failed" + (b && b.delivery_error ? ": " + b.delivery_error : "")
    };
    chip.className = "chip" + (st === "sent" ? " on" : st === "failed" ? " bad" : " wip");
    chip.innerHTML = '<span class="cd"></span>' + esc(words[st] || (st ? st : "—"));
  }

  /* ---------- states ---------- */

  function showState(html) {
    var st = $("#mb-state");
    st.innerHTML = '<div class="state">' + html + "</div>";
    st.hidden = false;
    $("#mb-report").hidden = true;
  }
  function showReport() {
    $("#mb-state").hidden = true;
    $("#mb-report").hidden = false;
  }
  function skeletons() {
    $all("#mb-report .body").forEach(function (el) {
      el.innerHTML = '<div class="skel w60"></div><div class="skel w40"></div>';
    });
  }

  /* ---------- load ---------- */

  var current = { date: null, kind: "morning" };
  var seq = 0;

  function kindWord(k) { return k === "evening" ? "evening" : "morning"; }

  function syncUrl() {
    try {
      var q = "?date=" + encodeURIComponent(current.date) + (current.kind === "evening" ? "&kind=evening" : "");
      history.replaceState(null, "", location.pathname + q);
    } catch (e) { /* a sandboxed frame may refuse; the page still works */ }
  }

  function paintControls() {
    $("#mb-date").value = current.date;
    $("#mb-today").hidden = current.date === arizonaToday();
    $all(".segb").forEach(function (b) {
      var on = b.getAttribute("data-kind") === current.kind;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var title = (current.kind === "evening" ? "Evening brief" : "Morning brief");
    var eb = $(".hl .eyebrow");
    if (eb) eb.textContent = title;
    document.title = title + " · Fundhub";
  }

  function load() {
    var my = ++seq;
    paintControls();
    syncUrl();
    skeletons();
    showReport();
    $("#mb-ran").textContent = longDate(current.date) + ". All times are Arizona time.";
    var chip = $("#mb-delivery");
    chip.className = "chip";
    chip.innerHTML = '<span class="cd"></span>Loading';

    window.FHData.read("morning-brief", { date: current.date, kind: current.kind }).then(function (res) {
      if (my !== seq) return; // a newer pick already went out
      if (!res.ok) {
        paintDelivery(null);
        var day = esc(longDate(current.date));
        if (res.source === "notfound") {
          showState("<b>No " + kindWord(current.kind) + " brief was saved for " + day + ".</b>" +
            '<p class="note">' + (current.kind === "evening"
              ? "The evening brief is saved at the end of each day."
              : "The brief is built and saved each morning at 6:00 a.m. Arizona time.") +
            " Pick another day above.</p>");
        } else if (res.source === "unauthorized") {
          showState("<b>This report is for owner and admin logins.</b>" +
            '<p class="note">Sign in with an owner or admin login to see it.</p>');
        } else if (res.source === "badrequest") {
          showState("<b>That day could not be read.</b><p class=\"note\">" + esc(res.error) + "</p>");
        } else if (res.source === "nodb") {
          showState("<b>The database is not answering right now.</b><p class=\"note\">Try again in a minute.</p>");
        } else if (res.source === "demo") {
          showState("<b>Demo login.</b><p class=\"note\">The morning brief is only read with a real login.</p>");
        } else {
          showState("<b>The report did not load.</b><p class=\"note\">" + esc(res.error || "Try again in a moment.") + "</p>");
        }
        return;
      }
      var b = res.data && res.data.brief;
      if (!b) {
        paintDelivery(null);
        showState("<b>The report came back empty.</b><p class=\"note\">Try again in a moment.</p>");
        return;
      }
      /* Until MB6 lands the endpoint does not know kind and answers with the
         morning row. Never show that under an Evening label. */
      var gotKind = b.kind || (res.data && res.data.kind) || "morning";
      if (gotKind !== current.kind) {
        paintDelivery(null);
        showState("<b>No " + kindWord(current.kind) + " brief was saved for " + esc(longDate(current.date)) + ".</b>" +
          '<p class="note">The evening brief is not switched on yet.</p>');
        return;
      }
      paintDelivery(b);
      var made = azTime(b.created_at);
      $("#mb-ran").textContent = longDate(current.date) + ". " +
        (made ? "Built " + made + ". " : "") + "All times are Arizona time.";
      paintSystems(b.systems);
      paintMarketing(b.marketing);
      paintMoney(b.money);
      paintTeam(b.team);
      paintSuggestions(b.suggestions);
      paintToday(b.today);
    });
  }

  function start() {
    var qDate = window.FHData.param ? window.FHData.param("date") : null;
    var qKind = window.FHData.param ? window.FHData.param("kind") : null;
    current.date = validDate(qDate) ? qDate : arizonaToday();
    current.kind = KINDS.indexOf(qKind) !== -1 ? qKind : "morning";

    $("#mb-date").max = arizonaToday();
    $("#mb-date").addEventListener("change", function (e) {
      var v = e.target.value;
      if (!validDate(v)) return;
      current.date = v;
      load();
    });
    $("#mb-today").addEventListener("click", function () {
      current.date = arizonaToday();
      load();
    });
    $all(".segb").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-kind");
        if (k === current.kind) return;
        current.kind = k;
        load();
      });
    });
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
