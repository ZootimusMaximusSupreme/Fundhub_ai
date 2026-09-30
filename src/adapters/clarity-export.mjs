// Microsoft Clarity Data Export API — sole call site.
// Agent rule: one pull per time Chris asks (no retry, no second dimension/`numOfDays` call).
// Machine stop: Microsoft allows 10 requests per project per UTC day — block before call 11.
// Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

export const CLARITY_EXPORT_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";
export const CLARITY_EXPORT_DAILY_CAP = 10;
export const DEFAULT_COUNTER_PATH = path.join(
  REPO_ROOT,
  "credentials",
  "clarity-export-daily.json"
);

function utcDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function counterKey(projectId, dateUtc) {
  return `${projectId}:${dateUtc}`;
}

function readCounts(counterPath) {
  try {
    const raw = fs.readFileSync(counterPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed.counts && typeof parsed.counts === "object" && !Array.isArray(parsed.counts)
        ? { ...parsed.counts }
        : { ...parsed };
    }
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
  return {};
}

function writeCounts(counterPath, counts) {
  fs.mkdirSync(path.dirname(counterPath), { recursive: true });
  const tmp = `${counterPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ counts }, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, counterPath);
}

/**
 * Only allowed way to call the Clarity Data Export API.
 * Agents: one pull per Chris ask — do not call this twice for the same ask.
 * Persists a daily count under credentials/ (gitignored). Increments only when
 * a request will be sent. Throws before fetch when Microsoft's 10/day cap is used.
 *
 * @param {object} [opts]
 * @param {string|number} [opts.numOfDays]
 * @param {string} [opts.dimension1]
 * @param {string} [opts.dimension2]
 * @param {string} [opts.dimension3]
 * @param {string} [opts.counterPath] — override for tests; default credentials/clarity-export-daily.json
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {Date} [opts.now] — override clock for tests
 */
export async function fetchClarityLiveInsights(opts = {}) {
  const env = opts.env || process.env;
  const token = String(env.CLARITY_DATA_EXPORT_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "CLARITY_DATA_EXPORT_TOKEN is missing. Set it in .env before calling Clarity Data Export."
    );
  }

  const projectId = String(env.CLARITY_PROJECT_ID || "").trim();
  if (!projectId) {
    throw new Error(
      "CLARITY_PROJECT_ID is missing. Set it in .env before calling Clarity Data Export."
    );
  }

  const counterPath = opts.counterPath || DEFAULT_COUNTER_PATH;
  const dateUtc = utcDateKey(opts.now || new Date());
  const key = counterKey(projectId, dateUtc);
  const counts = readCounts(counterPath);
  const used = Number(counts[key] || 0);

  if (used >= CLARITY_EXPORT_DAILY_CAP) {
    throw new Error(
      `Clarity Data Export daily cap (${CLARITY_EXPORT_DAILY_CAP}) used for project ${projectId} on ${dateUtc} UTC. Stop. Do not retry.`
    );
  }

  // Count this call before fetch — Microsoft counts the HTTP request.
  counts[key] = used + 1;
  writeCounts(counterPath, counts);

  const url = new URL(CLARITY_EXPORT_URL);
  if (opts.numOfDays != null && opts.numOfDays !== "") {
    url.searchParams.set("numOfDays", String(opts.numOfDays));
  }
  if (opts.dimension1) url.searchParams.set("dimension1", String(opts.dimension1));
  if (opts.dimension2) url.searchParams.set("dimension2", String(opts.dimension2));
  if (opts.dimension3) url.searchParams.set("dimension3", String(opts.dimension3));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail =
      typeof body === "string"
        ? body.slice(0, 200)
        : body && typeof body === "object"
          ? JSON.stringify(body).slice(0, 200)
          : "";
    throw new Error(
      `Clarity Data Export HTTP ${res.status}${detail ? `: ${detail}` : ""}`
    );
  }

  return body;
}
