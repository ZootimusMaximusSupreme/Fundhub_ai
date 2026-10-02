// Netlify Blobs in the api function: connectLambda when the platform passes a
// Lambda-compat event on context; otherwise rely on NETLIFY_SITE_ID +
// NETLIFY_BLOBS_TOKEN (see netlifyBlobsProvider in store.mjs).

/**
 * @param {unknown} context — second arg to netlify/functions/api.mjs handler
 */
export async function wireNetlifyBlobsRuntime(context) {
  if (!context || typeof context !== "object") return { wired: false, reason: "no_context" };

  const lambdaEvent = /** @type {{ blobs?: unknown; headers?: Record<string, string> }} */ (
    /** @type {Record<string, unknown>} */ (context).awsLambdaEvent ??
      /** @type {Record<string, unknown>} */ (context).event ??
      (/** @type {Record<string, unknown>} */ (context).blobs ? context : null)
  );
  if (!lambdaEvent?.blobs) {
    return { wired: false, reason: "no_lambda_blobs_on_context" };
  }

  const { connectLambda } = await import("@netlify/blobs");
  connectLambda(lambdaEvent);
  return { wired: true, reason: "connectLambda" };
}
