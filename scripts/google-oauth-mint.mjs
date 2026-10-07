#!/usr/bin/env node
/* google-oauth-mint.mjs — mint the Google token this repo reads, in one run.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THIS SCRIPT EXISTS
 *
 * Every Google thing in this repo — Gmail, Company Brain's Drive index, the
 * Sales Floor recordings — reads ONE credential: a desktop-OAuth token.json
 * holding { refresh_token, client_id, client_secret }. src/gmail/config.mjs
 * falls through to the Drive keys on purpose, so one token covers all of it.
 *
 * That token was minted in August by a tool called "file-sweep" which is not in
 * this repository and is no longer on this Mac (~/file-sweep does not exist).
 * So the repo could USE a token and could not MAKE one, and there was no way
 * back from losing it. This is the way back.
 *
 * WHAT IS LEFT FOR A HUMAN, and it is genuinely irreducible: Google will not
 * hand out a refresh token without a person signing in and pressing Allow. No
 * script, key or service account gets around that for a personal Gmail account
 * — and the owner's standing rule is personal Gmail with per-user OAuth, never
 * Workspace domain-wide delegation. So: one download, one command, one click.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * HOW TO RUN IT
 *
 *   1. In the Google Cloud Console, create (or reuse) an OAuth client of type
 *      "Desktop app", and download its JSON. Desktop is the type that accepts a
 *      loopback redirect, which is what this script listens on.
 *   2. node scripts/google-oauth-mint.mjs --client ~/Downloads/client_secret_*.json
 *   3. A browser opens. Sign in as the mailbox you want read. Press Allow.
 *
 * It then writes the token file and prints the one command that puts it on
 * Netlify. It does NOT touch Netlify itself unless you pass --set-netlify.
 *
 * FLAGS
 *   --client <path>   the JSON downloaded in step 1 (or set
 *                     GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)
 *   --out <path>      where to write the token
 *                     (default ~/.config/fundhub/google-token.json)
 *   --port <n>        loopback port for the redirect (default 8477)
 *   --scopes <list>   space- or comma-separated override of the scopes below
 *   --no-open         print the URL instead of opening a browser
 *   --set-netlify     also run `netlify env:set GOOGLE_GMAIL_OAUTH_TOKEN_JSON`
 *                     for the production, deploy-preview and branch contexts,
 *                     as a secret. OFF by default: writing production config is
 *                     a deliberate act, not a side effect of minting a token.
 *   --calendar        OPT-IN. Mint the calendar owner's token for the team
 *                     calendar link instead (src/staff/calendar-sync.mjs):
 *                     asks only for calendar.events + calendar.freebusy, writes
 *                     ~/.config/fundhub/google-calendar-token.json, and names
 *                     GOOGLE_CALENDAR_OAUTH_TOKEN_JSON — a NEW variable, so the
 *                     Gmail and Drive tokens are never touched. With no --client
 *                     and no GOOGLE_OAUTH_CLIENT_ID it reuses the client id and
 *                     secret inside the Google token already in the environment
 *                     (the same Desktop client). With --set-netlify it refuses
 *                     to overwrite GOOGLE_CALENDAR_OAUTH_TOKEN_JSON if Netlify
 *                     already holds one (owner law: never overwrite a key).
 *
 *                       node --env-file=.env scripts/google-oauth-mint.mjs --calendar --set-netlify
 *
 * WHAT IT NEVER DOES
 *   * It never prints a refresh token, a client secret or an access token. It
 *     prints which FIELDS are present and the path it wrote.
 *   * It never overwrites an existing token file unless you pass --force, so a
 *     credential that currently works cannot be clobbered by a re-run.
 *   * It never rotates or deletes anything already on Netlify. --set-netlify
 *     sets one named variable and leaves every other value alone.
 */

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { GMAIL_MODIFY_SCOPE } from "../src/gmail/config.mjs";
import { DRIVE_READONLY_SCOPE } from "../src/company-brain/config.mjs";
import { CALENDAR_SCOPES, TOKEN_ENV_KEY as CALENDAR_TOKEN_ENV_KEY } from "../src/messaging/providers/google-calendar.mjs";
import { calendarOwnerEmail } from "../src/staff/calendar-sync.mjs";

