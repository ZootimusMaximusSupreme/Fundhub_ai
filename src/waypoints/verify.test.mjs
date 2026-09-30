import { describe, test } from "node:test";
import assert from "node:assert";
import {
  judgeDisputeMailReceipt,
  judgeBureauResponseUpload,
  judgePaydown
} from "./verify.mjs";

describe("document proof judges", () => {
  test("dispute mail receipt completes when the upload is on file", () => {
    const docs = [{ kind: "client_upload", subtype: "dispute_mail_receipt" }];
    assert.equal(judgeDisputeMailReceipt(docs).verdict, "complete");
    assert.equal(judgeDisputeMailReceipt([]).verdict, "open");
    assert.equal(judgeDisputeMailReceipt([{ kind: "client_upload", subtype: "other" }]).verdict, "open");
  });

  test("bureau response upload completes when any bureau_response document exists", () => {
    const docs = [{ kind: "bureau_response", subtype: "bureau_letter" }];
    assert.equal(judgeBureauResponseUpload(docs).verdict, "complete");
    assert.equal(judgeBureauResponseUpload([]).verdict, "open");
  });
});

describe("judgePaydown (unchanged guard)", () => {
  test("still closes at or under target", () => {
    const wp = { params: { target_cents: 30000 } };
    const account = { balanceCents: 30000 };
    assert.equal(judgePaydown(wp, account).verdict, "complete");
  });
});
