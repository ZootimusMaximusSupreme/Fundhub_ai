// Unit tests for money-chain helpers — no Postgres.

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  BUCKET_TO_CODE, paymentKindFor, nothingUnlockedReason, NOTHING_UNLOCKED,
  ensureAttributions, ensureSalePayment, resolveProductId,
  onRoundFundedMoney, syncClientFunded, SQL_SYNC_CLIENT_FUNDED
} from "./money-chain.mjs";
import { OFFERS } from "../config/offers.mjs";

describe("money-chain helpers", () => {
  test("BUCKET_TO_CODE maps Commas semantic buckets to product codes", () => {
    assert.equal(BUCKET_TO_CODE.crs, "diagnostic");
    assert.equal(BUCKET_TO_CODE.deposit, "card-stacking-dfy");
    assert.equal(BUCKET_TO_CODE.diy, "diy-letter-pack");
    assert.equal(BUCKET_TO_CODE.success_fee, "card-stacking-dfy");
    assert.equal(BUCKET_TO_CODE.unmatched, null);
  });

  test("a repair payment resolves to the repair product, not the DIY package", () => {
    // offers.mjs gives REPAIR_DFY and REPAIR_TRIAL paymentPurpose 'repair', and
    // 015_seed_products.sql has exactly one category='repair' product. Before
    // this entry existed the bucket resolved to nothing and the sale landed on
    // consulting-package.
    assert.equal(BUCKET_TO_CODE.repair, "repair-bundle");
  });

  /* STRICTER THAN WHAT IT REPLACED, and deliberately so.
     This test used to assert BUCKET_TO_CODE.diy === "consulting-package" — the
     SAME code src/config/offers.mjs sells the $5,000 Capital Blueprint on. It
     passed while the defect it should have caught was live: two products at two
     prices behind one code, so a payment could not say which had been bought and
     the entitlement lookup, which is keyed on that code, opened the wrong tile.
     Sim Eleven-Blueprint paid $5,000 on production and his Capital Blueprint tile
     stayed locked.

     The old assertion pinned one value. This one pins that value AND the property
     the old one could not express: the DIY bucket and the Blueprint offer must
     never resolve to the same product again. A future edit that re-merges them
     fails here, which the old line would have welcomed. */
  test("the DIY bucket and the Capital Blueprint are different products", () => {
    const blueprint = OFFERS.UWIQ_DELIVERABLES;
    assert.equal(blueprint.name, "Capital Blueprint");
    assert.equal(blueprint.productCode, "consulting-package");
    assert.notEqual(
      BUCKET_TO_CODE.diy, blueprint.productCode,
      "the DIY letter downsell and the $5,000 Capital Blueprint share a product " +
      "code again — a payment can no longer say which one it bought"
    );
    // And no other offer may quietly take the DIY bucket's code either.
    const clash = Object.values(OFFERS).filter((o) => o.productCode === BUCKET_TO_CODE.diy);
    assert.deepEqual(clash, [], "an offer in the catalogue now sells on the DIY bucket's code");
  });

  test("paymentKindFor picks sale_payments.kind from event + bucket", () => {
    assert.equal(paymentKindFor("deposit", "deposit.paid"), "deposit");
    assert.equal(paymentKindFor("crs", "diagnostic.paid"), "deposit");
    assert.equal(paymentKindFor("diy", "sale.closed"), "deposit");
    assert.equal(paymentKindFor("success_fee", "payment.received"), "success_fee");
    assert.equal(paymentKindFor("unmatched", "payment.received"), "installment");
  });
});

describe("money-chain says why nothing unlocked", () => {
  // The rule stays: never grant an entitlement nobody mapped. What changed is
  // that the refusal now names itself, so "he paid and his portal is still
  // locked" has a readable answer instead of a silent return.

  test("no client on the payment is the first reason, before any product lookup", () => {
    assert.equal(nothingUnlockedReason({ clientId: null, product: { code: "diagnostic" } }), "no_client");
    assert.equal(nothingUnlockedReason({}), "no_client");
  });

  test("a payment we cannot pin to a product is its own distinct reason", () => {
    assert.equal(nothingUnlockedReason({ clientId: "c1", product: null }), "no_product");
    assert.equal(nothingUnlockedReason({ clientId: "c1", product: {} }), "no_product");
  });

  test("client plus product means go and read the mapping", () => {
    assert.equal(nothingUnlockedReason({ clientId: "c1", product: { code: "diagnostic" } }), null);
  });

  test("the log line is one greppable prefix", () => {
    // Anyone chasing a locked portal greps for this exact string.
    assert.equal(NOTHING_UNLOCKED, "[money-chain] nothing unlocked");
  });
});

