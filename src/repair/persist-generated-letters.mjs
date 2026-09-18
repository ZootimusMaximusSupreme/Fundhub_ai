// Save the SAME dispute-letter bodies the Repair desk sends, as client files.
// COMPLIANCE REVIEW REQUIRED — dispute letters.
//
// analyzeAndGenerate writes dispute_letters.body_text for bureau send.
// Until now nothing copied those bodies into documents, so the client pack
// and the Specialist send queue were two piles. This is the missing copy,
// not a second writer.

import { KINDS, titleFor } from "../documents/kinds.mjs";
import { storeAndRegister } from "../documents/register.mjs";

const BUREAU_NAME = Object.freeze({
  EX: "Experian",
  EQ: "Equifax",
  TU: "TransUnion"
});

export function letterHtml(bodyText, { bureau, round, target } = {}) {
  const escaped = String(bodyText || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const who = BUREAU_NAME[String(bureau || "").toUpperCase()] || bureau || "bureau";
  const dest = target && target !== "bureau" ? ` (${target})` : "";
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">"
    + `<title>Dispute letter — ${who} ${round || ""}${dest}</title></head>`
    + `<body><pre>${escaped}</pre></body></html>`
  );
}

function bureauLabel(code) {
  return BUREAU_NAME[String(code || "").toUpperCase()] || String(code || "Bureau");
}

/**
 * Persist each generated letter as a client deliverable.
 * Same body_text the bureau send queue already holds. Mails nothing.
 */
export async function persistGeneratedLetters(db, store, {
  orgId,
  clientId,
  round = "R1",
  letters = [],
  generatedBy = "repair_analyze"
} = {}) {
  if (!db || !store || typeof store.put !== "function" || !orgId || !clientId) {
    return { stored: [], skipped: "missing_args" };
  }
  const stored = [];
  for (const letter of letters || []) {
    const text = letter.body_text || letter.bodyText || "";
    if (!text) continue;
    const bureau = String(letter.bureau || "XX").toUpperCase();
    const target = letter.target || "bureau";
    const letterRound = letter.round || round;
    const discriminator = `repair-letter/${letterRound}/${bureau}/${target}/${letter.letterId || letter.id || "row"}`;
    const filename = `${bureau}_${letterRound}_${target}.html`;
    const title = `${titleFor("metro2_dispute_letter_pack")} — ${bureauLabel(bureau)} ${letterRound}`;
    const { document } = await storeAndRegister(db, store, {
      orgId,
      clientId,
      kind: KINDS.DELIVERABLE,
      subtype: "metro2_dispute_letter_pack",
      discriminator,
      title,
      body: letterHtml(text, { bureau, round: letterRound, target }),
      mimeType: "text/html",
      filename,
      generatedBy,
      sourceEventId: `repair.letters.ready:${clientId}:${discriminator}`,
      metadata: {
        pack: "repair_letter_pack",
        bureau,
        round: letterRound,
        target,
        letterId: letter.letterId || letter.id || null,
        same_as: "dispute_letters.body_text"
      }
    });
    stored.push({
      bureau,
      round: letterRound,
      target,
      documentId: document?.id || null,
      documentKey: document?.document_key || null
    });
  }
  return { stored, skipped: stored.length ? null : "nothing_to_store" };
}
