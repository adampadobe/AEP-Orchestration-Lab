/**
 * Registry of active Streamable HTTP MCP sessions.
 *
 * Lets a tool handler running inside a given session's requestContext (see
 * requestContext.mjs) look back into its own McpServer instance — e.g. to
 * register more tools mid-session (see tools/loadToolset.mjs) without the
 * client having to reconnect to a different focused endpoint.
 *
 * @typedef {object} SessionEntry
 * @property {import('@modelcontextprotocol/sdk/server/streamableHttp.js').StreamableHTTPServerTransport} transport
 * @property {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @property {string} endpoint
 * @property {Set<string>} loadedCategories - toolset categories already merged in via lab_load_toolset.
 */

/** @type {Map<string, SessionEntry>} */
const sessions = new Map();

/** @param {string} sessionId @param {SessionEntry} entry */
export function registerSession(sessionId, entry) {
  sessions.set(sessionId, entry);
}

/** @param {string} sessionId @returns {SessionEntry | undefined} */
export function getSession(sessionId) {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId) {
  sessions.delete(sessionId);
}
