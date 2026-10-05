// The morning brief — "Good morning, Chris." plus the full report behind it.
// MB3 on ops/workflows/morning-brief-2026-10-05.md. Spec:
// docs/specs/morning-brief-2026-10-05.md ("The morning text", "The full report").
// Flow: docs/journeys/morning-brief-flow.md.
//
// WHAT IT IS. Step 2 of the 6:00 a.m. Arizona pulse job
// (src/workflows/daily-pulse.mjs). Step 1 is Recon's audit (AG-07). This step
// reads the audit's result plus plain database reads, writes one text, and
// saves one morning_briefs row (db/migrations/431_morning_briefs.sql).
//
// NO MODEL. Every number is a plain SQL read, the src/ops/weekly-brief.mjs
// numbers-section pattern. A section with no source today prints one plain
// line saying what it is waiting on. It never prints a guessed number.
//
// DRY-RUN. MORNING_BRIEF_LIVE is false. The brief is built and saved with
// delivery_status 'dry_run'; nothing is texted. Today's pulse text is
// untouched. Going live (and whether this text replaces the pulse text or
// comes as well) is Chris's call after MB1 — see the PR.
//
// AUDIT ONLY. It never fixes, sends money, pulls credit, or changes an ad.

import { computePulse } from "./pulse.mjs";
import { briefsFromPulse } from "./briefs.mjs";
import { listUnrecordedCalls } from "../sales/unrecorded.mjs";
import { loadCashflowByDay } from "../finance/cashflow.mjs";
import { fromCents } from "../commissions/money.mjs";
import { textMorningBrief } from "../pulse/notify.mjs";

export const MORNING_BRIEF_LIVE = false;
export const BRIEF_TZ = "America/Phoenix";

export const LINES = {
  marketingWaiting:
    "Booked calls, shows, sales and return on ad spend: waiting on the marketing numbers (marketing machine M5).",
  dashboardWaiting: "Marketing dashboard: not built yet.",
  dyingAdsWaiting: "Dying ads: waiting on the marketing numbers (marketing machine M5).",
  moneyNotConnected: "Money: not connected yet.",
  accountsWaiting: "Per account (Fundhub LLC, Fundhub Credit Solutions, FH Consulting): no record yet of which bank account is which company.",
  creditLineWaiting: "Ad money left on the credit line: no source yet.",
  suggestionsWaiting: "Suggestions: none yet. They start when the cadence rules are approved (MB4).",
  todayWaiting: "Today: no source yet (MB4).",
  advisorWaiting: "Funding advisor files per person: no source yet. Nothing links a funding round to an advisor.",
  systemsMissing: "Systems: the morning check did not run, so nothing was checked."
};

/* ---------- dates ---------- */

export function phoenixDateStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRIEF_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function phoenixLongDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BRIEF_TZ, weekday: "long", month: "long", day: "numeric"
  }).format(now);
}

function dayBefore(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
}

export function money(cents) {
  if (cents == null) return "unknown";
  const s = fromCents(Number(cents));
  const [whole, frac] = String(s).replace(/^-/, "").split(".");
  const sign = Number(cents) < 0 ? "-" : "";
  return `${sign}$${Number(whole).toLocaleString("en-US")}.${(frac || "00").padEnd(2, "0")}`;
}

function errLine(label, err) {
  return { status: "error", line: `${label}: could not be read (${String((err && err.message) || err).slice(0, 120)}).` };
}

/* ---------- systems (MB2 scorecard contract) ---------- */

// Today's pulse check ids → the board contract's groups. MB2 replaces this
// mapping with its stored scorecard; until then step 1's result is mapped here.
const GROUP_BY_ID = {
  health: "backend",
  login: "front_doors",
  apply: "front_doors",
  suggestions: "backend",
  "gate-relay": "mac",
  recon: "jobs",
  unrecorded: "backend",
  gmail: "outside"
};

function groupFor(c) {
  if (GROUP_BY_ID[c.id]) return GROUP_BY_ID[c.id];
  if (c.kind === "registry") return String(c.path || "").startsWith("/api/") ? "backend" : "front_doors";
  return "backend";
}

function statusFor(raw) {
  if (raw === "PASS" || raw === "up") return "green";
  if (raw === "FAIL" || raw === "down") return "red";
  return "not_checked";
}

