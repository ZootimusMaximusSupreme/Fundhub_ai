// Hole 5: wait with no traffic from this lane, then open the #9 panel once.
const DELAY = Number(process.env.DELAY_MS || 12 * 60 * 1000);
console.log("waiting", DELAY, "ms before the look", new Date().toISOString());
await new Promise((r) => setTimeout(r, DELAY));
console.log("starting look", new Date().toISOString());
await import("./hole-5-look.mjs");
