import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { smsBody } from "./notify-fanout.mjs";

/* The fan-out itself imports the real providers; those are fenced and refuse
   with MESSAGING_DRY_RUN unset, which is exactly what these tests rely on: a
   run here can never send anything. The shape is what is under test. */
const notification = {
  title: "084_t01 is ready",
  click: "https://video.example/final.mp4",
  actions: [{ label: "Approve", url: "https://fundhub.ai/a?token=x" }, { label: "Reject", url: "https://fundhub.ai/r?token=x" }]
};

describe("the text Chris gets", () => {
  test("carries the video and both decisions, one link per line", () => {
    const body = smsBody(notification);
    assert.match(body, /^084_t01 is ready\n/);
    assert.match(body, /\nWatch: https:\/\/video\.example\/final\.mp4\n/);
    assert.match(body, /\nApprove: https:\/\/fundhub\.ai\/a\?token=x\n/);
    assert.match(body, /\nReject: https:\/\/fundhub\.ai\/r\?token=x$/);
  });

  test("a notification with no links is still a readable sentence", () => {
    assert.equal(smsBody({ title: "Ad 84 is ready" }), "Ad 84 is ready");
  });
});

describe("the fan-out never throws and never sends from a test", async () => {
  const { send } = await import("./notify-fanout.mjs");
  test("with no number set, the text is skipped and said so", async () => {
    const res = await send({ id: "r1", notification }, { env: { NTFY_TOPIC: "" } });
    assert.equal(res.channels.sms, false);
    assert.match(res.error || "", /PULSE_SMS_TO is not set|text not sent/);
  });
});

describe("the pulse number reaches Twilio in the shape it wants", async () => {
  const { normalizeUsNumber, chrisPulseSmsTo } = await import("../pulse/notify.mjs");
  test("common ways a US number gets typed all become +1 and ten digits", () => {
    for (const v of ["6025551234", "602 555 1234", "(602) 555-1234", "1-602-555-1234", "16025551234", "+16025551234"]) {
      assert.equal(normalizeUsNumber(v), "+16025551234", v);
    }
  });
  test("an already-international number is left alone", () => {
    assert.equal(normalizeUsNumber("+447700900123"), "+447700900123");
  });
  test("chrisPulseSmsTo hands back the tidied number", () => {
    assert.equal(chrisPulseSmsTo({ PULSE_SMS_TO: "(602) 555-1234" }), "+16025551234");
    assert.equal(chrisPulseSmsTo({}), null);
  });
});

describe("with a number set, the text is what counts", async () => {
  const { send } = await import("./notify-fanout.mjs");
  const notification = { title: "Ad 84 take 1 is ready", click: "https://v.example/f.mp4", actions: [] };
  test("no number: an ntfy-only setup still reports what it did", async () => {
    const res = await send({ id: "r", notification }, { env: {} });
    assert.equal(res.ok, false, "nothing is configured in a test, so nothing sent");
    assert.match(res.error, /no number set for a text/);
  });
});
