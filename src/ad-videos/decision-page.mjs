// The one screen in the ad-video pipeline, and it is throwaway on purpose.
//
// marketing/ads/video-pipeline-plan.md §2(5): "The front end, last and throwaway… a
// phone notification with two links would do the same job." It does — the two
// buttons in the notification are the ordinary path and this page is the
// fallback, for when Chris wants to watch the take before deciding.
//
// So: one file, no build step, no framework, no stylesheet to fetch. It is
// hand-written HTML in a template string because that is genuinely the right
// size for it, and because a page served to an unauthenticated stranger should
// be small enough to read in one sitting.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERYTHING INTERPOLATED IS ESCAPED, INCLUDING THE THINGS THAT "CANNOT" BE
// DANGEROUS
//
// The ad number is CHECKed to digits in the database and the status is one of
// thirteen known words, so escaping them looks like ceremony. It is not. The
// rule this file follows is that no value reaches the HTML without passing
// through esc(), with no exceptions carved out for values that happen to be
// safe today — because the carve-out is what survives when the column's
// constraint is relaxed two years from now and nobody remembers this page
// reads it.
//
// The one value that genuinely is attacker-shaped is the video URL: it comes
// back from Submagic. It goes through a protocol allow-list (https only) before
// it is ever put in a src attribute, so a `javascript:` URL in a vendor
// response cannot become script in Chris's browser.

/* The house escaper, reused rather than written again (CLAUDE.md §8, "reuse
   before you build"). It escapes & < > " ' so it is safe as text and inside a
   quoted attribute — both of which this page uses. Its own header states the
   limit: it is NOT safe inside <style>, which is why every value in STYLE below
   is a literal and nothing is interpolated there. */
import { esc } from "../deliverables/escape.mjs";

/** https only. Anything else — javascript:, data:, a relative path, junk — is
    dropped entirely and the page renders without a player. */
export function safeVideoUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 2000) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:") return null;
  return u.toString();
}

/* Shared head. `noindex` and a Referrer-Policy meta because the URL of this
   page contains a live one-time approval key: a search engine must never hold
   it and a click off this page must never hand it to another site. The header
   in api/public/ad-video-approve.mjs sets the real Referrer-Policy — this is
   the belt to that pair of braces. */
const HEAD = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="no-referrer">`;

const STYLE = `<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px 16px 40px;
    background: #0d0f12; color: #f2f4f7;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 22px; line-height: 1.25; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: #9aa4b2; font-size: 14px; margin: 0 0 20px; }
  video { width: 100%; border-radius: 12px; background: #000; display: block; margin-bottom: 20px; }
  .facts { list-style: none; padding: 0; margin: 0 0 24px; font-size: 14px; color: #c3cad4; }
  .facts li { padding: 7px 0; border-bottom: 1px solid #1e2228; display: flex; justify-content: space-between; gap: 16px; }
  .facts li:last-child { border-bottom: 0; }
  .facts b { color: #f2f4f7; font-weight: 600; }
  .warn { color: #ffb020; font-weight: 600; }
  /* Thumb-sized, stacked, and far enough apart that a tap cannot land on the
     wrong one. This is decided on a phone, one-handed, usually once. */
  .btns { display: grid; gap: 12px; }
  button {
    font: inherit; font-weight: 650; padding: 16px; border-radius: 12px;
    border: 0; cursor: pointer; width: 100%; min-height: 56px;
  }
  .yes { background: #15c26b; color: #04220f; }
  .no  { background: #1e2228; color: #ff8686; border: 1px solid #3a2226; }
  button[disabled] { opacity: .5; cursor: default; }
  .said { margin-top: 20px; font-size: 15px; min-height: 22px; }
  .ok   { color: #15c26b; }
  .bad  { color: #ff8686; }
  .quiet { color: #9aa4b2; }
</style>`;

/**
 * renderDecisionPage(view) → HTML
 *
 * view: { token, adId, adIdPadded, takeNo, status, videoUrl, facts: [[k,v]…],
 *         warn?: string|null }
 *
 * The two buttons POST to this page's own path, which is
 * api/public/ad-video-approve.mjs — the same door that rendered it, and the
 * only place a decision is written.
 *
 * `token` is echoed into a JavaScript string so the two buttons can POST it.
 * It is escaped as JSON, not as HTML, which is the correct escaping for that
 * position — and the token's own alphabet is `[a-z0-9_]` anyway, checked before
 * this function is ever reached.
 */
export function renderDecisionPage(view = {}) {
  const {
    token = "",
    adIdPadded = "",
    takeNo = null,
    videoUrl = null,
    facts = [],
    warn = null
  } = view;

  const src = safeVideoUrl(videoUrl);
  const player = src
    ? `<video controls playsinline preload="metadata" src="${esc(src)}"></video>`
    : `<p class="sub">The finished file is not linkable from here. Decide from the copy in Drive.</p>`;

  const factRows = facts
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`)
    .join("");

  return `${HEAD}
<title>Ad ${esc(adIdPadded)} — approve?</title>
${STYLE}
<main>
  <h1>Ad ${esc(adIdPadded)}, take ${esc(takeNo ?? "?")}</h1>
  <p class="sub">Watch it, then choose. This link works once.</p>
  ${player}
  ${warn ? `<p class="warn">${esc(warn)}</p>` : ""}
  ${factRows ? `<ul class="facts">${factRows}</ul>` : ""}
  <div class="btns">
    <button class="yes" id="yes">Approve — send to Paul</button>
    <button class="no"  id="no">Reject — re-film it</button>
  </div>
  <p class="said quiet" id="said"></p>
</main>
<script>
(function () {
  var token = ${JSON.stringify(String(token))};
  var said = document.getElementById("said");
  var yes = document.getElementById("yes");
  var no = document.getElementById("no");

  function lock() { yes.disabled = true; no.disabled = true; }

  function decide(decision) {
    lock();
    said.className = "said quiet";
    said.textContent = "Sending\\u2026";
    fetch(location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, decision: decision })
    }).then(function (r) {
      return r.json().catch(function () { return {}; });
    }).then(function (b) {
      if (b && b.ok) {
        said.className = "said ok";
        said.textContent = decision === "approve"
          ? "Approved. It goes to Paul."
          : "Rejected. Re-film it as the next take.";
      } else {
        said.className = "said bad";
        // One word from the server, same for every refusal. Turned into the
        // one thing a person can do about it.
        said.textContent = "That did not go through. This link may already have been used.";
      }
    }).catch(function () {
      said.className = "said bad";
      said.textContent = "No connection. Try again on a better signal.";
      yes.disabled = false; no.disabled = false;
    });
  }

  yes.addEventListener("click", function () { decide("approve"); });
  no.addEventListener("click", function () { decide("reject"); });
})();
</script>`;
}

/**
 * renderGonePage(message) → HTML
 *
 * THE SAME PAGE FOR EVERY REFUSAL. A token that never existed, one that was
 * used an hour ago, one that expired, and one that names a take a worker has
 * since failed all land here with identical bytes and an identical status. If
 * they differed, this endpoint would answer "is this a real approval key?" to
 * anyone who asked, one guess at a time.
 */
export function renderGonePage(message = "This link is no longer good.") {
  return `${HEAD}
<title>Nothing here</title>
${STYLE}
<main>
  <h1>Nothing here</h1>
  <p class="sub">${esc(message)}</p>
</main>`;
}

export default { renderDecisionPage, renderGonePage, safeVideoUrl };
