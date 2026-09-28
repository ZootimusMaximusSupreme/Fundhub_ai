/**
 * RB2B visitor ID pixel (Retention.com network).
 *
 * Public account id Z6PVLHZEJL6R is baked in — static JS on Netlify cannot read
 * env at request time. RB2B_ID in .env / Netlify mirrors this same public id.
 *
 * Snippet URL (Chris 2026-09-27):
 *   https://ddwl4m2hdecbv.cloudfront.net/b/Z6PVLHZEJL6R/Z6PVLHZEJL6R.js.gz
 */
!function (key) {
  if (window.reb2b) return;
  window.reb2b = { loaded: true };
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://ddwl4m2hdecbv.cloudfront.net/b/" + key + "/" + key + ".js.gz";
  document.getElementsByTagName("script")[0].parentNode.insertBefore(
    s,
    document.getElementsByTagName("script")[0]
  );
}("Z6PVLHZEJL6R");
