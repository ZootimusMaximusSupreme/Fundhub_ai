#!/usr/bin/env node
// Paginate the public Notion collection behind offers.calbartoncashback.com/Database-Download.
// The prior pull stopped at Notion's 500-row page; sizeHint said 921.
// Writes credentials/carl-barton-2026-09-18/carl-barton-database-full.{json,csv}

import { writeFileSync } from "node:fs";

const OUT = "credentials/carl-barton-2026-09-18";
const PAGE_ID = "143216ea-223d-80c9-ad0f-f70889a95ec2";
const COLLECTION_ID = "143216ea-223d-8142-a27f-000b22f45c0b";
const VIEW_ID = "143216ea-223d-81d0-8b26-000c0082aaf9";
const SPACE_ID = "c71e60e1-13c6-419b-b08a-258ae3e422b2";
const PAGE_SIZE = 200;

async function queryCollection(limit) {
  const res = await fetch("https://www.notion.so/api/v3/queryCollection?src=initial_load", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      origin: "https://www.notion.so",
      referer: `https://www.notion.so/${PAGE_ID.replace(/-/g, "")}`,
      "notion-client-version": "23.13.0.4010"
    },
    body: JSON.stringify({
      source: { type: "collection", id: COLLECTION_ID, spaceId: SPACE_ID },
      collectionView: { id: VIEW_ID, spaceId: SPACE_ID },
      loader: {
        type: "reducer",
        reducers: {
          collection_group_results: { type: "results", limit }
        },
        sort: [],
        searchQuery: "",
        userTimeZone: "America/Los_Angeles"
      }
    })
  });
  if (!res.ok) throw new Error(`queryCollection ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Notion's public reducer honours a raised limit in one shot; walk it up until
// the returned block count stops growing.
let json = null;
let limit = PAGE_SIZE;
let blockIds = [];
for (let i = 0; i < 12; i += 1) {
  json = await queryCollection(limit);
  blockIds = json.result?.reducerResults?.collection_group_results?.blockIds || [];
  const hint = json.result?.sizeHint ?? 0;
  const status = json.result?.rowCountStatus;
  console.log(`limit=${limit} got=${blockIds.length} sizeHint=${hint} status=${status}`);
  if (status === "exact" || blockIds.length < limit) break;
  limit = Math.max(limit * 2, hint + 200);
}

const recordMap = json.recordMap || {};
const collection = recordMap.collection?.[COLLECTION_ID];
const schema = (collection?.value?.value || collection?.value)?.schema || {};

function plain(prop) {
  if (!Array.isArray(prop)) return "";
  return prop.map((seg) => (Array.isArray(seg) ? seg[0] : "")).join("");
}

const rows = [];
for (const id of blockIds) {
  const raw = recordMap.block?.[id];
  const block = raw?.value?.value || raw?.value;
  if (!block?.properties) continue;
  const row = { _notion_id: id };
  for (const [key, def] of Object.entries(schema)) {
    row[def.name] = plain(block.properties[key]);
  }
  rows.push(row);
}

const headers = ["_notion_id", ...Object.values(schema).map((s) => s.name)];
const csv = [
  headers.join(","),
  ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
].join("\n");

writeFileSync(`${OUT}/carl-barton-database-full.json`, JSON.stringify(rows, null, 2));
writeFileSync(`${OUT}/carl-barton-database-full.csv`, `${csv}\n`);
console.log(JSON.stringify({
  ok: true,
  pageId: PAGE_ID,
  rows: rows.length,
  uniqueBanks: new Set(rows.map((r) => r["Bank Name"]).filter(Boolean)).size,
  columns: headers
}, null, 2));
