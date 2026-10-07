// yd-fee-safe — the daily job that turns a paid fee safe (spec §3, §6, §10 B4).
//
// A building's fee is `safe` refund_days (60 by default) after it was PAID: no
// refund can be owed any more. In the same pass the placement moves to `safe` and
// the first-touch broker's share, held until then, becomes `payable`. Staff then
// pay it with POST staff/broker-payout. The job only makes moves the database
// allows, so a fee that is not 60 days old is untouched, and a fee that was
// reversed (refunded) is skipped.
//
// This file is the logic. The Inngest function that runs it daily is registered on
// the Fundhub side, in src/workflows/yd-fee-safe.mjs (the workflow index and the
// journey runner read that folder), and is watched by the daily pulse
// (INNGEST_JOBS in src/pulse/heartbeats.mjs, the same id and cron).

import { db } from "../../db.mjs";
import { releaseSafeFees } from "../store/money.mjs";

export const FEE_SAFE_CRON = "0 8 * * *";
export const FEE_SAFE_JOB = "yd-fee-safe";

/** One pass. Exported so a test (or an operator) can run it on any handle. */
export async function runFeeSafe(handle = db, opts = {}) {
  const out = await releaseSafeFees(handle, opts);
  return { ok: out.errors.length === 0, ...out };
}
