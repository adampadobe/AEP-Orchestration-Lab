/**
 * Preflight industry infra for brand-scrape → profile generate (dual-stream aware).
 */

import { industryNeedsDualStream } from './framework/dualStreamGenerate.mjs';
import { getProfileConnection, profileInfraStatusAll } from './labApiClient.mjs';
import { assessIndustrySandboxConfig, connectionApiPathForIndustry } from './sandboxConfig.mjs';

/**
 * Industries required for a scrape-inferred lab generate (generic + target when dual-stream).
 * @param {string} industry
 */
export function industriesRequiredForScrapeGenerate(industry) {
  if (industryNeedsDualStream(industry)) {
    return ['generic', industry];
  }
  return [industry];
}

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.industry
 */
export async function assessScrapeGenerateIndustryReadiness({ sandbox, industry }) {
  const keys = industriesRequiredForScrapeGenerate(industry);

  const statusResult = await profileInfraStatusAll({ sandbox, refresh: false });
  if (!statusResult.ok) {
    return {
      ready: false,
      industries: {},
      warnings: [
        `Could not fetch profile infra status: ${statusResult.error || 'unknown error'}. ` +
          'Call lab_sandbox_profile_config before lab_generate_profile_from_brand_scrape.',
      ],
      next_action: 'lab_sandbox_profile_config',
    };
  }

  const statusAll = statusResult.data?.industries || {};
  /** @type {Record<string, ReturnType<typeof assessIndustrySandboxConfig>>} */
  const industries = {};
  const warnings = [];

  await Promise.all(
    keys.map(async (key) => {
      const path = connectionApiPathForIndustry(key);
      let connectionResponse = null;
      if (path) {
        const connResult = await getProfileConnection({ path, sandbox });
        if (connResult.ok) connectionResponse = connResult.data;
      }
      industries[key] = assessIndustrySandboxConfig({
        industry: key,
        sandbox,
        infraStatus: statusAll[key],
        connectionResponse,
      });
    }),
  );

  const notReady = keys.filter((k) => !industries[k]?.ready);
  const ready = notReady.length === 0;

  if (!ready) {
    for (const key of notReady) {
      const row = industries[key];
      warnings.push(
        `Industry "${key}" is not ready for profile streaming (${row?.missingSteps?.join(', ') || 'missing config'}). ` +
          `${row?.nextAction || 'Run lab_sandbox_profile_config.'}`,
      );
    }
    warnings.push(
      'Call lab_sandbox_profile_config (or lab_onboard_sandbox) for the lab_industry above before generating profiles from this scrape.',
    );
  }

  return {
    ready,
    industries,
    notReadyIndustries: notReady,
    warnings,
    next_action: ready
      ? null
      : `lab_sandbox_profile_config sandbox ${sandbox} industry ${notReady[0]}`,
    dual_stream: keys.length > 1,
    industries_checked: keys,
  };
}
