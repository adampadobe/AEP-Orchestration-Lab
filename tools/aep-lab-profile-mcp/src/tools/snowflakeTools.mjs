import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import {
  getSnowflakeConfig,
  snowflakeConnectionTest,
  snowflakeGenerateBaseProfiles,
  snowflakeInsertProfileFromAep,
  snowflakeQueryProfiles,
  STATIC_EGRESS_IP,
} from '../labApiClient.mjs';
import { getPrincipalAccess } from '../requestContext.mjs';
import { checkSnowflakeGenerateRate, checkSnowflakeTestRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const USER_KEY_REQUIRED =
  'Snowflake tools require a user-generated MCP API key (Profile Viewer → MCP servers) that maps to your Firebase uid. Shared ops keys cannot access per-user Snowflake credentials.';

/**
 * Snowflake credentials are stored per Firebase principalUid — ops env key has no uid mapping.
 */
export function requireUserMcpKeyForSnowflake() {
  const access = getPrincipalAccess();
  if (!access || access.source === 'env') {
    return {
      ok: false,
      message: USER_KEY_REQUIRED,
      coworkerPrompt:
        'Generate an MCP key in Profile Viewer → MCP servers for this sandbox, connect Coworker with that key, then retry lab_snowflake_config.',
      code: 'MCP_USER_KEY_REQUIRED',
    };
  }
  return { ok: true };
}

function redactSnowflakeConfig(record) {
  if (!record || typeof record !== 'object') return record;
  const safe = { ...record };
  delete safe.credential;
  delete safe.password;
  delete safe.privateKey;
  delete safe.keyPassphrase;
  return safe;
}

function buildConfigCoworkerSteps(record) {
  const steps = [];
  if (!record || !record.hasCredential) {
    steps.push(
      'Open Profile Viewer → Profiles → Profile generation – Snowflake. Save connection (key pair recommended).',
    );
    if (record && record.presetSource === 'agentic_travel_demo') {
      steps.push(
        'Apalmer sandboxes: Agentic travel defaults are pre-filled — paste PEM from aep_integration_1.p8, Save, then Test connection.',
      );
    }
  } else {
    steps.push('Call lab_snowflake_test_connection to verify Snowflake reachability.');
  }
  steps.push(`If network policy blocks the lab, allowlist static egress IP ${STATIC_EGRESS_IP}/32.`);
  return steps;
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSnowflakeTools(mcpServer) {
  mcpServer.registerTool(
    'lab_snowflake_config',
    {
      title: 'Get Snowflake connection config (redacted)',
      description:
        'GET /api/snowflake/config — public projection of saved Snowflake connection for current MCP principal + sandbox. ' +
        'Never returns credentials. Requires user-generated MCP key (maps to Firebase uid). ' +
        `Static egress IP for Snowflake NETWORK POLICY: ${STATIC_EGRESS_IP}.`,
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const userKey = requireUserMcpKeyForSnowflake();
      if (!userKey.ok) {
        return toolError(userKey.message, {
          code: userKey.code,
          coworkerPrompt: userKey.coworkerPrompt,
        });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await getSnowflakeConfig({ sandbox: allowed.sandbox });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_config',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const record = redactSnowflakeConfig(apiResult.data?.record);
      const ready = !!(record && record.hasCredential);
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        record,
        ready,
        hasCredential: !!(record && record.hasCredential),
        staticEgressIp: STATIC_EGRESS_IP,
        coworkerNextSteps: buildConfigCoworkerSteps(record),
        note: 'Credentials are never returned. Save via Profile Viewer → Profile generation – Snowflake.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_test_connection',
    {
      title: 'Test Snowflake connection',
      description:
        'POST /api/snowflake/connection-test — opens saved Snowflake config and runs SELECT CURRENT_VERSION(). ' +
        'Requires user-generated MCP key. Surfaces NETWORK POLICY hints with static IP.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
      },
    },
    async ({ sandbox }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const rate = checkSnowflakeTestRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const userKey = requireUserMcpKeyForSnowflake();
      if (!userKey.ok) {
        return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await snowflakeConnectionTest({ sandbox: allowed.sandbox });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_test_connection',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        staticEgressIp: STATIC_EGRESS_IP,
        version: result.version || null,
        ok: result.ok === true,
        error: result.error || null,
        hints: result.error?.hints || [],
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_generate_base_profiles',
    {
      title: 'Generate Snowflake base profiles (Agentic batch)',
      description:
        'POST /api/snowflake/generate-base-profiles — Snowflake-only Faker batch INSERT (not UPS-linked). ' +
        'Default table BASE_PROFILES, count 1–1000. Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        count: z.number().int().min(1).max(1000).optional().describe('Profiles to generate (default 10)'),
        table: z.string().optional().describe('Target table (default BASE_PROFILES)'),
      },
    },
    async ({ sandbox, count, table }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const rate = checkSnowflakeGenerateRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const userKey = requireUserMcpKeyForSnowflake();
      if (!userKey.ok) {
        return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await snowflakeGenerateBaseProfiles({
        sandbox: allowed.sandbox,
        count,
        table,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_generate_base_profiles',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        rowcount: result.rowcount,
        table: result.table,
        sample: result.sample,
        note: 'Snowflake-only rows — email scheme differs from AEP lab prefs unless dual_load_snowflake on lab_generate_profile.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_create_profile',
    {
      title: 'Insert one Snowflake profile from AEP persona',
      description:
        'POST /api/snowflake/insert-profile-from-aep — maps AEP dot-path attributes to BASE_PROFILES with shared email/ECID. ' +
        'Used for dual-load repair or standalone mirror insert. Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        email: z.string().email().describe('Profile email (same as AEP UPS)'),
        ecid: z.string().min(1).describe('ECID from lab_generate_profile'),
        table: z.string().optional().describe('Target table (default BASE_PROFILES)'),
        attributes: z.record(z.unknown()).optional().describe('AEP persona dot-path attributes to map'),
      },
    },
    async ({ sandbox, email, ecid, table, attributes }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const rate = checkSnowflakeGenerateRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const userKey = requireUserMcpKeyForSnowflake();
      if (!userKey.ok) {
        return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await snowflakeInsertProfileFromAep({
        sandbox: allowed.sandbox,
        email,
        ecid,
        table,
        attributes,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_create_profile',
        sandbox: allowed.sandbox,
        email,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        crmId: result.crmId,
        table: result.table,
        ecid: result.ecid,
        email: result.email,
        idempotent: result.idempotent,
        columnsWritten: result.columnsWritten,
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_query_profiles',
    {
      title: 'Query Snowflake Agentic travel profiles',
      description:
        'POST /api/snowflake/agentic/query-profiles — filter loyalty/time on Agentic base table. Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        filter_type: z
          .enum(['all', 'loyalty', 'non_loyalty'])
          .optional()
          .describe('Profile filter (default all)'),
        time_period: z
          .string()
          .optional()
          .describe('Time window: all_time, today, last_7_days, last_30_days, …'),
        limit: z.number().int().min(1).max(500).optional().describe('Max rows (default 50)'),
      },
    },
    async ({ sandbox, filter_type, time_period, limit }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const userKey = requireUserMcpKeyForSnowflake();
      if (!userKey.ok) {
        return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await snowflakeQueryProfiles({
        sandbox: allowed.sandbox,
        filter_type,
        time_period,
        limit,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_query_profiles',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        profiles: result.profiles,
        count: result.count,
        filterType: result.filterType,
        timePeriod: result.timePeriod,
      });
    },
  );
}
