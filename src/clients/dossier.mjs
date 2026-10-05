// The full client dossier — everything Fundhub holds on one client, in one shape.
//
// Owner law (2026-08-15, restated 2026-10-05): the context fetcher collects all
// of a client's data, so no AI agent starts blank and the copy machine hears
// every client. Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 9.
//
// buildDossier() returns every record, newest first, with NO count limits and
// NO text cuts. renderDossier() turns it into prompt text. When the whole thing
// is too big for one model call, the older items are replaced by the running
// summary in client_dossier_summaries (written by src/clients/dossier-summary.mjs)
// and everything newer than that summary still goes in full. Nothing is dropped
// without saying so: the render result names how many items were summarized and
// flags when the summary needs a refresh.
//
// READ ONLY. Every query filters by org_id — these tables have no row-level
// security doing it for us. Missing pieces stay null, never invented.

import { redact } from "../http/read-api.mjs";

/** Prompt budget in characters (about 75k tokens). Past this the summary steps in. */
export const DEFAULT_PROMPT_BUDGET_CHARS = 300_000;

const SURVEY_KEY = /^cf_svy_/;
const SURVEY_EXTRA_KEYS = [
  "how_much_funding_does_your_business_need",
  "what_will_the_funding_be_used_for",
  "what_is_your_current_credit_score",
  "cf_funding_scope"
];

// ── The ad (M0 step 5) ──────────────────────────────────────────────────────

/**
 * readClientAdLink — the resolved ad number, offer tag and lead level.
 *
 * PENDING HOOKUP: these come from M0 step 5's views (v_client_ad_number,
 * v_client_offer_tag, v_client_level), which do not exist yet. Until they do,
 * this returns nulls and says why. It never guesses an ad from utm text; the raw
 * first-touch row is in dossier.attribution for anyone who needs it today.
 */
