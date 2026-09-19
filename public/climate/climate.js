/* /climate/ — the lending-climate lead magnet.
 *
 * Reads three live endpoints and invents nothing:
 *   GET  /api/climate                 national + per-state scores (macro only)
 *   GET  /api/public/climate-match    how big the lender book is
 *   POST /api/public/climate-match    the real matcher: count, lanes, teaser names
 *   POST /api/public/optimize         the existing $32 SOFT_PULL checkout
 *
 * Nothing on this page says how likely a bank is to say yes, and no dollar
 * figure appears anywhere on it. A score the API did not send is drawn as an em
 * dash, never as a guess.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  /* Colour alone is never the signal — every band also carries its word.
     Same five bands and hex values as src/climate/config.mjs BANDS. */
  var BANDS = [
    { min: 80, title: "Very favorable", color: "#A8D8B0" },
    { min: 65, title: "Favorable", color: "#A9C6E8" },
    { min: 50, title: "Neutral", color: "#F2E39B" },
    { min: 35, title: "Tight", color: "#F5CE8F" },
    { min: 0, title: "Very tight", color: "#F2A69B" }
  ];

  var states = {};      // code -> { name, score, color, title }
  var selected = null;  // state code clicked on the map

  function showError(el, text) {
    el.textContent = text;
    el.classList.add("on");
  }
  function clearError(el) {
    el.textContent = "";
    el.classList.remove("on");
  }

  /* ---------------------------------------------------------------- the map */

  function paintLegend() {
    var box = $("legend");
    box.innerHTML = "";
    BANDS.forEach(function (b) {
      var row = document.createElement("div");
      var sw = document.createElement("i");
      sw.style.background = b.color;
      row.appendChild(sw);
      row.appendChild(document.createTextNode(b.title));
      box.appendChild(row);
    });
  }

  function selectState(code) {
    var st = states[code];
    if (!st) return;
    selected = code;
    Array.prototype.forEach.call(document.querySelectorAll("#usmap path"), function (p) {
      p.classList.toggle("on", p.getAttribute("data-state") === code);
    });
    $("st-name").textContent = st.name;
    $("st-score").textContent = st.score == null ? "—" : st.score;
    $("st-word").textContent = st.title || "Not reported";
    $("st-note").textContent = "Lending in " + st.name + " reads as " + String(st.title || "not reported").toLowerCase()
      + " today. That is the wider picture, not a decision about you. Scroll down and we will count the banks in our book that serve "
      + st.name + ".";
    var picker = $("home_state");
    if (picker && picker.value !== code) picker.value = code;
  }

  function drawMap(paths) {
    var svg = $("usmap");
    var codes = Object.keys(paths).sort();
    codes.forEach(function (code) {
      var st = states[code];
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", paths[code]);
      p.setAttribute("data-state", code);
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", (st ? st.name : code) + (st && st.score != null ? ", " + st.title : ""));
      /* An inline style, never a fill presentation attribute. The stylesheet
         gives every path a default grey fill so the map has a shape before the
         scores arrive, and a CSS declaration beats a presentation attribute — as
         an attribute the colour sits in the markup, reads correct in review, and
         paints nothing (measured 2026-09-18: all 51 states grey). */
      if (st && st.color) p.style.fill = st.color;
      p.addEventListener("click", function () { selectState(code); });
      p.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectState(code); }
      });
      svg.appendChild(p);
    });
    $("map-skel").style.display = "none";
    svg.style.display = "block";
    paintLegend();
  }

  function fillStatePickers() {
    var codes = Object.keys(states).sort(function (a, b) {
      return states[a].name < states[b].name ? -1 : 1;
    });
    var home = $("home_state");
    var biz = $("business_state");
    home.innerHTML = '<option value="">Choose your state</option>';
    biz.innerHTML = '<option value="">Same state, or no business</option>';
    codes.forEach(function (code) {
      var a = document.createElement("option");
      a.value = code; a.textContent = states[code].name;
      home.appendChild(a);
      var b = document.createElement("option");
      b.value = code; b.textContent = states[code].name;
      biz.appendChild(b);
    });
  }

  function fillScoreBands(bands) {
    var sel = $("score_band");
    sel.innerHTML = '<option value="">Choose one</option>';
    (bands || []).forEach(function (band) {
      var o = document.createElement("option");
      o.value = band;
      o.textContent = band === "Not sure" ? "I am not sure" : band;
      sel.appendChild(o);
    });
  }

  function loadClimate() {
    return fetch("/api/climate", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok === false) throw new Error("climate");
        var nat = d.national || {};
        $("nat-score").textContent = nat.score == null ? "—" : nat.score;
        $("nat-word").textContent = nat.title
          ? "Lending nationally reads as " + String(nat.title).toLowerCase() + " today."
          : "Today's national reading is not available.";
        if (d.as_of) {
          var when = new Date(d.as_of);
          $("nat-asof").textContent = isNaN(when.getTime()) ? "" :
            "Updated " + when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
        (d.states || []).forEach(function (s) {
          states[s.state] = { name: s.name || s.state, score: s.score, color: s.color, title: s.title };
        });
        fillStatePickers();
        return fetch("/climate/us-states-paths.json").then(function (r) { return r.json(); });
      })
      .then(drawMap)
      .catch(function () {
        $("map-skel").style.display = "none";
        $("nat-word").textContent = "Today's reading did not load. The bank count below still works.";
      });
  }

  function loadBook() {
    return fetch("/api/public/climate-match", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok === false) throw new Error("book");
        fillScoreBands(d.score_bands);
        if (d.book_size) {
          $("go-hint").textContent = "No credit check. We will check all "
            + d.book_size.toLocaleString("en-US") + " banks in our book.";
        }
      })
      .catch(function () {
        /* The bands are a nice-to-have; the state and business answers are what
           move the count. Fall back to the same list the CRM uses so the form
           is never a dead control. */
        fillScoreBands(["500-579", "580-649", "650-699", "700-749", "750+", "Not sure"]);
      });
  }

  /* ------------------------------------------------------------ the answer */

  function adTags() {
    var out = {};
    var q = new URLSearchParams(window.location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      var v = q.get(k);
      if (v) out[k] = v;
    });
    return out;
  }

  var lastEmail = "";
  var lastName = "";

  function paintAnswer(d) {
    var n = d.count || 0;
    $("count").textContent = n.toLocaleString("en-US");
    $("count-lbl").textContent = n === 1
      ? "bank in our book serves your state today."
      : "banks in our book serve your state today.";

    var lanes = $("lanes");
    lanes.innerHTML = "";
    var rows = [["National banks", d.lanes.national]];
    if (d.lanes.home.state) rows.push(["Local to " + d.lanes.home.state, d.lanes.home.count]);
    if (d.lanes.business.state) rows.push(["Local to " + d.lanes.business.state, d.lanes.business.count]);
    rows.forEach(function (r) {
      var box = document.createElement("div");
      box.className = "lane";
      var v = document.createElement("div");
      v.className = "v"; v.textContent = (r[1] || 0).toLocaleString("en-US");
      var k = document.createElement("div");
      k.className = "k"; k.textContent = r[0];
      box.appendChild(v); box.appendChild(k);
      lanes.appendChild(box);
    });

    var list = $("banks");
    list.innerHTML = "";
    (d.teaser || []).forEach(function (b) {
      var li = document.createElement("li");
      if (b.logo_path) {
        var img = document.createElement("img");
        img.src = b.logo_path; img.alt = "";
        img.addEventListener("error", function () { img.remove(); });
        li.appendChild(img);
      }
      var nm = document.createElement("span");
      nm.textContent = b.name;
      li.appendChild(nm);
      list.appendChild(li);
    });

    var shown = (d.teaser || []).length;
    var rest = Math.max(0, n - shown);
    $("locked-n").textContent = rest === 0
      ? "That is the whole list for your state."
      : rest.toLocaleString("en-US") + " more names are in the full list.";
    $("locked").style.display = rest === 0 ? "none" : "block";

    $("answer").classList.add("on");
    $("answer").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submit(e) {
    e.preventDefault();
    var err = $("err");
    clearError(err);
    var homeState = $("home_state").value;
    var name = $("name").value.trim();
    var email = $("email").value.trim();
    var phone = $("phone").value.trim();
    if (!homeState) return showError(err, "Pick the state you live in first.");
    if (!name) return showError(err, "We need your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(err, "That email address does not look right.");
    if (!phone) return showError(err, "We need a phone number so an advisor can reach you.");

    lastEmail = email;
    lastName = name;
    var go = $("go");
    var label = go.textContent;
    go.disabled = true;
    go.textContent = "Counting…";

    var body = {
      home_state: homeState,
      business_state: $("business_state").value || null,
      has_business: $("has_business").value || null,
      score_band: $("score_band").value || null,
      name: name,
      email: email,
      phone: phone
    };
    var tags = adTags();
    for (var k in tags) body[k] = tags[k];

    fetch("/api/public/climate-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok === false) throw new Error(d && d.error ? d.error : "match");
        paintAnswer(d);
        if (!selected) selectState(homeState);
      })
      .catch(function () {
        showError(err, "We could not reach the bank book just then. Try that button once more.");
      })
      .then(function () {
        go.disabled = false;
        go.textContent = label;
      });
  }

  function unlock() {
    var err = $("unlock-err");
    clearError(err);
    var btn = $("unlock");
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Opening checkout…";
    var parts = lastName.split(/\s+/);
    fetch("/api/public/optimize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        first_name: parts[0] || "",
        last_name: parts.slice(1).join(" "),
        email: lastEmail,
        phone: $("phone").value.trim()
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.checkoutUrl) throw new Error("checkout");
        window.location.href = d.checkoutUrl;
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = label;
        showError(err, "Checkout did not open. Call us at support@fundhub.ai and we will send the link.");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadClimate();
    loadBook();
    $("magnet").addEventListener("submit", submit);
    $("unlock").addEventListener("click", unlock);
    $("home_state").addEventListener("change", function () {
      if (this.value) selectState(this.value);
    });
  });
})();
