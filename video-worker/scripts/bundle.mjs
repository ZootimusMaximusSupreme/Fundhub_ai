// Image build step: bundle marketing/broll once, so a render never pays for webpack.
//   node scripts/bundle.mjs <broll dir> <out dir>

import { bundle } from "@remotion/bundler";
import { resolve } from "node:path";

const [, , brollDir = "/app/marketing/broll", outDir = "/app/bundle"] = process.argv;
const out = await bundle({ entryPoint: resolve(brollDir, "src/index.ts"), outDir: resolve(outDir) });
console.log(`bundled ${brollDir} -> ${out}`);