/* One consent, every Google surface this repo reads. Asking for both at once
   matters: a refresh token carries the scopes it was granted and nothing can
   add one later, so a token minted for Drive alone would leave Gmail needing a
   SECOND click on another day.

   Imported rather than typed out, so these are the scopes the CODE asks for and
   not a second copy that can drift from it. GMAIL_MODIFY_SCOPE had been exported
   and read by nothing since it was written — the refresh-token grant carries no
   scope parameter, so the only moment a scope is ever named is this one. */
const DEFAULT_SCOPES = [
  GMAIL_MODIFY_SCOPE,   // src/gmail — read, label, modify
  DRIVE_READONLY_SCOPE  // src/company-brain — index Drive
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_OUT = join(process.env.HOME || ".", ".config/fundhub/google-token.json");
const CALENDAR_OUT = join(process.env.HOME || ".", ".config/fundhub/google-calendar-token.json");

/* --calendar only: the Google tokens this repo already reads, in the order
   src/company-brain/config.mjs reads them. Each carries the Desktop client's id
   and secret, so the calendar consent can reuse that client without anyone
   downloading its JSON again. Only the client pair is read; the refresh token
   in it is never used or printed. */
const EXISTING_TOKEN_KEYS = [
  "GOOGLE_GMAIL_OAUTH_TOKEN_JSON", "GOOGLE_GMAIL_OAUTH_TOKEN_PATH",
  "GOOGLE_DRIVE_OAUTH_TOKEN_JSON", "GOOGLE_DRIVE_OAUTH_TOKEN_PATH",
  "GOOGLE_OAUTH_TOKEN_JSON", "GOOGLE_OAUTH_TOKEN_PATH"
];

function clientFromExistingToken(env = process.env) {
  for (const key of EXISTING_TOKEN_KEYS) {
    const value = String(env[key] || "").trim();
    if (!value) continue;
    try {
      const raw = key.endsWith("_PATH")
        ? readFileSync(value.replace(/^~(?=\/)/, process.env.HOME || "~"), "utf8")
        : value;
      const t = JSON.parse(raw);
      if (t.client_id && t.client_secret) {
        return { clientId: String(t.client_id), clientSecret: String(t.client_secret), from: key };
      }
    } catch { /* unreadable — try the next one */ }
  }
  return null;
}

function args(argv) {
  const out = { flags: new Set(), opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out.opts[name] = next; i += 1; } else { out.flags.add(name); }
  }
  return out;
}