export async function readClientAdLink(_db, { orgId, clientId } = {}) {
  return {
    org_id: orgId || null,
    client_id: clientId || null,
    ad_number: null,
    offer_tag: null,
    lead_level: null,
    pending: "M0 step 5 views v_client_ad_number, v_client_offer_tag and v_client_level are not built yet"
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function iso(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rows(res) {
  return (res && res.rows) || [];
}

/** Drop null / empty values from a row. Keeps false and 0. */
function present(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Keys a redact() pass removed, so the dossier can say what it withheld. */
function withheldKeys(raw, kept, prefix) {
  const out = [];
  for (const k of Object.keys(raw || {})) {
    if (!Object.hasOwn(kept || {}, k)) out.push(prefix ? `${prefix}.${k}` : k);
  }
  return out;
}

function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// ── funnel activity roll-up ─────────────────────────────────────────────────

/**
 * rollUpFunnel(events) — page, click and video events (funnel.*), one row per
 * page and one per video. Every event is counted; none is dropped.
 */
export function rollUpFunnel(events) {
  const pages = new Map();
  const videos = new Map();
  for (const e of events || []) {
    const p = asObject(e.payload);
    const props = asObject(p.props);
    const at = iso(e.created_at);
    const pageKey = p.page || "(unknown page)";
    const page = pages.get(pageKey) || {
      page: pageKey, funnel: p.funnel || null, views: 0, clicks: 0,
      events: {}, click_labels: {}, max_scroll_pct: null, max_seconds: null,
      first_at: at, last_at: at
    };
    page.events[e.name] = (page.events[e.name] || 0) + 1;
    if (e.name === "funnel.page") page.views += 1;
    if (e.name === "funnel.click") {
      page.clicks += 1;
      const label = props.label || props.element_id || props.href_path || null;
      if (label) page.click_labels[label] = (page.click_labels[label] || 0) + 1;
    }
    const scroll = props.depth ?? props.max_scroll;
    if (typeof scroll === "number") page.max_scroll_pct = Math.max(page.max_scroll_pct ?? 0, scroll);
    if (typeof props.seconds === "number") page.max_seconds = Math.max(page.max_seconds ?? 0, props.seconds);
    if (at && (!page.first_at || at < page.first_at)) page.first_at = at;
    if (at && (!page.last_at || at > page.last_at)) page.last_at = at;
    pages.set(pageKey, page);

    if (e.name === "funnel.video") {
      const vKey = props.video || "(unknown video)";
      const v = videos.get(vKey) || {
        video: vKey, page: p.page || null, plays: 0, unmutes: 0, actions: {},
        max_pct: null, max_seconds: null, duration_s: null, first_at: at, last_at: at
      };
      const action = props.action || "unknown";
      v.actions[action] = (v.actions[action] || 0) + 1;
      if (action === "play") v.plays += 1;
      if (action === "unmute") v.unmutes += 1;
      if (typeof props.pct === "number") v.max_pct = Math.max(v.max_pct ?? 0, props.pct);
      if (typeof props.current_s === "number") v.max_seconds = Math.max(v.max_seconds ?? 0, props.current_s);
      if (typeof props.duration_s === "number") v.duration_s = props.duration_s;
      if (at && (!v.first_at || at < v.first_at)) v.first_at = at;
      if (at && (!v.last_at || at > v.last_at)) v.last_at = at;
      videos.set(vKey, v);
    }
  }
  const newest = (a, b) => String(b.last_at || "").localeCompare(String(a.last_at || ""));
  return {
    pages: [...pages.values()].sort(newest),
    videos: [...videos.values()].sort(newest)
  };
}

// ── build ───────────────────────────────────────────────────────────────────

/**
 * buildDossier(db, { orgId, clientId }) → the whole client file, newest first.
 * Returns null when the client is not in this org.
 */
export async function buildDossier(db, { orgId, clientId } = {}) {
  if (!orgId) throw new Error("buildDossier: orgId is required");
  if (!clientId) throw new Error("buildDossier: clientId is required");
  const args = [orgId, clientId];

  const [
    clientRes, cfRes, attributionRes, convoRes, messageRes, callRes, outboundCallRes,
    insightRes, bookingRes, txRes, linkRes, invoiceRes, invoicePayRes, saleRes,
    salePayRes, contractRes, signerRes, cardRes, roundRes, appRes, pullRes, crsRes,
    snapshotRes, brainRes, eventRes, adLink
  ] = await Promise.all([
    db.query(`SELECT * FROM clients WHERE org_id = $1 AND id = $2`, args),
    db.query(`SELECT * FROM client_custom_fields WHERE org_id = $1 AND client_id = $2`, args),
    db.query(
      `SELECT * FROM client_ad_attribution WHERE org_id = $1 AND client_id = $2`,
      args
    ),
    db.query(
      `SELECT id, channel, kind, summary, sentiment, agent_code, agent_halted_at,
              agent_halt_reason, last_pulse_at, created_at, updated_at
         FROM conversations
        WHERE org_id = $1 AND client_id = $2
        ORDER BY last_pulse_at DESC NULLS LAST, updated_at DESC`,
      args
    ),
    // Every text and email, both directions. Inbound rows save with
    // sender_kind = 'system' by default, so who said it comes from direction.
    db.query(
      `SELECT id, conversation_id, direction, channel, rendered_body AS body, subject,
              sender_kind, sender_agent_code, sender_staff_id, status, provider,
              to_address, attachments, created_at
         FROM messages
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, outcome, belief_failed, notes, cash_collected_cents, transaction_id,
              recording_url, transcript, duration_seconds, booking_ref, checklist,
              staff_id, logged_at
         FROM call_outcomes
        WHERE org_id = $1 AND client_id = $2
        ORDER BY logged_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, call_id, kind, status, created_at, updated_at
         FROM outbound_calls
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, stage, channel, answers, notes, recording_url, meeting_url,
              recorded_by, occurred_at
         FROM customer_insights
        WHERE org_id = $1 AND client_id = $2
        ORDER BY occurred_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, source, provider_uid, starts_at, ends_at, status, meeting_url,
              attendee_email, attendee_name, event_type_slug, created_at
         FROM bookings
        WHERE org_id = $1 AND client_id = $2
        ORDER BY COALESCE(starts_at, created_at) DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, product_name, amount_paid, status, provider, provider_ref,
              raw_payload, created_at
         FROM transactions
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, purpose, description, amount_cents, currency, status, provider,
              paid_amount_cents, sale_motion, created_at, sent_at, paid_at, expired_at
         FROM payment_links
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, sale_id, funding_round_id, invoice_type, status, amount_due, currency,
              sent_at, due_at, paid_at, voided_at, written_off_at, write_off_reason,
              notes, created_at
         FROM invoices
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT ip.id, ip.invoice_id, ip.kind, ip.amount, ip.method, ip.paid_at, ip.notes,
              ip.created_at
         FROM invoice_payments ip
         JOIN invoices i ON i.id = ip.invoice_id AND i.org_id = ip.org_id
        WHERE ip.org_id = $1 AND i.client_id = $2
        ORDER BY COALESCE(ip.paid_at, ip.created_at) DESC, ip.id DESC`,
      args
    ),
    db.query(
      `SELECT id, product_id, agreed_price, agreed_success_fee_percent, currency,
              sold_at, status, sale_motion, notes, created_at
         FROM sales
        WHERE org_id = $1 AND client_id = $2
        ORDER BY COALESCE(sold_at, created_at) DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT sp.id, sp.sale_id, sp.kind, sp.amount, sp.paid_at, sp.notes, sp.sale_motion,
              sp.created_at
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id AND s.org_id = sp.org_id
        WHERE sp.org_id = $1 AND s.client_id = $2
        ORDER BY COALESCE(sp.paid_at, sp.created_at) DESC, sp.id DESC`,
      args
    ),
    db.query(
      `SELECT id, template_key, title, kind, subtype, status, merge_values, rendered_body,
              sent_at, viewed_at, signed_at, signer_name, voided_at, void_reason,
              completed_at, created_at
         FROM contracts
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT s.id, s.contract_id, s.signer_index, s.role_label, s.name, s.status,
              s.viewed_at, s.signed_at, s.declined_at, s.decline_reason, s.created_at
         FROM contract_signers s
         JOIN contracts c ON c.id = s.contract_id AND c.org_id = s.org_id
        WHERE s.org_id = $1 AND c.client_id = $2
        ORDER BY s.contract_id, s.signer_index`,
      args
    ),
    // There is no stage-history table today: a card keeps only its current
    // stage and when it entered it. Stage moves that emit events (round.*) are
    // in dossier.events.
    db.query(
      `SELECT c.id, p.name AS pipeline, ps.name AS stage, c.owner, c.entered_at,
              c.created_at, c.updated_at
         FROM cards c
         JOIN pipelines p ON p.id = c.pipeline_id AND p.org_id = c.org_id
         JOIN pipeline_stages ps ON ps.id = c.stage_id
        WHERE c.org_id = $1 AND c.client_id = $2
        ORDER BY COALESCE(c.entered_at, c.updated_at) DESC NULLS LAST, c.id DESC`,
      args
    ),
    db.query(
      `SELECT id, round_number, status, product, submitted_amount, approved_amount,
              funded_amount, hold_reason, conditions, created_at, updated_at
         FROM funding_rounds
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, funding_round_id, bank, lender_name, product_name, status,
              requested_amount, approved_amount, conditions, condition_text,
              submitted_date, status_updated_date, approval_exclusion_reason, created_at
         FROM applications
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, requested_by_kind, reason, status, state_reason, provider, cost_cents,
              crs_result_id, requested_at, resolved_at, created_at
         FROM soft_pull_requests
        WHERE org_id = $1 AND client_id = $2
        ORDER BY COALESCE(requested_at, created_at) DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, provider, outcome_tier, result, created_at
         FROM crs_results
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    db.query(
      `SELECT id, source, bureau, score, is_primary, data, created_at
         FROM snapshots
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    // Words that reached only the company brain: a recording transcribed
    // before it was matched to a call keeps its words here and nowhere else.
    db.query(
      `SELECT f.id AS file_id, f.name, f.mime_type, f.web_view_link, f.access_tier,
              f.source, f.created_at, c.chunk_index, c.content
         FROM brain_files f
         LEFT JOIN brain_chunks c ON c.file_id = f.id AND c.org_id = f.org_id
        WHERE f.org_id = $1 AND f.client_id = $2
        ORDER BY f.created_at DESC, f.id, c.chunk_index`,
      args
    ),
    db.query(
      `SELECT id, name, payload, created_at
         FROM events
        WHERE org_id = $1 AND client_id = $2
        ORDER BY created_at DESC, id DESC`,
      args
    ),
    readClientAdLink(db, { orgId, clientId })
  ]);

  const clientRaw = rows(clientRes)[0];
  if (!clientRaw) return null;

  // ── profile: the client row and every custom field ──
  const { custom_fields: cfJson, ...clientCols } = clientRaw;
  const client = redact(present(clientCols));
  const customFields = redact(asObject(cfJson));
  const cfRaw = present(rows(cfRes)[0] || {});
  delete cfRaw.org_id;
  delete cfRaw.client_id;
  const cfTable = redact(cfRaw);
  const withheld = [
    ...withheldKeys(present(clientCols), client, "clients"),
    ...withheldKeys(asObject(cfJson), customFields, "clients.custom_fields"),
    ...withheldKeys(cfRaw, cfTable, "client_custom_fields")
  ];
  const survey = {};
  for (const src of [customFields, cfTable]) {
    for (const [k, v] of Object.entries(src)) {
      if (SURVEY_KEY.test(k) || SURVEY_EXTRA_KEYS.includes(k)) survey[k] = v;
    }
  }

  // ── contracts carry their signers (decline reasons included) ──
  const signersByContract = new Map();
  for (const s of rows(signerRes)) {
    const list = signersByContract.get(s.contract_id) || [];
    list.push(present(s));
    signersByContract.set(s.contract_id, list);
  }

  // ── brain files: every chunk joined in order, never cut ──
  const brainFiles = new Map();
  for (const r of rows(brainRes)) {
    const f = brainFiles.get(r.file_id) || {
      file_id: r.file_id, name: r.name || null, mime_type: r.mime_type || null,
      web_view_link: r.web_view_link || null, access_tier: r.access_tier || null,
      source: r.source || null, created_at: r.created_at || null, chunks: 0, parts: []
    };
    if (r.content != null) {
      f.parts.push(r.content);
      f.chunks += 1;
    }
    brainFiles.set(r.file_id, f);
  }
  const brain = [...brainFiles.values()].map(({ parts, ...f }) => ({
    ...f, text: parts.join("\n\n")
  }));

  // ── events: funnel.* rolled up per page and video; everything else in full ──
  const funnel = [];
  const otherEvents = [];
  for (const e of rows(eventRes)) {
    if (String(e.name || "").startsWith("funnel.")) funnel.push(e);
    else otherEvents.push(e);
  }

  const invoices = rows(invoiceRes).map(present);

  const dossier = {
    org_id: orgId,
    client_id: clientId,
    built_at: new Date().toISOString(),
    profile: {
      client,
      custom_fields: customFields,
      custom_field_table: cfTable,
      survey,
      withheld_keys: withheld
    },
    ad: adLink,
    attribution: rows(attributionRes)[0] ? present(rows(attributionRes)[0]) : null,
    conversations: rows(convoRes).map(present),
    messages: rows(messageRes).map(present),
    calls: rows(callRes).map(present),
    setter_calls: rows(outboundCallRes).map(present),
    csm: rows(insightRes).map((r) => ({ ...present(r), answers: asObject(r.answers) })),
    bookings: rows(bookingRes).map(present),
    payments: {
      transactions: rows(txRes).map(present),
      payment_links: rows(linkRes).map(present),
      invoices,
      invoice_payments: rows(invoicePayRes).map(present),
      sale_payments: rows(salePayRes).map(present)
    },
    sales: rows(saleRes).map(present),
    contracts: rows(contractRes).map((c) => ({
      ...present(c), signers: signersByContract.get(c.id) || []
    })),
    pipeline: {
      cards: rows(cardRes).map(present),
      stage_history: null,
      stage_history_note: "No stage-history table exists; each card keeps its current stage and entered_at only."
    },
    funding_rounds: rows(roundRes).map(present),
    applications: rows(appRes).map(present),
    credit: {
      pulls: rows(pullRes).map(present),
      results: rows(crsRes).map(present),
      snapshots: rows(snapshotRes).map(present)
    },
    brain,
    activity: rollUpFunnel(funnel),
    funnel_event_count: funnel.length,
    events: otherEvents.map(present)
  };
  dossier.counts = countDossier(dossier);
  return dossier;
}

export function countDossier(d) {
  return {
    messages: d.messages.length,
    messages_inbound: d.messages.filter((m) => m.direction === "inbound").length,
    calls: d.calls.length,
    setter_calls: d.setter_calls.length,
    csm: d.csm.length,
    bookings: d.bookings.length,
    transactions: d.payments.transactions.length,
    payment_links: d.payments.payment_links.length,
    invoices: d.payments.invoices.length,
    invoice_payments: d.payments.invoice_payments.length,
    sale_payments: d.payments.sale_payments.length,
    sales: d.sales.length,
    contracts: d.contracts.length,
    cards: d.pipeline.cards.length,
    funding_rounds: d.funding_rounds.length,
    applications: d.applications.length,
    credit_pulls: d.credit.pulls.length,
    credit_results: d.credit.results.length,
    credit_snapshots: d.credit.snapshots.length,
    brain_files: d.brain.length,
    pages: d.activity.pages.length,
    videos: d.activity.videos.length,
    funnel_events: d.funnel_event_count,
    events: d.events.length,
    conversations: d.conversations.length
  };
}

// ── items: one dated, rendered line-block per record ────────────────────────

function json(v) {
  return JSON.stringify(v);
}

function kv(obj, skip = []) {
  return Object.entries(obj || {})
    .filter(([k, v]) => !skip.includes(k) && v != null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" && !(v instanceof Date) ? json(v) : (v instanceof Date ? v.toISOString() : v)}`)
    .join(" | ");
}

function who(m) {
  if (m.direction === "inbound") return "CLIENT";
  if (m.sender_kind === "agent") return `AGENT(${m.sender_agent_code || "?"})`;
  return String(m.sender_kind || "OUTBOUND").toUpperCase();
}

/**
 * dossierItems(dossier) → [{ kind, id, at, text }], newest first.
 * Every dated record becomes one item, rendered in full. Items without a date
 * sort as newest so they are never folded into a summary.
 */
export function dossierItems(d) {
  const items = [];
  const add = (kind, id, at, text) => items.push({ kind, id: id ?? null, at: iso(at), text });

  for (const m of d.messages) {
    const head = `[${m.channel || "message"} ${who(m)}]${m.subject ? ` Subject: ${m.subject}` : ""}`;
    const extra = kv(m, ["id", "body", "subject", "channel", "direction", "sender_kind",
      "sender_agent_code", "created_at", "conversation_id"]);
    add("message", m.id, m.created_at, `${head}\n${m.body ?? ""}${extra ? `\n(${extra})` : ""}`);
  }
  for (const c of d.calls) {
    const lines = [`[sales call] ${kv(c, ["id", "notes", "transcript", "logged_at"])}`];
    if (c.notes) lines.push(`notes: ${c.notes}`);
    if (c.transcript) lines.push(`said: ${c.transcript}`);
    add("call", c.id, c.logged_at, lines.join("\n"));
  }
  for (const s of d.setter_calls) add("setter_call", s.id, s.created_at, `[setter call] ${kv(s, ["id"])}`);
  for (const i of d.csm) {
    const lines = [`[CSM ${i.stage || "insight"}] ${kv(i, ["id", "stage", "answers", "notes", "occurred_at"])}`];
    if (i.notes) lines.push(`notes: ${i.notes}`);
    for (const [k, v] of Object.entries(i.answers || {})) {
      if (v == null || v === "") continue;
      lines.push(`${k}: ${typeof v === "object" ? json(v) : v}`);
    }
    add("csm", i.id, i.occurred_at, lines.join("\n"));
  }
  for (const b of d.bookings) add("booking", b.id, b.starts_at || b.created_at, `[booking] ${kv(b, ["id"])}`);
  for (const t of d.payments.transactions) add("transaction", t.id, t.created_at, `[payment] ${kv(t, ["id"])}`);
  for (const l of d.payments.payment_links) add("payment_link", l.id, l.created_at, `[payment link] ${kv(l, ["id"])}`);
  for (const i of d.payments.invoices) add("invoice", i.id, i.created_at, `[invoice] ${kv(i, ["id"])}`);
  for (const p of d.payments.invoice_payments) add("invoice_payment", p.id, p.paid_at || p.created_at, `[invoice payment] ${kv(p, ["id"])}`);
  for (const p of d.payments.sale_payments) add("sale_payment", p.id, p.paid_at || p.created_at, `[sale payment] ${kv(p, ["id"])}`);
  for (const s of d.sales) add("sale", s.id, s.sold_at || s.created_at, `[sale] ${kv(s, ["id"])}`);
  for (const c of d.contracts) {
    const lines = [`[contract] ${kv(c, ["id", "rendered_body", "signers"])}`];
    for (const s of c.signers || []) lines.push(`signer: ${kv(s, ["id", "contract_id"])}`);
    if (c.rendered_body) lines.push(`body:\n${c.rendered_body}`);
    add("contract", c.id, c.created_at, lines.join("\n"));
  }
  for (const c of d.pipeline.cards) add("card", c.id, c.entered_at || c.updated_at, `[pipeline card] ${kv(c, ["id"])}`);
  for (const r of d.funding_rounds) add("funding_round", r.id, r.created_at, `[funding round] ${kv(r, ["id"])}`);
  for (const a of d.applications) add("application", a.id, a.created_at, `[bank application] ${kv(a, ["id"])}`);
  for (const p of d.credit.pulls) add("credit_pull", p.id, p.requested_at || p.created_at, `[credit pull] ${kv(p, ["id"])}`);
  for (const r of d.credit.results) add("credit_result", r.id, r.created_at, `[credit result] ${kv(r, ["id"])}`);
  for (const s of d.credit.snapshots) add("credit_snapshot", s.id, s.created_at, `[credit snapshot] ${kv(s, ["id"])}`);
  for (const f of d.brain) {
    const head = `[brain file] ${kv(f, ["file_id", "text", "created_at", "chunks"])}`;
    add("brain_file", f.file_id, f.created_at, f.text ? `${head}\nwords:\n${f.text}` : head);
  }
  for (const p of d.activity.pages) add("page", `page:${p.page}`, p.last_at, `[page activity] ${kv(p)}`);
  for (const v of d.activity.videos) add("video", `video:${v.video}`, v.last_at, `[video activity] ${kv(v)}`);
  for (const e of d.events) add("event", e.id, e.created_at, `[event ${e.name}] ${json(e.payload ?? {})}`);
  for (const c of d.conversations) {
    if (!c.summary) continue;
    add("conversation_summary", c.id, c.last_pulse_at || c.updated_at,
      `[conversation ${c.channel || ""} summary] ${c.summary}`);
  }

  items.sort((a, b) => {
    if (a.at === b.at) return 0;
    if (a.at == null) return -1;
    if (b.at == null) return 1;
    return a.at < b.at ? 1 : -1;
  });
  return items;
}

function itemBlock(item) {
  return `- ${item.at || "(no date)"} ${item.text}`;
}

/** The always-in-full part: who the client is, their custom fields, the ad. */
export function dossierHeader(d) {
  const lines = ["CLIENT DOSSIER (every record Fundhub holds on this client; do not invent missing values)"];
  const p = d.profile || {};
  if (p.client && Object.keys(p.client).length) lines.push(`Profile: ${kv(p.client)}`);
  if (p.survey && Object.keys(p.survey).length) lines.push(`Survey answers: ${kv(p.survey)}`);
  if (p.custom_fields && Object.keys(p.custom_fields).length) lines.push(`Custom fields: ${kv(p.custom_fields)}`);
  if (p.custom_field_table && Object.keys(p.custom_field_table).length) {
    lines.push(`Custom field table: ${kv(p.custom_field_table)}`);
  }
  if (p.withheld_keys?.length) lines.push(`Withheld (sensitive, never sent to a model): ${p.withheld_keys.join(", ")}`);
  const ad = d.ad || {};
  lines.push(
    `Ad: number ${ad.ad_number ?? "unknown"}, offer ${ad.offer_tag ?? "unknown"}, lead level ${ad.lead_level ?? "unknown"}` +
    (ad.pending ? ` (pending: ${ad.pending})` : "")
  );
  if (d.attribution) lines.push(`First-touch attribution: ${kv(d.attribution, ["client_id", "org_id"])}`);
  if (d.counts) lines.push(`Counts: ${kv(d.counts)}`);
  return lines.join("\n");
}

/**
 * renderDossier(dossier, { summary?, budgetChars? }) → {
 *   text, mode: 'full' | 'summary_plus_newer',
 *   items_total, items_in_full, items_summarized,
 *   over_budget, summary_needed
 * }
 *
 * Fits → everything in full. Too big and a summary exists → the summary of the
 * items up to covers_until, plus every newer item in full. Too big with no
 * summary → still everything in full (never cut), flagged summary_needed so the
 * worker writes one. Never drops an item without counting it.
 */
export function renderDossier(dossier, { summary = null, budgetChars = DEFAULT_PROMPT_BUDGET_CHARS } = {}) {
  const header = dossierHeader(dossier);
  const items = dossierItems(dossier);
  const full = [header, "", `Records, newest first (${items.length}):`, ...items.map(itemBlock)].join("\n");

  if (full.length <= budgetChars) {
    return {
      text: full, mode: "full", items_total: items.length, items_in_full: items.length,
      items_summarized: 0, over_budget: false, summary_needed: false
    };
  }
  const coversUntil = summary ? iso(summary.covers_until) : null;
  if (!summary || !summary.summary || !coversUntil) {
    return {
      text: full, mode: "full", items_total: items.length, items_in_full: items.length,
      items_summarized: 0, over_budget: true, summary_needed: true
    };
  }
  const newer = items.filter((i) => i.at == null || i.at > coversUntil);
  const older = items.length - newer.length;
  const text = [
    header,
    "",
    `Summary of the ${older} older records, up to ${coversUntil}:`,
    summary.summary,
    "",
    `Newer records in full, newest first (${newer.length}):`,
    ...newer.map(itemBlock)
  ].join("\n");
  const overBudget = text.length > budgetChars;
  // A backdated record that landed after the summary was written is counted
  // here: the summary folded fewer items than now sit at or before covers_until.
  const stale = Number.isInteger(summary.items_covered) && summary.items_covered < older;
  return {
    text, mode: "summary_plus_newer", items_total: items.length, items_in_full: newer.length,
    items_summarized: older, over_budget: overBudget, summary_needed: overBudget || stale
  };
}

/** readDossierSummary — the running summary row for this client, or null. */
export async function readDossierSummary(db, { orgId, clientId } = {}) {
  if (!orgId || !clientId) return null;
  const res = await db.query(
    `SELECT summary, covers_until, items_covered, model, updated_at
       FROM client_dossier_summaries
      WHERE org_id = $1 AND client_id = $2`,
    [orgId, clientId]
  );
  return rows(res)[0] || null;
}

export default buildDossier;
