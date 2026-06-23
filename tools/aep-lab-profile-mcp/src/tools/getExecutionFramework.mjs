import { getExecutionFramework } from '../framework/labFramework.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { jsonResult } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGetExecutionFrameworkTool(mcpServer) {
  mcpServer.registerTool(
    'lab_get_execution_framework',
    {
      title: 'Get lab execution framework',
      description:
        'Returns structured JSON for how the AEP Orchestration Lab executes profiles: workflows (onboard → generate → full-snapshot update → events), ' +
        'dataflow pattern (schema→dataset→HTTP flow→Firestore connection), email/mobile/testProfile conventions, segment_hint catalog, ' +
        'when to use generate vs update vs edge event. Call this FIRST in Coworker sessions — no manual retraining needed. ' +
        'Also available as MCP resources lab://framework/overview and lab://framework/overview.json.',
      inputSchema: {},
    },
    async () => {
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_get_execution_framework' });
      return jsonResult(getExecutionFramework());
    },
  );
}
