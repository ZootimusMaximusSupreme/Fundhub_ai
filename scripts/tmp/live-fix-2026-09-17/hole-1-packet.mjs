// read-only: page titles of the owner's contract packet PDF
import { readFileSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const data = new Uint8Array(readFileSync("docs/contracts/source-2026-08-28/Fundhub-Service-Agreements-Packet.pdf"));
const doc = await pdfjs.getDocument({ data }).promise;
let all = "";
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  const t = (await p.getTextContent()).items.map((x) => x.str).join(" ").replace(/\s+/g, " ");
  all += `\n=== PAGE ${i}\n${t}`;
  console.log(i, t.slice(0, 140));
}
writeFileSync("/tmp/live-fix-2026-09-17/hole-1/packet.txt", all);
const hits = ["Funding Agreement", "FUNDING AGREEMENT", "Credit Repair", "CREDIT REPAIR", "3,000", "deposit", "success fee", "Credit Repair Organizations"];
for (const h of hits) console.log("HIT", h, (all.match(new RegExp(h, "gi")) || []).length);
