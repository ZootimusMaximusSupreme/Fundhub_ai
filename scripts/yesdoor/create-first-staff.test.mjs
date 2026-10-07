// Pure tests for the first-staff script: it prints instructions by default, refuses
// remote databases, and never reads a database to do so. The run that really creates
// a user is src/http/yesdoor-first-staff.pg.test.mjs (scratch database only).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, refuseTarget, run, INSTRUCTIONS, ROLES } from "./create-first-staff.mjs";

const sink = () => { const lines = []; return { lines, log: (...a) => lines.push(a.join(" ")), error: (...a) => lines.push(`ERR ${a.join(" ")}`) }; };

test("no arguments: it prints the instructions and touches nothing", async () => {
  const out = sink();
  const code = await run([], { DATABASE_URL: "postgres://prod.supabase.com/x" }, out);
  assert.equal(code, 0);
  assert.match(out.lines.join("\n"), /NEVER run this against the Fundhub production database/);
  assert.equal(INSTRUCTIONS.includes("YD_STAFF_PASSWORD"), true);
});

test("arguments: defaults, roles, and plain refusals", () => {
  assert.deepEqual(parseArgs([]), { apply: false, email: null, name: null, role: "owner", session: false });
  assert.deepEqual(parseArgs(["--apply", "--email", " Me@Example.Test ", "--role", "ops", "--name", "Me", "--session"]),
    { apply: true, email: "me@example.test", name: "Me", role: "ops", session: true });
  assert.match(parseArgs(["--apply"]).error, /email/);
  assert.match(parseArgs(["--apply", "--email", "nope"]).error, /email/);
  assert.match(parseArgs(["--apply", "--email", "a@b.co", "--role", "closer"]).error, /role/);
  assert.match(parseArgs(["--email"]).error, /needs a value/);
  assert.match(parseArgs(["--wat"]).error, /unknown argument/);
  assert.deepEqual([...ROLES], ["owner", "ops", "sales", "collections"]);
});

test("a hosted database is refused unless the owner says it is Yesdoor's own", () => {
  assert.match(refuseTarget("postgresql://u:p@aws-0-us-west-2.pooler.supabase.com:5432/postgres", {}), /hosted database/);
  assert.match(refuseTarget("postgresql://u:p@db.oqpnlusrotpxfenysfxz.supabase.co:5432/postgres", {}), /hosted database/);
  assert.equal(refuseTarget("postgresql://u:p@db.x.supabase.co:5432/postgres", { YD_ALLOW_REMOTE_DB: "yes" }), null);
  assert.equal(refuseTarget("postgres://postgres@127.0.0.1:55434/scratch", {}), null);
  assert.match(refuseTarget("", {}), /not set/);
  assert.match(refuseTarget("not a url", {}), /readable/);
});

test("--apply with no database, a weak password, or a hosted database stops before touching anything", async () => {
  const noDb = sink();
  assert.equal(await run(["--apply", "--email", "a@b.co"], {}, noDb), 1);
  assert.match(noDb.lines.join("\n"), /DATABASE_URL is not set/);
  const hosted = sink();
  assert.equal(await run(["--apply", "--email", "a@b.co"], { DATABASE_URL: "postgresql://u:p@x.pooler.supabase.com/db", YD_STAFF_PASSWORD: "long-enough-password" }, hosted), 1);
  assert.match(hosted.lines.join("\n"), /Refusing/);
  const weak = sink();
  assert.equal(await run(["--apply", "--email", "a@b.co"], { DATABASE_URL: "postgres://postgres@127.0.0.1:1/none", YD_STAFF_PASSWORD: "short" }, weak), 1);
  assert.match(weak.lines.join("\n"), /YD_STAFF_PASSWORD/);
  assert.ok(!weak.lines.join("\n").includes("short\n"), "the password is never echoed");
});
