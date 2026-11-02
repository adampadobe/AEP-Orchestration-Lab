import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { normalizeIndustry } from '../industries.mjs';
import { snowflakeProfileTableForIndustry } from '../snowflakeIndustry.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { checkSnowflakeGenerateRate } from '../rateLimiter.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getGenerationPrefs, getSnowflakeConfig, snowflakeGenerateBaseProfiles } from '../labApiClient.mjs';
import { requireUserMcpKeyForSnowflake } from './snowflakeTools.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

export const generationTargetSchema = z.enum(['snowflake', 'aep']).optional().describe(
  'Default snowflake: seed the shared recipient parent and selected industry data, without AEP streaming. ' +
  'Set aep explicitly for the existing AEP persona/dual-load workflow.',
);

function validateSeedRequest(params, preflight) {
  const allowed = assertSandboxAllowed(params.sandbox);
  if (!allowed.ok) return { error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }) };
  const userKey = requireUserMcpKeyForSnowflake();
  if (!userKey.ok) return { error: toolError(userKey.message, { code: userKey.code }) };
  const { industry } = normalizeIndustry(params.industry);
  if (!snowflakeProfileTableForIndustry(industry)) {
    return { error: toolError('Choose an industry for Snowflake seeding: travel, fsi, retail, telecom, media, or sports. Use target:"aep" for generic AEP profiles.') };
  }
  const supported = new Set(['sandbox', 'industry', 'target', 'count', 'randomize', 'fill_sample_data', 'use_stored_prefs', 'test_profile']);
  const unsupported = Object.keys(params).filter(key => params[key] !== undefined && !supported.has(key));
  if (unsupported.length) {
    return { error: toolError(`Snowflake seeding does not support these AEP/custom options: ${unsupported.join(', ')}. Omit them or explicitly select target:"aep"; options are never silently ignored.`) };
  }
  if (['randomize', 'fill_sample_data', 'use_stored_prefs', 'test_profile'].some(key => params[key] === false)) {
    return { error: toolError('Snowflake seeding generates randomized test recipients using shared stored email preferences. These options must not be false; use target:"aep" for AEP-specific controls.') };
  }
  const count = params.count ?? 1;
  if (!preflight && (!Number.isInteger(count) || count < 1 || count > 100)) {
    return { error: toolError('Snowflake profile generation count must be an integer from 1 to 100.') };
  }
  return { sandbox: allowed.sandbox, industry, count };
}

export async function generateSnowflakeProfiles(params, tool) {
  const validated = validateSeedRequest(params, false);
  if (validated.error) return validated.error;
  const { sandbox, industry, count } = validated;
  const keyId = getRequestKeyId();
  const rate = checkSnowflakeGenerateRate(keyId);
  if (!rate.ok) return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
  const started = Date.now();
  const apiResult = await snowflakeGenerateBaseProfiles({
    sandbox, industry, count, use_generation_prefs: true,
  });
  const result = apiResult.data?.result;
  const ok = apiResult.ok && apiResult.data?.ok === true && result?.ok === true
    && result.rowcount === count && result.recipientRowcount === count
    && typeof result.recipientTable === 'string'
    && Array.isArray(result.profiles) && result.profiles.length === count
    && result.profiles.every(profile => profile.recipientId && profile.email && profile.ecid);
  writeAuditLog({ keyId, tool, sandbox, industry, result: ok ? 'ok' : 'error', durationMs: Date.now() - started });
  if (!ok) {
    return toolError(result?.error?.message || apiResult.error || 'Snowflake seeding did not confirm success.', {
      status: apiResult.status, response: apiResult.data,
      note: 'Do not automatically retry: generation creates new identities and may still commit after a timeout or gateway error. Wait for the backend request to finish, then inspect Snowflake before generating again. Never release or reuse reserved emails based only on a transport failure.',
    });
  }
  return fromLabApi(apiResult, {
    target: 'snowflake', aep_streamed: false, sandbox, industry,
    table: result.table,
    rowcount: result.rowcount,
    recipientTable: result.recipientTable,
    recipientRowcount: result.recipientRowcount,
    tableRowcounts: result.tableRowcounts,
    relationalRefresh: result.relationalRefresh,
    profiles: result.profiles,
    ...(count === 1 ? result.profiles?.[0] : {}),
    note: 'Shared recipient parent is written before linked industry data in one transaction. AEP/AJO ingestion is separate. Run generation serially; do not automatically retry.',
  });
}

export async function preflightSnowflakeProfiles(params) {
  const validated = validateSeedRequest(params, true);
  if (validated.error) return validated.error;
  const { sandbox, industry } = validated;
  const config = await getSnowflakeConfig({ sandbox });
  if (!config.ok) return fromLabApi(config);
  const prefs = await getGenerationPrefs({ sandbox });
  if (!prefs.ok) return fromLabApi(prefs);
  const record = config.data?.record;
  const generationPrefs = prefs.data?.prefs;
  const missingFields = ['account', 'user', 'database', 'schema', 'warehouse']
    .filter(field => !record?.[field]);
  if (!record?.hasCredential) missingFields.push('credential');
  if (!generationPrefs?.baseEmail) missingFields.push('baseEmail');
  return fromLabApi(config, {
    target: 'snowflake', sandbox, industry, aep_streamed: false,
    ready: missingFields.length === 0,
    missingFields,
    recipientTable: record?.database && record?.schema
      ? `${record.database}.${record.schema}.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE` : null,
    industryTable: snowflakeProfileTableForIndustry(industry),
    nextScaledEmail: generationPrefs?.nextScaledEmail,
    note: 'Read-only configuration check, not a SQL privilege or connection test. Confirm email preferences with lab_confirm_profile_generation and reachability with lab_snowflake_test_connection. Seeding may add missing schema objects and recipient columns; no profiles or emails reserved by this preflight.',
  });
}
