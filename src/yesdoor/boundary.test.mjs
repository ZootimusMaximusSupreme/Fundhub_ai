// The Yesdoor split-ready boundary (docs/specs/yesdoor-mvp-build-spec.md §0.2).
//
// Yesdoor is built inside the Fundhub repo for now and will move to its own repo
// and database. It can only move cleanly if nothing in src/yesdoor reaches into
// Fundhub code except a short, reviewed list of files. This test reads every
// source file under src/yesdoor and fails on any import outside that list.
//
// Fundhub logic Yesdoor needs (magic links, signed links, ledger patterns, the
// lender-style matcher) is COPIED into src/yesdoor, not imported. That is
// owner-set: "copied in as starting code."
//
// Relative imports that stay inside src/yesdoor are fine. Node built-ins and the
// two installed packages (pg, inngest) are fine. Everything else fails.
//
// api/yesdoor/** is the HTTP shell and moves with the app, so it gets the same
// check: it may import src/yesdoor/** and the db handle, nothing else.
//
// PURE UNIT TEST. No database. Runs in every CI pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const YD_DIR = path.join(ROOT, "src", "yesdoor");
const API_YD_DIR = path.join(ROOT, "api", "yesdoor");

/** The whole allowlist (spec §0.2). Adding a line here is a reviewed decision. */
export const ALLOWED_OUTSIDE_IMPORTS = Object.freeze([
  "src/db.mjs",
  "src/commissions/money.mjs",
  "src/http/middleware/requireAuth.mjs",
  "src/http/middleware/requireRole.mjs",
  "src/auth/session.mjs",
  "src/workflows/client.mjs"
]);

/** What the HTTP shell under api/yesdoor may import besides src/yesdoor/**. */
const ALLOWED_FOR_API = Object.freeze(["src/db.mjs"]);

const PACKAGES = new Set(["pg", "inngest"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** Strip comments so an example import inside a comment is not a violation. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** Every module specifier a file pulls in: static, re-export, side-effect, dynamic. */
export function specifiersOf(src) {
  const code = stripComments(src);
  const found = [];
  const patterns = [
    /\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:[\w*{}\s,$]+?\s+)from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) found.push(m[1]);
  }
  return found;
}

/** violations(file, src, rootDir, allow) → list of readable problems. */
export function violationsIn(file, src, { insideDir, allow }) {
  const bad = [];
  for (const spec of specifiersOf(src)) {
    if (spec.startsWith("node:") || PACKAGES.has(spec)) continue;
    if (!spec.startsWith(".")) {
      bad.push(`${path.relative(ROOT, file)} imports package "${spec}"`);
      continue;
    }
    const target = path.resolve(path.dirname(file), spec);
    if (target === insideDir || target.startsWith(insideDir + path.sep)) continue;
    const rel = path.relative(ROOT, target).split(path.sep).join("/");
    if (!allow.includes(rel)) {
      bad.push(`${path.relative(ROOT, file)} imports ${rel} (not on the allowlist)`);
    }
  }
  return bad;
}

test("boundary: src/yesdoor imports nothing outside the §0.2 allowlist", () => {
  // This file holds deliberate bad-import examples in strings, so it is not scanned.
  const files = walk(YD_DIR).filter((f) => path.basename(f) !== "boundary.test.mjs");
  assert.ok(files.length > 0, "found no files under src/yesdoor");
  const problems = [];
  for (const file of files) {
    problems.push(...violationsIn(file, fs.readFileSync(file, "utf8"), {
      insideDir: YD_DIR, allow: ALLOWED_OUTSIDE_IMPORTS
    }));
  }
  assert.deepEqual(problems, [],
    "src/yesdoor must stay split-ready. Copy the Fundhub code you need into src/yesdoor " +
    "instead of importing it:\n  " + problems.join("\n  "));
});

test("boundary: api/yesdoor imports only src/yesdoor and the db handle", () => {
  const files = walk(API_YD_DIR);
  assert.ok(files.length > 0, "found no files under api/yesdoor");
  const problems = [];
  for (const file of files) {
    // Relative imports from api/yesdoor/** to src/yesdoor/** are the intended shape.
    const src = fs.readFileSync(file, "utf8");
    for (const spec of specifiersOf(src)) {
      if (spec.startsWith("node:") || PACKAGES.has(spec)) continue;
      if (!spec.startsWith(".")) { problems.push(`${path.relative(ROOT, file)} imports package "${spec}"`); continue; }
      const target = path.resolve(path.dirname(file), spec);
      const rel = path.relative(ROOT, target).split(path.sep).join("/");
      const ok = rel.startsWith("src/yesdoor/") || ALLOWED_FOR_API.includes(rel);
      if (!ok) problems.push(`${path.relative(ROOT, file)} imports ${rel}`);
    }
  }
  assert.deepEqual(problems, [], "api/yesdoor may import only src/yesdoor/** and src/db.mjs:\n  " + problems.join("\n  "));
});

test("boundary: the allowlist files all exist (a rename must update this list)", () => {
  for (const rel of ALLOWED_OUTSIDE_IMPORTS) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is on the allowlist but does not exist`);
  }
});

test("boundary: the scanner catches every import shape (so a green run means something)", () => {
  const file = path.join(YD_DIR, "store", "x.mjs");
  const opts = { insideDir: YD_DIR, allow: ALLOWED_OUTSIDE_IMPORTS };
  const bad = (code) => violationsIn(file, code, opts);

  assert.equal(bad(`import { x } from "../../affiliates/refer.mjs";`).length, 1);
  assert.equal(bad(`import x from "../../lenders/match.mjs"`).length, 1);
  assert.equal(bad(`import "../../lib/side-effect.mjs";`).length, 1);
  assert.equal(bad(`export { y } from "../../contracts/send.mjs";`).length, 1);
  assert.equal(bad(`const m = await import("../../commissions/ledger.mjs");`).length, 1);
  assert.equal(bad(`import express from "express";`).length, 1);
  assert.equal(bad(`import {\n a,\n b\n} from "../../underwrite/engine.mjs";`).length, 1);

  // Fine: allowlisted, inside src/yesdoor, node built-ins, pg.
  assert.deepEqual(bad(`import { db } from "../../db.mjs";`), []);
  assert.deepEqual(bad(`import { toCents } from "../../commissions/money.mjs";`), []);
  assert.deepEqual(bad(`import { x } from "./other.mjs";`), []);
  assert.deepEqual(bad(`import { y } from "../config.mjs";`), []);
  assert.deepEqual(bad(`import fs from "node:fs";`), []);
  assert.deepEqual(bad(`import pg from "pg";`), []);
  // An import in a comment is not an import.
  assert.deepEqual(bad(`// import x from "../../affiliates/refer.mjs";\n/* import y from "../../lenders/x.mjs" */`), []);
});