describe("money-chain attribution", () => {
  function attributionDb() {
    const staff = new Map([
      ["closer-1", { id: "closer-1", role: "closer" }],
      ["manager-1", { id: "manager-1", role: "sales_manager" }]
    ]);
    const rows = [];
    return {
      rows,
      query: async (sql, params) => {
        const text = String(sql);
        if (/FROM staff/i.test(text)) {
          const row = staff.get(params[0]);
          return { rows: row ? [row] : [] };
        }
        if (/SELECT 1 FROM sale_attributions/i.test(text)) {
          const [saleId, staffId, role, basis] = params;
          return {
            rows: rows.some((r) =>
              r.sale_id === saleId && r.staff_id === staffId &&
              r.role === role && r.basis === basis
            ) ? [{ "?column?": 1 }] : []
          };
        }
        if (/SUM\(split_percent\)/i.test(text)) {
          const [saleId, basis, role] = params;
          const total = rows
            .filter((r) => r.sale_id === saleId && r.basis === basis && r.role === role)
            .reduce((sum, r) => sum + r.split_percent, 0);
          return { rows: [{ s: total }] };
        }
        if (/INSERT INTO sale_attributions/i.test(text)) {
          const [org_id, sale_id, staff_id, role, basis, split_percent] = params;
          const row = { id: `attr-${rows.length + 1}`, org_id, sale_id, staff_id, role, basis, split_percent };
          rows.push(row);
          return { rows: [{ id: row.id }] };
        }
        throw new Error(`unhandled SQL: ${text.slice(0, 100)}`);
      }
    };
  }

  test("a real closer and manager each receive their own front- and back-end credit", async () => {
    const db = attributionDb();
    const result = await ensureAttributions(db, {
      orgId: "org-1",
      saleId: "sale-1",
      event: {
        payload: { closerId: "closer-1", salesManagerId: "manager-1" }
      }
    });

    assert.equal(result.written, 4);
    assert.deepEqual(
      db.rows.map((r) => `${r.role}:${r.basis}`).sort(),
      [
        "closer:back_end",
        "closer:front_end",
        "sales_manager:back_end",
        "sales_manager:front_end"
      ]
    );
  });

  test("missing actors remain unattributed", async () => {
    const db = attributionDb();
    const result = await ensureAttributions(db, {
      orgId: "org-1",
      saleId: "sale-1",
      event: { payload: {} }
    });
    assert.equal(result.written, 0);
    assert.deepEqual(db.rows, []);
  });
});

describe("ensureSalePayment", () => {
  test("INSERT copies product_id from the sale so deposit.paid can write sale_payments", async () => {
    const calls = [];
    const db = {
      query: async (sql, params) => {
        const text = String(sql);
        calls.push({ sql: text, params });
        if (/FROM transactions/i.test(text)) return { rows: [] };
        if (/INSERT INTO sale_payments/i.test(text)) {
          return { rows: [{ id: "pay-1", product_id: params[3] }] };
        }
        throw new Error(`unhandled SQL: ${text.slice(0, 100)}`);
      }
    };

    const result = await ensureSalePayment(db, {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      orgId: "org-1",
      name: "deposit.paid",
      payload: { amount: 3000 }
    }, {
      saleId: "sale-1",
      productId: "prod-from-sale",
      kind: "deposit"
    });

    assert.equal(result.created, true);
    assert.equal(result.payment?.id, "pay-1");
    const ins = calls.find((c) => /INSERT INTO sale_payments/i.test(c.sql));
    assert.ok(ins, "deposit.paid must INSERT sale_payments when a sale exists");
    assert.match(ins.sql, /product_id/, "INSERT must include product_id (live NOT NULL)");
    assert.equal(ins.params[3], "prod-from-sale");
  });
});

describe("resolveProductId matches product codes, not just display names", () => {
  function productDb(rows) {
    return {
      query: async (sql, params) => {
        const text = String(sql);
        if (/resolve_product_id/i.test(text)) return { rows: [] };
        if (/FROM products WHERE org_id/i.test(text) && /lower\(code\)/i.test(text)) {
          const code = String(params[1] || "").toLowerCase();
          const row = rows.find((r) => r.code === code);
          return { rows: row ? [{ id: row.id }] : [] };
        }
        if (/FROM products WHERE id/i.test(text)) {
          const row = rows.find((r) => r.id === params[0]);
          return { rows: row ? [row] : [] };
        }
        return { rows: [] };
      }
    };
  }

  test("a catalog name miss still finds the product by code", async () => {
    const db = productDb([{ id: "p-repair", code: "repair-bundle" }]);
    const id = await resolveProductId(db, "org-1", {
      productName: "repair-bundle",
      productBucket: "repair"
    });
    assert.equal(id, "p-repair");
  });

  test("a product code used as the sale.closed bucket still resolves", async () => {
    const db = productDb([{ id: "p-course", code: "funding-mastery" }]);
    const id = await resolveProductId(db, "org-1", {
      productName: "Funding Mastery course (A to Z)",
      productBucket: "funding-mastery"
    });
    assert.equal(id, "p-course");
  });
});

