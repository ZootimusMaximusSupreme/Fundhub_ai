// The phone-approval door. Runs with NO DATABASE.
//
// Lives under src/http/ so npm test's `src/**` glob picks it up (CLAUDE.md
// §12). The real SQL is exercised by src/http/ad-video-decision.pg.test.mjs.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THE FAKE BELOW IS, AND WHAT IT IS HONESTLY WORTH
//
// fakeStore() is not a stub that answers whatever each test wants. It is a
// small model of the two statements src/video/decision-store.mjs actually
// makes, INCLUDING the guards in their WHERE clauses:
//
//   * the read returns the token joined to its take, or nothing;
//   * the spend applies `used_at IS NULL`, `expires_at > now()` and
//     `status = 'awaiting_approval'` before it writes, exactly as the SQL does,
//     and reports zero rows when any of them fails.
//
// That is what makes the replay test below mean something. A stub that simply
// returned success twice would prove only that the handler calls a function.
//
// WHAT IT CANNOT PROVE, AND THIS IS STATED PLAINLY: that Postgres really
// re-checks the WHERE under a row lock, that 390's policies keep this door to
// one row, and that the column names match the real table. Those need a
// database. They are in the .pg.test.mjs file, and that file WAS NOT RUN —
// there is no local Postgres on this machine.

import { test, describe } from "node:test";
import assert from "node:assert";

import handler from "../../api/public/ad-video-decision.mjs";
import { mintDecisionToken } from "../video/decision-token.mjs";

const VIDEO_ID = "77777777-7777-4777-8777-777777777777";
const ORG = "11111111-1111-4111-8111-111111111111";

/* ── the model ────────────────────────────────────────────────────────────── */

function fakeStore({ status = "awaiting_approval", expired = false, used = false } = {}) {
  const { token, selector, verifierHash } = mintDecisionToken();

  const state = {
    token: {
      token_id: "tok-1",
      selector,
      verifier_sha256: verifierHash,
      expires_at: new Date(Date.now() + (expired ? -60_000 : 3_600_000)),
      used_at: used ? new Date() : null,
      decision: used ? "approve" : null
    },
    video: {
      id: VIDEO_ID, org_id: ORG, ad_id: "43", take_no: 2, status,
      video_kind: "ad", finished_version: 1, duration_seconds: 102,
      width: 1920, height: 1080,
      submagic_download_url: "https://cdn.submagic.test/043_t02.mp4",
      approved_at: null, approved_by: null, rejected_reason: null
    },
    scopes: []
  };

  /* Stands in for withDecisionScope: records the selector the transaction was
     opened for, so a test can assert the door never widens its own scope. */
  const withDecisionScope = async (sel, fn) => {
    state.scopes.push(sel);
    return fn({
      query: async (sql, params) => {
        if (/FROM ad_video_decision_tokens t\s+JOIN ad_videos v/.test(sql)) {
          // The read. Selector must match, or the row is invisible.
          if (params[0] !== state.token.selector) return { rows: [] };
          return { rows: [{ ...state.token, ...state.video, token_id: state.token.token_id }] };
        }

        if (/WITH spent AS/.test(sql)) {
          const [tokenId, decision, nextStatus, decidedBy, reason] = params;

          // The three guards the real UPDATE carries in its WHERE clause.
          const okToken = tokenId === state.token.token_id
            && state.token.used_at == null
            && state.token.expires_at.getTime() > Date.now();
          const okVideo = state.video.status === "awaiting_approval";

          if (!okToken || !okVideo) {
            return { rows: [{ spent_count: okToken ? 1 : 0, id: null, ad_id: null,
              take_no: null, status: null, finished_version: null }] };
          }

          state.token.used_at = new Date();
          state.token.decision = decision;
          state.video.status = nextStatus;
          if (nextStatus === "approved") {
            state.video.approved_at = new Date();
            state.video.approved_by = decidedBy;
          } else {
            state.video.rejected_reason = reason;
          }

          return { rows: [{
            spent_count: 1, id: state.video.id, ad_id: state.video.ad_id,
            take_no: state.video.take_no, status: state.video.status,
            finished_version: state.video.finished_version
          }] };
        }

        throw new Error(`fakeStore: unexpected SQL — ${sql.slice(0, 60)}`);
      }
    });
  };

  return { token, selector, state, withDecisionScope };
}

function mkRes() {
  return {
    statusCode: null, body: null, html: null, headers: {}, finished: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.finished = true; return this; },
    send(s) { this.html = s; this.finished = true; return this; },
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; return this; }
  };
}

