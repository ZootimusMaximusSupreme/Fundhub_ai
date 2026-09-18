// Pull 0_APR_database.pdf out of the saved .eml and dump every URI in it.
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const OUT = "credentials/carl-barton-2026-09-18";
const eml = readFileSync(`${OUT}/19ada89be6725a52.eml`, "latin1");

const marker = eml.indexOf("0_APR_database.pdf");
const start = eml.indexOf("\r\n\r\n", marker) + 4;
const boundaryLine = eml.slice(start).search(/\r\n--/);
const b64 = eml.slice(start, start + boundaryLine).replace(/\s+/g, "");
const pdf = Buffer.from(b64, "base64");
writeFileSync(`${OUT}/0_APR_database.pdf`, pdf);
console.log("pdf bytes", pdf.length, "header", pdf.slice(0, 8).toString("latin1"));

const bin = pdf.toString("latin1");

// 1. plain URIs in uncompressed objects
const plain = Array.from(new Set(bin.match(/https?:\/\/[^\s)<>\]}"']+/g) || []));
console.log("plain URIs:", plain);

// 2. /URI actions
const uriActions = Array.from(new Set((bin.match(/\/URI\s*\(([^)]*)\)/g) || []).map(s => s)));
console.log("URI actions:", uriActions);

// 3. decompress FlateDecode streams and look again
const found = new Set();
const re = /stream\r?\n/g;
let m;
while ((m = re.exec(bin))) {
  const s = m.index + m[0].length;
  const e = bin.indexOf("endstream", s);
  if (e < 0) continue;
  try {
    const out = inflateSync(Buffer.from(bin.slice(s, e), "latin1")).toString("latin1");
    for (const u of out.match(/https?:\/\/[^\s)<>\]}"']+/g) || []) found.add(u);
    for (const u of out.match(/\/URI\s*\(([^)]*)\)/g) || []) found.add(u);
  } catch { /* not flate */ }
}
console.log("in streams:", Array.from(found));
