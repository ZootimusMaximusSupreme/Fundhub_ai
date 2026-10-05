// Image build step: download the Chrome that Remotion drives (the programmatic
// form of `remotion browser ensure`), so the first render does not.

import { ensureBrowser } from "@remotion/renderer";

await ensureBrowser();
console.log("remotion browser ready");
