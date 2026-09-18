// Company Brain config — Drive connector credentials from env.
//
// Owner-set 2026-08-02 (H-1): pgvector (not Cognee) for v1 store.
// Owner-set 2026-08-02 (H-2): index everything. No folder exclusion list.
// Owner-set 2026-08-02 (H-3): only the owner role approves owner/affiliate classifications.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

function resolveTokenPath(pathRaw) {
  const trimmed = String(pathRaw || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("~/")) {
    return join(process.env.HOME || "", trimmed.slice(2));
  }
  return trimmed;
}

/* Every place a desktop-OAuth token.json can sit, Drive's own key first.
   scripts/google-oauth-mint.mjs asks for Drive and Gmail in one consent and
   stores the result under the Gmail key, so that token reads Drive too.
   Owner rule (2026-09-17): a stored key is never removed. A key Google refuses
   stays where it is; the Drive client falls through to the next token here
   (drive-client.mjs). Measured 2026-09-18: the August token under the Drive key
   gets 401 invalid_client; the Gmail key's token reads the same Drive. */
export const DRIVE_OAUTH_ENV_KEYS = [
  ["GOOGLE_DRIVE_OAUTH_TOKEN_PATH", "GOOGLE_DRIVE_OAUTH_TOKEN_JSON"],
  ["GOOGLE_OAUTH_TOKEN_PATH", "GOOGLE_OAUTH_TOKEN_JSON"],
  ["GOOGLE_GMAIL_OAUTH_TOKEN_PATH", "GOOGLE_GMAIL_OAUTH_TOKEN_JSON"]
];

function parseOAuthTokenJson(parsed, label) {
  const missing = [];
  const refreshToken = parsed?.refresh_token ? String(parsed.refresh_token) : "";
  const clientId = parsed?.client_id ? String(parsed.client_id) : "";
  const clientSecret = parsed?.client_secret ? String(parsed.client_secret) : "";
  const tokenUri = parsed?.token_uri ? String(parsed.token_uri) : GOOGLE_TOKEN_URL;
  if (!refreshToken) missing.push(`${label}(refresh_token)`);
  if (!clientId) missing.push(`${label}(client_id)`);
  if (!clientSecret) missing.push(`${label}(client_secret)`);
  if (missing.length) return { missing, credentials: null };
  return {
    missing: [],
    credentials: { refreshToken, clientId, clientSecret, tokenUri }
  };
}

function oauthCredentialsFromKeys(env, pathKey, jsonKey) {
  const pathRaw = String(env[pathKey] || "").trim();
  const inlineRaw = env[jsonKey] || "";
  if (!pathRaw && !inlineRaw) return null;
  const label = jsonKey.replace(/_JSON$/, "");

  if (inlineRaw) {
    try {
      const parsed = typeof inlineRaw === "string" ? JSON.parse(inlineRaw) : inlineRaw;
      return { ...parseOAuthTokenJson(parsed, label), tokenSource: jsonKey };
    } catch {
      return { missing: [`${jsonKey}(invalid_json)`], credentials: null, tokenSource: jsonKey };
    }
  }

  const resolved = resolveTokenPath(pathRaw);
  if (!resolved || !existsSync(resolved)) {
    return { missing: [`${pathKey}(not_found)`], credentials: null, tokenSource: pathKey };
  }
  try {
    const parsed = JSON.parse(readFileSync(resolved, "utf8"));
    return { ...parseOAuthTokenJson(parsed, label), tokenSource: pathKey };
  } catch {
    return { missing: [`${pathKey}(invalid_json)`], credentials: null, tokenSource: pathKey };
  }
}

/** Every usable OAuth token in DRIVE_OAUTH_ENV_KEYS order, or null when none is set. */
function oauthCandidatesFromEnv(env) {
  const candidates = [];
  const missing = [];
  let anySet = false;
  for (const [pathKey, jsonKey] of DRIVE_OAUTH_ENV_KEYS) {
    const oauth = oauthCredentialsFromKeys(env, pathKey, jsonKey);
    if (!oauth) continue;
    anySet = true;
    if (oauth.credentials) {
      candidates.push({ credentials: oauth.credentials, tokenSource: oauth.tokenSource });
    } else {
      missing.push(...oauth.missing);
    }
  }
  return anySet ? { candidates, missing } : null;
}

/**
 * Read Drive connector settings from env.
 * Returns { ready, missing[], authMode, serviceAccount, oauthCredentials, delegateEmail }.
 * Does not throw — callers branch on `ready`.
 *
 * Env (personal Gmail / desktop OAuth — takes precedence when set):
 *   GOOGLE_DRIVE_OAUTH_TOKEN_PATH — path to token.json from desktop OAuth
 *   GOOGLE_DRIVE_OAUTH_TOKEN_JSON — inline token.json string (for hosted deploys)
 *   then GOOGLE_OAUTH_TOKEN_* and GOOGLE_GMAIL_OAUTH_TOKEN_* as fallbacks
 *   (DRIVE_OAUTH_ENV_KEYS above). A PATH or JSON key that is set but unreadable
 *   is skipped when a later key holds a usable token.
 *
 * Env (Workspace service account):
 *   GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON — full service-account JSON string
 *   GOOGLE_DRIVE_DELEGATE_EMAIL — optional Workspace user (domain-wide
 *     delegation). If unset, the robot reads files shared with it.
 */
export function driveConfigFromEnv(env = process.env) {
  const oauth = oauthCandidatesFromEnv(env);
  if (oauth) {
    const first = oauth.candidates[0] || null;
    return {
      ready: !!first,
      missing: first ? [] : oauth.missing,
      authMode: "oauth",
      oauthCredentials: first ? first.credentials : null,
      // Every usable token, in order. The Drive client moves to the next one
      // when Google refuses a token or it has no Drive scope.
      oauthCandidates: oauth.candidates,
      tokenSource: first ? first.tokenSource : null,
      serviceAccount: null,
      delegateEmail: null,
      excludedFolderIds: []
    };
  }

  const raw = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || "";
  const delegateEmail = String(env.GOOGLE_DRIVE_DELEGATE_EMAIL || "").trim() || null;

  const missing = [];
  let serviceAccount = null;

  if (!raw) {
    missing.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
  } else {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== "object") throw new Error("not an object");
      if (!parsed.client_email || !parsed.private_key) {
        missing.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.client_email|private_key");
      } else {
        serviceAccount = {
          clientEmail: String(parsed.client_email),
          privateKey: String(parsed.private_key).replace(/\\n/g, "\n"),
          projectId: parsed.project_id ? String(parsed.project_id) : null
        };
      }
    } catch {
      missing.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON(invalid_json)");
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    authMode: "service_account",
    oauthCredentials: null,
    serviceAccount,
    delegateEmail,
    // H-2 owner-set: empty = index everything
    excludedFolderIds: []
  };
}
