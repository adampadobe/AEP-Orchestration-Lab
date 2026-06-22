/**
 * Shared MCP tool response helpers.
 */

export function jsonResult(obj) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
  };
}

export function toolError(message, detail) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, detail }, null, 2) }],
    isError: true,
  };
}

/**
 * Wrap lab API client result for MCP tool output.
 * @param {Awaited<ReturnType<import('../labApiClient.mjs').labApiRequest>>} apiResult
 * @param {object} [extra]
 */
export function fromLabApi(apiResult, extra = {}) {
  if (!apiResult.ok) {
    return toolError(apiResult.error || 'Lab API request failed', {
      status: apiResult.status,
      url: apiResult.url,
      response: apiResult.data,
      ...extra,
    });
  }
  return jsonResult({ ok: true, ...extra, lab: apiResult.data });
}