/** runDailyPulse() result → the scorecard contract on the board. */
export function scorecardFromPulse(pulse, { now = new Date() } = {}) {
  if (!pulse || !Array.isArray(pulse.checks)) return null;
  return {
    date: phoenixDateStamp(now),
    ran_at: now.toISOString(),
    source: "runDailyPulse",
    checks: pulse.checks.map((c) => {
      let status = statusFor(c.status);
      const proof = c.detail ? String(c.detail).slice(0, 300) : null;
      // Green means it ran and passed WITH proof. No proof is not green.
      if (status === "green" && !proof) status = "not_checked";
      const row = { id: c.id, group: groupFor(c), status, proof };
      if (status === "red") {
        row.customer_sees = null; // MB2 fills this; no source today
        row.since = null;         // MB2 fills this; no source today
        row.day_count = null;     // MB2 fills this; no source today
        row.fix = c.suggestedFix || null;
      }
      return row;
    })
  };
}

export function summarizeSystems(scorecard) {
  if (!scorecard || !Array.isArray(scorecard.checks)) {
    return { status: "missing", total: 0, green: 0, red: 0, not_checked: 0, reds: [], line: LINES.systemsMissing };
  }
  const checks = scorecard.checks;
  const green = checks.filter((c) => c.status === "green").length;
  const reds = checks.filter((c) => c.status === "red");
  const notChecked = checks.filter((c) => c.status !== "green" && c.status !== "red").length;
  let line = `Systems: ${green} of ${checks.length} checks green.`;
  if (reds.length) {
    line += ` ${reds.length} red: ` + reds.slice(0, 3).map((c) => {
      const day = c.day_count ? ` (day ${c.day_count})` : "";
      return `${c.id}${day}`;
    }).join(", ") + (reds.length > 3 ? `, and ${reds.length - 3} more in the report.` : ".");
  }
  if (notChecked) line += ` ${notChecked} not checked.`;
  // Never "nothing needs you" while anything is red or not checked.
  if (!reds.length && !notChecked) line += " Nothing needs you.";
  return {
    status: "ok",
    total: checks.length,
    green,
    red: reds.length,
    not_checked: notChecked,
    reds,
    line,
    scorecard
  };
}

/* ---------- marketing ---------- */

/* Spend comes from ad_metrics_daily — the same table the marketing machine's
   numbers (M5, docs/specs/marketing-machine-2026-10-04.md §11.1) count spend
   from. Everything else waits for M5; it is not rebuilt here. */