/* HOLE 8 — the person row follows the rounds.
   On the 2026-09-17 live walk Sim Eight-Funding had two funded $25,000 rounds
   and clients.funded was still false with no amount, because nothing ever
   wrote it. round.funded now writes it, right after the round itself. */
describe("round.funded writes the person row funded (hole 8)", () => {
  const ORG = "00000000-0000-4000-8000-0000000000a8";
  const CLIENT = "00000000-0000-4000-8000-0000000000c8";
  const ROUND = "00000000-0000-4000-8000-0000000000f8";

  function roundDb(round) {
    const queries = [];
    return {
      queries,
      query: async (sql, params = []) => {
        const text = String(sql);
        queries.push({ text, params });
        if (/SELECT \* FROM funding_rounds WHERE id = \$1/.test(text)) return { rows: [round] };
        if (/UPDATE funding_rounds/.test(text)) {
          return { rows: [{ ...round, status: "funded", funded_amount: String(params[1]) }] };
        }
        if (/UPDATE clients c/.test(text)) {
          return { rows: [{ id: params[0], funded: true, funded_amount: "50000.00" }] };
        }
        return { rows: [] };
      }
    };
  }

  // Not card stacking, so the bank-yes check (which has its own tests) is not
  // what this test is about.
  const altFinRound = () => ({
    id: ROUND, org_id: ORG, client_id: CLIENT, round_number: 2,
    status: "approved", product: "alt_fin", funded_amount: null, approved_amount: null
  });

  test("a funded round marks the client funded, scoped to that client and org", async () => {
    const db = roundDb(altFinRound());
    const out = await onRoundFundedMoney(
      { name: "round.funded", orgId: ORG, clientId: CLIENT, payload: { fundingRoundId: ROUND, fundedAmount: 25000 } },
      db
    );
    assert.equal(out.done, true, JSON.stringify(out));
    const roundAt = db.queries.findIndex((q) => /UPDATE funding_rounds/.test(q.text));
    const clientAt = db.queries.findIndex((q) => /UPDATE clients c/.test(q.text));
    assert.ok(roundAt >= 0, "the round was never written funded");
    assert.ok(clientAt >= 0,
      "the round was written funded and the person row was not — clients.funded stays false, " +
      "which is exactly what the 2026-09-17 live walk found on Sim Eight-Funding");
    assert.ok(clientAt > roundAt, "the person row must be written after the round, from the rounds");
    assert.deepEqual(db.queries[clientAt].params, [CLIENT, ORG]);
  });

  test("a refused round.funded does not touch the person row", async () => {
    const db = roundDb(altFinRound());
    const out = await onRoundFundedMoney(
      { name: "round.funded", orgId: ORG, clientId: CLIENT, payload: { fundingRoundId: ROUND } },
      db
    );
    assert.equal(out.done, false);
    assert.equal(out.reason, "missing_funded_amount");
    assert.ok(!db.queries.some((q) => /UPDATE clients/.test(q.text)),
      "a round that did not fund marked the client funded");
  });

  test("the funded total is the funded rounds, and unknown stays unknown", () => {
    const sql = SQL_SYNC_CLIENT_FUNDED;
    assert.match(sql, /fr\.status = 'funded'/, "only funded rounds may count toward the funded total");
    assert.match(sql, /SUM\(fr\.funded_amount\)/, "the funded total is the sum of the funded rounds");
    assert.match(sql, /bool_and\(fr\.funded_amount IS NOT NULL\)/,
      "a funded round with no amount must leave the total unknown (NULL), not a partial sum");
    assert.doesNotMatch(sql, /COALESCE\([^)]*funded_amount[^)]*,\s*0\)/i, "unknown money must never become 0");
    assert.match(sql, /HAVING count\(\*\) > 0/, "a client with no funded round must not be marked funded");
    assert.doesNotMatch(sql, /funded\s*=\s*false/i, "this never un-funds a client");
  });

  test("with no client or org it does nothing", async () => {
    const db = roundDb(altFinRound());
    assert.equal(await syncClientFunded(db, { clientId: null, orgId: ORG }), null);
    assert.equal(await syncClientFunded(db, { clientId: CLIENT, orgId: null }), null);
    assert.equal(db.queries.length, 0);
  });
});
