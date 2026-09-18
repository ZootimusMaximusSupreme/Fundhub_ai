import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const dir = process.argv[2];
for (const f of readdirSync(dir).filter(n => n.toLowerCase().endsWith(".pdf")).sort()) {
  const data = new Uint8Array(readFileSync(join(dir, f)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  console.log(`\n========== ${f}  (${doc.numPages} pages) ==========`);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => it.str + (it.hasEOL ? "\n" : "")).join("");
    console.log(`--- page ${i} ---\n${text.replace(/[ \t]{2,}/g, " ").trim()}`);
  }
}
