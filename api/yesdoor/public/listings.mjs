// GET /api/yesdoor/public/listings?city&beds&maxRent&page — the public search.
//
// No login. Live listings at signed/live buildings, plus the Arizona SAMPLE
// listings (each carries isSample: true; the site must label them "Sample
// listing"). Cheapest first, 24 a page.
//   city     exact city name, any case
//   beds     exact bedroom count; 0 = studio
//   maxRent  a number of WHOLE DOLLARS (not cents)
//   page     1-based
// GET only. The company is the deployment's own (YD_ORG_SLUG), never a parameter.
import { db } from "../../../src/db.mjs";
import { allowMethods, qs, sendError } from "../../../src/yesdoor/http.mjs";
import { resolveYdOrgId } from "../../../src/yesdoor/store/org.mjs";
import { searchListings } from "../../../src/yesdoor/store/listings.mjs";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  try {
    const orgId = await resolveYdOrgId(db);
    const out = await searchListings(db, {
      orgId, city: qs(req, "city"), beds: qs(req, "beds"), maxRent: qs(req, "maxRent"), page: qs(req, "page")
    });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
