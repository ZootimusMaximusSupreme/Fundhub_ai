// Run the product's own daily ClickFunnels stats pull once, now.
import sweep from "../../src/workflows/clickfunnels-analytics-sweeper.mjs";
const t = await sweep();
console.log(JSON.stringify(t, null, 2));
process.exit(0);
