// Postgres-backed tests for how staff give people a way in:
//   GET|POST /api/yesdoor/staff/brokers      POST /api/yesdoor/staff/accounts
//
// Proved: the wrong principal gets 401/403; a login can only be tied to this company's
// buildings and brokers (another company's are the same 404 as ones that do not exist, and
// nothing is half-created); the same email twice (any casing, any kind of login) and a
// second login for one broker are 409s while another company may reuse an address;
// the account, its building links, its sign-in email and the event land together; the
// emailed link signs the new person in and reaches only their buildings; the link never
// appears in a response; a split broker needs licence details; the tracking code is minted.
//
// SCRATCH database only, as fundhub_app. Skips without DATABASE_URL.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, close } from "../db.mjs";
import { buildYdFixture, call, creditLeaks } from "../yesdoor/testing/fixture.mjs";
import { useFixtureEnv, one, rows } from "../yesdoor/testing/b4.mjs";
import { verifyMagicLink } from "../yesdoor/auth/magic-link.mjs";

const HAVE_DB = !!process.env.DATABASE_URL;

describe("yesdoor staff create brokers and logins", { skip: !HAVE_DB ? "no DATABASE_URL" : false }, () => {
  let fx, h;
  const t = () => fx.tokens;
  const post = (door, token, body, extra = {}) => call(h[door], { method: "POST", token, body, ...extra });
  let n = 0;
  const addr = (tag = "p") => `${tag}${++n}-${fx.rand}@Example.test`;
  const brokerBody = (over = {}) => ({
    name: `Test Broker ${++n}`, email: addr("brk"), company: "Locator Co", plan: "split", splitPercent: 30,
    licenceState: "AZ", licenceNumber: `BR${100000 + n}`, ...over
  });
  const eventsFor = (entityId) => rows(db, `SELECT name, actor_kind, actor_id, payload FROM yd_events WHERE entity_id = $1 ORDER BY occurred_at, id`, [entityId]);
  const tokenFromOutbox = (row) => new URL(row.context.magic_link.url).searchParams.get("t");

  before(async () => {
    fx = await buildYdFixture(db);
    useFixtureEnv(fx);
    h = {};
    for (const [name, file] of [
      ["brokers", "staff/brokers"], ["accounts", "staff/accounts"], ["agreement", "staff/agreement"],
      ["esign", "webhooks/esign"], ["bRenters", "building/renters"], ["kLink", "broker/link"], ["verify", "auth/verify"]
    ]) h[name] = (await import(`../../api/yesdoor/${file}.mjs`)).default;
  });
  after(async () => { await close(); });

  /* ── who may do what ──────────────────────────────────────────────────── */

  test("both doors: nobody 401, an account session 401, a closer 403", async () => {
    for (const door of ["brokers", "accounts"]) {
      assert.equal((await post(door, undefined, {})).code, 401, `${door} without a session`);
      assert.equal((await post(door, t().renterA, {})).code, 401, `${door} with a renter session`);
      assert.equal((await post(door, t().buildingA, {})).code, 401, `${door} with a building session`);
      assert.equal((await post(door, t().brokerA, {})).code, 401, `${door} with a broker session`);
      assert.equal((await post(door, t().closerA, {})).code, 403, `${door} with a closer`);
      assert.equal((await post(door, t().collectionsA, {})).code, 403, `${door} with collections`);
    }
    assert.equal((await call(h.brokers, { token: t().closerA })).code, 403, "GET brokers with a closer");
    assert.equal((await call(h.brokers)).code, 401, "GET brokers with nobody");
  });

  test("creating a login is ops only: sales is refused (it may add brokers, not hand out logins)", async () => {
    const r = await post("accounts", t().salesA, { kind: "building_user", email: addr(), buildingIds: [fx.A.bSigned] });
    assert.equal(r.code, 403);
    assert.equal(await one(db, `SELECT id FROM yd_accounts WHERE org_id = $1 AND email = $2`, [fx.orgA, "x"]), null);
  });

  /* ── POST staff/brokers ───────────────────────────────────────────────── */

  describe("POST staff/brokers", () => {
    test("ops, sales and the owner can add a broker; the code is minted; it starts applied; one event names the staff member", async () => {
      for (const who of ["opsA", "salesA", "ownerA"]) {
        const body = brokerBody();
        const r = await post("brokers", t()[who], body);
        assert.equal(r.code, 201, `${who}: ${JSON.stringify(r.body)}`);
        const b = r.body.broker;
        assert.equal(b.name, body.name);
        assert.equal(b.email, body.email.toLowerCase(), "the email is stored lower-case");
        assert.equal(b.plan, "split");
        assert.equal(b.splitPercent, 30);
        assert.equal(b.status, "applied");
        assert.match(b.trackingCode, /^YD-\d{6}$/);
        assert.deepEqual(b.licence, { state: "AZ", number: body.licenceNumber, verifiedAt: null });
        assert.equal(b.hasAccount, false);
        const ev = await eventsFor(b.id);
        assert.deepEqual(ev.map((e) => e.name), ["broker.created"]);
        assert.equal(ev[0].actor_kind, "staff");
        assert.equal(ev[0].actor_id, fx.staffIds[who]);
        assert.equal(JSON.stringify(ev[0].payload).includes(body.licenceNumber), false, "the licence number is not copied into the timeline");
        const row = await one(db, `SELECT org_id FROM yd_brokers WHERE id = $1`, [b.id]);
        assert.equal(row.org_id, fx.orgA);
      }
    });

    test("defaults: split plan, 25 percent; a software partner needs no licence and takes no split", async () => {
      const split = await post("brokers", t().opsA, { name: "Default Split", email: addr(), licenceState: "CA", licenceNumber: "01234567" });
      assert.equal(split.code, 201);
      assert.equal(split.body.broker.plan, "split");
      assert.equal(split.body.broker.splitPercent, 25);

      const soft = await post("brokers", t().opsA, { name: "Software Only", email: addr(), plan: "software" });
      assert.equal(soft.code, 201);
      assert.equal(soft.body.broker.plan, "software");
      assert.deepEqual(soft.body.broker.licence, { state: null, number: null, verifiedAt: null });

      const withSplit = await post("brokers", t().opsA, { name: "Software Split", email: addr(), plan: "software", splitPercent: 10 });
      assert.equal(withSplit.code, 400, "a software-only partner takes no split percent");
    });

    test("a split partner needs a licence state and number; the state must be AZ, CA or FL", async () => {
      assert.equal((await post("brokers", t().opsA, { name: "No Licence", email: addr(), plan: "split" })).body.error, "licence_required");
      assert.equal((await post("brokers", t().opsA, { name: "Half", email: addr(), licenceState: "AZ" })).body.error, "licence_required");
      assert.equal((await post("brokers", t().opsA, { name: "Half", email: addr(), licenceNumber: "1" })).body.error, "licence_required");
      assert.equal((await post("brokers", t().opsA, brokerBody({ licenceState: "TX" }))).code, 400);
      assert.equal((await post("brokers", t().opsA, brokerBody({ licenceState: "Arizona" }))).code, 400);
    });

    test("licenceVerified stamps the time (needs the licence details); a verified split partner goes active when it signs", async () => {
      assert.equal((await post("brokers", t().opsA, { name: "Verify Me", email: addr(), plan: "software", licenceVerified: true })).body.error, "licence_required");
      const made = await post("brokers", t().opsA, brokerBody({ licenceVerified: true }));
      assert.equal(made.code, 201);
      assert.ok(made.body.broker.licence.verifiedAt);

      const sent = await post("agreement", t().opsA, { partyKind: "broker", partyId: made.body.broker.id, action: "send" });
      assert.equal(sent.code, 201, JSON.stringify(sent.body));
      assert.equal(sent.body.agreement.kind, "broker_partner");
      const signed = await call(h.esign, { method: "POST", body: { url: sent.body.signing.url, signerName: "Pat Partner" } });
      assert.equal(signed.code, 200);
      const row = await one(db, `SELECT status FROM yd_brokers WHERE id = $1`, [made.body.broker.id]);
      assert.equal(row.status, "active");

      // Not verified: signing leaves it applied until staff checks the licence.
      const open = await post("brokers", t().opsA, brokerBody());
      const sent2 = await post("agreement", t().opsA, { partyKind: "broker", partyId: open.body.broker.id, action: "send" });
      await call(h.esign, { method: "POST", body: { url: sent2.body.signing.url, signerName: "Pat Two" } });
      assert.equal((await one(db, `SELECT status FROM yd_brokers WHERE id = $1`, [open.body.broker.id])).status, "applied");
    });

    test("bad input is a plain 400, never a 500", async () => {
      const bad = [
        {}, { name: "  ", email: addr() }, { name: "X" }, { name: "X", email: "not-an-email" }, { name: "X", email: addr(), plan: "gold" },
        brokerBody({ splitPercent: 101 }), brokerBody({ splitPercent: -1 }), brokerBody({ splitPercent: "30" }),
        brokerBody({ licenceVerified: "yes" }), brokerBody({ name: "x".repeat(300) }), brokerBody({ licenceNumber: "9".repeat(80) })
      ];
      for (const body of bad) assert.equal((await post("brokers", t().opsA, body)).code, 400, JSON.stringify(body).slice(0, 80));
      assert.equal((await call(h.brokers, { method: "POST", token: t().opsA, body: "{not json" })).code, 400);
    });

    test("the same email twice is a 409 (any casing); the other company can use it; two codes are never the same", async () => {
      const email = addr("twin");
      const first = await post("brokers", t().opsA, brokerBody({ email }));
      assert.equal(first.code, 201);
      const again = await post("brokers", t().salesA, brokerBody({ email: email.toUpperCase() }));
      assert.equal(again.code, 409);
      assert.equal(again.body.error, "broker_exists");
      const other = await post("brokers", t().opsB, brokerBody({ email }));
      assert.equal(other.code, 201, "another company may have a broker with that address");
      assert.notEqual(other.body.broker.id, first.body.broker.id);
      assert.equal((await rows(db, `SELECT id FROM yd_brokers WHERE email = $1`, [email.toLowerCase()])).length, 2);

      const codes = new Set();
      for (let i = 0; i < 5; i++) codes.add((await post("brokers", t().opsA, brokerBody())).body.broker.trackingCode);
      assert.equal(codes.size, 5);
    });

    test("a broker lands in the staff member's own company, and the other company never sees it", async () => {
      const made = await post("brokers", t().opsB, brokerBody({ name: "Org B Only Broker" }));
      assert.equal(made.code, 201);
      const row = await one(db, `SELECT org_id FROM yd_brokers WHERE id = $1`, [made.body.broker.id]);
      assert.equal(row.org_id, fx.orgB);
      const seenByA = await call(h.brokers, { token: t().opsA });
      assert.equal(seenByA.code, 200);
      assert.ok(!seenByA.body.brokers.some((b) => b.name === "Org B Only Broker"));
      assert.ok(seenByA.body.brokers.some((b) => b.id === fx.A.broker));
    });

    test("GET lists the book for every staff role, filters by status, and carries no credit or money fields", async () => {
      for (const who of ["opsA", "salesA", "collectionsA", "ownerA"]) {
        const r = await call(h.brokers, { token: t()[who] });
        assert.equal(r.code, 200, who);
        assert.ok(r.body.brokers.length >= 1);
        assert.deepEqual(creditLeaks(r.body), []);
        assert.ok(r.body.brokers.every((b) => !("earnedCents" in b) && !("renters" in b)));
      }
      const active = await call(h.brokers, { token: t().opsA, query: { status: "active" } });
      assert.ok(active.body.brokers.length >= 1 && active.body.brokers.every((b) => b.status === "active"));
      assert.equal((await call(h.brokers, { token: t().opsA, query: { status: "gold" } })).code, 400);
      assert.equal((await call(h.brokers, { method: "DELETE", token: t().opsA })).code, 405);
    });
  });

  /* ── POST staff/accounts: building users ──────────────────────────────── */

  describe("POST staff/accounts (building user)", () => {
    test("ops and the owner create a login for one building: the account, the link row, the queued email and the event land together", async () => {
      for (const who of ["opsA", "ownerA"]) {
        const email = addr(`bu-${who}`);
        const r = await post("accounts", t()[who], { kind: "building_user", email, buildingIds: [fx.A.bSigned], role: "manager" });
        assert.equal(r.code, 201, `${who}: ${JSON.stringify(r.body)}`);
        const a = r.body.account;
        assert.equal(a.kind, "building_user");
        assert.equal(a.email, email.toLowerCase());
        assert.equal(a.status, "active");
        assert.equal(a.brokerId, null);
        assert.deepEqual(a.buildings.map((b) => [b.id, b.role]), [[fx.A.bSigned, "manager"]]);
        assert.deepEqual(r.body.signIn, { queued: true, expiresMinutes: 15 });

        const acct = await one(db, `SELECT org_id, kind, renter_id, broker_id FROM yd_accounts WHERE id = $1`, [a.id]);
        assert.deepEqual([acct.org_id, acct.kind, acct.renter_id, acct.broker_id], [fx.orgA, "building_user", null, null]);
        const links = await rows(db, `SELECT building_id, role, removed_at FROM yd_account_buildings WHERE account_id = $1`, [a.id]);
        assert.deepEqual(links.map((l) => [l.building_id, l.role, l.removed_at]), [[fx.A.bSigned, "manager", null]]);

        const mail = await rows(db, `SELECT to_address, template_key, status, channel FROM yd_outbox WHERE org_id = $1 AND to_address = $2`, [fx.orgA, email.toLowerCase()]);
        assert.equal(mail.length, 1);
        assert.deepEqual([mail[0].template_key, mail[0].status, mail[0].channel], ["yd-magic-link", "queued", "email"]);
        const link = await rows(db, `SELECT account_id, outcome, expires_at, consumed_at FROM yd_magic_links WHERE org_id = $1 AND email = $2`, [fx.orgA, email.toLowerCase()]);
        assert.equal(link.length, 1);
        assert.deepEqual([link[0].account_id, link[0].outcome, link[0].consumed_at], [a.id, "issued", null]);

        const ev = await eventsFor(a.id);
        assert.deepEqual(ev.map((e) => e.name), ["account.created"]);
        assert.equal(ev[0].actor_kind, "staff");
        assert.equal(ev[0].actor_id, fx.staffIds[who]);
        assert.deepEqual(ev[0].payload.building_ids, [fx.A.bSigned]);
      }
    });

    test("the emailed link signs the new person in, once, and shows only their buildings; the link is never in a response", async () => {
      const email = addr("signin");
      const second = (await one(db, `SELECT id FROM yd_buildings WHERE org_id = $1 AND id <> $2 AND status = 'signed' LIMIT 1`, [fx.orgA, fx.A.bSigned])).id;
      const r = await post("accounts", t().opsA, { kind: "building_user", email, buildingIds: [fx.A.bSigned] });
      assert.equal(r.code, 201);
      const text = JSON.stringify(r.body);
      assert.ok(!/token|magic|[?&]t=/i.test(text), "no sign-in link or token in the response");

      const mail = await one(db, `SELECT context FROM yd_outbox WHERE org_id = $1 AND to_address = $2`, [fx.orgA, email.toLowerCase()]);
      const token = tokenFromOutbox(mail);
      assert.ok(token && token.length >= 20);
      const session = await verifyMagicLink(db, token, {});
      assert.equal(session.ok, true);
      assert.equal(session.principal.kind, "building_user");
      assert.deepEqual(session.principal.buildingIds, [fx.A.bSigned], "only the building they were given");
      assert.ok(!session.principal.buildingIds.includes(second));

      const seen = await call(h.bRenters, { token: session.token });
      assert.equal(seen.code, 200);
      assert.deepEqual(seen.body.buildings.map((b) => b.id), [fx.A.bSigned]);

      const again = await verifyMagicLink(db, token, {});
      assert.equal(again.ok, false, "the invitation link works once");
    });

    test("one login can cover several buildings (a repeated id counts once)", async () => {
      const email = addr("multi");
      const others = (await rows(db, `SELECT id FROM yd_buildings WHERE org_id = $1 ORDER BY id LIMIT 3`, [fx.orgA])).map((x) => x.id);
      assert.equal(others.length, 3);
      const r = await post("accounts", t().opsA, { kind: "building_user", email, buildingIds: [...others, others[0].toUpperCase()] });
      assert.equal(r.code, 201, JSON.stringify(r.body));
      assert.equal(r.body.account.buildings.length, 3);
      assert.equal((await rows(db, `SELECT 1 FROM yd_account_buildings WHERE account_id = $1`, [r.body.account.id])).length, 3);
      assert.equal((await rows(db, `SELECT 1 FROM yd_account_buildings WHERE account_id = $1 AND role = 'leasing'`, [r.body.account.id])).length, 3, "role defaults to leasing");
    });

    test("another company's building (or one that does not exist) is the same 404, and nothing is half-created", async () => {
      const email = addr("cross");
      const before = {
        accounts: (await one(db, `SELECT count(*)::int AS n FROM yd_accounts WHERE org_id = $1`, [fx.orgA])).n,
        mail: (await one(db, `SELECT count(*)::int AS n FROM yd_outbox WHERE org_id = $1`, [fx.orgA])).n,
        links: (await one(db, `SELECT count(*)::int AS n FROM yd_account_buildings WHERE org_id = $1`, [fx.orgA])).n
      };
      const foreign = await post("accounts", t().opsA, { kind: "building_user", email, buildingIds: [fx.B.bSigned] });
      const ghost = await post("accounts", t().opsA, { kind: "building_user", email, buildingIds: ["00000000-0000-4000-8000-000000000001"] });
      const mixed = await post("accounts", t().opsA, { kind: "building_user", email, buildingIds: [fx.A.bSigned, fx.B.bSigned] });
      for (const r of [foreign, ghost, mixed]) {
        assert.equal(r.code, 404);
        assert.equal(r.body.error, "building_not_found");
      }
      assert.deepEqual(foreign.body, ghost.body, "a building in another company looks exactly like one that is not there");
      assert.deepEqual({
        accounts: (await one(db, `SELECT count(*)::int AS n FROM yd_accounts WHERE org_id = $1`, [fx.orgA])).n,
        mail: (await one(db, `SELECT count(*)::int AS n FROM yd_outbox WHERE org_id = $1`, [fx.orgA])).n,
        links: (await one(db, `SELECT count(*)::int AS n FROM yd_account_buildings WHERE org_id = $1`, [fx.orgA])).n
      }, before);
      assert.equal(await one(db, `SELECT id FROM yd_accounts WHERE email = $1`, [email.toLowerCase()]), null);
    });

    test("the login is made in the staff member's own company only", async () => {
      const email = addr("orgb");
      const r = await post("accounts", t().opsB, { kind: "building_user", email, buildingIds: [fx.B.bSigned] });
      assert.equal(r.code, 201);
      const row = await one(db, `SELECT org_id FROM yd_accounts WHERE id = $1`, [r.body.account.id]);
      assert.equal(row.org_id, fx.orgB);
      assert.equal((await post("accounts", t().opsB, { kind: "building_user", email: addr("orgb2"), buildingIds: [fx.A.bSigned] })).code, 404);
    });

    test("the same email twice is a 409 (any casing, and against a renter's or a broker's login too); the other company may reuse it", async () => {
      const email = addr("dupe");
      assert.equal((await post("accounts", t().opsA, { kind: "building_user", email, buildingIds: [fx.A.bSigned] })).code, 201);
      const again = await post("accounts", t().opsA, { kind: "building_user", email: email.toUpperCase(), buildingIds: [fx.A.bOther] });
      assert.equal(again.code, 409);
      assert.equal(again.body.error, "account_exists");
      assert.equal((await post("accounts", t().opsA, { kind: "building_user", email: `rita+a${fx.rand}@example.test`, buildingIds: [fx.A.bSigned] })).code, 409, "a renter's address");
      assert.equal((await post("accounts", t().opsA, { kind: "building_user", email: `ben+a${fx.rand}@example.test`, buildingIds: [fx.A.bSigned] })).code, 409, "a broker's address");
      assert.equal((await post("accounts", t().opsB, { kind: "building_user", email, buildingIds: [fx.B.bSigned] })).code, 201, "another company");
      assert.equal((await rows(db, `SELECT 1 FROM yd_outbox WHERE org_id = $1 AND to_address = $2`, [fx.orgA, email.toLowerCase()])).length, 1, "the refused repeat queued no second email");
    });

    test("bad input is a plain 400, never a 500", async () => {
      const ok = { kind: "building_user", email: addr("bad"), buildingIds: [fx.A.bSigned] };
      const bad = [
        {}, { ...ok, kind: "renter" }, { ...ok, kind: undefined },
        { ...ok, email: undefined }, { ...ok, email: "nope" }, { ...ok, email: "  " },
        { ...ok, buildingIds: undefined }, { ...ok, buildingIds: [] }, { ...ok, buildingIds: "abc" }, { ...ok, buildingIds: ["not-a-uuid"] },
        { ...ok, buildingIds: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) },
        { ...ok, role: "janitor" }, { ...ok, brokerId: fx.A.broker }
      ];
      for (const body of bad) assert.equal((await post("accounts", t().opsA, body)).code, 400, JSON.stringify(body).slice(0, 90));
      assert.equal((await rows(db, `SELECT 1 FROM yd_accounts WHERE email LIKE $1`, [`bad%-${fx.rand}@example.test`])).length, 0);
      assert.equal((await call(h.accounts, { token: t().opsA })).code, 405, "GET is refused");
    });
  });

  /* ── POST staff/accounts: broker logins ───────────────────────────────── */

  describe("POST staff/accounts (broker)", () => {
    const newBroker = async (over = {}) => (await post("brokers", t().opsA, brokerBody(over))).body.broker;

    test("a broker login is tied to the broker, defaults to the broker's own email, queues the sign-in link, and signs them in to the broker portal", async () => {
      const broker = await newBroker();
      assert.equal((await call(h.brokers, { token: t().opsA })).body.brokers.find((b) => b.id === broker.id).hasAccount, false);
      const r = await post("accounts", t().opsA, { kind: "broker", brokerId: broker.id });
      assert.equal(r.code, 201, JSON.stringify(r.body));
      assert.equal(r.body.account.kind, "broker");
      assert.equal(r.body.account.brokerId, broker.id);
      assert.equal(r.body.account.email, broker.email);
      assert.deepEqual(r.body.account.buildings, []);
      assert.deepEqual(r.body.signIn, { queued: true, expiresMinutes: 15 });
      assert.equal((await call(h.brokers, { token: t().opsA })).body.brokers.find((b) => b.id === broker.id).hasAccount, true);

      const mail = await one(db, `SELECT context, template_key FROM yd_outbox WHERE org_id = $1 AND to_address = $2`, [fx.orgA, broker.email]);
      assert.equal(mail.template_key, "yd-magic-link");
      const session = await verifyMagicLink(db, tokenFromOutbox(mail), {});
      assert.equal(session.ok, true);
      assert.equal(session.principal.kind, "broker");
      assert.equal(session.principal.brokerId, broker.id);
      const link = await call(h.kLink, { token: session.token });
      assert.equal(link.code, 200);
      assert.equal(link.body.trackingCode, broker.trackingCode);

      const ev = await eventsFor(r.body.account.id);
      assert.deepEqual(ev.map((e) => e.name), ["account.created"]);
      assert.equal(ev[0].payload.broker_id, broker.id);
    });

    test("a different sign-in address may be given; a second login for the same broker is a 409", async () => {
      const broker = await newBroker();
      const email = addr("alt");
      const r = await post("accounts", t().opsA, { kind: "broker", brokerId: broker.id, email });
      assert.equal(r.code, 201);
      assert.equal(r.body.account.email, email.toLowerCase());
      const again = await post("accounts", t().opsA, { kind: "broker", brokerId: broker.id, email: addr("alt2") });
      assert.equal(again.code, 409);
      assert.equal(again.body.error, "account_exists");
    });

    test("a broker that already has a login by hand (the fixture's) cannot be given another", async () => {
      const r = await post("accounts", t().opsA, { kind: "broker", brokerId: fx.A.broker, email: addr("hand") });
      assert.equal(r.code, 409);
    });

    test("another company's broker (or one that does not exist) is the same 404, and nothing is created", async () => {
      const email = addr("fb");
      const foreign = await post("accounts", t().opsA, { kind: "broker", brokerId: fx.B.broker, email });
      const ghost = await post("accounts", t().opsA, { kind: "broker", brokerId: "00000000-0000-4000-8000-000000000002", email });
      assert.equal(foreign.code, 404);
      assert.equal(foreign.body.error, "broker_not_found");
      assert.deepEqual(foreign.body, ghost.body);
      assert.equal(await one(db, `SELECT id FROM yd_accounts WHERE email = $1`, [email.toLowerCase()]), null);
      assert.equal(await one(db, `SELECT id FROM yd_outbox WHERE to_address = $1`, [email.toLowerCase()]), null);
    });

    test("an address that already has a login is a 409 even when the broker has none yet", async () => {
      const broker = await newBroker();
      const r = await post("accounts", t().opsA, { kind: "broker", brokerId: broker.id, email: `leasing+a${fx.rand}@example.test` });
      assert.equal(r.code, 409);
      assert.equal(await one(db, `SELECT id FROM yd_accounts WHERE broker_id = $1`, [broker.id]), null, "nothing half-created");
    });

    test("bad input is a plain 400", async () => {
      const broker = await newBroker();
      for (const body of [
        { kind: "broker" }, { kind: "broker", brokerId: "nope" }, { kind: "broker", brokerId: broker.id, email: "bad" },
        { kind: "broker", brokerId: broker.id, buildingIds: [fx.A.bSigned] }
      ]) assert.equal((await post("accounts", t().opsA, body)).code, 400, JSON.stringify(body));
    });
  });
});
