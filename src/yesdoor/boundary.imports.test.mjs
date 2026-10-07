// Split-ready boundary guard (docs/specs/yesdoor-mvp-build-spec.md §0).
//
// Yesdoor will move to its own repository and database. Until then it lives
// here, and this test keeps it movable: a file under src/yesdoor may import
// only
//   - node: built-ins
//   - other files inside src/yesdoor
//   - the six Fundhub files on the allowlist below
// Fundhub logic Yesdoor needs is COPIED into src/yesdoor, never imported.
//
// It also checks that nothing under src/yesdoor transmits: outbound sending
// belongs in src/messaging/providers/ only (CLAUDE.md §12), and every Yesdoor
// provider is a sandbox stub.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const YESDOOR = path.join(ROOT, "src", "yesdoor");

export const ALLOWLIST = [
  "src/db.mjs",
  "src/commissions/money.mjs",
  "src/http/middleware/requireAuth.mjs",
  "src/http/middleware/requireRole.mjs",
  "src/auth/session.mjs",
  "src/workflows/client.mjs"
].map((p) => path.join(ROOT, p));

/* ------------------------------------------------------------ the checker */

// The scan reads raw source and does NOT strip comments. Stripping needs a real
// parser to be safe (a "//" inside a string such as "file:///x" would hide the
// rest of the line), and a guard that can be fooled is worse than one that is a
// little strict. So an import or fetch call written inside a comment is flagged
// too: reword the comment.

