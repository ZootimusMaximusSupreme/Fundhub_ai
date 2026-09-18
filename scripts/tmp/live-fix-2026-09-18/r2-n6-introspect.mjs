// Hole N6 — read only. GET https://fundhub.ai/api/inngest — Inngest's own
// public introspection of the served app (function count, mode, whether keys
// are present). A GET changes nothing and registers nothing. Also prints the
// count this branch's code serves, for comparison.
const r = await fetch("https://fundhub.ai/api/inngest", { signal: AbortSignal.timeout(20000) });
const text = await r.text();
let body;
try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
console.log("live status", r.status);
console.log("live body", JSON.stringify(body));
const { functions } = await import("../../../src/workflows/index.mjs");
console.log("this branch serves", functions.length, "functions; drain present:",
  functions.some((f) => f.id() === "commas-inbox-drain"));
process.exit(0);
