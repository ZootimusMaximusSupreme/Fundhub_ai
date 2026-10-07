/* Yesdoor pre-screen funnel: 1) name + email  2) address + permission  3) results.
   No Social Security number anywhere. The permission text and its version string are
   saved with the renter (spec: consent captured once, covers re-checks). */
(function () {
  "use strict";
  var YD = window.YD; var ui = YD.ui;
  ui.mountChrome({ active: "prescreen" });
  var source = ui.captureSource();

  var P = ui.params();
  var ctx = { listing: P.listing || "", city: P.city || "", beds: P.beds || "", maxRent: P.maxRent || "" };
  var S = { step: 1, lead: null, token: null, address: null, result: null, needDob: false, sample: null };
  var stepEl = document.getElementById("step");
  var progressEl = document.getElementById("progress");
  var LABELS = ["Who you are", "Your address", "Your results"];

  function progress() {
    progressEl.innerHTML = LABELS.map(function (l, i) {
      var n = i + 1;
      return '<li' + (n === S.step ? ' aria-current="step"' : "") + (n < S.step ? ' class="done"' : "") + ">Step " + n + ": " + l + "</li>";
    }).join("");
  }
  function focusHeading() { var h = stepEl.querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }
  function setErr(field, msg) {
    var err = document.getElementById(field.id + "-err");
    if (msg) { field.setAttribute("aria-invalid", "true"); if (err) { err.textContent = msg; err.hidden = false; } }
    else { field.removeAttribute("aria-invalid"); if (err) err.hidden = true; }
  }
  function fieldHtml(id, label, attrs, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" id="' + id + '" name="' + id + '" ' + (attrs || "") + ' aria-describedby="' + id + '-err">' +
      (hint ? '<span class="hint">' + hint + "</span>" : "") + '<div class="field-error" id="' + id + '-err" role="alert" hidden></div></div>';
  }

  /* ------------------------------------------------------------ step 1 */
  function step1() {
    S.step = 1; progress();
    stepEl.innerHTML = '<div class="card stack" style="max-width:640px"><div><h1>See if you&rsquo;re approved</h1>' +
      '<p class="muted">Step 1 of 3. It takes about 60 seconds and is free. We do not ask for your Social Security number.</p><p id="ctx-line" class="caption"></p></div>' +
      '<div id="sample-box"></div>' +
      '<form id="f1" novalidate class="stack"><div class="form-grid two">' +
      fieldHtml("first", "First name", 'type="text" autocomplete="given-name" required') + fieldHtml("last", "Last name", 'type="text" autocomplete="family-name" required') + "</div>" +
      fieldHtml("email", "Email address", 'type="email" autocomplete="email" required', "We send your results and tour details here.") +
      '<div><button class="btn" type="submit" id="go1">Continue</button></div></form></div>';
    focusHeading();
    var f = document.getElementById("f1");
    if (S.lead) { f.first.value = S.lead.firstName; f.last.value = S.lead.lastName; f.email.value = S.lead.email; }

    if (ctx.listing) {
      YD.api.listing(ctx.listing).then(function (r) {
        var l = r.listing; var line = document.getElementById("ctx-line");
        if (line) line.textContent = "Checking for: " + ui.bedsLabel(l.beds) + " at " + l.buildingName + " (" + ui.money(l.rentCents) + " a month)";
      }, function () { /* the page works without it */ });
    }
    YD.api.ready().then(function () {
      if (!YD.api.isDemo() || !YD.demo) return;
      var box = document.getElementById("sample-box"); if (!box) return;
      var list = YD.demo.sampleRenters();
      box.innerHTML = '<div class="group"><div class="field"><label for="sample">Demo only: try a sample renter</label><select class="input" id="sample"><option value="">I will type my own details</option>' +
        list.map(function (r, i) { return '<option value="' + i + '">' + ui.esc(r.firstName + " " + r.lastName) + " (" + (r.lane === "second_chance" ? "Second Chance" : "Verified") + ")</option>"; }).join("") +
        '</select><span class="hint" id="sample-story">Each sample is one made-up person with one credit file. Nothing here is real.</span></div></div>';
      document.getElementById("sample").addEventListener("change", function () {
        var r = list[this.value];
        if (!r) { S.sample = null; document.getElementById("sample-story").textContent = "Each sample is one made-up person with one credit file. Nothing here is real."; return; }
        S.sample = r; f.first.value = r.firstName; f.last.value = r.lastName; f.email.value = r.email;
        document.getElementById("sample-story").textContent = r.story;
      });
    });

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true;
      setErr(f.first, f.first.value.trim() ? "" : "Enter your first name."); if (!f.first.value.trim()) ok = false;
      setErr(f.last, f.last.value.trim() ? "" : "Enter your last name."); if (!f.last.value.trim()) ok = false;
      var emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim());
      setErr(f.email, emailOk ? "" : "Enter an email address like name@example.com."); if (!emailOk) ok = false;
      if (!ok) { var bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
      var btn = document.getElementById("go1"); ui.busy(btn, true);
      S.lead = { firstName: f.first.value.trim(), lastName: f.last.value.trim(), email: f.email.value.trim().toLowerCase() };
      YD.api.lead({ firstName: S.lead.firstName, lastName: S.lead.lastName, email: S.lead.email, source: source }).then(function (res) {
        S.token = res.renterToken;
        YD.api.rememberRenter({ token: res.renterToken, email: S.lead.email, firstName: S.lead.firstName });
        if (S.sample && S.sample.address) S.address = S.sample.address;
        step2();
      }, function (err) {
        ui.busy(btn, false);
        setErr(f.email, ui.errMessage(err)); f.email.focus();
      });
    });
  }

  /* ------------------------------------------------------------ step 2 */
  function step2() {
    S.step = 2; progress();
    stepEl.innerHTML = '<div class="card stack" style="max-width:640px"><div><h1>Where do you live now?</h1>' +
      '<p class="muted">Step 2 of 3. We use your name and current address to find your file. Still no Social Security number.</p></div>' +
      '<form id="f2" novalidate class="stack">' +
      fieldHtml("line1", "Street address", 'type="text" autocomplete="address-line1" required') +
      '<div class="form-grid three">' + fieldHtml("city", "City", 'type="text" autocomplete="address-level2" required') +
      fieldHtml("state", "State", 'type="text" maxlength="2" autocomplete="address-level1" required value="AZ"') +
      fieldHtml("zip", "ZIP code", 'type="text" inputmode="numeric" maxlength="5" autocomplete="postal-code" required') + "</div>" +
      '<div id="dob-box" hidden>' + fieldHtml("dob", "Date of birth", 'type="date" autocomplete="bday"', "Only needed when we cannot find your file by name and address.") + "</div>" +
      '<div class="group stack"><h2>Your permission</h2><p id="consent-text" class="prose">' + ui.esc(ui.consent.text) + '</p><p class="caption">Permission wording version: <span class="num">' + ui.esc(ui.consent.version) + "</span></p>" +
      '<div class="check"><input type="checkbox" id="consent" aria-describedby="consent-err"><label for="consent">I agree to the screening and re-check permission above.</label></div>' +
      '<div class="field-error" id="consent-err" role="alert" hidden></div></div>' +
      '<div id="f2-msg" class="notice warn" role="status" hidden></div>' +
      '<div class="row"><button class="btn" type="submit" id="go2">Run my 60-second check</button><button class="btn-secondary" type="button" id="back1">Back</button></div></form></div>';
    focusHeading();
    var f = document.getElementById("f2");
    if (S.address) { f.line1.value = S.address.line1 || ""; f.city.value = S.address.city || ""; f.state.value = S.address.state || "AZ"; f.zip.value = S.address.zip || ""; }
    document.getElementById("back1").addEventListener("click", step1);

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true;
      ["line1", "city"].forEach(function (k) { var bad = !f[k].value.trim(); setErr(f[k], bad ? "This is needed to find your file." : ""); if (bad) ok = false; });
      var stBad = !/^[A-Za-z]{2}$/.test(f.state.value.trim()); setErr(f.state, stBad ? "Use the 2-letter state, like AZ." : ""); if (stBad) ok = false;
      var zipBad = !/^\d{5}$/.test(f.zip.value.trim()); setErr(f.zip, zipBad ? "Enter a 5-digit ZIP code." : ""); if (zipBad) ok = false;
      var box = document.getElementById("consent"); var cerr = document.getElementById("consent-err");
      if (!box.checked) { cerr.textContent = "Check the box to continue. We cannot run the check without your permission."; cerr.hidden = false; box.setAttribute("aria-invalid", "true"); ok = false; }
      else { cerr.hidden = true; box.removeAttribute("aria-invalid"); }
      var dobBox = document.getElementById("dob-box");
      if (!dobBox.hidden && !f.dob.value) { setErr(f.dob, "Add your date of birth so we can find your file."); ok = false; }
      if (!ok) { var bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
      S.address = { line1: f.line1.value.trim(), city: f.city.value.trim(), state: f.state.value.trim().toUpperCase(), zip: f.zip.value.trim() };
      var btn = document.getElementById("go2"); ui.busy(btn, true);
      YD.api.prescreen({
        email: S.lead.email, address: S.address, dob: dobBox.hidden ? undefined : f.dob.value,
        consent: { text: ui.consent.text, version: ui.consent.version, checked: true },
        listingId: ctx.listing || undefined, city: ctx.city || undefined, beds: ctx.beds || undefined, maxRent: ctx.maxRent || undefined
      }).then(function (res) {
        ui.busy(btn, false);
        if (res.status === "no_match") {
          dobBox.hidden = false; var m = document.getElementById("f2-msg"); m.textContent = res.message || "We could not find your file. Add your date of birth and try again."; m.hidden = false;
          btn.textContent = "Try again with my date of birth"; btn.setAttribute("data-label", btn.textContent); f.dob.focus(); return;
        }
        S.result = res; step3();
      }, function (err) {
        ui.busy(btn, false);
        var m = document.getElementById("f2-msg"); m.textContent = ui.errMessage(err); m.hidden = false; m.setAttribute("role", "alert");
      });
    });
  }

  /* ------------------------------------------------------------ step 3 */
  function rowHtml(m, primary) {
    var picked = ctx.listing && m.listingId === ctx.listing;
    var reasons = m.reasons || [];
    var why = reasons.length
      ? '<details class="why"><summary>Why this answer</summary><ul class="reasons">' + reasons.map(function (r) { return "<li>" + ui.esc(r.reason) + "</li>"; }).join("") + "</ul></details>"
      : "";
    var book = m.result === "no" ? "" :
      '<a class="' + (primary ? "btn" : "btn-secondary") + '" href="book.html?building=' + encodeURIComponent(m.buildingId) + "&amp;listing=" + encodeURIComponent(m.listingId) +
      '" aria-label="Book a tour at ' + ui.esc(m.buildingName) + '">Book a tour</a>';
    return '<li class="result-row" style="list-style:none"><div><strong>' + ui.esc(m.buildingName) + "</strong>" + (picked ? ' <span class="tag lane">The apartment you picked</span>' : "") +
      '<div class="muted">' + ui.esc(ui.bedsLabel(m.beds)) + " · " + ui.money(m.rentCents) + " a month · " + ui.esc(m.city) + "</div>" +
      (m.rulesConfirmedAt ? '<div class="caption">Building rules confirmed ' + ui.esc(ui.date(m.rulesConfirmedAt)) + (m.rulesStale ? " (a while ago, so the best answer is likely)" : "") + "</div>" : "") +
      (m.isSample ? ui.sampleTag("Sample listing") : "") + why + "</div><div>" + ui.statusChip(m.result) + "</div><div>" + book + "</div></li>";
  }

  function step3() {
    S.step = 3; progress();
    var r = S.result;
    var ms = r.matches || [];
    var approved = ms.filter(function (m) { return m.result === "approved"; });
    var likely = ms.filter(function (m) { return m.result === "likely"; });
    var no = ms.filter(function (m) { return m.result === "no"; });
    var verified = !!r.incomeVerified;
    var headline; var caption;
    if (verified && approved.length && r.approvedMaxRentCents) {
      headline = "Approved up to " + ui.money(r.approvedMaxRentCents) + " rent";
      caption = "A month. Worked out from your verified income, credit and background, at " + ui.plural(approved.length, "building", "buildings") + " that will approve you today.";
    } else if (verified && likely.length) {
      headline = "Likely approved up to " + ui.money(r.approvedMaxRentCents) + " rent";
      caption = "A month. It is likely, not certain, because a building still needs to confirm a rule or you are close to a limit.";
    } else if (!verified && (approved.length || likely.length)) {
      headline = "Likely approved at " + ui.plural(approved.length + likely.length, "building", "buildings");
      caption = "Link your bank to turn likely into approved and see your top rent.";
    } else {
      headline = "No building in this search will approve you today";
      caption = "That is useful to know before paying a single application fee.";
    }
    var second = r.lane === "second_chance";
    var primaryDone = false;
    function rows(list) {
      return list.map(function (m) {
        var primary = !primaryDone && verified && m.result !== "no"; if (primary) primaryDone = true;
        return rowHtml(m, primary);
      }).join("");
    }
    var html = '<div class="stack">' +
      '<div class="card stack"><div><span class="eyebrow">Step 3 of 3 · Your results</span><h1 class="big-number" style="margin-top:8px">' + ui.esc(headline) + '</h1><p class="muted prose">' + ui.esc(caption) + "</p></div>" +
      '<div class="row"><span class="tag lane">' + ui.esc(ui.laneName(r.lane)) + "</span>" + (ms[0] && ms[0].isSample ? ui.sampleTag("Sample result") : "") + "</div>" +
      (second
        ? '<p class="prose"><strong>You are on Yesdoor Second Chance.</strong> We only show buildings whose rules fit your whole story, so you do not pay application fees just to hear no.</p>'
        : '<p class="prose"><strong>You are on Yesdoor Verified.</strong> You get fast tours and first pick of specials, and buildings waive the application fee where they can.</p>') +
      (r.widenedSearch ? '<div class="notice">Nothing in your filters fit, so we searched all of Phoenix, Tempe, Scottsdale, Mesa and Chandler.</div>' : "") +
      ((r.notices || []).map(function (n) { return '<div class="notice">' + ui.esc(n.text) + "</div>"; }).join("")) + "</div>";

    if (!verified) {
      html += '<div class="card stack" id="income-card"><h2>Link your bank to lock in your number</h2>' +
        '<p class="prose">We never take your word on income, and we never ask for pay stubs. Linking your bank lets us confirm your income from repeat deposits. We cannot move money.</p>' +
        '<div><button class="btn" type="button" id="link-bank">Link my bank</button></div><p class="caption">This preview uses a sandbox bank link. No real account is touched.</p></div>';
      primaryDone = true; // the one filled button on this screen is the bank link
    }

    if (approved.length) html += '<section class="card" aria-labelledby="ap-h"><h2 id="ap-h">Approved (' + approved.length + ')</h2><ul style="padding:0;margin:0">' + rows(approved) + "</ul></section>";
    if (likely.length) html += '<section class="card" aria-labelledby="lk-h"><h2 id="lk-h">Likely (' + likely.length + ')</h2><ul style="padding:0;margin:0">' + rows(likely) + "</ul></section>";
    if (!approved.length && !likely.length) {
      html += ui.emptyState("Nothing to book yet", second
        ? "Second Chance means we keep looking. As buildings join and your income or file changes, we re-check for you and email you if something opens up."
        : "Try a higher rent or a different city, or open the full list of apartments.", '<a class="btn-secondary" href="search.html">Find apartments</a>');
    }
    if (no.length) {
      html += '<details class="card"><summary><strong>Not this one (' + no.length + ")</strong> <span class=\"caption\">Buildings that would say no today, and why.</span></summary>" +
        '<ul style="padding:0;margin:16px 0 0">' + no.map(function (m) { return rowHtml(m, false); }).join("") + "</ul></details>";
    }
    html += '<section class="card stack" aria-labelledby="next-h"><h2 id="next-h">Your risk-free next step</h2>' +
      "<p class=\"prose\">Pick a tour time. It is free. We register you with the building so the tour counts, and if a building says no after we said approved, we find you another one right away and refund the application fee where the building does not waive it.</p></section>";
    if (second) {
      html += '<section class="card stack" aria-labelledby="help-h"><h2 id="help-h">If a building says no</h2>' +
        "<p class=\"prose\">You will see backup buildings you already clear, in the same email and in My Yesdoor, so you are never left with nothing.</p>" +
        '<div class="group"><h3>Denial help <span class="tag">Placeholder</span></h3><p class="muted">A partner offer for denial help, credit repair and tenant lawyers will show up here for renters who get denied.</p></div></section>';
    }
    html += '<p><a href="renter.html">Go to My Yesdoor</a> to see these results again, your tours and your bookings.</p></div>';
    stepEl.innerHTML = html;
    var h1 = stepEl.querySelector("h1"); if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus(); }

    var lb = document.getElementById("link-bank");
    if (lb) lb.addEventListener("click", function () {
      ui.busy(lb, true);
      YD.api.meIncome({ publicToken: "sandbox-public-token", renterToken: S.token, listingId: ctx.listing || undefined, city: ctx.city || undefined, beds: ctx.beds || undefined, maxRent: ctx.maxRent || undefined }).then(function (res) {
        S.result.incomeVerified = true;
        if (res.approvedMaxRentCents !== undefined) S.result.approvedMaxRentCents = res.approvedMaxRentCents;
        if (res.matches && res.matches.length) S.result.matches = res.matches;
        if (res.lane) S.result.lane = res.lane;
        ui.toast("Income verified. Your results are updated.");
        step3();
      }, function (err) { ui.busy(lb, false); ui.toast(ui.errMessage(err)); });
    });
  }

  step1();
})();
