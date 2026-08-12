import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpWorkflow, listMcpContexts, MCP_WORKFLOWS } from '../framework/mcpContextGuide.mjs';

function jsonContents(uri, data) {
  return { contents: [{ uri: typeof uri === 'string' ? uri : uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}

export function registerMcpGuideResources(mcpServer) {
  mcpServer.registerResource('lab-mcp-contexts', 'lab://mcp/contexts', {
    title: 'AEP Lab MCP capability directory',
    description: 'Canonical context names, URLs, capabilities, access methods, and safety posture.',
    mimeType: 'application/json',
  }, async (uri) => jsonContents(uri, { contexts: listMcpContexts() }));

  mcpServer.registerResource('lab-mcp-workflow', new ResourceTemplate('lab://mcp/workflows/{workflow}', {}), {
    title: 'AEP Lab cross-context workflow',
    description: `Read-only workflow plan. Available workflows: ${Object.keys(MCP_WORKFLOWS).join(', ')}.`,
    mimeType: 'application/json',
  }, async (uri, { workflow }) => jsonContents(uri, getMcpWorkflow(workflow) || { ok: false, error: 'Unknown workflow', available: Object.keys(MCP_WORKFLOWS) }));
}
