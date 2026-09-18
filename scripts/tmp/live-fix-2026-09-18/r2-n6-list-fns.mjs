// Hole N6 — local only. Lists every Inngest function this app serves and its
// cron, exactly as the app would describe itself to Inngest when it syncs.
// Touches no database and no network.
const { functions } = await import("../../../src/workflows/index.mjs");
console.log("function count", functions.length);
for (const f of functions) {
  const cfg = f.getConfig({ baseUrl: new URL("https://example.invalid/api/inngest"), appPrefix: "fundhub-platform" });
  for (const c of cfg) {
    const crons = (c.triggers || []).filter((t) => t.cron).map((t) => t.cron);
    if (crons.length) console.log(c.id, crons.join(" | "));
  }
}