export async function loadMarketing(db, { orgId, briefDate }) {
  const yesterday = dayBefore(briefDate);
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(spend_cents), 0)::bigint AS cents
         FROM ad_metrics_daily
        WHERE org_id = $1 AND date = $2::date`,
      [orgId, yesterday]
    );
    const n = Number(r.rows[0]?.n || 0);
    const cents = n ? Number(r.rows[0].cents) : null;
    return {
      status: "partial",
      spend_day: yesterday,
      spend_cents: cents,
      spend_source: "ad_metrics_daily",
      spend_line: cents == null
        ? `Ad spend ${yesterday}: no spend rows synced.`
        : `Ad spend ${yesterday}: ${money(cents)}.`,
      waiting: [LINES.marketingWaiting, LINES.dyingAdsWaiting],
      dashboard_url: null,
      dashboard_line: LINES.dashboardWaiting
    };
  } catch (err) {
    return { ...errLine("Ad spend", err), waiting: [LINES.marketingWaiting], dashboard_url: null };
  }
}

/* ---------- money ---------- */

export async function plaidLive(db, { orgId, env = process.env }) {
  if (String(env?.PLAID_ENV || "").trim() !== "production") return { live: false, reason: "PLAID_ENV is not production" };
  const r = await db.query(
    `SELECT COUNT(*)::int AS n FROM plaid_items WHERE org_id = $1 AND link_state = 'active'`,
    [orgId]
  );
  const n = Number(r.rows[0]?.n || 0);
  return n ? { live: true, active_links: n } : { live: false, reason: "no active Plaid link" };
}

export async function loadMoney(db, { orgId, briefDate, env = process.env }) {
  try {
    const plaid = await plaidLive(db, { orgId, env });
    if (!plaid.live) {
      return { status: "not_connected", reason: plaid.reason, line: LINES.moneyNotConnected };
    }
    const yesterday = dayBefore(briefDate);
    const monthStart = `${briefDate.slice(0, 8)}01`;
    const [dayRows, mtdRows] = await Promise.all([
      loadCashflowByDay(db, { orgId, fromDay: yesterday, toDay: yesterday }),
      loadCashflowByDay(db, { orgId, fromDay: monthStart, toDay: briefDate })
    ]);
    const sum = (rows, k) => rows.reduce((n, r) => n + Number(r[k] || 0), 0);
    const inY = sum(dayRows, "inflow_cents");
    const outY = sum(dayRows, "outflow_cents");
    return {
      status: "ok",
      source: "bank_transactions via src/finance/cashflow.mjs (same read as Finance OS)",
      day: yesterday,
      in_cents: inY,
      out_cents: outY,
      mtd_in_cents: sum(mtdRows, "inflow_cents"),
      mtd_out_cents: sum(mtdRows, "outflow_cents"),
      line: `Money posted ${yesterday}: ${money(inY)} in, ${money(outY)} out.`,
      waiting: [LINES.accountsWaiting, LINES.creditLineWaiting]
    };
  } catch (err) {
    return errLine("Money", err);
  }
}

/* ---------- team and company ---------- */

export async function loadTeam(db, { orgId, now }) {
  const out = { status: "ok", window: "last 24 hours", waiting: [LINES.advisorWaiting] };

  try {
    const pulse = await computePulse(db, { orgId, period: "today", now });
    out.company_8 = pulse.company_8;
    out.calendar = pulse.calendar;
    out.pods = pulse.pods;
    out.briefs = briefsFromPulse(pulse);
  } catch (err) {
    out.company_8 = null;
    out.company_error = errLine("Company numbers", err).line;
  }

  try {
    const r = await db.query(
      `SELECT o.staff_id, s.name,
              count(*) FILTER (WHERE o.outcome <> 'no_show')::int AS calls_held,
              count(*) FILTER (WHERE o.outcome = 'no_show')::int AS no_shows,
              count(*) FILTER (WHERE o.outcome = 'deposit')::int AS deposits,
              count(*) FILTER (WHERE o.outcome = 'downsell')::int AS downsells
         FROM call_outcomes o
         JOIN staff s ON s.id = o.staff_id AND s.org_id = o.org_id
        WHERE o.org_id = $1
          AND COALESCE(o.is_demo, false) = false
          AND o.logged_at >= $2::timestamptz - interval '24 hours'
          AND o.logged_at < $2::timestamptz
        GROUP BY o.staff_id, s.name
        ORDER BY s.name`,
      [orgId, now.toISOString()]
    );
    out.closers = r.rows;
  } catch (err) {
    out.closers = null;
    out.closers_error = errLine("Closer calls", err).line;
  }

  try {
    const r = await db.query(
      `SELECT count(*)::int AS n
         FROM tasks
        WHERE org_id = $1
          AND assignee_role = 'csm'
          AND done = false
          AND due_at IS NOT NULL
          AND due_at < $2::timestamptz`,
      [orgId, now.toISOString()]
    );
    out.csm_overdue = Number(r.rows[0]?.n || 0);
  } catch (err) {
    out.csm_overdue = null;
    out.csm_error = errLine("CSM overdue tasks", err).line;
  }

  try {
    const rows = await listUnrecordedCalls(db, { orgId, now });
    out.unrecorded_calls = rows.length;
  } catch (err) {
    out.unrecorded_calls = null;
    out.unrecorded_error = errLine("Unrecorded calls", err).line;
  }

  const held = Array.isArray(out.closers) ? out.closers.reduce((n, r) => n + r.calls_held, 0) : null;
  const noShows = Array.isArray(out.closers) ? out.closers.reduce((n, r) => n + r.no_shows, 0) : null;
  const funded = out.company_8?.funded_count?.value;
  const part = (v, word) => (v == null ? `${word} unknown` : `${v} ${word}`);
  out.line = `Team, last 24 hours: ${part(held, "calls held")}, ${part(noShows, "no-shows")}, ${part(funded, "files funded")}.`;
  return out;
}

/* ---------- the text ---------- */

export function formatMorningText({ now = new Date(), systems, marketing, money: m, team } = {}) {
  const lines = [`Good morning, Chris. ${phoenixLongDate(now)}.`, ""];
  lines.push(systems?.line || LINES.systemsMissing);
  const cash = team?.company_8?.cash_cents?.value;
  lines.push(`Last 24 hours: ${cash == null ? "cash collected unknown" : `${money(cash)} cash collected`}.`);
  if (marketing?.spend_line || marketing?.line) lines.push(marketing.spend_line || marketing.line);
  lines.push(LINES.marketingWaiting);
  lines.push(m?.line || LINES.moneyNotConnected);
  lines.push(team?.line || "Team: could not be read.");
  return lines.join("\n");
}

/* ---------- build, save, send ---------- */

export async function buildMorningBrief(db, { orgId, env = process.env, now = new Date(), pulse = null, scorecard = null } = {}) {
  if (!orgId) throw new TypeError("buildMorningBrief: orgId required");
  const briefDate = phoenixDateStamp(now);
  const card = scorecard || scorecardFromPulse(pulse, { now });
  const systems = summarizeSystems(card);
  const [marketing, moneySection, team] = await Promise.all([
    loadMarketing(db, { orgId, briefDate }),
    loadMoney(db, { orgId, briefDate, env }),
    loadTeam(db, { orgId, now })
  ]);
  const text = formatMorningText({ now, systems, marketing, money: moneySection, team });
  return {
    org_id: orgId,
    brief_date: briefDate,
    systems,
    marketing,
    money: moneySection,
    team,
    suggestions: [],
    suggestions_line: LINES.suggestionsWaiting,
    today: { status: "waiting", line: LINES.todayWaiting },
    text_body: text,
    report_url: null
  };
}

const COLUMNS = `id, org_id, brief_date::text AS brief_date, systems, marketing, money, team, suggestions, today,
  text_body, report_url, sent_to_last4, dry_run, delivery_status, delivery_error,
  provider_message_id, sent_at, created_at, updated_at`;

export async function readMorningBrief(db, { orgId, date }) {
  if (!orgId) throw new TypeError("readMorningBrief: orgId required");
  const r = await db.query(
    `SELECT ${COLUMNS} FROM morning_briefs WHERE org_id = $1 AND brief_date = $2::date`,
    [orgId, date]
  );
  return r.rows[0] || null;
}

/** Upsert one row per (org, Arizona day). A row already sent is never rewritten. */
export async function saveMorningBrief(db, brief, delivery, { dryRun = true } = {}) {
  const r = await db.query(
    `INSERT INTO morning_briefs
       (org_id, brief_date, systems, marketing, money, team, suggestions, today,
        text_body, report_url, sent_to_last4, dry_run, delivery_status, delivery_error,
        provider_message_id, sent_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             CASE WHEN $13 = 'sent' THEN now() ELSE NULL END)
     ON CONFLICT (org_id, brief_date) DO UPDATE SET
       systems = EXCLUDED.systems, marketing = EXCLUDED.marketing, money = EXCLUDED.money,
       team = EXCLUDED.team, suggestions = EXCLUDED.suggestions, today = EXCLUDED.today,
       text_body = EXCLUDED.text_body, report_url = EXCLUDED.report_url,
       sent_to_last4 = EXCLUDED.sent_to_last4, dry_run = EXCLUDED.dry_run,
       delivery_status = EXCLUDED.delivery_status, delivery_error = EXCLUDED.delivery_error,
       provider_message_id = EXCLUDED.provider_message_id, sent_at = EXCLUDED.sent_at,
       updated_at = now()
     WHERE morning_briefs.delivery_status <> 'sent'
     RETURNING ${COLUMNS}`,
    [
      brief.org_id, brief.brief_date,
      JSON.stringify(brief.systems), JSON.stringify(brief.marketing), JSON.stringify(brief.money),
      JSON.stringify(brief.team), JSON.stringify(brief.suggestions), JSON.stringify(brief.today),
      brief.text_body, brief.report_url,
      delivery.sent_to_last4, !!dryRun,
      delivery.delivery_status, delivery.error, delivery.provider_message_id
    ]
  );
  if (r.rows[0]) return { saved: true, row: r.rows[0] };
  return { saved: false, reason: "already_sent", row: await readMorningBrief(db, { orgId: brief.org_id, date: brief.brief_date }) };
}

/**
 * runMorningBrief — build, (maybe) text, save. Called by step 2 of the pulse job.
 * live defaults to MORNING_BRIEF_LIVE (false): nothing is texted.
 */
export async function runMorningBrief({
  db, orgId = null, env = process.env, now = new Date(), pulse = null, scorecard = null,
  live = MORNING_BRIEF_LIVE, sendImpl
} = {}) {
  if (!db) return { ok: false, reason: "no_db" };
  let org = orgId;
  if (!org) {
    const r = await db.query(`SELECT id FROM orgs WHERE is_default LIMIT 1`);
    org = r.rows[0]?.id || null;
  }
  if (!org) return { ok: false, reason: "no_org" };

  const brief = await buildMorningBrief(db, { orgId: org, env, now, pulse, scorecard });

  const existing = await readMorningBrief(db, { orgId: org, date: brief.brief_date });
  if (existing && existing.delivery_status === "sent") {
    return { ok: true, brief, delivery: { delivery_status: "sent" }, saved: { saved: false, reason: "already_sent", row: existing } };
  }

  const delivery = await textMorningBrief({
    body: brief.text_body,
    env,
    dryRun: !live,
    ...(sendImpl ? { sendImpl } : {})
  });
  const saved = await saveMorningBrief(db, brief, delivery, { dryRun: !live });
  return { ok: true, brief, delivery, saved };
}

export default runMorningBrief;
