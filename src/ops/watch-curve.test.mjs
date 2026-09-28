import { test, describe } from "node:test";
import assert from "node:assert";
import { MIN_N_RATE } from "./discoveries.mjs";
import {
  diesBefore25Percent,
  dyingAlertCopy,
  notifyDyingBefore25,
  DIES_BEFORE_25_THRESHOLD
} from "./watch-curve.mjs";

describe("diesBefore25Percent", () => {
  test("most plays never reach 25% → dying", () => {
    const out = diesBefore25Percent({ plays: 100, p25: 30 });
    assert.equal(out.dying, true);
    assert.ok(out.rate < DIES_BEFORE_25_THRESHOLD);
  });

  test("half or more reach 25% → not dying", () => {
    const out = diesBefore25Percent({ plays: 100, p25: 50 });
    assert.equal(out.dying, false);
  });

  test("too few plays → not a call", () => {
    const out = diesBefore25Percent({ plays: MIN_N_RATE - 1, p25: 1 });
    assert.equal(out.dying, false);
    assert.match(out.note, /Need/);
  });

  test("early leave plus a tap through is a hop, not a broken opening", () => {
    const out = diesBefore25Percent({ plays: 200, p25: 40, clicks: 80 });
    assert.equal(out.dying, false);
    assert.equal(out.hopped, true);
    assert.match(out.note, /hop/i);
  });

  test("early leave with almost no taps is still a broken opening", () => {
    const out = diesBefore25Percent({ plays: 200, p25: 40, clicks: 10 });
    assert.equal(out.dying, true);
    assert.equal(out.hopped, false);
  });

  test("unknown Meta numbers → not dying", () => {
    assert.equal(diesBefore25Percent({}).dying, false);
    assert.equal(diesBefore25Percent({ plays: null, p25: 10 }).dying, false);
  });
});

describe("dyingAlertCopy", () => {
  test("names the ad and says change the opening", () => {
    const copy = dyingAlertCopy("SLO Ad 3 — Straight Offer");
    assert.match(copy.title, /SLO Ad 3/);
    assert.match(copy.title, /quarter mark/i);
    assert.match(copy.body, /opening/i);
  });
});

describe("notifyDyingBefore25", () => {
  test("buzzes once for a dying ACTIVE ad and records the day", async () => {
    const calls = [];
    const db = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM ads a/i.test(sql)) {
          return {
            rows: [{
              ad_id: "ad-1",
              org_id: "org-1",
              partner_id: "p-1",
              ad_name: "SLO Ad 7 — Haynes",
              metric_date: "2026-09-27",
              video_plays: 200,
              video_p25_watched: 40
            }]
          };
        }
        return { rows: [] };
      }
    };
    let sent = null;
    const send = async (msg) => {
      sent = msg;
      return { ok: true, status: "sent" };
    };
    const out = await notifyDyingBefore25(db, { partnerId: "p-1", send });
    assert.equal(out.alerted, 1);
    assert.match(sent.notification.title, /Haynes|SLO Ad 7/);
    assert.ok(calls.some((c) => /ad_watch_curve_alerts/i.test(c.sql)),
      "the alert day was not recorded");
  });

  test("does not buzz when enough people reach 25%", async () => {
    const db = {
      query: async () => ({
        rows: [{
          ad_id: "ad-1",
          org_id: "org-1",
          partner_id: "p-1",
          ad_name: "Healthy ad",
          video_plays: 200,
          video_p25_watched: 120
        }]
      })
    };
    let sent = false;
    const out = await notifyDyingBefore25(db, {
      partnerId: "p-1",
      send: async () => { sent = true; return { ok: true, status: "sent" }; }
    });
    assert.equal(sent, false);
    assert.equal(out.alerted, 0);
  });
});
