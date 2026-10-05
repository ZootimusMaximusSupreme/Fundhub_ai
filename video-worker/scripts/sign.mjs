// Mint a 24-hour signed GET link for one R2 key. For the first-run proof in
// spec 9.5: a signed GET answers 403 to HEAD, so check that Submagic and Meta
// can both fetch a link like this before trusting it.
//   node scripts/sign.mjs <key>
// Prints the link only. Needs the R2 env names in the README.

import { r2FromEnv } from "../lib/r2.mjs";

const key = process.argv[2];
if (!key) {
  console.error("usage: node scripts/sign.mjs <r2 key>");
  process.exit(2);
}
console.log(await r2FromEnv().signedUrl(key, 86_400));