/** Every module specifier a file pulls in, plus anything we cannot read statically. */
export function importsOf(source) {
  const code = source;
  const specs = [];
  const unreadable = [];
  const grab = (re) => { let m; while ((m = re.exec(code))) specs.push(m[1]); };

  grab(/\bimport\s+(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']/g); // import x from "y" / import "y"
  grab(/\bexport\s+[^'"();]*?\s+from\s+["']([^"']+)["']/g);      // export { x } from "y" / export * from "y"
  grab(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);                // import("y")
  grab(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g);               // require("y")

  if (/\bimport\s*\(\s*[^"'\s)]/.test(code)) unreadable.push("import() with a computed path");
  if (/\brequire\s*\(\s*[^"'\s)]/.test(code)) unreadable.push("require() with a computed path");
  if (/\bcreateRequire\b/.test(code)) unreadable.push("createRequire");
  return { specs, unreadable };
}

/** Returns a plain-English problem, or null when the import is allowed. */
export function problemWith(specifier, fromFile) {
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith(".")) {
    const target = path.resolve(path.dirname(fromFile), specifier);
    if (target === YESDOOR || target.startsWith(YESDOOR + path.sep)) return null;
    if (ALLOWLIST.includes(target)) return null;
    return `imports ${specifier}, which resolves to ${path.relative(ROOT, target)}, outside src/yesdoor and not on the allowlist`;
  }
  if (/^(file:|https?:|data:)/.test(specifier) || specifier.startsWith("/")) {
    return `imports ${specifier}, an absolute or remote path`;
  }
  return `imports the package or built-in "${specifier}" (use a node: built-in, or copy the code in)`;
}

export function violationsIn(source, fromFile) {
  const { specs, unreadable } = importsOf(source);
  return [
    ...specs.map((s) => problemWith(s, fromFile)).filter(Boolean),
    ...unreadable.map((u) => `uses ${u}, which this guard cannot check`)
  ];
}

const TRANSMIT = [
  [/\bfetch\s*\(/, "fetch("],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/node:(?:http|https|http2|net|tls|dgram|dns)\b/, "a node: network module"],
  [/\bchild_process\b/, "child_process"]
];

export function transmitsIn(source) {
  return TRANSMIT.filter(([re]) => re.test(source)).map(([, name]) => name);
}

/* -------------------------------------------------------------- the scan */

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

const SELF = fileURLToPath(import.meta.url);
const FILES = walk(YESDOOR).sort();
const isTest = (f) => f.endsWith(".test.mjs");
const rel = (f) => path.relative(ROOT, f);

describe("src/yesdoor stays split-ready", () => {
  test("the scan sees the module tree", () => {
    assert.ok(FILES.length >= 25, `only ${FILES.length} files found under src/yesdoor`);
    assert.ok(FILES.some((f) => f.endsWith(path.join("match", "match.mjs"))));
  });

  test("every allowlisted Fundhub file exists (the allowlist cannot go stale)", () => {
    for (const f of ALLOWLIST) assert.ok(fs.existsSync(f), `${rel(f)} is on the allowlist but does not exist`);
  });

  test("no file imports outside src/yesdoor except the allowlist", () => {
    // The boundary tests are skipped: their own test inputs are deliberate bad imports in
    // strings. They import only node: built-ins, which the checker's own tests below prove are allowed.
    const BOUNDARY_TESTS = new Set([SELF, path.join(YESDOOR, "boundary.test.mjs")]);
    const problems = [];
    for (const f of FILES.filter((x) => !BOUNDARY_TESTS.has(x))) {
      for (const p of violationsIn(fs.readFileSync(f, "utf8"), f)) problems.push(`${rel(f)} ${p}`);
    }
    assert.deepEqual(problems, []);
  });

  test("no non-test file transmits anything", () => {
    const problems = [];
    for (const f of FILES.filter((x) => !isTest(x))) {
      const found = transmitsIn(fs.readFileSync(f, "utf8"));
      if (found.length) problems.push(`${rel(f)} uses ${found.join(", ")}`);
    }
    assert.deepEqual(problems, []);
  });

  test("every provider module says it is a sandbox: PROVIDER and SANDBOX = true", async () => {
    const providers = FILES.filter((f) => f.includes(`${path.sep}providers${path.sep}`) && !isTest(f)
      && !f.endsWith(`${path.sep}index.mjs`) && !f.endsWith(`${path.sep}common.mjs`));
    assert.ok(providers.length >= 8, `found ${providers.length} provider modules`);
    for (const f of providers) {
      const mod = await import(pathToFileURL(f).href);
      assert.equal(typeof mod.PROVIDER, "string", `${rel(f)} has no PROVIDER`);
      assert.equal(mod.SANDBOX, true, `${rel(f)} is not marked SANDBOX: true`);
    }
  });
});

describe("the checker itself catches what it should", () => {
  const here = path.join(YESDOOR, "match", "x.mjs");
  // Sources are built from pieces so this file never contains an import line of its own.
  const imp = (what, from) => ["import ", what, " from ", JSON.stringify(from), ";"].join("");
  const bad = (source) => violationsIn(source, here);

  test("allows node: built-ins, files inside src/yesdoor and the allowlist", () => {
    assert.deepEqual(bad(imp("{ test }", "node:test")), []);
    assert.deepEqual(bad(imp("fs", "node:fs")), []);
    assert.deepEqual(bad(imp("{ YD_DEFAULTS }", "../config.mjs")), []);
    assert.deepEqual(bad(imp("x", "./rules.mjs")), []);
    assert.deepEqual(bad(imp("{ db }", "../../db.mjs")), []);
    assert.deepEqual(bad(imp("{ fromCents }", "../../commissions/money.mjs")), []);
    assert.deepEqual(bad(imp("{ requireAuth }", "../../http/middleware/requireAuth.mjs")), []);
    assert.deepEqual(bad(imp("{ requireRole }", "../../http/middleware/requireRole.mjs")), []);
    assert.deepEqual(bad(imp("s", "../../auth/session.mjs")), []);
    assert.deepEqual(bad(imp("{ inngest }", "../../workflows/client.mjs")), []);
  });
  test("refuses other Fundhub files, even close neighbours of allowed ones", () => {
    assert.equal(bad(imp("x", "../../contracts/signed-link.mjs")).length, 1);
    assert.equal(bad(imp("x", "../../messaging/send.mjs")).length, 1);
    assert.equal(bad(imp("x", "../../auth/magic-link.mjs")).length, 1);
    assert.equal(bad(imp("x", "../../db.mjs/../lib/x.mjs")).length, 1);
    assert.equal(bad(imp("x", "../../../api/health.mjs")).length, 1);
    assert.equal(bad(imp("x", "../../yesdoor-lookalike/x.mjs")).length, 1);
  });
  test("refuses packages, bare built-ins and absolute or remote paths", () => {
    for (const from of ["pg", "inngest", "crypto", "fs", "/etc/passwd", "https://example.com/x.mjs", "file:///x.mjs", "data:text/javascript,1"]) {
      assert.equal(bad(imp("x", from)).length, 1, from);
    }
  });
  test("sees side-effect, namespace, multi-line, re-export, dynamic and require forms", () => {
    const outside = "../../contracts/x.mjs";
    const forms = [
      ["import ", JSON.stringify(outside), ";"].join(""),
      imp("* as m", outside),
      ["import {\n  a,\n  b\n} from ", JSON.stringify(outside)].join(""),
      ["export { a } from ", JSON.stringify(outside)].join(""),
      ["export * from ", JSON.stringify(outside)].join(""),
      ["const m = await import(", JSON.stringify(outside), ");"].join(""),
      ["const m = require(", JSON.stringify(outside), ");"].join("")
    ];
    for (const f of forms) assert.equal(bad(f).length, 1, f);
  });
  test("cannot be fooled by a computed path or createRequire", () => {
    assert.equal(bad("const m = await import(path);").length, 1);
    assert.equal(bad("const m = require(name);").length, 1);
    assert.equal(bad("const r = createRequire(import.meta.url);").length, 1);
  });
  test("a string like file:///x cannot hide the rest of a line", () => {
    const tricky = ["const a = 'file:///x'; ", imp("x", "../../contracts/x.mjs")].join("");
    assert.equal(bad(tricky).length, 1);
  });
  test("fails closed: an import written inside a comment is flagged too", () => {
    assert.equal(bad(["// ", imp("x", "../../contracts/x.mjs")].join("")).length, 1);
  });
  test("spots network use", () => {
    assert.deepEqual(transmitsIn("await fetch(url)"), ["fetch("]);
    assert.deepEqual(transmitsIn(["import h from ", '"node:https"'].join("")), ["a node: network module"]);
    assert.deepEqual(transmitsIn("new WebSocket(u)"), ["WebSocket"]);
    assert.deepEqual(transmitsIn("const prefetchedAt = 1; const fetchedRows = 2;"), []);
  });
});
