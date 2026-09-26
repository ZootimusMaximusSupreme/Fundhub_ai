// Settle payment_links when Commas says money cleared.
// Prefer link_ref (metadata). Fall back to Commas product/session id so a
// mismatched mint script cannot leave paid money invisible on the board.
import { on } from "../events/registry.mjs";
import { markPaid, markPaidBySession } from "../payment-links/index.mjs";
import { toCents } from "../commissions/money.mjs";
import {
  ensureSloPortalForPaidClient,
  isSloCheckoutLinkRef
} from "../slo/buyer.mjs";

async function openSloPortalIfPaid(db, link) {
  if (!link || !isSloCheckoutLinkRef(link.link_ref)) return;
  if (!link.org_id || !link.client_id) return;
  await ensureSloPortalForPaidClient(db, {
    orgId: link.org_id,
    clientId: link.client_id
  });
}

export async function onPaymentReceivedForLink(event, db) {
  const p = event.payload || {};
  const paidAmountCents = p.amount != null ? toCents(p.amount) : null;
  /* Commas ids only. p.productId is OUR products.id, copied off the link by
     processCommasInboxRow — every deposit link shares one. Writing it into
     commas_session_id let the first payment per product claim it, and every
     later payment for that product hit the unique index
     payment_links_commas_session and left its link unpaid (N2, 2026-09-18). */
  const sessionId = p.itemId || p.commasSessionId || null;

  if (p.ref) {
    const byRef = await markPaid(db, {
      linkRef: p.ref,
      commasSessionId: sessionId || p.providerRef || null,
      paidAmountCents
    });
    if (byRef) {
      await openSloPortalIfPaid(db, byRef);
      return;
    }
  }

  if (sessionId) {
    const bySession = await markPaidBySession(db, {
      commasSessionId: sessionId,
      paidAmountCents
    });
    await openSloPortalIfPaid(db, bySession);
  }
}

export function register() {
  on("payment.received", onPaymentReceivedForLink);
}