function fail(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

/* The Console's download nests the pair under "installed" (desktop) or "web".
   Reading it straight off disk is one less thing for a person to copy by hand,
   and copying by hand is how a credential ends up as a masked string. */
function clientFrom(opts) {
  if (opts.client) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(opts.client, "utf8"));
    } catch (err) {
      fail(`Could not read ${opts.client}: ${err.message}`,
        "Point --client at the JSON you downloaded from the Google Cloud Console.");
    }
    const block = parsed.installed || parsed.web || parsed;
    if (!block.client_id || !block.client_secret) {
      fail("That JSON has no client_id / client_secret in it.",
        'Download the OAuth client again — pick type "Desktop app".');
    }
    return { clientId: String(block.client_id), clientSecret: String(block.client_secret) };
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    fail("No OAuth client to sign in with.",
      "Pass --client <downloaded json>, or set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

/* PKCE. Not strictly required for a confidential desktop client, but it costs
   four lines and it means an intercepted authorization code on the loopback
   interface is useless on its own. */
function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>`
    + `<body style="font:16px/1.5 system-ui;margin:4rem auto;max-width:34rem;padding:0 1rem">`
    + `<h1 style="font-size:1.3rem">${title}</h1><p>${body}</p></body>`;
}

/* Waits for Google to bounce the browser back to the loopback address. Resolves
   with the one-time code. Times out rather than hanging a terminal forever. */
function waitForCode(port, state, { timeoutMs = 5 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname !== "/") { res.writeHead(404).end(); return; }
      const err = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const gotState = url.searchParams.get("state");

      if (err) {
        res.writeHead(200, { "content-type": "text/html" })
          .end(page("Not connected", `Google said: <code>${err}</code>. Nothing was changed. You can close this tab.`));
        done(new Error(`consent refused: ${err}`));
        return;
      }
      if (gotState !== state) {
        res.writeHead(400, { "content-type": "text/html" })
          .end(page("Not connected", "That reply did not match this sign-in. Nothing was changed."));
        done(new Error("state mismatch — the reply did not belong to this run"));
        return;
      }
      if (!code) {
        res.writeHead(400, { "content-type": "text/html" }).end(page("Not connected", "No code came back."));
        done(new Error("no authorization code in the reply"));
        return;
      }
      res.writeHead(200, { "content-type": "text/html" })
        .end(page("Connected", "You can close this tab and go back to the terminal."));
      done(null, code);
    });

    let finished = false;
    const timer = setTimeout(() => done(new Error("timed out waiting for the browser")), timeoutMs);
    function done(err, code) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      server.close(() => (err ? reject(err) : resolve(code)));
    }

    server.on("error", (e) => done(new Error(
      e.code === "EADDRINUSE"
        ? `port ${port} is already in use — rerun with --port <another number>`
        : e.message
    )));
    server.listen(port, "127.0.0.1");
  });
}

async function exchange({ code, clientId, clientSecret, redirectUri, verifier }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier
    }).toString()
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`token exchange returned non-json (${res.status})`); }
  if (!res.ok || !json.refresh_token) {
    // No refresh_token usually means Google has seen this consent before and
    // reused it. prompt=consent below is what forces a fresh one.
    const why = json.error_description || json.error || `status ${res.status}`;
    throw new Error(`token exchange gave no refresh token (${why})`);
  }
  return json;
}

async function main() {
  const { flags, opts } = args(process.argv.slice(2));
  const calendar = flags.has("calendar");
  let reused = null;
  if (calendar && !opts.client && !(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)) {
    reused = clientFromExistingToken();
  }
  const { clientId, clientSecret } = reused || clientFrom(opts);
  const port = Number(opts.port || 8477);
  const outPath = opts.out || (calendar ? CALENDAR_OUT : DEFAULT_OUT);
  const envKey = calendar ? CALENDAR_TOKEN_ENV_KEY : "GOOGLE_GMAIL_OAUTH_TOKEN_JSON";
  const scopes = opts.scopes
    ? String(opts.scopes).split(/[\s,]+/).filter(Boolean)
    : (calendar ? [...CALENDAR_SCOPES] : DEFAULT_SCOPES);
  const redirectUri = `http://localhost:${port}`;

  if (existsSync(outPath) && !flags.has("force")) {
    fail(`${outPath} already exists.`,
      "A token that works must not be clobbered by a re-run. Pass --out <other path>, or --force if you mean it.");
  }

  const state = randomBytes(16).toString("hex");
  const { verifier, challenge } = pkce();
  const url = `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    // offline is what produces a refresh token at all; consent forces a NEW one
    // even when this account has approved these scopes before.
    access_type: "offline",
    prompt: "consent",
    // --calendar asks for its two scopes only, not every scope this client
    // was ever granted, so the calendar token can do nothing else.
    include_granted_scopes: calendar ? "false" : "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  })}`;

  console.log("\n  Asking Google for:");
  for (const s of scopes) console.log(`    · ${s}`);
  if (reused) console.log(`\n  Using the Google sign-in client already stored in ${reused.from}.`);
  console.log(calendar
    ? `\n  Sign in as ${calendarOwnerEmail()} (the calendar the booking page reads), then press Allow.\n`
    : `\n  Sign in as the mailbox you want read, then press Allow.\n`);

  const waiting = waitForCode(port, state);
  if (flags.has("no-open")) {
    console.log(`  Open this in a browser:\n\n  ${url}\n`);
  } else {
    console.log("  Opening your browser…\n");
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  }

  const code = await waiting;
  const token = await exchange({ code, clientId, clientSecret, redirectUri, verifier });

  /* Exactly the shape src/gmail/config.mjs and src/company-brain/config.mjs
     parse: refresh_token, client_id, client_secret, token_uri. Anything else
     Google returned is dropped — an access token expires in an hour and has no
     business sitting in a file. */
  const tokenFile = {
    refresh_token: token.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    token_uri: TOKEN_URL,
    scope: token.scope || scopes.join(" "),
    minted_at: new Date().toISOString()
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(tokenFile, null, 2)}\n`, { mode: 0o600 });

  const granted = String(token.scope || "").split(/\s+/).filter(Boolean);
  const missing = scopes.filter((s) => !granted.includes(s));

  console.log(`  Written: ${outPath}  (owner-only, 0600)`);
  console.log(`  Fields:  ${Object.keys(tokenFile).join(", ")}`);
  console.log(`  Granted: ${granted.length ? granted.join("  ") : "(Google did not list them back)"}`);
  if (missing.length) {
    console.log(`\n  HEADS UP — these were asked for and not granted:`);
    for (const s of missing) console.log(`    · ${s}`);
    console.log("  Whatever needs them will still fail. Run again and approve everything.");
  }

  if (!calendar) {
    console.log(`\n  Prove it locally:\n    GOOGLE_GMAIL_OAUTH_TOKEN_PATH="${outPath}" node scripts/gmail-probe.mjs`);
  }

  if (calendar && flags.has("set-netlify")) {
    /* Never overwrite a stored key (CLAUDE.md §11). If Netlify already holds
       one, stop here and say so; the new token stays in the file above. */
    const existing = spawnSync("netlify", ["env:get", envKey, "--context", "production"], { encoding: "utf8" });
    if (existing.status === 0 && String(existing.stdout || "").trim()) {
      console.log(`\n  Netlify already holds ${envKey}. It was NOT overwritten.`);
      console.log(`  The new token is in ${outPath}. Nothing else was changed.\n`);
      return;
    }
  }

  if (flags.has("set-netlify")) {
    console.log("\n  Putting it on Netlify as a secret…");
    const r = spawnSync("netlify", [
      "env:set", envKey, JSON.stringify(tokenFile),
      "--context", "production", "--context", "deploy-preview", "--context", "branch-deploy",
      "--secret"
    ], { stdio: ["ignore", "inherit", "inherit"] });
    if (r.status !== 0) {
      console.log("  That did not work. The command to run by hand is below.");
    } else {
      console.log("  Set. It takes effect on the next deploy — batch it with any other change and ship once.");
      return;
    }
  }

  if (calendar) {
    console.log(`\n  Put it on Netlify (ONE command, then ship once):

    netlify env:set ${envKey} "$(cat ${outPath})" \\
      --context production --context deploy-preview --context branch-deploy --secret

  ${envKey} is a new variable read only by the team calendar link
  (src/messaging/providers/google-calendar.mjs). No other key is touched.\n`);
    return;
  }

  console.log(`\n  Put it on Netlify (ONE command, then ship once):

    netlify env:set GOOGLE_GMAIL_OAUTH_TOKEN_JSON "$(cat ${outPath})" \\
      --context production --context deploy-preview --context branch-deploy --secret

  GOOGLE_GMAIL_OAUTH_TOKEN_JSON wins over the Drive keys in
  src/gmail/config.mjs, so this adds a working Gmail credential without
  touching, rotating or removing the Drive one that is already there.\n`);
}

main().catch((err) => {
  console.error(`\n  Did not finish: ${err.message}\n`);
  process.exit(1);
});
