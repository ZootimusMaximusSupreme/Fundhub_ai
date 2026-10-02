// Microsoft Clarity Data Export API — project-live-insights.
// Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api

export const CLARITY_EXPORT_BASE =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export const VALID_DIMENSIONS = new Set([
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
]);

/** @param {number} days */
export function normalizeNumOfDays(days) {
  const n = Math.floor(Number(days));
  if (n === 1 || n === 2 || n === 3) return n;
  return 3;
}

/**
 * @param {object} opts
 * @param {string} opts.token Bearer token (Settings → Data Export)
 * @param {1|2|3} [opts.numOfDays]
 * @param {string} [opts.dimension1]
 * @param {string} [opts.dimension2]
 * @param {string} [opts.dimension3]
 * @param {typeof fetch} [opts.fetch]
 */
export async function fetchProjectLiveInsights({
  token,
  numOfDays = 3,
  dimension1,
  dimension2,
  dimension3,
  fetch: fetchFn = globalThis.fetch,
}) {
  const bearer = String(token ?? "").trim();
  if (!bearer) {
    return { ok: false, status: 0, message: "CLARITY_DATA_EXPORT_TOKEN unset" };
  }

  const days = normalizeNumOfDays(numOfDays);
  const params = new URLSearchParams({ numOfDays: String(days) });
  for (const [key, dim] of [
    ["dimension1", dimension1],
    ["dimension2", dimension2],
    ["dimension3", dimension3],
  ]) {
    const d = String(dim ?? "").trim();
    if (!d) continue;
    if (!VALID_DIMENSIONS.has(d)) {
      return { ok: false, status: 0, message: `Invalid Clarity dimension: ${d}` };
    }
    params.set(key, d);
  }

  const url = `${CLARITY_EXPORT_BASE}?${params.toString()}`;
  const res = await fetchFn(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
          ? body.error
          : res.statusText || "Clarity export failed";
    return { ok: false, status: res.status, message: msg, body };
  }

  return { ok: true, status: res.status, payload: body, numOfDays: days };
}

/** Flatten metric blocks into rows with metricName + fields from information[]. */
export function flattenClarityPayload(payload) {
  if (!Array.isArray(payload)) return [];
  const rows = [];
  for (const block of payload) {
    const metricName = String(block?.metricName ?? "").trim();
    const info = block?.information;
    if (!metricName || !Array.isArray(info)) continue;
    for (const row of info) {
      if (row && typeof row === "object") {
        rows.push({ metricName, ...row });
      }
    }
  }
  return rows;
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * CRO signals for Fundhub funnel URLs from a flattened Clarity export.
 * @param {ReturnType<typeof flattenClarityPayload>} rows
 * @param {object} [opts]
 * @param {string} [opts.urlIncludes] substring match on URL field (case-insensitive)
 */
export function buildClarityCroFindings(rows, opts = {}) {
  const needle = String(opts.urlIncludes ?? "roadmap").toLowerCase();
  const urlRows = rows.filter((r) => {
    const u = String(r.URL ?? r.Url ?? r.url ?? "").toLowerCase();
    return u.includes(needle) || u.includes("apply.fundhub.ai");
  });

  const findings = [];
  const push = (severity, code, message, detail = {}) => {
    findings.push({ severity, code, message, ...detail });
  };

  for (const r of urlRows) {
    const url = String(r.URL ?? r.Url ?? r.url ?? "(unknown URL)");
    const sessions = num(r.totalSessionCount);
    const dead = num(r.deadClickCount ?? r.DeadClickCount);
    const rage = num(r.rageClickCount ?? r.RageClickCount);
    const quickback = num(r.quickbackClick ?? r.QuickbackClick);
    const scroll = num(r.scrollDepth ?? r.ScrollDepth);
    const engagement = num(r.engagementTime ?? r.EngagementTime);

    if (sessions != null && sessions >= 5 && dead != null && dead >= 3) {
      push(
        "high",
        "dead_clicks",
        "People tapped but nothing happened (dead clicks). Check buttons and form fields.",
        { url, sessions, deadClicks: dead, metricName: r.metricName },
      );
    }
    if (sessions != null && sessions >= 5 && rage != null && rage >= 2) {
      push(
        "high",
        "rage_clicks",
        "Rage clicks — repeated angry tapping. Something looks broken or misleading.",
        { url, sessions, rageClicks: rage, metricName: r.metricName },
      );
    }
    if (sessions != null && sessions >= 5 && quickback != null && quickback >= 3) {
      push(
        "medium",
        "quickback",
        "Quick back — they left right after landing. Opening or message mismatch.",
        { url, sessions, quickbackClicks: quickback, metricName: r.metricName },
      );
    }
    if (scroll != null && scroll > 0 && scroll < 25 && sessions != null && sessions >= 10) {
      push(
        "medium",
        "low_scroll",
        "Most people are not scrolling far. Hero or VSL may not be pulling them down.",
        { url, scrollDepth: scroll, sessions, metricName: r.metricName },
      );
    }
    if (engagement != null && engagement > 0 && engagement < 15 && sessions != null && sessions >= 10) {
      push(
        "low",
        "short_engagement",
        "Short time on page. They skim and leave.",
        { url, engagementSeconds: engagement, sessions, metricName: r.metricName },
      );
    }
  }

  if (!urlRows.length) {
    push(
      "low",
      "no_url_rows",
      "No Clarity URL rows matched this funnel yet. Wait for traffic or widen the URL filter.",
      { urlIncludes: needle },
    );
  }

  const rank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return findings;
}
