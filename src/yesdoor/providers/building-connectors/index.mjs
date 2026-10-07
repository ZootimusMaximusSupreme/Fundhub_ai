// building-connectors/index.mjs — pick the connector for a building.
// yd_buildings.connection is one of manual | csv | feed | entrata_api.
//
// Every connector has the same three methods (spec §7):
//   listListings, pushGuestCard, getLeaseStatus
// and exports PROVIDER and SANDBOX: true. None calls the network.

import * as manual from "./manual.mjs";
import * as csv from "./csv.mjs";
import * as mitsFeed from "./mits-feed.mjs";
import * as entrata from "./entrata-sandbox.mjs";

export const CONNECTORS = Object.freeze({
  manual,
  csv,
  feed: mitsFeed,
  entrata_api: entrata
});

export const CONNECTION_KINDS = Object.freeze(Object.keys(CONNECTORS));

export function getConnector(kind) {
  if (!Object.hasOwn(CONNECTORS, kind)) {
    throw new Error(`unknown building connection "${kind}" (expected ${CONNECTION_KINDS.join(", ")})`);
  }
  return CONNECTORS[kind];
}