const getReq = (t) => ({ method: "GET", headers: {}, query: t == null ? {} : { t }, body: null });
const postReq = (body) => ({
  method: "POST", headers: { "content-type": "application/json" }, query: {},
  body, rawBody: JSON.stringify(body ?? {})
});

async function call(req, store) {
  const res = mkRes();
  await handler(req, res, { withDecisionScope: store.withDecisionScope });
  return res;
}

/* ── 1. the happy path ────────────────────────────────────────────────────── */

describe("a valid token approves once", () => {
  test("POST approve moves the take and answers with what it did", async () => {
    const store = fakeStore();
    const res = await call(postReq({ token: store.token, decision: "approve" }), store);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true, decision: "approve", status: "approved", ad_id: "43", take_no: 2
    });
    assert.equal(store.state.video.status, "approved");
    assert.equal(store.state.video.approved_by, "chris");
    assert.ok(store.state.video.approved_at, "approved_at is stamped");
    assert.ok(store.state.token.used_at, "the key is spent");
  });

  test("the ad number is echoed UNPADDED", async () => {
    // Padding it here would be the first step towards a padded utm_content,
    // which splits one ad's results in half (plan §4).
    const store = fakeStore();
    const res = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(res.body.ad_id, "43");
  });

  test("the transaction is opened for the token's own selector and nothing wider", async () => {
    const store = fakeStore();
    await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.deepEqual(store.state.scopes, [store.selector]);
  });
});

/* ── 2. replay ────────────────────────────────────────────────────────────── */

describe("*** REPLAY IS REFUSED ***", () => {
  test("the same token a second time changes nothing and says nothing new", async () => {
    const store = fakeStore();

    const first = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(first.statusCode, 200);

    const second = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(second.statusCode, 404);
    assert.deepEqual(second.body, { ok: false, error: "invalid" });
    assert.equal(store.state.video.status, "approved", "the take did not move again");
  });

  test("*** A REPLAY CANNOT OVERTURN THE FIRST DECISION ***", async () => {
    // The failure this guard exists for: Chris rejects, something re-fires the
    // approve button, and the reject silently becomes an approve.
    const store = fakeStore();

    await call(postReq({ token: store.token, decision: "reject" }), store);
    assert.equal(store.state.video.status, "rejected");

    const flip = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(flip.statusCode, 404);
    assert.equal(store.state.video.status, "rejected", "the first decision must stand");
    assert.equal(store.state.video.approved_by, null);
  });

  test("a token minted already-spent is refused before any write is attempted", async () => {
    const store = fakeStore({ used: true });
    const res = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(res.statusCode, 404);
    assert.equal(store.state.video.status, "awaiting_approval");
  });
});

/* ── 3. a bad token ───────────────────────────────────────────────────────── */

describe("a bad token is 404, and every refusal looks the same", () => {
  const bad = [
    ["no token at all", undefined],
    ["empty", ""],
    ["not our shape", "hello"],
    ["another repo prefix", `slo_${"a".repeat(24)}`],
    ["right shape, never minted", `avd_${"a".repeat(32)}_${"b".repeat(64)}`],
    ["SQL in the value", `avd_${"a".repeat(32)}_${"b".repeat(64)}' OR '1'='1`],
    ["upper case hex", `avd_${"A".repeat(32)}_${"B".repeat(64)}`]
  ];

  for (const [name, value] of bad) {
    test(`POST — ${name}`, async () => {
      const store = fakeStore();
      const res = await call(postReq({ token: value, decision: "approve" }), store);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { ok: false, error: "invalid" });
      assert.equal(store.state.video.status, "awaiting_approval");
    });
  }

  test("*** THE RIGHT SELECTOR WITH THE WRONG SECRET IS REFUSED ***", async () => {
    // The whole point of the two-halves design. Guessing or reading the public
    // selector must not be enough to decide anything.
    const store = fakeStore();
    const [, selector] = store.token.split("_");
    const forged = `avd_${selector}_${"c".repeat(64)}`;

    const res = await call(postReq({ token: forged, decision: "approve" }), store);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { ok: false, error: "invalid" });
    assert.equal(store.state.video.status, "awaiting_approval");
  });

  test("an expired token is refused", async () => {
    const store = fakeStore({ expired: true });
    const res = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(res.statusCode, 404);
    assert.equal(store.state.video.status, "awaiting_approval");
  });

  test("a take that is not waiting on a person is refused", async () => {
    const store = fakeStore({ status: "editing" });
    const res = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(res.statusCode, 404);
    assert.equal(store.state.video.status, "editing");
  });

  test("EVERY refusal is byte-identical — nothing tells them apart", async () => {
    const answers = [];
    for (const [, value] of bad) {
      const store = fakeStore();
      const res = await call(postReq({ token: value, decision: "approve" }), store);
      answers.push(JSON.stringify({ s: res.statusCode, b: res.body }));
    }
    for (const spec of [{ used: true }, { expired: true }, { status: "editing" }]) {
      const store = fakeStore(spec);
      const res = await call(postReq({ token: store.token, decision: "approve" }), store);
      answers.push(JSON.stringify({ s: res.statusCode, b: res.body }));
    }
    assert.equal(new Set(answers).size, 1,
      "two refusals differed — this endpoint would answer 'is this a real key?' one guess at a time");
  });
});

