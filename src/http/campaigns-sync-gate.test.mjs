// Which Meta connections /api/campaigns/sync will even attempt.
//
// THIS FILE NEEDS NO DATABASE AND DOES RUN. syncBlockReason() is exported from
// api/campaigns/sync.mjs precisely so the rule that stranded every new
// connection can be checked without Postgres. The end-to-end proof — that a
// freshly connected, pending account syncs and is promoted to 'active' — lives
// in campaigns-sync-activation.pg.test.mjs and needs DATABASE_URL.
//
// THE BUG THIS PINS. sync.mjs used to select `connection_state = 'active'`
// only, and nothing in the repository ever wrote 'active'
// (api/campaigns/meta-agency.mjs inserts 'pending'; 046_ad_platforms.sql:69
// defaults to 'pending'). So "Sync Meta now" answered "Connect a Meta ad
// account for this partner first" forever, on a connection that was already
// connected. A 'pending' row with a token and a real ad account must be
// syncable, or nothing downstream can ever start.
//
// Lives under src/ deliberately: npm test's glob is "src/**" and "scripts/**",
// so a test placed under api/ silently never runs (CLAUDE.md §12).

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  syncBlockReason,
  isPlaceholderAccount,
  metaVerificationState
} from "../../api/campaigns/sync.mjs";

const conn = (over = {}) => ({
  connection_state: "pending",
  encrypted_access_token: "v1:aaa:bbb:ccc",
  external_ad_account_id: "act_1234567890",
  ...over
});

describe("which Meta connections sync will attempt", () => {
  test("a freshly connected 'pending' account is syncable — the whole point", () => {
    assert.equal(syncBlockReason(conn()), null);
  });

  test("an already-proved 'active' account stays syncable", () => {
    assert.equal(syncBlockReason(conn({ connection_state: "active" })), null);
  });

  test("a bare digits ad account id is fine — acct() prefixes act_ itself", () => {
    assert.equal(syncBlockReason(conn({ external_ad_account_id: "1234567890" })), null);
  });

  test("no saved token is refused, and says so", () => {
    const why = syncBlockReason(conn({ encrypted_access_token: null }));
    assert.match(why, /no saved key/i);
  });

  test("the pending:biz: placeholder is refused, and names the missing act_ number", () => {
    const why = syncBlockReason(conn({ external_ad_account_id: "pending:biz:987654321" }));
    assert.match(why, /act_/);
  });

  test("revoked and expired are refused — a retry cannot change either", () => {
    for (const state of ["revoked", "expired", "needs_verification"]) {
      const why = syncBlockReason(conn({ connection_state: state }));
      assert.ok(why, `${state} should be refused`);
      assert.match(why, new RegExp(state));
    }
  });

  test("isPlaceholderAccount recognises exactly the placeholder shape", () => {
    assert.equal(isPlaceholderAccount("pending:biz:123"), true);
    assert.equal(isPlaceholderAccount("PENDING:biz:123"), true);
    assert.equal(isPlaceholderAccount("act_123"), false);
    assert.equal(isPlaceholderAccount(""), false);
    assert.equal(isPlaceholderAccount(null), false);
  });
});

/* THE SECOND SWITCH NOBODY COULD FLIP.
   db/migrations/046_ad_platforms.sql:414-418 refuses to put a credit-related
   campaign live unless platform_verification_state = 'approved'. Nothing in the
   repository ever wrote 'approved' — api/campaigns/meta-agency.mjs:169 inserts
   'unverified' and no other writer existed — so "go live" failed with a database
   error forever. sync.mjs now reads Meta's own verification_status back and
   writes what Meta said. This pins the mapping; the end-to-end proof is in
   campaigns-sync-activation.pg.test.mjs and needs DATABASE_URL. */
describe("what Meta's verification_status is allowed to mean", () => {
  test("only Meta's 'verified' earns 'approved'", () => {
    assert.equal(metaVerificationState("verified"), "approved");
    assert.equal(metaVerificationState("VERIFIED"), "approved");
  });

  test("every waiting word is 'submitted', not approved", () => {
    for (const s of ["pending", "pending_need_more_info", "pending_submission"]) {
      assert.equal(metaVerificationState(s), "submitted", s);
    }
  });

  test("a refusal is 'rejected'", () => {
    for (const s of ["failed", "rejected", "revoked", "ineligible", "expired"]) {
      assert.equal(metaVerificationState(s), "rejected", s);
    }
  });

  test("not_verified is 'unverified'", () => {
    assert.equal(metaVerificationState("not_verified"), "unverified");
  });

  /* null means "Meta did not say", and sync.mjs leaves the column untouched on
     null. Guessing here would hand out the launch gate for free, which is the
     exact bug being fixed. */
  test("silence, or a word we do not know, is never a decision", () => {
    for (const s of [null, undefined, "", "   ", "something_new_from_meta", 7]) {
      assert.equal(metaVerificationState(s), null, String(s));
    }
  });

  test("every value it can return is one the column's CHECK allows", () => {
    const allowed = new Set(["unverified", "submitted", "approved", "rejected"]);
    for (const s of ["verified", "pending", "failed", "not_verified"]) {
      assert.ok(allowed.has(metaVerificationState(s)), s);
    }
  });
});
