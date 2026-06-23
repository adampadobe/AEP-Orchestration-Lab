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
import { registerMcpAccessInfoTool } from './mcpAccessInfo.mjs';
import { registerListEventTargetsTool } from './listEventTargets.mjs';
import { registerSendProfileEventTool } from './sendProfileEvent.mjs';
import { registerSendEdgeEventTool } from './sendEdgeEvent.mjs';
import { registerPreflightProfileEventTool } from './preflightProfileEvent.mjs';
import { registerGetExecutionFrameworkTool } from './getExecutionFramework.mjs';
import { registerGetIndustryPlaybookTool } from './getIndustryPlaybook.mjs';
import { registerPreflightProfileGenerateTool } from './preflightProfileGenerate.mjs';
import { registerGenerationPrefsTools } from './generationPrefs.mjs';
import { registerListRecentProfilesTool } from './listRecentProfiles.mjs';
import { registerBrandScrapeTools } from './brandScrape.mjs';
import { registerGenerateProfileFromBrandScrapeTools } from './generateProfileFromBrandScrape.mjs';
import { registerPrepareDemoFromBrandScrapeTool } from './prepareDemoFromBrandScrape.mjs';
import { registerCreateJourneyFromBrandScrapeTool } from './createJourneyFromBrandScrape.mjs';
import { registerSendRetailJourneyEventsTool } from './sendRetailJourneyEvents.mjs';
import { registerSendProfileEventsBatchTool } from './sendProfileEventsBatch.mjs';
import { registerMcpFirstRunSetupTool } from './mcpFirstRunSetup.mjs';
import { registerSetupEventInfraTool } from './setupEventInfra.mjs';
import { registerEventConfigTools } from './eventConfig.mjs';

/**
 * Register all Profile MCP tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProfileTools(mcpServer) {
  registerGetExecutionFrameworkTool(mcpServer);
  registerGetIndustryPlaybookTool(mcpServer);
  registerPreflightProfileGenerateTool(mcpServer);
  registerGenerationPrefsTools(mcpServer);
  registerListRecentProfilesTool(mcpServer);
  registerListIndustriesTool(mcpServer);
  registerListSandboxesTool(mcpServer);
  registerMcpAccessInfoTool(mcpServer);
  registerMcpFirstRunSetupTool(mcpServer);
  registerProfileInfraStatusTool(mcpServer);
  registerGenerateProfileTool(mcpServer);
  registerLookupProfileTool(mcpServer);
  registerGetProfileTool(mcpServer);
  registerUpdateProfileTool(mcpServer);
  registerProfileActivityTool(mcpServer);
  registerListEventTargetsTool(mcpServer);
  registerSetupEventInfraTool(mcpServer);
  registerEventConfigTools(mcpServer);
  registerSendProfileEventTool(mcpServer);
  registerSendEdgeEventTool(mcpServer);
  registerPreflightProfileEventTool(mcpServer);
  registerSendRetailJourneyEventsTool(mcpServer);
  registerSendProfileEventsBatchTool(mcpServer);
  registerGenerateProfilesBatchTool(mcpServer);
  registerBatchJobStatusTool(mcpServer);
  registerProvisionProfileInfraStepTool(mcpServer);
  registerEnableProfileTool(mcpServer);
  registerSandboxProfileConfigTool(mcpServer);
  registerOnboardSandboxTool(mcpServer);
  registerBrandScrapeTools(mcpServer);
  registerGenerateProfileFromBrandScrapeTools(mcpServer);
  registerPrepareDemoFromBrandScrapeTool(mcpServer);
  registerCreateJourneyFromBrandScrapeTool(mcpServer);
}