/* ── 4. reject ────────────────────────────────────────────────────────────── */

describe("the reject path", () => {
  test("POST reject moves the take to rejected", async () => {
    const store = fakeStore();
    const res = await call(postReq({ token: store.token, decision: "reject" }), store);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.decision, "reject");
    assert.equal(res.body.status, "rejected");
    assert.equal(store.state.video.status, "rejected");
    assert.equal(store.state.video.approved_at, null, "a reject never stamps approved_at");
    assert.equal(store.state.video.approved_by, null);
  });

  test("a reason is kept on a reject, capped", async () => {
    const store = fakeStore();
    await call(postReq({ token: store.token, decision: "reject", reason: "stumbled at 0:12" }), store);
    assert.equal(store.state.video.rejected_reason, "stumbled at 0:12");

    /* 500 characters: over the 280-character reason cap, but still inside the
       2 KB body cap, so it is the REASON cap being tested and not the body one.
       A 5000-character reason is refused earlier, as 413 — which is correct,
       and is asserted separately in "the door". */
    const long = fakeStore();
    const res = await call(
      postReq({ token: long.token, decision: "reject", reason: "x".repeat(500) }), long);
    assert.equal(res.statusCode, 200);
    assert.equal(long.state.video.rejected_reason.length, 280);
  });

  test("a blank reason is stored as nothing, not as an empty string", async () => {
    const store = fakeStore();
    await call(postReq({ token: store.token, decision: "reject", reason: "   " }), store);
    assert.equal(store.state.video.rejected_reason, null);
  });

  test("a reason on an APPROVE is dropped — an approval has nothing to explain", async () => {
    const store = fakeStore();
    await call(postReq({ token: store.token, decision: "approve", reason: "looks fine" }), store);
    assert.equal(store.state.video.rejected_reason, null);
  });

  test("a decision word we do not know is refused, not guessed at", async () => {
    for (const d of ["delivered", "approved", "yes", "", null, "__proto__"]) {
      const store = fakeStore();
      const res = await call(postReq({ token: store.token, decision: d }), store);
      assert.equal(res.statusCode, 404, `decision=${String(d)} must be refused`);
      assert.equal(store.state.video.status, "awaiting_approval");
    }
  });
});

/* ── 5. nothing leaks ─────────────────────────────────────────────────────── */

