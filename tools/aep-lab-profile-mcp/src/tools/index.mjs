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
import { registerRunPlaybookTool } from './runPlaybook.mjs';
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
import { registerDemoAssetTools } from './demoAssets.mjs';
import { registerAjoCleanupTools } from './ajoCleanupTools.mjs';
import { registerMcpGuideTools } from './mcpGuideTools.mjs';
import { registerPdfTools } from './pdfTools.mjs';
import { registerCommandCentreTools } from './commandCentreTools.mjs';
import { registerLoadToolsetTool } from './loadToolset.mjs';

/**
 * Register all Profile MCP tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerProfileTools(mcpServer) {
  registerMcpGuideTools(mcpServer);
  registerPdfTools(mcpServer);
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
  registerDemoAssetTools(mcpServer);
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
  registerAjoCleanupTools(mcpServer);
  registerSnowflakeTools(mcpServer);
  registerLiveActivityTools(mcpServer);
  registerSendProfileEventTool(mcpServer);
  registerSendEdgeEventTool(mcpServer);
  registerPreflightProfileEventTool(mcpServer);
  registerSendRetailJourneyEventsTool(mcpServer);
  registerSendProfileEventsBatchTool(mcpServer);
  registerGenerateProfilesBatchTool(mcpServer);
  registerBatchJobStatusTool(mcpServer);
  registerRunPlaybookTool(mcpServer);
  registerProvisionProfileInfraStepTool(mcpServer);
  registerEnableProfileTool(mcpServer);
  registerSandboxProfileConfigTool(mcpServer);
  registerOnboardSandboxTool(mcpServer);
  registerBrandScrapeTools(mcpServer);
  registerGenerateProfileFromBrandScrapeTools(mcpServer);
  registerPrepareDemoFromBrandScrapeTool(mcpServer);
  registerCreateJourneyFromBrandScrapeTool(mcpServer);
  registerCommandCentreTools(mcpServer);
}

/**
 * Domain-only composers (no lab_mcp_access_info) — shared between the
 * `registerFocused*` endpoint composites below and the `lab_load_toolset`
 * category map, so a tool already present in a session (like the access-info
 * tool every focused endpoint starts with) never gets registered twice.
 */
function registerProfileDomainTools(mcpServer) {
  registerListIndustriesTool(mcpServer);
  registerProfileInfraStatusTool(mcpServer);
  registerPreflightProfileGenerateTool(mcpServer);
  registerConfirmProfileGenerationTool(mcpServer);
  registerGenerateProfileTool(mcpServer);
  registerLookupProfileTool(mcpServer);
  registerGetProfileTool(mcpServer);
  registerUpdateProfileTool(mcpServer);
  registerProfileActivityTool(mcpServer);
  registerListEventTargetsTool(mcpServer);
  registerPreflightProfileEventTool(mcpServer);
  registerSendProfileEventTool(mcpServer);
  registerSendProfileEventsBatchTool(mcpServer);
  registerSendRetailJourneyEventsTool(mcpServer);
  registerSnowflakeTools(mcpServer, {
    include: new Set([
      'lab_snowflake_config',
      'lab_snowflake_test_connection',
      'lab_snowflake_get_profile_by_email',
      'lab_snowflake_enrich_profiles',
      'lab_snowflake_get_profile_bundle',
    ]),
  });
  registerRunPlaybookTool(mcpServer);
}

function registerDemoPrepDomainTools(mcpServer) {
  registerBrandScrapeTools(mcpServer);
  registerDemoAssetTools(mcpServer);
  registerDemoConfigTools(mcpServer);
  registerPrepareDemoFromBrandScrapeTool(mcpServer);
}

/** Categories `lab_load_toolset` can pull into an already-open session. */
const LOADABLE_TOOLSETS = {
  profile: registerProfileDomainTools,
  audiences: registerAudienceTools,
  'ajo-cleanup': registerAjoCleanupTools,
  decisioning: registerDecisioningTools,
  'demo-prep': registerDemoPrepDomainTools,
  pdf: registerPdfTools,
  'command-centre': registerCommandCentreTools,
};

/**
 * Read-only capability directory and cross-context planning, plus access
 * check and lab_load_toolset — this is the one endpoint meant to start
 * small and grow, so it's the only place lab_load_toolset is exposed (the
 * full `/mcp` catalog already has every category loaded; the other focused
 * endpoints are intentionally scoped and shouldn't be able to widen
 * themselves).
 */
export function registerFocusedMcpGuideTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerMcpGuideTools(mcpServer);
  registerLoadToolsetTool(mcpServer, LOADABLE_TOOLSETS);
}

/** Small, high-frequency catalog for clients that eagerly load only a few tools. */
export function registerFocusedProfileTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerProfileDomainTools(mcpServer);
}

/** Governed audience cleanup catalog: access check, list, audit, one delete. */
export function registerFocusedAudienceTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerAudienceTools(mcpServer);
}

/** Governed AJO cleanup catalog: access check, read-only audit, and one exact delete. */
export function registerFocusedAjoCleanupTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerAjoCleanupTools(mcpServer);
}

/** Decisioning evaluation and catalog tools, plus the access check. */
export function registerFocusedDecisioningTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerDecisioningTools(mcpServer);
}

/** Focused customer demo preparation: scrape, stable assets, and governed RTDB. */
export function registerFocusedDemoPrepTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerDemoPrepDomainTools(mcpServer);
}

/** Focused PDF preparation, stored output, and server-template catalog. */
export function registerFocusedPdfTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerPdfTools(mcpServer);
}

/** Focused Command Centre admin layer: list/add/update/delete your own customer engagements, tasks, meetings. */
export function registerFocusedCommandCentreTools(mcpServer) {
  registerMcpAccessInfoTool(mcpServer);
  registerCommandCentreTools(mcpServer);
}
