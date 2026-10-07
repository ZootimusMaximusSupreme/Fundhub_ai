// src/yesdoor/providers/esign-sandbox.mjs — pretend e-signature.
// Spec §7. Signing happens through an HMAC link (agreements/signed-link.mjs,
// secret YD_LINK_SECRET). No network and no third-party signer.
//
//   createSigningLink({ agreementId, ... })   mint the link to send
//   completeSigning({ url, signerName, signerIp, ... })
//                                              verify the link and produce the
//                                              fields B4 writes to yd_agreements
//
// The completion step is what POST yesdoor/webhooks/esign calls. It does not
// touch the database: B4 turns the returned fields into the update, and the
// agreement must still be `sent` for the update to apply.

import { signAgreementUrl, verifyAgreementRequest } from "../agreements/signed-link.mjs";

export const PROVIDER = "esign_sandbox";
export const SANDBOX = true;

export function createSigningLink({ agreementId, ttlSeconds, secret, baseUrl, basePath, now } = {}) {
  const link = signAgreementUrl({ agreementId, ttlSeconds, secret, baseUrl, basePath, now });
  return { provider: PROVIDER, sandbox: true, ...link };
}

/**
 * @returns {{ ok: true, status: "signed", agreementId, signed_at, signer_name, signer_ip }
 *          | { ok: false, reason: "invalid_link" | "missing_signer_name" }}
 * A bad signature, an expired link and a malformed link all return the same
 * `invalid_link`, so a caller cannot probe which one it was.
 */
export function completeSigning({ url, signerName, signerIp = null, secret, now = Date.now } = {}) {
  const name = typeof signerName === "string" ? signerName.trim() : "";
  const check = verifyAgreementRequest(url, { secret, now });
  if (!check.valid) return { ok: false, reason: "invalid_link" };
  if (!name) return { ok: false, reason: "missing_signer_name" };
  return {
    ok: true,
    status: "signed",
    agreementId: check.agreementId,
    signed_at: new Date(now()).toISOString(),
    signer_name: name,
    signer_ip: signerIp
  };
}
