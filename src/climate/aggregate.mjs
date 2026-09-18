import { STATE_FIPS, STATE_NAMES, nowIso } from "./config.mjs";
import { pullBls, pullCrmLenders, pullFred } from "./connectors.mjs";
import { computeNational, computeStateScore } from "./scoring.mjs";

let memo = null;
let memoAt = 0;
const MEMO_MS = 15 * 60 * 1000;

export async function buildComposite(force = false, db = null) {
  if (!force && memo && Date.now() - memoAt < MEMO_MS) return memo;
  const asOf = nowIso();
  const [fred, bls, crm] = await Promise.all([pullFred(), pullBls(), pullCrmLenders(db)]);
  const national = computeNational(fred);
  const banks = crm?.lenders || [];
  const blsMap = new Map((bls?.states || []).map((e) => [e.state_code, e]));
  const states = Object.keys(STATE_FIPS).map((stateCode) => {
    const entry = blsMap.get(stateCode) || {
      state_code: stateCode,
      unemployment_rate_pct: 4.5,
      delinquency_rate_pct: 1.5
    };
    const scored = computeStateScore(entry, banks, national.nfib_index, []);
    return {
      ...scored,
      name: STATE_NAMES[stateCode] || stateCode,
      updated_at: asOf,
      stale: Boolean(bls?.stale)
    };
  });
  const payload = {
    as_of: asOf,
    stale: Boolean(fred?.stale || bls?.stale || crm?.stale),
    national: {
      score: national.score,
      components: national.components,
      color_band: national.color_band,
      color: national.color,
      title: national.title,
      updated_at: national.updated_at,
      stale: Boolean(national.stale)
    },
    states,
    banks,
    sources: {
      fred: fred?.fetch_status,
      bls: bls?.fetch_status,
      lenders: crm?.fetch_status
    }
  };
  memo = payload;
  memoAt = Date.now();
  return payload;
}
