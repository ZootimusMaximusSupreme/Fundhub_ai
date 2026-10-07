// src/yesdoor/providers/plaid-sandbox.mjs — pretend bank-account income check.
// Spec §7 and §7b. Deterministic, no network, no clock.
//
//   verifyIncome({ renterId, publicToken, email? })
//     Plaid path. The sandbox public token is `public-sandbox-<fixture key>` (see
//     publicTokenFor). Known token -> that sample renter's verified income. Any
//     other token -> a generated income derived from a hash of renterId and
//     token, so a renter's number never changes between calls.
//
//   submitStatements({ renterId, files })
//     Statement-upload path. Nothing is verified automatically: the result is
//     `review`, a staff task.
//
// The return value is shaped like a yd_income_checks row (without ids/dates).

import { createHash } from "node:crypto";
import { fixtureByEmail, fixtureByKey } from "../fixtures/renters.mjs";

export const PROVIDER = "plaid_sandbox";
export const SANDBOX = true;

const TOKEN_PREFIX = "public-sandbox-";

export const publicTokenFor = (fixtureKey) => `${TOKEN_PREFIX}${fixtureKey}`;

export async function verifyIncome({ renterId, publicToken, email = null } = {}) {
  if (!renterId) throw new Error("verifyIncome needs a renterId");
  if (!publicToken) throw new Error("verifyIncome needs a publicToken");

  let fixture = null;
  if (typeof publicToken === "string" && publicToken.startsWith(TOKEN_PREFIX)) {
    fixture = fixtureByKey(publicToken.slice(TOKEN_PREFIX.length));
  }
  if (!fixture && email) fixture = fixtureByEmail(email);

  if (fixture) {
    return {
      provider: PROVIDER, sandbox: true, method: "plaid", status: "verified",
      monthly_income_cents: fixture.income.monthly_income_cents,
      sources: fixture.income.sources.map((s) => ({ ...s }))
    };
  }

  // Generated: $2,500 to $6,999 a month, in whole dollars, from one payroll source.
  const h = createHash("sha256").update(`${renterId}|${publicToken}`).digest();
  const monthly = (2500 + ((h[0] << 8) | h[1]) % 4500) * 100;
  return {
    provider: PROVIDER, sandbox: true, method: "plaid", status: "verified",
    monthly_income_cents: monthly,
    sources: [{ kind: "payroll", label: "Recurring deposits (sandbox)", monthly_cents: monthly }]
  };
}

export async function submitStatements({ renterId, files = [] } = {}) {
  if (!renterId) throw new Error("submitStatements needs a renterId");
  return {
    provider: PROVIDER, sandbox: true, method: "statements", status: "review",
    monthly_income_cents: null,
    sources: [],
    note: `${files.length} statement file(s) received. Staff review the deposits before income counts as verified.`
  };
}

