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
        'Returns canonical lab profile industry keys and alias notes. For persona fields, tenant paths, and segment_hints use lab_get_industry_playbook. No lab HTTP call.',
      inputSchema: {},
    },
    async () => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_list_industries' });
      return jsonResult(listIndustriesCatalog());
    },
  );
}
