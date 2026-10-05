// Running summary of a client's older dossier items (client_dossier_summaries).
//
// Spec: docs/specs/marketing-machine-2026-10-04.md §6 step 9. When a dossier is
// too big for one model call, nothing is cut silently: this job folds the older
// items into one running summary and records covers_until. renderDossier()
// (src/clients/dossier.mjs) then hands a model the summary plus every newer item
// in full.
//
// PENDING HOOKUP: this is meant to run in the worker (M0 step 4), refreshed when
// new data lands. The worker is not built yet, so nothing schedules it today.
//
// Folding is paged, never cut: items go to the model in batches that fit one
// call, and an item bigger than a batch is sent in numbered parts, each folded
// in turn. No transaction is held across a model call; the row is written once,
// after every fold succeeded. Any model failure writes nothing.

import { callModel, DEFAULT_MODEL } from "../agents/model.mjs";
import { scrubText } from "./scrub.mjs";
import {
  buildDossier,
  dossierItems,
  readDossierSummary,
  renderDossier,
  DEFAULT_PROMPT_BUDGET_CHARS
} from "./dossier.mjs";

/** Claude only, named explicitly from the repo's central default (spec §4 trap 8). */
export const SUMMARY_MODEL = DEFAULT_MODEL;
export const SUMMARY_MAX_TOKENS = 4000;
/** One fold call may take this long before it is abandoned (trap 8). */
export const SUMMARY_TIMEOUT_MS = 120_000;
export const SUMMARY_TIMED_OUT = "timed_out";

/**
 * callWithTimeout(callModelImpl, request, { timeoutMs, fetchImpl })
 * callModel has no timeout of its own on main, so this module adds one: the
 * fetch it is handed carries an abort signal, and the call races a timer. A
 * call that runs out of time comes back as an error, never as a summary.
 */
