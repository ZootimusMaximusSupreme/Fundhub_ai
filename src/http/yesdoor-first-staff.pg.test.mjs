// Postgres-backed test for scripts/yesdoor/create-first-staff.mjs: on a SCRATCH
// database it makes a Yesdoor staff user in a Yesdoor org, the password works, the
// session token it prints opens the staff doors, and nothing else was touched.
// Skips without DATABASE_URL. It refuses hosted databases by itself (see the script).

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { login } from "../auth/login.mjs";
import { buildYdFixture, call } from "../yesdoor/testing/fixture.mjs";
import { run } from "../../scripts/yesdoor/create-first-staff.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("create-first-staff on a scratch database", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, pipeline;
  const sink = () => { const lines = []; return { lines, log: (...a) => lines.push(a.join(" ")), error: (...a) => lines.push(`ERR ${a.join(" ")}`) }; };

  before(async () => {
    fx = await buildYdFixture(db);
    pipeline = (await import("../../api/yesdoor/staff/pipeline.mjs")).default;
  });
  after(async () => { await close(); });

  test("creates an owner in the Yesdoor org, prints a session token once, and that token opens the staff doors", async () => {
    const email = `first-${fx.rand}@example.test`;
    const password = "a-long-enough-password-1";
    const out = sink();
    const env = { ...process.env, YD_ORG_SLUG: fx.slugA, YD_STAFF_PASSWORD: password };
    const code = await run(["--apply", "--email", email, "--name", "First Owner", "--session"], env, out);
    assert.equal(code, 0, out.lines.join("\n"));
    const text = out.lines.join("\n");
    assert.match(text, /created:/);
    assert.ok(!text.includes(password), "the password is never printed");
    assert.ok(!text.includes("scrypt"), "the hash is never printed");

    const row = (await db.query(`SELECT org_id, role, status, password_hash IS NOT NULL AS has_hash FROM staff WHERE lower(email) = $1`, [email])).rows[0];
    assert.deepEqual([row.org_id, row.role, row.status, row.has_hash], [fx.orgA, "owner", "active", true]);

    const token = out.lines[out.lines.findIndex((l) => l.startsWith("session token")) + 1];
    assert.ok(token && token.length >= 40);
    const r = await call(pipeline, { token });
    assert.equal(r.code, 200, "the printed token is a working staff session");

    const signedIn = await login(db, { email, password, orgId: fx.orgA });
    assert.equal(signedIn.ok, true, "the password works against the Yesdoor org");
    assert.equal(signedIn.staff.org_id, fx.orgA);
    const wrongOrg = await login(db, { email, password, orgId: fx.orgB });
    assert.equal(wrongOrg.ok, false, "and not against another company");
  });

  test("running it again resets the password and role instead of making a second row", async () => {
    const email = `again-${fx.rand}@example.test`;
    const env = { ...process.env, YD_ORG_SLUG: fx.slugA, YD_STAFF_PASSWORD: "first-password-123456" };
    assert.equal(await run(["--apply", "--email", email, "--role", "ops"], env, sink()), 0);
    const out = sink();
    assert.equal(await run(["--apply", "--email", email, "--role", "sales"], { ...env, YD_STAFF_PASSWORD: "second-password-123456" }, out), 0);
    assert.match(out.lines.join("\n"), /updated:/);
    const rows = (await db.query(`SELECT role FROM staff WHERE lower(email) = $1`, [email])).rows;
    assert.deepEqual(rows.map((r) => r.role), ["sales"]);
    assert.equal((await login(db, { email, password: "first-password-123456", orgId: fx.orgA })).ok, false);
    assert.equal((await login(db, { email, password: "second-password-123456", orgId: fx.orgA })).ok, true);
  });

  test("an organisation that does not exist is a plain failure that writes nothing", async () => {
    const out = sink();
    const env = { ...process.env, YD_ORG_SLUG: `no-such-org-${fx.rand}`, YD_STAFF_PASSWORD: "a-long-enough-password-1" };
    assert.equal(await run(["--apply", "--email", `ghost-${fx.rand}@example.test`], env, out), 1);
    assert.match(out.lines.join("\n"), /no organisation/);
    assert.equal((await db.query(`SELECT id FROM staff WHERE lower(email) = $1`, [`ghost-${fx.rand}@example.test`])).rows.length, 0);
  });
});
