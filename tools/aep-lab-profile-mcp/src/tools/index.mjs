import { registerListIndustriesTool } from './listIndustries.mjs';
import { registerListSandboxesTool } from './listSandboxes.mjs';
import { registerProfileInfraStatusTool } from './profileInfraStatus.mjs';
import { registerGenerateProfileTool } from './generateProfile.mjs';
import { registerLookupProfileTool } from './lookupProfile.mjs';

/**
 * Register all Phase 1 MVP tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProfileTools(mcpServer) {
  registerListIndustriesTool(mcpServer);
  registerListSandboxesTool(mcpServer);
  registerProfileInfraStatusTool(mcpServer);
  registerGenerateProfileTool(mcpServer);
  registerLookupProfileTool(mcpServer);
}
