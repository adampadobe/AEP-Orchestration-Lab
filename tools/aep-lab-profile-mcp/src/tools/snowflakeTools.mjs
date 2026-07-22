import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import {
  getSnowflakeConfig,
  snowflakeConnectionTest,
  snowflakeGenerateBaseProfiles,
  snowflakeInsertProfileFromAep,
  snowflakeQueryProfiles,
  snowflakeIndustryCatalog,
  snowflakeTableStructure,
  snowflakeValidateProposal,
  snowflakeGenerateFull,
  snowflakeEnrichProfiles,
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
        'Apalmer sandboxes: Agentic travel defaults are returned by the API — paste PEM from aep_integration_1.p8, Save, then Test connection.',
      );
      if (record.labUser) {
        steps.push(
          `Config is scoped to Firebase uid ${String(record.labUser).slice(0, 8)}… — MCP key must be generated while signed in as the same user.`,
        );
      }
    } else if (record && record.configState === 'empty') {
      steps.push(
        'Empty config for this MCP principal — generate your MCP key in Profile Viewer → MCP servers while signed in as the user who saves Snowflake.',
      );
    }
  } else {
    steps.push('Call lab_snowflake_test_connection to verify Snowflake reachability.');
  }
  steps.push(`If network policy blocks the lab, allowlist static egress IP ${STATIC_EGRESS_IP}/32.`);
  return steps;
}

