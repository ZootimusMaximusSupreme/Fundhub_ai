// GET / POST /api/marketing/offers — the offers (funnels with a permanent tag).
//
// Route key: "marketing/offers" in netlify/functions/api.mjs ROUTES.
//
//   GET                list every offer in the org (including retired)
//   GET ?tag=slo       one offer
//   POST               create the offer if the tag is new, otherwise patch it.
//                      The tag is permanent; it is never renamed or reused.
//                      `card_md` (optional) is the offer card's markdown: saving
//                      it commits marketing/offers/<tag>.md through the outbox.
//
// PENDING HOOKUP: the outbox (M0 step 2) is not on main yet. The commit goes
// through one call, enqueueRepoWrite in src/marketing/repo-writes.mjs, which is
// a stub today. The response says `repo_write: { queued: false, pending: "outbox" }`
// until the real one is swapped in. Nothing else here changes when it is.
//
// requireAuth, then requireRole(ROLE_SETS.MARKETING): requireAuth ignores roles
// (CLAUDE.md §12). marketing_offers is org-scoped, not partner-RLS.

import { db } from "../../src/db.mjs";
import { requireAuth } from "../../src/http/middleware/requireAuth.mjs";
import { ROLE_SETS, requireRole, isUuid } from "../../src/http/read-api.mjs";
import { dbDown } from "../../src/http/db-down.mjs";
import { safeError } from "../../src/http/health.mjs";
import { withTransaction } from "../../src/db/with-transaction.mjs";
import {
  TAG_RE, cardPathFor, createOffer, getOffer, listOffers, updateOffer, validateOfferBody
} from "../../src/marketing/offers.mjs";
import { enqueueRepoWrite as defaultEnqueueRepoWrite } from "../../src/marketing/repo-writes.mjs";
import { requestIdFrom, withRequestId } from "../../src/marketing/requests.mjs";

export const ROUTE = "marketing/offers";

export default async function handler(req, res, deps = {}) {
  const database = deps.db ?? db;
  const enqueueRepoWrite = deps.enqueueRepoWrite ?? defaultEnqueueRepoWrite;
  const method = req.method || "GET";

  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireAuth(req, res, { db: database });
  if (!staff) return;
  if (!requireRole(res, staff, ROLE_SETS.MARKETING)) return;

  const orgId = staff.org_id;
  if (!isUuid(orgId)) return res.status(403).json({ ok: false, error: "forbidden" });

  try {
    if (method === "GET") {
      const tag = req.query?.tag;
      if (tag !== undefined && tag !== "") {
        if (typeof tag !== "string" || !TAG_RE.test(tag)) {
          return res.status(400).json({ ok: false, error: "tag_invalid", message: "tag is not a valid offer tag." });
        }
        const offer = await getOffer(database, orgId, tag);
        if (!offer) return res.status(404).json({ ok: false, error: "offer_not_found", message: "No offer has that tag." });
        return res.status(200).json({ ok: true, offer });
      }
      const offers = await listOffers(database, orgId);
      return res.status(200).json({ ok: true, count: offers.length, offers });
    }

    const body = req.body || {};
    const existing = typeof body.tag === "string" && TAG_RE.test(body.tag)
      ? await getOffer(database, orgId, body.tag)
      : null;
    const checked = validateOfferBody(body, { creating: !existing });
    if (checked.error) {
      return res.status(400).json({ ok: false, error: checked.error, message: checked.message });
    }

    const out = await withRequestId(
      database,
      { orgId, requestId: requestIdFrom(req), route: ROUTE },
      () => withTransaction(database, async (tx) => {
        const offer = existing
          ? await updateOffer(tx, orgId, checked.tag, checked.fields)
          : await createOffer(tx, orgId, checked.tag, checked.fields);

        let repoWrite = null;
        if (checked.card_md !== undefined) {
          repoWrite = await enqueueRepoWrite(tx, {
            orgId,
            staffId: staff.id,
            path: offer.card_path || cardPathFor(offer.tag),
            content: checked.card_md,
            message: `Offer card: ${offer.name} (${offer.tag})`
          });
        }
        return {
          status: existing ? 200 : 201,
          body: { ok: true, created: !existing, offer, repo_write: repoWrite }
        };
      })
    );
    return res.status(out.status).json(out.replayed ? { ...out.body, replayed: true } : out.body);
  } catch (err) {
    if (err && err.code === "23505") {
      return res.status(409).json({ ok: false, error: "offer_exists", message: "An offer with that tag already exists." });
    }
    if (dbDown(res, err)) return;
    return res.status(500).json({ ok: false, error: safeError(err) });
  }
}