describe("*** NOTHING LEAKS WITHOUT A VALID TOKEN ***", () => {
  test("a GET with no token shows the same blank page as a wrong one", async () => {
    const store = fakeStore();
    const none = await call(getReq(undefined), store);
    const wrong = await call(getReq(`avd_${"a".repeat(32)}_${"b".repeat(64)}`), store);

    assert.equal(none.statusCode, 404);
    assert.equal(wrong.statusCode, 404);
    assert.equal(none.html, wrong.html, "the two pages differed");
  });

  test("a refused GET carries no ad number, no take, no video URL", async () => {
    const store = fakeStore();
    const res = await call(getReq("rubbish"), store);
    const page = String(res.html);
    for (const secret of ["43", "043", "submagic", "cdn.submagic.test", "take 2", VIDEO_ID, ORG]) {
      assert.ok(!page.toLowerCase().includes(secret.toLowerCase()),
        `the refusal page leaked "${secret}"`);
    }
  });

  test("a refused POST body says one word and nothing about the row", async () => {
    const store = fakeStore();
    const res = await call(postReq({ token: "rubbish", decision: "approve" }), store);
    const body = JSON.stringify(res.body);
    assert.equal(body, '{"ok":false,"error":"invalid"}');
    for (const secret of ["43", "submagic", VIDEO_ID, ORG]) {
      assert.ok(!body.includes(secret));
    }
  });

  test("a VALID GET shows the take, because by then the caller has proved it holds the key", async () => {
    const store = fakeStore();
    const res = await call(getReq(store.token), store);
    assert.equal(res.statusCode, 200);
    assert.match(res.html, /Ad 043/);
    assert.match(res.html, /cdn\.submagic\.test/);
    assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
  });

  test("*** A GET NEVER DECIDES ANYTHING ***", async () => {
    /* The load-bearing rule. A GET that decided would be fired by every link
       preview, mail prefetcher and URL scanner that touched the notification. */
    const store = fakeStore();
    const res = await call(getReq(store.token), store);

    assert.equal(res.statusCode, 200);
    assert.equal(store.state.video.status, "awaiting_approval", "a GET moved the take");
    assert.equal(store.state.token.used_at, null, "a GET spent the key");
  });

  test("a GET can be repeated as often as a scanner likes, and the key still works after", async () => {
    const store = fakeStore();
    for (let i = 0; i < 5; i++) await call(getReq(store.token), store);
    const decided = await call(postReq({ token: store.token, decision: "approve" }), store);
    assert.equal(decided.statusCode, 200, "five previews burned the one-time key");
  });

  test("the approval key is kept out of caches, referrers and search engines", async () => {
    const store = fakeStore();
    const res = await call(getReq(store.token), store);
    assert.match(res.headers["cache-control"], /no-store/);
    assert.equal(res.headers["referrer-policy"], "no-referrer");
    assert.match(res.headers["x-robots-tag"], /noindex/);
  });
});

/* ── the shape of the door itself ─────────────────────────────────────────── */

describe("the door", () => {
  test("refuses a method it does not answer", async () => {
    const store = fakeStore();
    const res = mkRes();
    await handler({ method: "DELETE", headers: {}, query: {} }, res,
      { withDecisionScope: store.withDecisionScope });
    assert.equal(res.statusCode, 405);
    assert.match(res.headers.allow, /GET, POST, OPTIONS/);
  });

  test("answers the browser's preflight without reading or writing anything", async () => {
    const store = fakeStore();
    const res = mkRes();
    await handler({ method: "OPTIONS", headers: { origin: "https://apply.fundhub.ai" }, query: {} },
      res, { withDecisionScope: store.withDecisionScope });
    assert.equal(res.statusCode, 200);
    assert.equal(store.state.scopes.length, 0, "the preflight touched the database");
  });

  test("echoes an allow-listed origin and NEVER a wildcard", async () => {
    const store = fakeStore();
    const res = mkRes();
    await handler({ method: "OPTIONS", headers: { origin: "https://apply.fundhub.ai" }, query: {} },
      res, { withDecisionScope: store.withDecisionScope });
    assert.equal(res.headers["access-control-allow-origin"], "https://apply.fundhub.ai");

    const evil = mkRes();
    await handler({ method: "OPTIONS", headers: { origin: "https://evil.test" }, query: {} },
      evil, { withDecisionScope: store.withDecisionScope });
    assert.equal(evil.headers["access-control-allow-origin"], undefined);
  });

  test("an oversized body is refused by byte count before it is parsed", async () => {
    const store = fakeStore();
    const res = mkRes();
    const huge = { token: store.token, decision: "approve", reason: "x".repeat(4000) };
    await handler(
      { method: "POST", headers: {}, query: {}, body: huge, rawBody: JSON.stringify(huge) },
      res, { withDecisionScope: store.withDecisionScope });
    assert.equal(res.statusCode, 413);
    assert.equal(store.state.scopes.length, 0, "an oversized body reached the database");
  });

  test("a body that is not JSON is refused, not repaired", async () => {
    const store = fakeStore();
    const res = mkRes();
    await handler({ method: "POST", headers: {}, query: {}, body: "{not json", rawBody: "{not json" },
      res, { withDecisionScope: store.withDecisionScope });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { ok: false, error: "invalid" });
  });

  test("a store that throws answers one word, never a database message", async () => {
    const res = mkRes();
    await handler(postReq({ token: `avd_${"a".repeat(32)}_${"b".repeat(64)}`, decision: "approve" }),
      res, {
        withDecisionScope: async () => { throw new Error("connection to 10.0.0.4:5432 refused"); }
      });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { ok: false, error: "error" });
    assert.ok(!JSON.stringify(res.body).includes("5432"));
  });
});
