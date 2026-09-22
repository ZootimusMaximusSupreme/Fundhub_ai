#!/usr/bin/env node
/**
 * Point apply.fundhub.ai at Netlify (Cloudflare DNS).
 * Auth: CLOUDFLARE_API_TOKEN in .env (never printed).
 * Optional: CLOUDFLARE_ZONE_ID (else lookup fundhub.ai zone).
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

const TOKEN = String(process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
const ZONE_ID = String(process.env.CLOUDFLARE_ZONE_ID ?? "").trim();
const TARGET = "transcendent-wisp-888771.netlify.app";
const RECORD_NAME = "apply";

async function cf(path, opts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...opts,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg =
      body.errors?.map((e) => e.message).join("; ") ||
      body.message ||
      res.statusText;
    throw new Error(`Cloudflare ${res.status}: ${msg}`);
  }
  return body.result;
}

async function resolveZoneId() {
  if (ZONE_ID) return ZONE_ID;
  const zones = await cf("/zones?name=fundhub.ai&status=active");
  const z = zones?.[0];
  if (!z?.id) throw new Error("zone fundhub.ai not found for this token");
  return z.id;
}

async function main() {
  if (!TOKEN) {
    console.error(
      JSON.stringify({
        error: "CLOUDFLARE_API_TOKEN missing",
        need: "Add CLOUDFLARE_API_TOKEN to .env (DNS Edit on zone fundhub.ai)",
      }),
    );
    process.exit(2);
  }

  const zoneId = await resolveZoneId();
  const existing = await cf(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${RECORD_NAME}.fundhub.ai`,
  );
  const payload = {
    type: "CNAME",
    name: RECORD_NAME,
    content: TARGET,
    proxied: false,
    ttl: 1,
  };

  let result;
  if (existing?.length) {
    const id = existing[0].id;
    result = await cf(`/zones/${zoneId}/dns_records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    result = await cf(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  console.log(
    JSON.stringify({
      ok: true,
      zone_id: zoneId,
      record: { id: result.id, name: result.name, content: result.content, proxied: result.proxied },
      prove: "https://apply.fundhub.ai/roadmap/",
    }),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
