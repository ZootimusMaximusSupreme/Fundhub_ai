(function () {
  /* Where the numbers go. Cross-site on purpose — see the header. */
  var ENDPOINT = "https://fundhub.ai/api/public/vsl-watch";

  /* Budget for one page view. Never stream. */
  var MAX_SENDS = 8;      /* hard ceiling on messages per video, per page view */
  var FLUSH_AT  = 60;     /* send once this many unsent rows have piled up      */
  var MAX_ROWS  = 200;    /* seconds in one message. The receiver caps it at 240
                             (src/vsl/watch-beacon.mjs:77) — stay under it      */

  var ATTRIBUTION_STORE = "fh_attribution";  /* written by 06-utm-hidden-fields */
  var VISITOR_STORE     = "fh_visitor_v1";   /* this browser, on this device    */

  /* ══ PURE LOGIC START — sliced out and tested by
        src/ads/vsl-watch-fragment.test.mjs. Do not rename these two functions
        and do not move these markers; the test finds them by these lines. ══ */

  /* Which whole second, if any, should be written down right now.
     timeupdate fires about four times a second. Writing all of them would be
     four times the data for none of the meaning, so one row per whole second is
     the most we ever keep. Going backwards is never a sample — a jump backwards
     is handled as a rewind, and lastSecond is cleared so the re-watch records
     from where it lands. */
  function fhShouldSample(lastSecond, currentTime) {
    if (typeof currentTime !== "number") return null;
    if (!isFinite(currentTime) || currentTime < 0) return null;
    var second = Math.floor(currentTime);
    if (lastSecond === null || lastSecond === undefined) return second;
    if (typeof lastSecond !== "number" || !isFinite(lastSecond)) return second;
    if (second <= lastSecond) return null;
    return second;
  }

  /* What a jump means. Told apart by where it came from and where it landed.
     restartArmed is true only in the moment after the person tapped for sound,
     because the page's own unmute code sets currentTime back to 0. That is the
     same person starting over with the sound on, not a rewind, and calling it a
     rewind makes the opening look twice as well watched as it is.
     A move of less than three quarters of a second is the browser nudging
     itself, not a person, and is nothing. */
  function fhClassifySeek(fromSec, toSec, restartArmed) {
    if (typeof fromSec !== "number" || typeof toSec !== "number") return null;
    if (!isFinite(fromSec) || !isFinite(toSec)) return null;
    if (restartArmed && toSec < 1.5 && fromSec >= 1.5) return "restart";
    var moved = toSec - fromSec;
    if (Math.abs(moved) < 0.75) return null;
    return moved < 0 ? "rewind" : "skip";
  }

  /* ══ PURE LOGIC END ══ */

  function randomKey() {
    /* Tied to nobody. Just enough to tell two viewings apart. It means nothing
       outside this page and it is thrown away when the tab closes. */
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var a = new Uint8Array(16), out = "", i;
        window.crypto.getRandomValues(a);
        for (i = 0; i < a.length; i++) out += (a[i] + 256).toString(16).slice(1);
        return out;
      }
    } catch (e) {}
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2, 12);
  }

  function visitorId() {
    /* One random string per browser, kept on the visitor's own device. It is
       tied to no person and to no way of contacting one, and it cannot be
       turned into either — it only lets two page views be recognised as the
       same browser.
       db/migrations/379_vsl_watch.sql:436 requires 16 to 64 characters of
       letters, digits, dash or underscore, and randomKey() gives exactly that.
       Storage blocked? A fresh one is made and nothing breaks — that viewing
       just looks like a new browser. */
    try {
      var found = localStorage.getItem(VISITOR_STORE);
      if (found && /^[A-Za-z0-9_-]{16,64}$/.test(found)) return found;
      var made = randomKey();
      localStorage.setItem(VISITOR_STORE, made);
      return made;
    } catch (e) { return randomKey(); }
  }

  function attribution() {
    /* ONE SOURCE OF TRUTH. 06-utm-hidden-fields.html already read the address
       bar and saved it, first touch wins. This does not read the address bar
       again — two readers would drift apart the day one of them changed. */
    try {
      var raw = sessionStorage.getItem(ATTRIBUTION_STORE);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) { return null; }
  }

  function referrerOrigin() {
    /* THE SITE THEY CAME FROM, AND NOTHING ELSE. A whole referring link can
       carry somebody's search terms or a click id in its query string, and none
       of that belongs here. The receiver refuses anything that is not an
       http:// or https:// address (src/vsl/watch-beacon.mjs:158-165), so this
       hands back scheme and host and stops there. */
    try {
      var raw = document.referrer;
      if (!raw) {
        var saved = attribution();
        var host = saved && saved.referrer_domain;
        return host ? ("https://" + String(host).split("/")[0]).slice(0, 200) : null;
      }
      var m = String(raw).match(/^https?:\/\/[^\/?#]+/i);
      return m ? m[0].slice(0, 200) : null;
    } catch (e) { return null; }
  }

  function deviceHint() {
    /* A GUESS FROM THE WIDTH OF THE WINDOW, and nothing cleverer. The receiver
       accepts only these three words (src/vsl/watch-beacon.mjs:90). A tablet
       held upright and a small laptop window look the same to this and always
       will — it is a rough sort, not a fact about the device. */
    try {
      var w = window.innerWidth ||
        (document.documentElement && document.documentElement.clientWidth) || 0;
      if (!w) return null;
      if (w < 768) return "mobile";
      if (w < 1024) return "tablet";
      return "desktop";
    } catch (e) { return null; }
  }

  function pageUrl() {
    /* THE PAGE, AND NOTHING ELSE. Everything after a # is dropped, and so is
       everything after a ? — for the same reason the referring link is cut
       down: an ad platform bolts its own tracking code onto the end of every
       link it sends people through, and that code identifies one person's click.
       It has no business travelling here, and 379 keeps the FIRST address it
       ever sees forever, so anything that slips in can never be cleaned up
       later. Nothing is lost by cutting it: the ad is already sent on its own,
       as utm_content.
       The receiver refuses anything that is not an http:// or https:// address
       (src/vsl/watch-beacon.mjs:158-165). */
    try {
      var here = location.href.split("#")[0].split("?")[0];
      return /^https?:\/\//i.test(here) ? here.slice(0, 500) : null;
    } catch (e) { return null; }
  }

  function videoPathOf(url) {
    /* "https://fundhub.ai/funnel/vsl.mp4" becomes "funnel/vsl.mp4" — the path
       under the site, with no leading slash, lowercased. That is exactly the
       shape the receiver and the table both demand
       (src/vsl/watch-beacon.mjs:88, db/migrations/379_vsl_watch.sql:430).
       Anything that does not fit comes back empty rather than mangled: a
       refused beacon is better than a viewing filed under a made-up name. */
    if (!url) return null;
    try {
      var clean = String(url).split("#")[0].split("?")[0];
      var scheme = clean.indexOf("://");
      if (scheme > -1) {
        var rest = clean.slice(scheme + 3);
        var slash = rest.indexOf("/");
        clean = slash > -1 ? rest.slice(slash + 1) : "";
      }
      clean = clean.replace(/^\/+/, "").toLowerCase();
      if (!clean || clean.indexOf("..") > -1) return null;
      return /^[a-z0-9][a-z0-9._\/-]{0,119}$/.test(clean) ? clean : null;
    } catch (e) { return null; }
  }

  function track(video) {
    if (!video || video.__fhWatch) return;
    video.__fhWatch = true;

    var visitorKey  = visitorId();
    var sessionKey  = randomKey();
    var videoKey    = videoPathOf(video.currentSrc || video.src);
    var rows        = [];      /* unsent event rows */
    var sends       = 0;
    var closed      = false;

    var playIndex   = 0;       /* 0 until something actually plays */
    var lastSecond  = null;    /* last whole second written down, this play */
    var seekFrom    = null;    /* where a seek started */
    var furthest    = null;    /* furthest second reached, whole video */
    var furthestExact = null;  /* the same, to the fraction of a second */
    /* THE SECOND HIGH-WATER MARK, and the only number here that is safe to
       quote as "a person chose to watch and got this far".
       It starts EMPTY and it is NEVER seeded from furthestExact. Seeding it
       would import the silent pass's position and recreate the exact lie this
       exists to prevent (src/vsl/watch-beacon.mjs:78-84). Empty means "they
       never tapped for sound". 0 means "they tapped and watched nothing". */
    var furthestUnmutedExact = null;
    var metadataSeen = false;  /* the browser has the file and could play it */
    var lengthSec   = null;    /* the file's length, once the browser says */
    var everUnmuted = null;    /* null = never heard either way */
    var everPlayed  = false;
    var completed   = false;
    var justEnded   = false;
    var restartArmed = false;  /* armed by the tap for sound */
    var armedTicks  = 0;       /* how long we keep expecting the restart */

    /* Counted HERE, not worked out from the events list. The events list is
       capped and is emptied after every send, so counting from it would lose
       every jump that happened before the last message went out. */
    var replays     = 0;       /* started again after it reached the end */
    var rewinds     = 0;
    var skips       = 0;
    var sampleTotal = 0;       /* every position sample, repeats included */

    /* ── writing down ───────────────────────────────────────────────────── */

    /* mark() records one moment. The DATABASE keeps a plain set of seconds per
       viewing and merges every message into it, so what travels is a list of
       numbers and nothing else. The name of what happened is counted here
       instead — see the counters above. */
    function mark(second) {
      if (typeof second !== "number" || !isFinite(second) || second < 0) return;
      if (furthestExact === null || second > furthestExact) furthestExact = second;
      /* The second mark only ever moves once the tap has already happened.
         everUnmuted is set to true by the volumechange handler at the moment of
         the tap, and the page's own code sends the video back to 0 in the same
         breath, so the first thing this can record is the restart. Nothing from
         before the tap can reach it. */
      if (everUnmuted === true &&
          (furthestUnmutedExact === null || second > furthestUnmutedExact)) {
        furthestUnmutedExact = second;
      }
      var whole = Math.floor(second);
      if (furthest === null || whole > furthest) furthest = whole;
      if (rows.length < MAX_ROWS && rows.indexOf(whole) === -1) rows.push(whole);
      if (rows.length >= FLUSH_AT) send("flush");
    }

    function startNewPlay(second) {
      playIndex = playIndex + 1;
      lastSecond = null;
      everPlayed = true;
      mark(second);
    }

    function currentTimeOf() {
      try {
        var t = video.currentTime;
        return (typeof t === "number" && isFinite(t) && t >= 0) ? t : null;
      } catch (e) { return null; }
    }

    /* ── what gets sent ─────────────────────────────────────────────────── */

    function payload(kind) {
      var final = (kind === "close");

      /* NULL MEANS "WE DO NOT KNOW" AND IT HAS TO SURVIVE. A "no" is only
         honest once the viewing is over. Until the closing message, anything we
         have not seen yet goes as empty, never as false and never as 0. The
         receiver treats null and a missing key the same way and stores neither
         as a zero (src/vsl/watch-beacon.mjs:120-128). */
      var unmuted = everUnmuted;
      if (unmuted === null && final && everPlayed) {
        try { unmuted = !(video.muted || video.volume === 0); } catch (e) { unmuted = null; }
      }

      /* "The browser refused to start it" is only claimed when the browser had
         the file ready, never played it, AND the player is still sitting there
         stopped at the moment they leave. Once stored it can never be taken
         back (379's trigger keeps a true), so a guess here is permanent, and
         the third check is what keeps a player that IS running from being
         filed as blocked just because we joined it late.
         Residual risk, stated: somebody who closes the tab in the half second
         between the file being ready and the video starting is still counted as
         blocked, because a player about to start looks exactly like one that
         was refused. There is no way to tell those two apart from in here. */
      var blocked = null;
      if (final) {
        var stopped = true;
        try { stopped = !!video.paused; } catch (e) { stopped = true; }
        blocked = (metadataSeen && !everPlayed && stopped) ? true : (everPlayed ? false : null);
      }

      var ad = null;
      try { var at = attribution(); ad = (at && at.utm_content) || null; } catch (e) { ad = null; }

      return {
        /* The three the receiver refuses to work without. */
        v:   videoKey,                    /* "funnel/vsl.mp4" */
        vid: visitorKey,                  /* this browser. Not a person. */
        sid: sessionKey,                  /* this one viewing */

        dur: lengthSec,                   /* empty until the browser says */
        pos: furthestExact,               /* empty when nothing ever played */
        /* EMPTY WHEN THEY NEVER TAPPED FOR SOUND, and empty is the right
           answer for those people forever. Never 0 for them — 0 is reserved
           for somebody who did tap and then watched none of it. */
        pos_unmuted: furthestUnmutedExact,

        unmuted: unmuted,
        finished: completed ? true : (final ? false : null),
        blocked: blocked,

        replays: everPlayed ? replays : null,
        rewinds: everPlayed ? rewinds : null,
        skips:   everPlayed ? skips   : null,

        utm_content: ad,                  /* raw. The database reads the number out */
        page: pageUrl(),
        ref:  referrerOrigin(),
        device: deviceHint(),
        /* True when this browser says it is automated. The server decides
           person or agent. This flag is not a name the page can pick. */
        wd: typeof navigator !== "undefined" && navigator.webdriver === true,

        samples: rows.length ? rows.slice(0, MAX_ROWS) : null,
        /* A RUNNING TOTAL for the whole viewing, not this message's count.
           The database keeps the larger of the two, so a message that arrives
           twice cannot double it. Empty until something has played — a 0 here
           before the video starts would read as a measured zero. */
        n: everPlayed ? sampleTotal : null
      };
    }

    function send(kind) {
      try {
        if (sends >= MAX_SENDS) return;
        if (kind !== "open" && kind !== "close" && rows.length === 0) return;
        var body = JSON.stringify(payload(kind));
        var delivered = false;

        /* sendBeacon survives the page closing. A plain fetch usually does not.
           The Blob type is text/plain ON PURPOSE — it keeps this a "simple"
           cross-site request, so the browser sends it with no permission check
           first. See the header: the handler must JSON.parse the raw body. */
        try {
          if (navigator && typeof navigator.sendBeacon === "function") {
            delivered = navigator.sendBeacon(
              ENDPOINT,
              new Blob([body], { type: "text/plain;charset=UTF-8" })
            );
          }
        } catch (e) { delivered = false; }

        if (!delivered) {
          try {
            fetch(ENDPOINT, {
              method: "POST",
              body: body,
              mode: "cors",
              credentials: "omit",
              cache: "no-store",
              keepalive: true,
              headers: { "Content-Type": "text/plain;charset=UTF-8" }
            })["catch"](function () {});
          } catch (e) {}
        }

        sends = sends + 1;
        /* Cleared whether or not it landed. sendBeacon only says it queued the
           message, never that it arrived, so there is nothing to wait for.
           Re-sending would cost bytes for no gain: the database merges the
           seconds into one set per viewing, so anything that DID land is
           already there, and anything that did not is gone either way. */
        rows = [];
      } catch (e) {}
    }

    function closeOnce() {
      try {
        if (closed) return;
        closed = true;
        send("close");
      } catch (e) {}
    }

    /* ── listening to the video, and to nothing else ─────────────────────── */

    function on(name, fn) {
      try {
        video.addEventListener(name, function (ev) {
          try { fn(ev); } catch (e) {}   /* never throw into the page */
        }, false);
      } catch (e) {}
    }

    on("loadedmetadata", function () {
      metadataSeen = true;
      var d = video.duration;
      if (typeof d === "number" && isFinite(d) && d > 0) lengthSec = d;
      var k = videoPathOf(video.currentSrc || video.src);
      if (k) videoKey = k;
    });

    on("loadstart", function () {
      /* slo-03-thank-you.html swaps one player between two films
         (clickfunnels-fragments/slo/slo-03-thank-you.html:202). A different
         file is a different viewing. Close the old one and start clean. */
      var k = videoPathOf(video.currentSrc || video.src);
      if (!k || k === videoKey) return;
      if (sends > 0 || rows.length > 0) closeOnce();
      videoKey = k; sessionKey = randomKey(); rows = []; sends = 0; closed = false;
      playIndex = 0; lastSecond = null; furthest = null; lengthSec = null;
      everUnmuted = null; everPlayed = false;
      completed = false; justEnded = false;
      restartArmed = false; armedTicks = 0;
      replays = 0; rewinds = 0; skips = 0; sampleTotal = 0;
      furthestExact = null; furthestUnmutedExact = null; metadataSeen = false;
      send("open");
    });

    on("play", function () {
      if (playIndex === 0) { startNewPlay(currentTimeOf()); return; }
      /* THE FLAG IS LEFT ARMED ON PURPOSE. When somebody taps for sound while
         the video is sitting still — which is what happens when the browser
         refused to autoplay, and whenever they paused first — the browser fires
         play BEFORE seeked, because seeked waits for the picture to arrive.
         Switching the flag off here left seeked to call that jump back to zero
         a rewind, and the whole point of this file is that it never does.
         So seeked switches it off itself, and the two-tick timeout below
         switches it off if no restart ever comes. startNewPlay running twice
         costs nothing: the seconds list throws away repeats. */
      if (restartArmed) { startNewPlay(currentTimeOf()); return; }
      if (justEnded)    { justEnded = false; replays = replays + 1; startNewPlay(currentTimeOf()); return; }
      mark(currentTimeOf());
    });

    on("pause", function () {
      if (video.ended) return;            /* the end already says it ended */
      mark(currentTimeOf());
    });

    on("waiting", function () { mark(currentTimeOf()); });

    on("ended", function () {
      completed = true;
      justEnded = true;
      mark(currentTimeOf());
    });

    on("timeupdate", function () {
      /* THE CLOCK. The browser's own event on a real video. No timer. */
      var second = fhShouldSample(lastSecond, video.currentTime);
      if (second === null) return;
      lastSecond = second;
      sampleTotal = sampleTotal + 1;
      mark(video.currentTime);
      if (restartArmed) {
        /* The tap for sound restarts the video. If two seconds of normal
           playing go by and no restart came, it was a plain unmute on the
           browser's own controls. Stop expecting one. */
        armedTicks = armedTicks + 1;
        if (armedTicks >= 2) { restartArmed = false; armedTicks = 0; }
      }
    });

    on("seeking", function () {
      seekFrom = (typeof video.currentTime === "number") ? video.currentTime : null;
      /* seeking fires with currentTime ALREADY moved in some browsers, so the
         last second we wrote down is the more reliable "from". */
      if (typeof lastSecond === "number") seekFrom = lastSecond;
    });

    on("seeked", function () {
      var to = video.currentTime;
      var what = fhClassifySeek(seekFrom, to, restartArmed);
      seekFrom = null;
      if (what === "restart") {
        restartArmed = false; armedTicks = 0;
        startNewPlay(to);
        return;
      }
      if (what === null) { lastSecond = null; return; }
      if (justEnded && what === "rewind") {
        /* Back to the start after it finished = a replay, not a rewind. */
        justEnded = false;
        replays = replays + 1;
        startNewPlay(to);
        return;
      }
      if (what === "rewind") rewinds = rewinds + 1;
      if (what === "skip") skips = skips + 1;
      lastSecond = null;
      mark(to);
    });

    on("volumechange", function () {
      var muted = !!video.muted || video.volume === 0;
      if (!muted) {
        if (everUnmuted !== true) {
          everUnmuted = true;
          /* Turning the sound on IS the decision to watch. It travels as
             `unmuted`, which is the only field the table has for it. */
          restartArmed = true;       /* the page's own code is about to seek to 0 */
          armedTicks = 0;
          /* Nothing is written down here on purpose. The restart that follows
             lands at second 0 and records itself. Writing the second they
             tapped at would add a second to the silent pass that nobody
             actually watched. */
        }
      } else if (everUnmuted === null) {
        everUnmuted = false;
      }
    });

    /* ── leaving ────────────────────────────────────────────────────────── */

    try {
      window.addEventListener("pagehide", closeOnce, false);
      document.addEventListener("visibilitychange", function () {
        try {
          if (document.visibilityState === "hidden") closeOnce();
          else closed = false;   /* they came back — a later leave sends again */
        } catch (e) {}
      }, false);
    } catch (e) {}

    /* The very first message. Sent BEFORE anything plays, so a browser that
       refuses to autoplay still leaves a trace that the player was here. */
    if (everUnmuted === null) { try { if (!video.muted && video.volume !== 0) everUnmuted = true; } catch (e) {} }
    send("open");
  }

  /* ── finding the video, with no timer ─────────────────────────────────── */

  function sweep() {
    try {
      var list = document.querySelectorAll("video");
      for (var i = 0; i < list.length; i++) track(list[i]);
    } catch (e) {}
  }

  try {
    sweep();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", sweep, false);
    }
    window.addEventListener("load", sweep, false);
    /* A player ClickFunnels renders later still gets caught: these fire on the
       video itself and bubble down through the capture phase, so the first
       thing any new video does reaches us. No polling, no timer. */
    ["loadedmetadata", "play", "canplay"].forEach(function (n) {
      document.addEventListener(n, function (ev) {
        try {
          if (ev && ev.target && ev.target.tagName === "VIDEO") track(ev.target);
        } catch (e) {}
      }, true);
    });
  } catch (e) {}
  /* No video on this page? Everything above found nothing and did nothing.
     Silently. That is the correct behaviour, not a failure. */
})();
