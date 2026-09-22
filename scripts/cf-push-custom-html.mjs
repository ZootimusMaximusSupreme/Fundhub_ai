#!/usr/bin/env node
/**
 * Push FundHub funnel HTML + tracking to ClickFunnels 2.0 via Custom HTML Pages API.
 * GA 2026-09-18: POST /workspaces/{id}/pages/custom_html, PUT /pages/{id} (custom_html, head_code).
 *
 * Auth (names only in logs): CLICKFUNNELS_API_KEY + CLICKFUNNELS_SUBDOMAIN,
 * or analytics_connections row (platform=clickfunnels) via DATABASE_URL.
 *
 * Never prints secrets. Never commits .env.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

import { cfFetch } from "../src/analytics/clickfunnels.mjs";
import { decryptToken } from "../src/adplatforms/tokens.mjs";
import {
  metaPixelId,
  metaPixelHeadHtml,
  directRoasHeadHtml,
  wrapCustomHtmlDocument,
  DO_NOT_FULL_REPLACE_PATHS,
  PUSH_MANIFEST,
  trackingFooterScripts,
} from "../clickfunnels-fragments/tracking-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SUBDOMAIN = "chrisstanbridgestea3f77f";

function loadDotEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotEnv();

function baseUrl(subdomain) {
  return `https://${subdomain}.myclickfunnels.com/api/v2`;
}

/** GET/PUT/POST to ClickFunnels (FundHub push — includes write methods). */
async function cfApi({ url, apiKey, ctx = {}, method = "GET", body }) {
  if (method === "GET") return cfFetch({ url, apiKey, ctx, method });
  const doFetch = ctx.fetch || globalThis.fetch;
  const res = await doFetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "user-agent": "FundHub-CF-Push/1.0 (+https://fundhub.ai)",
    },
    body,
  });
  const text = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const message =
      parsed && typeof parsed.error === "string" ? parsed.error : String(text).slice(0, 500);
    const e = new Error(`ClickFunnels ${res.status}: ${message}`);
    e.status = res.status;
    e.platformMessage = message;
    throw e;
  }
  return {
    body: parsed,
    nextCursor:
      typeof res.headers?.get === "function" ? res.headers.get("pagination-next") : null,
  };
}

async function credsFromEnv() {
  const apiKey = String(process.env.CLICKFUNNELS_API_KEY ?? "").trim();
  const subdomain = String(process.env.CLICKFUNNELS_SUBDOMAIN ?? DEFAULT_SUBDOMAIN)
    .trim()
    .toLowerCase();
  if (!apiKey) return null;
  return { api_key: apiKey, subdomain, source: "CLICKFUNNELS_API_KEY" };
}

async function credsFromDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url });
  try {
    const r = await pool.query(
      `SELECT org_id, external_account_id, encrypted_credentials
       FROM analytics_connections WHERE platform = 'clickfunnels' AND connection_state = 'active'
       LIMIT 1`,
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    const json = decryptToken(row.encrypted_credentials, { partnerId: row.org_id });
    const parsed = JSON.parse(json);
    return {
      api_key: parsed.api_key,
      subdomain: parsed.subdomain || row.external_account_id,
      source: "analytics_connections",
    };
  } finally {
    await pool.end();
  }
}

async function resolveCreds() {
  const fromEnv = await credsFromEnv();
  if (fromEnv) return fromEnv;
  const fromDb = await credsFromDb();
  if (fromDb) return fromDb;
  return null;
}

async function resolveWorkspaceId(creds, ctx = {}) {
  if (process.env.CLICKFUNNELS_WORKSPACE_ID) {
    return String(process.env.CLICKFUNNELS_WORKSPACE_ID).trim();
  }
  const teams = await walkAll(`${baseUrl(creds.subdomain)}/teams`, creds.api_key, ctx);
  for (const team of teams) {
    const workspaces = await walkAll(
      `${baseUrl(creds.subdomain)}/teams/${team.id}/workspaces`,
      creds.api_key,
      ctx,
    );
    const match = workspaces.find((w) => w.subdomain === creds.subdomain);
    if (match) return match.id;
    if (workspaces.length === 1) return workspaces[0].id;
  }
  throw new Error(`workspace not found for subdomain ${creds.subdomain}`);
}

