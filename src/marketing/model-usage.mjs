// What a model call cost, written to marketing_model_usage (spec M0 step 4).
// NOT recordUsage: that charges a partner token cap Social Studio shares, and its
// purpose CHECK refuses new values.
//
// Prices are dollars per million tokens, from Anthropic's list as of 2026-09-25.
// A model that is not in the table is recorded at cost 0 and reported as
// unpriced, so a new model never makes the write fail; add its row here.

export const MODEL_PRICES = Object.freeze({
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 }
});

/** Dollars for one call, or null when the model has no price row. */
export function costUsd(model, usage = {}) {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const read = Number(usage.cache_read_tokens) || 0;
  const write = Number(usage.cache_creation_tokens) || 0;
  const readRate = p.cacheRead ?? p.input * 0.1;
  const writeRate = p.input * 1.25;
  return (input * p.input + output * p.output + read * readRate + write * writeRate) / 1e6;
}

/**
 * Write one usage row. `usage` is the object callModel returns.
 * Returns { id, cost_usd, priced }.
 */
export async function recordMarketingUsage(db, { orgId, batchId = null, jobId = null, model, usage = {} }) {
  if (!orgId) throw new Error("recordMarketingUsage: orgId is required");
  if (!model) throw new Error("recordMarketingUsage: model is required");
  const cost = costUsd(model, usage);
  const r = await db.query(
    `INSERT INTO marketing_model_usage
       (org_id, batch_id, job_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orgId, batchId, jobId, model,
      Number(usage.input_tokens) || 0, Number(usage.output_tokens) || 0,
      Number(usage.cache_read_tokens) || 0, Number(usage.cache_creation_tokens) || 0,
      cost ?? 0]
  );
  return { id: r.rows[0].id, cost_usd: cost ?? 0, priced: cost !== null };
}
