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
