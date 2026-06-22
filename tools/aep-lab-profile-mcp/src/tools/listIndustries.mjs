import { listIndustriesCatalog } from '../industries.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerListIndustriesTool(mcpServer) {
  mcpServer.registerTool(
    'lab_list_industries',
    {
      title: 'List profile industries',
      description:
        'Returns canonical lab profile industry keys (generic, travel, fsi, telecom, retail, media, sports) and alias notes (telecommunications→telecom, public→generic). No lab HTTP call.',
      inputSchema: {},
    },
    async () => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_list_industries' });
      return jsonResult(listIndustriesCatalog());
    },
  );
}
