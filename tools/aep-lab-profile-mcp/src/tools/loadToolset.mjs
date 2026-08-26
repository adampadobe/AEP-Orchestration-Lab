import * as z from 'zod';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId, getRequestSessionId } from '../requestContext.mjs';
import { getSession } from '../sessionRegistry.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * Registers `lab_load_toolset`, which pulls another named toolset into the
 * CURRENT MCP session (via McpServer.registerTool + sendToolListChanged),
 * so a client doesn't have to reconnect to a different focused endpoint
 * mid-conversation to reach more tools.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 * @param {Record<string, (server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer) => void>} categories
 *   Map of category name -> a function that registers that category's tools
 *   on a server. Callers must pass domain-only registration functions (not
 *   a `registerFocused*` composite that also re-registers `lab_mcp_access_info`
 *   or other tools already present in this session, which would throw).
 */
export function registerLoadToolsetTool(mcpServer, categories) {
  const categoryNames = Object.keys(categories);

  mcpServer.registerTool('lab_load_toolset', {
    title: 'Load an additional toolset into this session',
    description:
      'Registers another named toolset into the CURRENT MCP session, so you do not need to reconnect to a different '
      + `focused endpoint mid-conversation. Available categories: ${categoryNames.join(', ')}. After a successful call, `
      + 'send tools/list again to see the newly available tools.',
    inputSchema: {
      category: z.enum(categoryNames).describe('Which toolset to load into this session.'),
    },
  }, async ({ category }) => {
    const sessionId = getRequestSessionId();
    const session = sessionId ? getSession(sessionId) : undefined;
    if (!session) {
      return toolError(
        'No active MCP session found for this request.',
        'lab_load_toolset only works over a live Streamable HTTP session (it has nothing to add tools to otherwise).',
      );
    }

    if (session.loadedCategories.has(category)) {
      return jsonResult({
        ok: true,
        category,
        alreadyLoaded: true,
        note: 'This toolset is already loaded in this session — no action taken.',
      });
    }

    categories[category](session.server);
    session.loadedCategories.add(category);
    session.server.sendToolListChanged();

    writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_load_toolset', identifier: category, result: 'ok' });

    return jsonResult({
      ok: true,
      category,
      message: `Loaded the '${category}' toolset into this session. Send tools/list again to see the new tools.`,
    });
  });
}
