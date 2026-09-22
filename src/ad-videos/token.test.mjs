// The approval token's pure half — minting it, reading it back, comparing it.
//
// SEPARATE FROM src/http/ad-video-approve.pg.test.mjs ON PURPOSE. That file
// needs a database and therefore SKIPS on a machine with no Postgres, which is
// this one. These checks need no database at all, and a check that can run
// should never be parked behind one that cannot — a skipped test is not green
// (CLAUDE.md §12).
//
// What is being checked is a credential. This token is the only thing between a
// stranger and approving a video Chris has not watched, because a phone
// notification has no session to authenticate with.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  TOKEN_BYTES, TOKEN_TTL_HOURS, TOKEN_RE,
  mintApprovalToken, readToken, tokensMatch, withApprovalToken, AdVideoTokenError
} from "./token.mjs";

describe("approval token — minting", () => {
  test("it is 24 random bytes, written as 48 hex characters", () => {
    assert.equal(TOKEN_BYTES, 24);
    const { token } = mintApprovalToken();
    assert.equal(token.length, 48);
    assert.match(token, TOKEN_RE);
    assert.match(token, /^[0-9a-f]+$/, "hex only, so it is safe in a URL with no escaping");
  });

  test("the shape matches what 389's ad_videos_token_ck accepts", () => {
    // '^[0-9a-f]{32,64}$' in the migration. 48 sits inside it.
    assert.equal(TOKEN_RE.source, "^[0-9a-f]{32,64}$");
    assert.ok(mintApprovalToken().token.length >= 32);
    assert.ok(mintApprovalToken().token.length <= 64);
  });

  test("no two tokens are the same", () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) seen.add(mintApprovalToken().token);
    assert.equal(seen.size, 2000, "a repeat means the randomness is not random");
  });

  test("it always carries an expiry, because a token with none never stops working", () => {
    const now = new Date("2026-09-23T10:00:00Z");
    const { expiresAt } = mintApprovalToken({ now });
    assert.equal(TOKEN_TTL_HOURS, 72);
    assert.equal(expiresAt.toISOString(), "2026-09-26T10:00:00.000Z");
  });

  test("the life can be shortened, and a negative one is already dead", () => {
    const now = new Date("2026-09-23T10:00:00Z");
    assert.equal(mintApprovalToken({ now, ttlHours: 1 }).expiresAt.toISOString(), "2026-09-23T11:00:00.000Z");
    assert.ok(mintApprovalToken({ now, ttlHours: -1 }).expiresAt < now);
  });
});

describe("approval token — reading one off a URL", () => {
  test("a good token comes back cleaned, never throwing", () => {
    const { token } = mintApprovalToken();
    assert.equal(readToken(token), token);
    assert.equal(readToken(` ${token.toUpperCase()} `), token, "trimmed and lowercased");
  });

  test("anything that is not the shape is null, not an error", () => {
    // Null rather than a throw because the caller must answer a malformed token
    // exactly as it answers an unknown one. A different answer tells a prober
    // that their guess was at least the right length.
    for (const bad of [
      "", "   ", null, undefined, "abc", "nope",
      "z".repeat(48),            // not hex
      "a".repeat(31),            // too short
      "a".repeat(65),            // too long
      "a".repeat(47) + "!",      // punctuation
      12345, {}, [], true,
      "a".repeat(48) + "\n",     // a trailing newline IS trimmed, so this passes
    ]) {
      const got = readToken(bad);
      if (bad === "a".repeat(48) + "\n") {
        assert.equal(got, "a".repeat(48), "a trailing newline is whitespace and is trimmed");
      } else {
        assert.equal(got, null, JSON.stringify(String(bad)));
      }
    }
  });

  test("a token cannot smuggle SQL or a URL fragment through", () => {
    for (const bad of [
      "' OR 1=1 --", `${"a".repeat(48)}' --`, "../../etc/passwd",
      "a".repeat(40) + "%20" + "a".repeat(8)
    ]) {
      assert.equal(readToken(bad), null, bad);
    }
  });
});

