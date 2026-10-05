#!/usr/bin/env node
/** List .env keys whose values look like Netlify CLI masks (not real secrets). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  ".env"
);

export function isMaskPlaceholder(value) {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (v.replace(/\*/g, "").length === 0) return true;
  return v.includes("*") && v.replace(/\*/g, "").length <= 8;
}

export function listMaskedKeys(envText) {
  const masked = [];
  for (const line of envText.split(/\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const eq = s.indexOf("=");
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (isMaskPlaceholder(val)) masked.push(key);
  }
  return masked;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(__dirname, "env-audit-masks.mjs");

if (isMain) {
  const masked = listMaskedKeys(fs.readFileSync(ENV_PATH, "utf8"));
  console.log(JSON.stringify({ maskedCount: masked.length, keys: masked }, null, 2));
  process.exit(masked.length ? 1 : 0);
}
