// Cross-site rules for the /roadmap widget's four doors:
//   /api/public/slo-checkout, slo-pull, slo-status, slo-repair-checkout.
//
// The widget lives on https://apply.fundhub.ai/roadmap (ClickFunnels on a
// custom domain). These endpoints live on https://fundhub.ai. Different
// origins, so the browser applies its cross-site rules, and a call that
// ignored them is blocked with no visible error at all.
//
// Same pattern as api/public/vsl-watch.mjs, copied rather than imported
// because that file is an api/ handler (src/ does not import from api/):
//
//   THE ALLOW-LIST. Access-Control-Allow-Origin is echoed back ONLY for an
//   origin on the list below, and the header is left off entirely for anything
//   else. Never "*": a wildcard would let any page on the internet start an
//   order or post an identity through a visitor's browser.
//
//   THE PREFLIGHT. A cross-site POST carrying application/json makes the
//   browser ask first, with OPTIONS. answerPreflight() answers it. It reads
//   nothing and writes nothing.
//
// No cookies are used by these doors (the credential is ref + client_id in the
// body or query), so Access-Control-Allow-Credentials is never sent.

export const SLO_WIDGET_ORIGINS = Object.freeze([
  "https://apply.fundhub.ai",
  "https://fundhub.ai",
  "https://www.fundhub.ai"
]);

const ORIGIN_SET = new Set(SLO_WIDGET_ORIGINS);

export function isAllowedOrigin(origin) {
  return ORIGIN_SET.has(String(origin || "").trim());
}

/** Headers for this origin, or {} when it is not on the list. */
export function sloCorsHeaders(origin, methods = "GET, POST, OPTIONS") {
  const o = String(origin || "").trim();
  if (!ORIGIN_SET.has(o)) return {};
  return {
    "Access-Control-Allow-Origin": o,
    // So a cache does not serve one origin's answer to another.
    Vary: "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400"
  };
}

/** Set the cross-site headers on res for this request's Origin. */
export function applySloCors(req, res, methods) {
  const h = req?.headers || {};
  const cors = sloCorsHeaders(h.origin || h.Origin, methods);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
}

/**
 * Answer the browser's permission question. Returns true when it answered
 * (the caller must stop), false when this is not a preflight.
 */
export function answerPreflight(req, res, methods) {
  if (String(req?.method || "").toUpperCase() !== "OPTIONS") return false;
  res.setHeader("Allow", methods);
  /* 200 with a tiny body, as api/public/vsl-watch.mjs does. Not 204: the
     function adapter always builds a Response with a body, and a 204 with a
     body is refused by the Response constructor. */
  res.status(200).json({ ok: true });
  return true;
}

/**
 * A return address for Commas' success page, when the widget asks for one.
 * https only, and only on an allow-listed origin, so it can never be used to
 * send a payer somewhere else. Anything else → null (the caller keeps its
 * default). Any query string the widget sent is dropped; the success URL gets
 * exactly ref + client_id added by withCheckoutIdentifiers.
 *
 * ONE fragment survives: #fhw, the id of the checkout widget on /roadmap.
 * Without it the payer comes back to the top of a long sales page and the
 * checkout form is what they see, which reads as a lost payment. Every other
 * fragment is still dropped.
 */
export function sloReturnUrl(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s || s.length > 300) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (!ORIGIN_SET.has(u.origin)) return null;
  if (u.username || u.password) return null;
  return `${u.origin}${u.pathname}${u.hash === "#fhw" ? "#fhw" : ""}`;
}
