// POST /api/auth/authorized-rep
//   { client_id, email, name, phone }  add this person to the file
//   { client_id, remove: true }        take the current person off the file
//
// Owner or admin. One live person per file. Adding someone else takes the
// old one off. The reply includes a sign-in link, the same way the portal
// link does, so the person on the phone can read it out.

import { db } from "../../src/db.mjs";
import { requireRole } from "../../src/http/middleware/requireRole.mjs";
import { isUuid } from "../../src/http/read-api.mjs";
import { requireClientInOrg } from "../../src/http/client-scope.mjs";
import { addAuthorizedRep, removeAuthorizedRep, liveRepContact } from "../../src/auth/authorized-rep.mjs";
import { requestMagicLink, magicLinkUrl } from "../../src/auth/magic-link.mjs";

const SAY = {
  email_required: "Type an email address.",
  name_required: "Type a name.",
  phone_required: "Type a phone number. Texts for this file go there.",
  client_not_found: "That file was not found.",
  email_is_a_client: "That email is already on a client file. Use his own email.",
  email_is_another_login: "That email is already a login. Use a different one.",
  no_rep: "Nobody is linked to this file.",
  staff_required: "Sign in as staff first."
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const staff = await requireRole("owner", "admin")(req, res);
  if (!staff) return;

  const body = req.body || {};
  const clientId = String(
    (req.method === "GET" ? (req.query && req.query.client_id) : body.client_id) || ""
  ).trim();
  if (!isUuid(clientId)) {
    return res.status(400).json({ ok: false, error: "client_id must be a uuid" });
  }
  if (!(await requireClientInOrg(res, db, staff, clientId))) return;

  if (req.method === "GET") {
    const rep = await liveRepContact(db, clientId);
    return res.status(200).json({
      ok: true,
      rep: rep ? { name: rep.name, email: rep.email, phone: rep.phone } : null
    });
  }

  if (body.remove === true) {
    const out = await removeAuthorizedRep(db, { orgId: staff.org_id, clientId });
    if (!out.ok) {
      return res.status(out.status || 404).json({
        ok: false,
        error: SAY[out.error] || "Could not take them off this file.",
        code: out.error
      });
    }
    return res.status(200).json({ ok: true, removed: true });
  }

  const out = await addAuthorizedRep(db, {
    orgId: staff.org_id,
    clientId,
    email: body.email,
    name: body.name,
    phone: body.phone,
    staffId: staff.id
  });
  if (!out.ok) {
    return res.status(out.status || 400).json({
      ok: false,
      error: SAY[out.error] || "Could not add them.",
      code: out.error
    });
  }

  const issued = await requestMagicLink(db, {
    email: out.email,
    orgId: staff.org_id,
    queueEmail: true
  });

  return res.status(200).json({
    ok: true,
    account_id: out.accountId,
    replaced: out.replaced === true,
    sent: issued.sent === true,
    ...(issued.token
      ? { url: magicLinkUrl(issued.token), expiresAt: issued.expiresAt }
      : {})
  });
}