async function walkAll(url, apiKey, ctx) {
  const out = [];
  let after = null;
  for (let page = 0; page < 25; page++) {
    const u = new URL(url);
    if (after) u.searchParams.set("after", after);
    const { body, nextCursor } = await cfApi({ url: u.toString(), apiKey, ctx });
    if (Array.isArray(body)) out.push(...body);
    if (!nextCursor) break;
    after = nextCursor;
  }
  return out;
}

function readFragment(relPath) {
  const abs = join(ROOT, relPath);
  return readFileSync(abs, "utf8");
}

function trackingHeadScripts({ skipMeta, skipDirectRoas, env = process.env }) {
  const parts = [];
  if (!skipMeta) parts.push(metaPixelHeadHtml(metaPixelId(env).id));
  if (!skipDirectRoas) parts.push(directRoasHeadHtml(env));
  return parts.join("\n");
}

function footerSrcs(footBits) {
  return [...String(footBits).matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
}

function injectIntoCustomHtmlDocument(html, { headBits = "", footBits = "" } = {}) {
  let out = html;
  if (headBits && !out.includes(headBits.slice(0, 40))) {
    if (out.includes("</head>")) out = out.replace("</head>", `${headBits}\n</head>`);
    else out = `${headBits}\n${out}`;
  }
  if (footBits && !out.includes(footBits.slice(0, 40))) {
    if (out.includes("</body>")) out = out.replace("</body>", `${footBits}\n</body>`);
    else out = `${out}\n${footBits}`;
  }
  return out;
}

async function getCustomHtml(creds, pageId, ctx) {
  const { body } = await cfApi({
    url: `${baseUrl(creds.subdomain)}/pages/${pageId}/custom_html`,
    apiKey: creds.api_key,
    ctx,
  });
  return body.custom_html ?? "";
}

function injectBlock(html, block) {
  if (!block || html.includes(block.slice(0, 40))) return html;
  return `${html}\n${block}`;
}

async function listPages(creds, workspaceId, ctx) {
  const funnels = await walkAll(
    `${baseUrl(creds.subdomain)}/workspaces/${workspaceId}/funnels`,
    creds.api_key,
    ctx,
  );
  const pages = [];
  for (const f of funnels) {
    const url = new URL(`${baseUrl(creds.subdomain)}/workspaces/${workspaceId}/pages`);
    url.searchParams.set("filter[funnel_ids]", String(f.id));
    const rows = await walkAll(url.toString(), creds.api_key, ctx);
    for (const p of rows) {
      pages.push({
        id: p.id,
        name: p.name,
        current_path: p.current_path,
        funnel_id: f.id,
        funnel_name: f.name,
      });
    }
  }
  return pages;
}

/** The public page as a visitor gets it (no auth). Empty string when it cannot be read. */
async function fetchLiveHtml(url, ctx = {}) {
  if (!url) return "";
  const doFetch = ctx.fetch || globalThis.fetch;
  try {
    const res = await doFetch(url, {
      headers: { "user-agent": "Fundhub-CF-Push/1.0 (+https://fundhub.ai)" },
    });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

async function getPage(creds, pageId, ctx) {
  const { body } = await cfApi({
    url: `${baseUrl(creds.subdomain)}/pages/${pageId}`,
    apiKey: creds.api_key,
    ctx,
  });
  return body;
}

async function isCustomHtmlPage(creds, pageId, ctx) {
  try {
    await cfApi({
      url: `${baseUrl(creds.subdomain)}/pages/${pageId}/custom_html`,
      apiKey: creds.api_key,
      ctx,
    });
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

async function appendHeadFooter(creds, pageId, headSnippet, footerSnippet, ctx, dryRun) {
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      pageId,
      mode: "head_footer_append",
      would_append_footer_srcs: footerSrcs(footerSnippet),
      would_append_head: Boolean(headSnippet),
    };
  }
  if (!headSnippet && !footerSnippet) {
    return { ok: true, pageId, mode: "head_footer_append", skipped: true, reason: "tracking_already_present" };
  }
  const page = await getPage(creds, pageId, ctx);
  const payload = { page: {} };
  if (headSnippet) {
    payload.page.head_code = headSnippet;
    payload.page.head_code_mode = "append";
  }
  if (footerSnippet) {
    payload.page.footer_code = footerSnippet;
    payload.page.footer_code_mode = "append";
  }
  const { body } = await cfApi({
    url: `${baseUrl(creds.subdomain)}/pages/${pageId}`,
    apiKey: creds.api_key,
    ctx,
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return { ok: true, pageId, body };
}

async function putCustomHtml(creds, pageId, html, ctx, dryRun) {
  if (dryRun) {
    return { ok: true, dryRun: true, pageId, mode: "custom_html_put" };
  }
  const { body } = await cfApi({
    url: `${baseUrl(creds.subdomain)}/pages/${pageId}`,
    apiKey: creds.api_key,
    ctx,
    method: "PUT",
    body: JSON.stringify({ page: { custom_html: html } }),
  });
  return { ok: true, pageId, body };
}

async function createCustomHtmlPage(creds, workspaceId, opts, ctx, dryRun) {
  if (dryRun) {
    return { ok: true, dryRun: true, mode: "custom_html_create", name: opts.name };
  }
  const { body } = await cfApi({
    url: `${baseUrl(creds.subdomain)}/workspaces/${workspaceId}/pages/custom_html`,
    apiKey: creds.api_key,
    ctx,
    method: "POST",
    body: JSON.stringify({ page: opts }),
  });
  return { ok: true, body };
}

async function snapshotCustomHtml(creds, pageId, ctx, outDir) {
  try {
    const { body } = await cfApi({
      url: `${baseUrl(creds.subdomain)}/pages/${pageId}/custom_html`,
      apiKey: creds.api_key,
      ctx,
    });
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `page-${pageId}-custom-html.html`);
    writeFileSync(file, body.custom_html ?? "", "utf8");
    return file;
  } catch {
    return null;
  }
}

async function cmdList(creds) {
  const ctx = {};
  const workspaceId = await resolveWorkspaceId(creds, ctx);
  console.log(
    JSON.stringify(
      {
        auth: creds.source,
        subdomain: creds.subdomain,
        workspace_id: workspaceId,
        pages: await listPages(creds, workspaceId, ctx),
      },
      null,
      2,
    ),
  );
}

async function cmdPush(creds, { dryRun = false, only = null } = {}) {
  const ctx = {};
  const workspaceId = await resolveWorkspaceId(creds, ctx);
  const pixel = metaPixelId(process.env);
  const pages = await listPages(creds, workspaceId, ctx);
  const byPath = new Map(
    pages.filter((p) => p.current_path).map((p) => [p.current_path, p]),
  );
  const byId = new Map(pages.map((p) => [String(p.id), p]));

  const results = [];
  const snapDir = join(ROOT, "docs/workflows/cf-push-snapshots");

  for (const row of PUSH_MANIFEST) {
    if (only && row.key !== only) continue;
    if (!row.path && !row.pageId) {
      results.push({ key: row.key, skipped: true, reason: "no_path_map_yet" });
      continue;
    }
    const page =
      (row.pageId && byId.get(String(row.pageId))) || (row.path && byPath.get(row.path));
    if (!page) {
      results.push({ key: row.key, path: row.path, pageId: row.pageId, error: "page_not_found" });
      continue;
    }

    if (row.strategy === "custom_html_inject_only") {
      await snapshotCustomHtml(creds, page.id, ctx, snapDir);
      const existing = await getCustomHtml(creds, page.id, ctx);
      const head = trackingHeadScripts({
        skipMeta: existing.includes("fbq('init'"),
        skipDirectRoas: existing.includes("directroas.com"),
        env: process.env,
      });
      const foot = trackingFooterScripts({
        includeVslBeacon: !!row.vslBeacon,
        skipAttribution: existing.includes("fh-attribution.js"),
        extraSrcs: row.extraFooterScripts ?? [],
        existing,
      });
      const html = injectIntoCustomHtmlDocument(existing, { headBits: head, footBits: foot });
      const r = await putCustomHtml(creds, page.id, html, ctx, dryRun);
      results.push({
        key: row.key,
        page_id: page.id,
        path: row.path,
        liveUrl: row.liveUrl,
        mode: "custom_html_inject_only",
        pixel_env: pixel.envName,
        ...r,
      });
      continue;
    }

    if (DO_NOT_FULL_REPLACE_PATHS.has(row.path) || row.strategy === "head_footer_append_only") {
      const livePage = await getPage(creds, page.id, ctx);
      const liveHead = String(livePage.head_code ?? "");
      const liveFoot = String(livePage.footer_code ?? "");
      const liveHasAttr =
        liveHead.includes("fh-attribution.js") || liveFoot.includes("fh-attribution.js");
      const liveHasMeta = liveHead.includes("fbq('init'") || liveFoot.includes("fbq('init'");
      const head = trackingHeadScripts({
        skipMeta: liveHasMeta,
        skipDirectRoas: liveHead.includes("directroas.com") || liveFoot.includes("directroas.com"),
        env: process.env,
      });
      const foot = trackingFooterScripts({
        includeVslBeacon: !!row.vslBeacon,
        skipAttribution: liveHasAttr,
        extraSrcs: row.extraFooterScripts ?? [],
        existing: `${liveHead}\n${liveFoot}`,
      });
      await snapshotCustomHtml(creds, page.id, ctx, snapDir);
      const r = await appendHeadFooter(creds, page.id, head, foot, ctx, dryRun);
      results.push({
        key: row.key,
        page_id: page.id,
        path: row.path,
        liveUrl: row.liveUrl,
        mode: "inject_head_footer_only",
        calendar_safe: true,
        pixel_env: pixel.envName,
        ...r,
      });
      continue;
    }

    const bodyHtml = row.fragment ? readFragment(row.fragment) : "";
    // The CF SDK shows a "NO_PAGE_META ERROR" badge on the live page without this token.
    const sdkToken = (await getPage(creds, page.id, ctx))?.sdk?.token;
    const html = wrapCustomHtmlDocument({
      bodyHtml,
      pageToken: sdkToken,
      pixelId: pixel.id,
      includeVslBeacon: !!row.vslBeacon,
      env: process.env,
    });

    await snapshotCustomHtml(creds, page.id, ctx, snapDir);
    const custom = await isCustomHtmlPage(creds, page.id, ctx);
    if (custom) {
      const r = await putCustomHtml(creds, page.id, html, ctx, dryRun);
      results.push({
        key: row.key,
        page_id: page.id,
        path: row.path,
        liveUrl: row.liveUrl,
        mode: "custom_html_put",
        pixel_env: pixel.envName,
        ...r,
      });
    } else {
      const livePage = await getPage(creds, page.id, ctx);
      const liveHead = String(livePage.head_code ?? "");
      const liveFoot = String(livePage.footer_code ?? "");
      // GET /pages/{id} does not return head_code or footer_code, so the API alone
      // cannot see what the footer already loads. That blind spot is how
      // vsl-watch-beacon.js ended up on /watch three times. Read the public page too.
      const liveHtml = await fetchLiveHtml(row.liveUrl, ctx);
      const existing = `${liveHead}\n${liveFoot}\n${liveHtml}`;
      const head = "";
      const foot = trackingFooterScripts({
        includeVslBeacon: !!row.vslBeacon,
        skipAttribution: existing.includes("fh-attribution.js"),
        extraSrcs: row.extraFooterScripts ?? [],
        existing,
      });
      const r = await appendHeadFooter(creds, page.id, head, foot, ctx, dryRun);
      results.push({
        key: row.key,
        page_id: page.id,
        path: row.path,
        liveUrl: row.liveUrl,
        note: "Not a custom HTML page — footer scripts appended (srcs already on the page skipped); fragment body unchanged",
        pixel_env: pixel.envName,
        live_html_read: liveHtml.length > 0,
        ...r,
        mode: "builder_page_tracking_inject_only",
      });
    }
  }

  console.log(JSON.stringify({ auth: creds.source, workspace_id: workspaceId, results }, null, 2));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const dryRun = rest.includes("--dry-run");
  const onlyArg = rest.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length) : null;

  if (!cmd || !["list", "push"].includes(cmd)) {
    console.error("Usage: node scripts/cf-push-custom-html.mjs list|push [--dry-run] [--only=key]");
    process.exit(1);
  }

  const creds = await resolveCreds();
  if (!creds?.api_key) {
    console.error(
      JSON.stringify({
        error: "auth_missing",
        need_env: "CLICKFUNNELS_API_KEY",
        also: ["CLICKFUNNELS_SUBDOMAIN", "analytics_connections (clickfunnels)"],
      }),
    );
    process.exit(2);
  }

  if (cmd === "list") await cmdList(creds);
  else await cmdPush(creds, { dryRun, only });
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, status: err.status ?? null }));
  process.exit(1);
});
