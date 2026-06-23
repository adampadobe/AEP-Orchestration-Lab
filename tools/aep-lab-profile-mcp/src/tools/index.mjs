import { registerListIndustriesTool } from './listIndustries.mjs';
import { registerListSandboxesTool } from './listSandboxes.mjs';
import { registerProfileInfraStatusTool } from './profileInfraStatus.mjs';
import { registerGenerateProfileTool } from './generateProfile.mjs';
import { registerLookupProfileTool } from './lookupProfile.mjs';
import { registerGetProfileTool } from './getProfile.mjs';
import { registerUpdateProfileTool } from './updateProfile.mjs';
import { registerProfileActivityTool } from './profileActivity.mjs';
import { registerGenerateProfilesBatchTool } from './generateProfilesBatch.mjs';
import { registerBatchJobStatusTool } from './batchJobStatus.mjs';
import { registerProvisionProfileInfraStepTool } from './provisionProfileInfraStep.mjs';
import { registerEnableProfileTool } from './enableProfile.mjs';
import { registerSandboxProfileConfigTool } from './sandboxProfileConfig.mjs';
import { registerOnboardSandboxTool } from './onboardSandbox.mjs';

/**
 * Register all Profile MCP tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProfileTools(mcpServer) {
  registerListIndustriesTool(mcpServer);
  registerListSandboxesTool(mcpServer);
  registerProfileInfraStatusTool(mcpServer);
  registerGenerateProfileTool(mcpServer);
  registerLookupProfileTool(mcpServer);
  registerGetProfileTool(mcpServer);
  registerUpdateProfileTool(mcpServer);
  registerProfileActivityTool(mcpServer);
  registerGenerateProfilesBatchTool(mcpServer);
  registerBatchJobStatusTool(mcpServer);
  registerProvisionProfileInfraStepTool(mcpServer);
  registerEnableProfileTool(mcpServer);
  registerSandboxProfileConfigTool(mcpServer);
  registerOnboardSandboxTool(mcpServer);
}