function uidPrefix(uid) {
  const s = String(uid || '');
  if (!s) return null;
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

function buildConfigSummary(record, sandbox, labMeta = {}) {
  const principalPrefix = uidPrefix(record && record.labUser) || uidPrefix(labMeta.labUserUid);
  const scopeHint = principalPrefix
    ? ` Scoped to Firebase uid prefix ${principalPrefix} — MCP key must belong to the same user who saved in Profile Viewer.`
    : '';

  if (!record) {
    return `No Snowflake config for sandbox "${sandbox}".${scopeHint}`;
  }

  if (record.account && record.hasCredential) {
    return `Snowflake ready: ${record.account} / ${record.user} → ${record.database}.${record.schema}.${scopeHint}`;
  }

  if (record.account && !record.hasCredential) {
    return (
      `Connection fields saved (${record.account}) but credential not stored for this principal.${scopeHint} ` +
      'Save PEM in Profile Viewer → Profile generation – Snowflake.'
    );
  }

  if (record.presetSource === 'agentic_travel_demo') {
    const target = `${record.account} / ${record.database}.${record.schema}`;
    if (record.hasCredential) {
      return (
        `Apalmer preset defaults (${target}) and credential exist for this principal, but account fields were empty in Firestore — re-save connection in Profile Viewer.${scopeHint}`
      );
    }
    return (
      `Apalmer Agentic travel preset defaults apply (${target}). Connection fields are pre-filled; credential not saved for this MCP principal.${scopeHint} ` +
      'Profile Viewer shows the same presets client-side — save your key pair there, then retry lab_snowflake_test_connection.'
    );
  }

  return (
    `Snowflake connection fields are empty for sandbox "${sandbox}".${scopeHint} ` +
    'Use a user-generated MCP key (Profile Viewer → MCP servers), not the shared ops key.'
  );
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
      const ready = !!(record && record.hasCredential && record.account);
      const labMeta = {
        labUserUid: apiResult.data?.labUserUid || null,
        labUserUidPrefix: apiResult.data?.labUserUidPrefix || null,
      };
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        record,
        ready,
        hasCredential: !!(record && record.hasCredential),
        configState: record && record.configState ? record.configState : null,
        presetSource: record && record.presetSource ? record.presetSource : null,
        configSummary: buildConfigSummary(record, allowed.sandbox, labMeta),
        labUserUidPrefix: labMeta.labUserUidPrefix,
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
        table: z.string().optional().describe('Target table (default BASE_PROFILES for batch generator)'),
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
        'POST /api/snowflake/insert-profile-from-aep — maps AEP dot-path attributes to AGENTIC_TRAVEL_PROFILE_CUSTOMER (BASE_PROFILES column shape) with shared email/ECID. ' +
        'Used for dual-load repair or standalone mirror insert. Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        email: z.string().email().describe('Profile email (same as AEP UPS)'),
        ecid: z.string().min(1).describe('ECID from lab_generate_profile'),
        table: z.string().optional().describe('Target table (default AGENTIC_TRAVEL_PROFILE_CUSTOMER for dual-load)'),
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

  mcpServer.registerTool(
    'lab_snowflake_industry_catalog',
    {
      title: 'Snowflake industry manifest + table existence',
      description:
        'POST /api/snowflake/industry-catalog — read-only travel manifest (phase tables, event groups, dual-load targets, ' +
        'validation rules) plus optional INFORMATION_SCHEMA table checks. Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: z.string().optional().describe('Industry key (default travel)'),
        check_tables: z
          .boolean()
          .optional()
          .describe('Probe Snowflake INFORMATION_SCHEMA for manifest tables (default true)'),
      },
    },
    async ({ sandbox, industry, check_tables }) => {
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

      const apiResult = await snowflakeIndustryCatalog({
        sandbox: allowed.sandbox,
        industry,
        check_tables,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_industry_catalog',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      const manifest = result.manifest || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        industry: result.industry || industry || 'travel',
        manifest,
        supportedIndustries: result.supportedIndustries || ['travel'],
        tableCheck: result.tableCheck || null,
        tableCheckSkipped: result.tableCheckSkipped === true,
        runnerConfigured: manifest.runner?.configured === true,
        dualLoadTarget: manifest.dualLoad?.defaultTargetTable || null,
        queryTable: manifest.dualLoad?.queryTable || null,
        coworkerNextSteps: [
          'Review phaseTables and tableCheck.missingCount before generate-full or enrich.',
          'Use lab_snowflake_table_structure for column metadata per phase.',
        ],
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_table_structure',
    {
      title: 'Snowflake Agentic travel table structure by phase',
      description:
        'POST /api/snowflake/agentic/table-structure — column metadata for phase1|phase2|phase3 tables. ' +
        'Requires user-generated MCP key. No arbitrary SQL.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        phase: z.enum(['phase1', 'phase2', 'phase3']).describe('Agentic travel phase'),
      },
    },
    async ({ sandbox, phase }) => {
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

      const apiResult = await snowflakeTableStructure({
        sandbox: allowed.sandbox,
        phase,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_table_structure',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        phase: result.phase || phase,
        tableCount: result.table_count,
        structureText: result.structure_text,
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_validate_proposal',
    {
      title: 'Validate Snowflake travel enrich/generate proposal',
      description:
        'POST /api/snowflake/industry-validate-proposal — read-only travel manifest validation for phases, ' +
        'enrich event_types, and generate-full count. No DDL or arbitrary SQL. Requires user MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: z.string().optional().describe('Industry (travel only in v3.22)'),
        phases: z.array(z.enum(['phase1', 'phase2', 'phase3'])).optional(),
        event_types: z
          .array(
            z.enum([
              'mobile',
              'website',
              'booking',
              'checkin',
              'call',
              'disruption',
              'inflight',
              'hotel',
              'loyalty',
              'pos',
            ]),
          )
          .optional(),
        count: z.number().int().min(1).max(1000).optional().describe('generate-full profile count'),
      },
    },
    async ({ sandbox, industry, phases, event_types, count }) => {
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

      const apiResult = await snowflakeValidateProposal({
        sandbox: allowed.sandbox,
        industry,
        phases,
        event_types,
        count,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_validate_proposal',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      const validation = result.validation || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        valid: validation.valid === true,
        errors: validation.errors || [],
        warnings: validation.warnings || [],
        resolved: validation.resolved || null,
        runnerConfigured: result.runner?.configured === true,
        manifest: result.manifest || null,
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_generate_full',
    {
      title: 'Snowflake Agentic travel generate-full (phased)',
      description:
        'POST /api/snowflake/agentic/generate-full — delegates to Python agentic-travel-runner when configured. ' +
        'Generates Phase 1–3 profiles + events. Requires user MCP key. count 1–1000.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        count: z.number().int().min(1).max(1000).describe('Profiles to generate across all phases'),
      },
    },
    async ({ sandbox, count }) => {
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

      const proposal = await snowflakeValidateProposal({
        sandbox: allowed.sandbox,
        industry: 'travel',
        count,
      });
      if (!proposal.ok || proposal.data?.result?.validation?.valid === false) {
        const errors = proposal.data?.result?.validation?.errors || [proposal.error || 'Invalid proposal'];
        return toolError('generate-full proposal failed manifest validation', { errors });
      }

      const apiResult = await snowflakeGenerateFull({ sandbox: allowed.sandbox, count });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_generate_full',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      const runnerNotConfigured =
        !apiResult.ok && result.error && result.error.code === 'RUNNER_NOT_CONFIGURED';
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        count,
        data: result.data || null,
        runnerNotConfigured,
        coworkerNextSteps: runnerNotConfigured
          ? [
              'Runner not configured — AGENTIC_TRAVEL_RUNNER_URL + AGENTIC_TRAVEL_RUNNER_HMAC_SECRET must be set on Cloud Functions.',
              'Use lab_snowflake_industry_catalog to confirm runner.configured before retry.',
            ]
          : ['lab_snowflake_query_profiles — verify generated rows'],
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_enrich_profiles',
    {
      title: 'Snowflake Agentic travel enrich profiles',
      description:
        'POST /api/snowflake/agentic/enrich-profiles — add event streams for existing CRM profiles via Python runner. ' +
        'Requires user MCP key. event_types from travel manifest (website, booking, mobile, …).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        profiles: z
          .array(
            z.object({
              crmId: z.string().optional(),
              ecid: z.string().optional(),
              email: z.string().optional(),
              phoneNumber: z.string().optional(),
              loyaltyId: z.string().optional(),
            }),
          )
          .min(1),
        event_types: z
          .array(
            z.enum([
              'mobile',
              'website',
              'booking',
              'checkin',
              'call',
              'disruption',
              'inflight',
              'hotel',
              'loyalty',
              'pos',
            ]),
          )
          .min(1),
      },
    },
    async ({ sandbox, profiles, event_types }) => {
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

      const proposal = await snowflakeValidateProposal({
        sandbox: allowed.sandbox,
        industry: 'travel',
        event_types,
      });
      if (!proposal.ok || proposal.data?.result?.validation?.valid === false) {
        const errors = proposal.data?.result?.validation?.errors || [proposal.error || 'Invalid event_types'];
        return toolError('enrich proposal failed manifest validation', { errors });
      }

      const apiResult = await snowflakeEnrichProfiles({
        sandbox: allowed.sandbox,
        profiles,
        event_types,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_enrich_profiles',
        sandbox: allowed.sandbox,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      const runnerNotConfigured =
        !apiResult.ok && result.error && result.error.code === 'RUNNER_NOT_CONFIGURED';
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        profileCount: profiles.length,
        eventTypes: event_types,
        data: result.data || null,
        runnerNotConfigured,
      });
    },
  );
}