describe("approval token — comparing", () => {
  test("a token matches itself and nothing else", () => {
    const { token } = mintApprovalToken();
    assert.equal(tokensMatch(token, token), true);
    assert.equal(tokensMatch(token, token.toUpperCase()), true, "case is normalised first");
    assert.equal(tokensMatch(token, mintApprovalToken().token), false);
  });

  test("a different length is false rather than a crash", () => {
    // crypto.timingSafeEqual throws on mismatched lengths; the length check has
    // to come first or an attacker gets a 500 as a length oracle.
    const { token } = mintApprovalToken();
    assert.equal(tokensMatch(token, token.slice(0, 46)), false);
    assert.equal(tokensMatch(token.slice(0, 46), token), false);
  });

  test("junk on either side is false, never a throw", () => {
    const { token } = mintApprovalToken();
    for (const bad of [null, undefined, "", "nope", 123, {}]) {
      assert.equal(tokensMatch(token, bad), false, String(bad));
      assert.equal(tokensMatch(bad, token), false, String(bad));
      assert.equal(tokensMatch(bad, bad), false, String(bad));
    }
  });
});

describe("approval token — the scoped transaction refuses to open on junk", () => {
  test("a malformed token never reaches the database at all", async () => {
    // The pool factory below would throw if it were ever called. It must not be.
    const exploding = () => { throw new Error("the pool must not be touched for a bad token"); };
    for (const bad of ["", null, "nope", "z".repeat(48)]) {
      await assert.rejects(
        withApprovalToken(exploding, bad, async () => "never"),
        (err) => {
          assert.ok(err instanceof AdVideoTokenError);
          assert.equal(err.code, "bad_token");
          return true;
        },
        String(bad)
      );
    }
  });

  test("a missing callback is refused before a connection is taken", async () => {
    const exploding = () => { throw new Error("the pool must not be touched"); };
    await assert.rejects(
      withApprovalToken(exploding, mintApprovalToken().token, null),
      (err) => {
        assert.equal(err.code, "bad_callback");
        return true;
      }
    );
  });

  test("the token is declared transaction-locally, and the work commits", async () => {
    const said = [];
    const client = {
      query: async (sql, params) => { said.push([sql, params]); return { rows: [] }; },
      release: () => said.push(["RELEASE"])
    };
    const pool = () => ({ connect: async () => client });
    const { token } = mintApprovalToken();

    const out = await withApprovalToken(pool, token, async (tx) => {
      assert.equal(tx.token, token);
      await tx.query("SELECT 1");
      return "done";
    });

    assert.equal(out, "done");
    assert.equal(said[0][0], "BEGIN");
    // is_local = true is the third argument. Session-scoped would leak this
    // request's scope onto whichever request borrowed the connection next.
    assert.match(said[1][0], /set_config\('fundhub\.ad_video_token', \$1, true\)/);
    assert.deepEqual(said[1][1], [token]);
    assert.equal(said[2][0], "SELECT 1");
    assert.equal(said[3][0], "COMMIT");
    assert.deepEqual(said[4], ["RELEASE"]);
  });

  test("a throw inside rolls back, releases, and rethrows the original error", async () => {
    const said = [];
    const client = {
      query: async (sql) => { said.push(sql); return { rows: [] }; },
      release: () => said.push("RELEASE")
    };
    const pool = () => ({ connect: async () => client });

    await assert.rejects(
      withApprovalToken(pool, mintApprovalToken().token, async () => {
        throw new Error("the step broke");
      }),
      /the step broke/
    );
    assert.ok(said.includes("ROLLBACK"), "a failed decision must not be left half-committed");
    assert.ok(!said.includes("COMMIT"));
    assert.equal(said[said.length - 1], "RELEASE", "the connection must go back to the pool");
  });
});
