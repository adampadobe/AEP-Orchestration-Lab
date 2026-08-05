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
import { registerConfirmProfileGenerationTool, registerGenerationPrefsTools } from './generationPrefs.mjs';
import { registerListRecentProfilesTool } from './listRecentProfiles.mjs';
import { registerBrandScrapeTools } from './brandScrape.mjs';
import { registerGenerateProfileFromBrandScrapeTools } from './generateProfileFromBrandScrape.mjs';
import { registerPrepareDemoFromBrandScrapeTool } from './prepareDemoFromBrandScrape.mjs';
import { registerCreateJourneyFromBrandScrapeTool } from './createJourneyFromBrandScrape.mjs';
import { registerSendRetailJourneyEventsTool } from './sendRetailJourneyEvents.mjs';
import { registerSendProfileEventsBatchTool } from './sendProfileEventsBatch.mjs';
import { registerMcpFirstRunSetupTool } from './mcpFirstRunSetup.mjs';
import { registerSetupEventInfraTool } from './setupEventInfra.mjs';
import { registerEnableEventProfileTool } from './enableEventProfile.mjs';
import { registerEventConfigTools } from './eventConfig.mjs';
import { registerDecisioningTools } from './decisioningTools.mjs';
import { registerSnowflakeTools } from './snowflakeTools.mjs';
import { registerLiveActivityTools } from './liveActivityTools.mjs';
import { registerDemoConfigTools } from './demoConfig.mjs';
import { registerAudienceTools } from './audienceTools.mjs';

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
  registerDemoConfigTools(mcpServer);
  registerProfileInfraStatusTool(mcpServer);
  registerGenerateProfileTool(mcpServer);
  registerLookupProfileTool(mcpServer);
  registerGetProfileTool(mcpServer);
  registerUpdateProfileTool(mcpServer);
  registerProfileActivityTool(mcpServer);
  registerListEventTargetsTool(mcpServer);
  registerSetupEventInfraTool(mcpServer);
  registerEnableEventProfileTool(mcpServer);
  registerEventConfigTools(mcpServer);
  registerDecisioningTools(mcpServer);
  registerAudienceTools(mcpServer);
  registerSnowflakeTools(mcpServer);
  registerLiveActivityTools(mcpServer);
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

/** Small, high-frequency catalog for clients that eagerly load only a few tools. */
export function registerFocusedProfileTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerListIndustriesTool(mcpServer);
  registerProfileInfraStatusTool(mcpServer);
  registerPreflightProfileGenerateTool(mcpServer);
  registerConfirmProfileGenerationTool(mcpServer);
  registerGenerateProfileTool(mcpServer);
  registerLookupProfileTool(mcpServer);
  registerGetProfileTool(mcpServer);
  registerProfileActivityTool(mcpServer);
}

/** Governed audience cleanup catalog: access check, list, audit, one delete. */
export function registerFocusedAudienceTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerAudienceTools(mcpServer);
}

/** Decisioning evaluation and catalog tools, plus the access check. */
export function registerFocusedDecisioningTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerDecisioningTools(mcpServer);
}