export async function callWithTimeout(callModelImpl, request, {
  timeoutMs = SUMMARY_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  const controller = new AbortController();
  const baseFetch = fetchImpl;
  const fetchWithSignal = typeof baseFetch === "function"
    ? (url, init = {}) => baseFetch(url, { ...init, signal: controller.signal })
    : baseFetch;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ mode: "live", text: null, error: SUMMARY_TIMED_OUT });
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve(callModelImpl({ ...request, fetchImpl: fetchWithSignal })),
      timeout
    ]);
  } catch (err) {
    return { mode: "live", text: null, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
/** Characters of new items per fold call. */
export const SUMMARY_BATCH_CHARS = 60_000;

export const SUMMARY_SYSTEM = [
  "You keep a running summary of one client's history at Fundhub, a business-funding company.",
  "You get the summary so far and the next records, oldest first.",
  "Return the updated summary only: it must keep every fact from the summary so far and add the new records.",
  "Keep names, dollar amounts, dates, credit facts, objections, promises, complaints and the client's own words that matter.",
  "Write plain facts. Never invent anything that is not in the records."
].join("\n");

function itemText(item) {
  return `- ${item.at || "(no date)"} ${item.text}`;
}

/**
 * splitOlder(items, keepNewestChars) → { keep, older, coversUntil }
 * Walks newest to oldest keeping items until keepNewestChars is used, then
 * everything older is folded. Items sharing the boundary time all fold together
 * so covers_until never splits one moment. Undated items always stay in full.
 */
export function splitOlder(items, keepNewestChars) {
  const newestFirst = items.slice();
  const keep = [];
  let used = 0;
  let i = 0;
  for (; i < newestFirst.length; i++) {
    const it = newestFirst[i];
    if (it.at == null) { keep.push(it); used += itemText(it).length; continue; }
    const size = itemText(it).length;
    if (keep.some((k) => k.at != null) && used + size > keepNewestChars) break;
    keep.push(it);
    used += size;
  }
  let older = newestFirst.slice(i);
  if (!older.length) return { keep, older: [], coversUntil: null };
  const coversUntil = older[0].at;
  // Pull any kept item that shares the boundary time into the folded side.
  const sameMoment = keep.filter((k) => k.at === coversUntil);
  if (sameMoment.length) {
    older = [...sameMoment, ...older];
    for (const k of sameMoment) keep.splice(keep.indexOf(k), 1);
  }
  return { keep, older, coversUntil };
}

/**
 * batchesOf(items, batchChars) → [string]
 * Oldest first. An item bigger than one batch is sent in numbered parts.
 */
export function batchesOf(itemsOldestFirst, batchChars = SUMMARY_BATCH_CHARS) {
  const out = [];
  let cur = "";
  const flush = () => { if (cur) { out.push(cur); cur = ""; } };
  for (const it of itemsOldestFirst) {
    const text = itemText(it);
    if (text.length > batchChars) {
      flush();
      const parts = Math.ceil(text.length / batchChars);
      for (let p = 0; p < parts; p++) {
        out.push(`(record part ${p + 1} of ${parts})\n${text.slice(p * batchChars, (p + 1) * batchChars)}`);
      }
      continue;
    }
    if (cur && cur.length + 1 + text.length > batchChars) flush();
    cur = cur ? `${cur}\n${text}` : text;
  }
  flush();
  return out;
}

/**
 * refreshDossierSummary(db, { orgId, clientId, env?, fetchImpl?, callModelImpl?,
 *   budgetChars?, keepNewestChars?, batchChars?, timeoutMs? })
 * → { refreshed, reason, covers_until?, items_covered?, calls? }
 *
 * No-op when the whole dossier fits the budget, or when the summary already
 * covers everything older than the kept window.
 */
export async function refreshDossierSummary(db, {
  orgId,
  clientId,
  env = process.env,
  fetchImpl,
  callModelImpl = callModel,
  budgetChars = DEFAULT_PROMPT_BUDGET_CHARS,
  keepNewestChars = Math.floor(budgetChars / 2),
  batchChars = SUMMARY_BATCH_CHARS,
  timeoutMs = SUMMARY_TIMEOUT_MS
} = {}) {
  if (!orgId || !clientId) return { refreshed: false, reason: "org_and_client_required" };
  const dossier = await buildDossier(db, { orgId, clientId });
  if (!dossier) return { refreshed: false, reason: "client_not_found" };

  if (!renderDossier(dossier, { budgetChars }).over_budget) return { refreshed: false, reason: "fits" };
  const items = dossierItems(dossier);

  const { older, coversUntil } = splitOlder(items, keepNewestChars);
  if (!older.length) return { refreshed: false, reason: "nothing_older" };

  const existing = await readDossierSummary(db, { orgId, clientId });
  const prevUntil = existing?.covers_until ? new Date(existing.covers_until).toISOString() : null;
  const alreadyCovered = prevUntil ? older.filter((i) => i.at <= prevUntil).length : 0;
  // Start over when a backdated record slipped in under the old covers_until.
  const restart = !existing || !Number.isInteger(existing.items_covered)
    || existing.items_covered !== alreadyCovered;
  const toFold = restart ? older : older.filter((i) => i.at > prevUntil);
  if (!toFold.length) return { refreshed: false, reason: "up_to_date" };

  let running = restart ? "" : String(existing.summary || "");
  const batches = batchesOf(toFold.slice().reverse(), batchChars);
  const anthropicOnly = { ANTHROPIC_API_KEY: env?.ANTHROPIC_API_KEY };
  for (const batch of batches) {
    const res = await callWithTimeout(callModelImpl, {
      system: SUMMARY_SYSTEM,
      user: `SUMMARY SO FAR:\n${running || "(none yet)"}\n\nNEXT RECORDS (oldest first):\n${batch}`,
      env: anthropicOnly,
      model: SUMMARY_MODEL,
      maxTokens: SUMMARY_MAX_TOKENS
    }, { timeoutMs, fetchImpl: fetchImpl || globalThis.fetch });
    if (res?.mode === "shadow") return { refreshed: false, reason: "no_model_key", calls: batches.length };
    if (res?.error || !res?.text || !String(res.text).trim()) {
      return { refreshed: false, reason: "model_error", detail: res?.error || "empty reply" };
    }
    // The records sent were already scrubbed; the reply is scrubbed too.
    running = scrubText(String(res.text).trim());
  }

  await db.query(
    `INSERT INTO client_dossier_summaries
       (org_id, client_id, summary, covers_until, items_covered, model)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, client_id) DO UPDATE
       SET summary = EXCLUDED.summary,
           covers_until = EXCLUDED.covers_until,
           items_covered = EXCLUDED.items_covered,
           model = EXCLUDED.model,
           updated_at = now()`,
    [orgId, clientId, running, coversUntil, older.length, SUMMARY_MODEL]
  );
  return {
    refreshed: true, reason: null, covers_until: coversUntil,
    items_covered: older.length, calls: batches.length
  };
}

export default refreshDossierSummary;
