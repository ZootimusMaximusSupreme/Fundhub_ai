// SLO $297 diagnostic — public till constants.
//
// Owner-set 2026-09-17: pay, then pull, then pack, then book.
// Commas is the card API. ClickFunnels stays last. The live /watch funnel
// does not move.
//
// THE TITLE IS NOT INVENTED. commas-catalog-hands-off: reuse a keep title,
// never POST /public-api/products/create, never mint a new catalog row.
// Consulting Services Assessment is the diagnostic title already used by
// SOFT_PULL and /optimize.

export const SLO_PRICE_CENTS = 29700;

export const SLO_KEEP_TITLE = "Consulting Services Assessment";

export const SLO_SOURCE = "slo";

/* purpose + products.code the Commas webhook already knows. That is what
   fires diagnostic.paid → C-00 (the pull) → analysis.completed (the pack).
   Do not guess this offer by dollar amount. */
export const SLO_PURPOSE = "diagnostic";

export const SLO_PRODUCT_CODE = "diagnostic";

export const SLO_PULL_PATH = "/slo/pull.html";

export const SLO_BOOK_URL = "https://apply.fundhub.ai/schedule/phonecall";

export function sloPublicBase(env = process.env) {
  const raw = String(env.PUBLIC_BASE_URL || "https://fundhub.ai").trim();
  return raw.replace(/\/+$/, "") || "https://fundhub.ai";
}

/** Where Commas sends them after the card. Same window. The pull form. */
export function sloPullSuccessUrl(env = process.env) {
  return `${sloPublicBase(env)}${SLO_PULL_PATH}`;
}
