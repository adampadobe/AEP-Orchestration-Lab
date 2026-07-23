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
  snowflakeProfileBundle,
  snowflakeProvision,
  STATIC_EGRESS_IP,
} from '../labApiClient.mjs';
import { getPrincipalAccess } from '../requestContext.mjs';
import { checkSnowflakeGenerateRate, checkSnowflakeTestRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';
import { snowflakeProfileTableForIndustry } from '../snowflakeIndustry.mjs';

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

/** Discoverable aliases for full industry Snowflake profile readback (Coworker tool search). */
export const SNOWFLAKE_PROFILE_READBACK_TOOL_NAMES = [
  'lab_snowflake_get_profile_by_email',
  'lab_snowflake_query_profiles',
];

export const SNOWFLAKE_PROFILE_INDUSTRIES = ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports'];
export const SNOWFLAKE_ENRICH_EVENT_TYPES = [
  'mobile', 'website', 'booking', 'checkin', 'call', 'disruption', 'inflight', 'hotel', 'loyalty', 'pos',
  'digital', 'transaction', 'application', 'advisory', 'products',
  'order', 'browse', 'return', 'service', 'rewards',
  'usage', 'billing', 'network', 'devices',
  'viewing', 'engagement', 'download', 'watchlist',
  'attendance', 'merchandise', 'betting', 'membership',
];

export function snowflakeProfileIndustryInputSchema() {
  return z
    .enum(SNOWFLAKE_PROFILE_INDUSTRIES)
    .default('travel')
    .describe('CRM industry (default travel)');
}

const SNOWFLAKE_FULL_ROW_NOTE =
  'Each profile includes profiles[].columns with every column from the selected industry CRM table ' +
  '(shared identity/person/value fields plus industry operational fields) and top-level createdAt from _RECORDCREATEDTIMESTAMP. ' +
  'Use email or ecid after dual_load_snowflake — do NOT tell the user to run Snowflake console SQL or raw Snowflake MCP SELECT *.';

async function runSnowflakeQueryProfiles({
  sandbox,
  industry = 'travel',
  email,
  ecid,
  filter_type,
  time_period,
  limit,
  toolName,
}) {
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
    industry,
    filter_type,
    time_period,
    limit,
    email,
    ecid,
  });
  writeAuditLog({
    keyId,
    tool: toolName,
    sandbox: allowed.sandbox,
    result: apiResult.ok ? 'ok' : 'error',
    durationMs: Date.now() - started,
  });

  const result = apiResult.data?.result || {};
  return fromLabApi(apiResult, {
    sandbox: allowed.sandbox,
    industry,
    table: result.table || snowflakeProfileTableForIndustry(industry),
    columnCount: result.columnCount || null,
    columns: result.columns || null,
    profiles: result.profiles,
    count: result.count,
    filterType: result.filterType || result.filter_type,
    timePeriod: result.timePeriod || result.time_period,
    email: email || null,
    ecid: ecid || null,
    coworkerNote: SNOWFLAKE_FULL_ROW_NOTE,
    neverUseSnowflakeConsoleSql:
      'Lab MCP returns the full mirror row — use this tool instead of Snowflake console SELECT * or generic Snowflake MCP SQL.',
  });
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
        'Default table BASE_PROFILES, count 1–1000. Emails use shared Firestore generation prefs (<local>+DDMMYYYY-N@domain) ' +
        'unless use_generation_prefs:false (legacy Agentic Snowflake counter). Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        count: z.number().int().min(1).max(1000).optional().describe('Profiles to generate (default 10)'),
        table: z.string().optional().describe('Target table (default BASE_PROFILES for batch generator)'),
        use_generation_prefs: z
          .boolean()
          .optional()
          .describe(
            'When true (default), each row reserves email via POST /api/lab/generation-prefs/next-email (Portal parity). ' +
              'Set false for legacy adamp.adobedemo+DDMMYYYY+N@gmail.com Snowflake scan.',
          ),
      },
    },
    async ({ sandbox, count, table, use_generation_prefs }) => {
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
        use_generation_prefs,
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
        emailSource: result.emailSource || (use_generation_prefs === false ? 'legacy_snowflake_table_scan' : 'labProfileGenerationPrefs'),
        use_generation_prefs: use_generation_prefs !== false,
        note:
          'Snowflake-only batch — emails share Portal/MCP Firestore counter when use_generation_prefs is true (default). ' +
          'For AEP+Snowflake parity use lab_generate_profile dual_load_snowflake:true (omit email).',
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_create_profile',
    {
      title: 'Insert one industry Snowflake CRM profile (dual-load)',
      description:
        'POST /api/snowflake/insert-profile-from-aep — default mode crm_generate builds a full industry CRM row ' +
        'with independent operational attributes and shared email/ECID/CRMID from AEP. ' +
        'Pass mode mirror only for legacy AEP dot-path attribute mapping. Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        email: z.string().email().describe('Profile email (same as AEP UPS)'),
        ecid: z.string().min(1).describe('ECID from lab_generate_profile'),
        industry: z.enum(['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']).optional().describe('CRM industry (default travel)'),
        table: z.string().optional().describe('Optional target table override; default selected from industry'),
        mode: z
          .enum(['crm_generate', 'mirror'])
          .optional()
          .describe('Insert mode (default crm_generate). mirror = legacy AEP attribute mapper only.'),
        attributes: z
          .record(z.unknown())
          .optional()
          .describe('Optional AEP attributes — crm_generate uses FIRSTNAME/LASTNAME only; mirror maps all dot-paths'),
      },
    },
    async ({ sandbox, email, ecid, industry, table, mode, attributes }) => {
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
        industry: industry || 'travel',
        table,
        mode: mode || 'crm_generate',
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
        mode: result.mode || mode || 'crm_generate',
        table: result.table,
        ecid: result.ecid,
        email: result.email,
        idempotent: result.idempotent,
        columnsWritten: result.columnsWritten,
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_get_profile_by_email',
    {
      title: 'Get full industry Snowflake CRM profile row by email',
      description:
        'POST /api/snowflake/agentic/query-profiles with email filter — returns the complete selected industry CRM row ' +
        '(all fields in profiles[].columns) plus createdAt from _RECORDCREATEDTIMESTAMP. ' +
        'Use INSTEAD of Snowflake console SQL or raw Snowflake MCP SELECT * after lab_generate_profile dual_load_snowflake. ' +
        'Requires user-generated MCP key (Profile Viewer → MCP servers).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        industry: snowflakeProfileIndustryInputSchema(),
        email: z
          .string()
          .email()
          .describe('Profile email from lab_generate_profile (same address streamed to AEP + Snowflake mirror)'),
      },
    },
    async ({ sandbox, email, industry }) =>
      runSnowflakeQueryProfiles({
        sandbox,
        industry: industry || 'travel',
        email,
        limit: 1,
        toolName: 'lab_snowflake_get_profile_by_email',
      }),
  );

  mcpServer.registerTool(
    'lab_snowflake_query_profiles',
    {
      title: 'Query Snowflake industry CRM profiles — full row readback by email or ecid',
      description:
        'POST /api/snowflake/agentic/query-profiles — returns every column from the selected industry CRM table in profiles[].columns ' +
        'with createdAt from _RECORDCREATEDTIMESTAMP. Filter by email or ecid for one-profile dual-load verification. ' +
        'Prefer lab_snowflake_get_profile_by_email when you only have email. Use INSTEAD of Snowflake console SQL or raw Snowflake MCP SELECT *. ' +
        'Requires user-generated MCP key.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: snowflakeProfileIndustryInputSchema(),
        email: z
          .string()
          .email()
          .optional()
          .describe('Filter to one profile by EMAIL (case-insensitive). Best for dual-load verification — same as lab_snowflake_get_profile_by_email.'),
        ecid: z
          .string()
          .min(1)
          .optional()
          .describe('Filter to one profile by ECID from lab_generate_profile'),
        filter_type: z
          .enum(['all', 'loyalty', 'non_loyalty'])
          .optional()
          .describe('Profile filter when email/ecid omitted (default all)'),
        time_period: z
          .string()
          .optional()
          .describe('Time window: all_time, today, last_7_days, last_30_days, …'),
        limit: z.number().int().min(1).max(500).optional().describe('Max rows when not filtering by email/ecid (default 50)'),
      },
    },
    async ({ sandbox, industry, email, ecid, filter_type, time_period, limit }) =>
      runSnowflakeQueryProfiles({
        sandbox,
        industry: industry || 'travel',
        email,
        ecid,
        filter_type,
        time_period,
        limit,
        toolName: 'lab_snowflake_query_profiles',
      }),
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
      title: 'Validate Snowflake provision or industry enrich proposal',
      description:
        'POST /api/snowflake/industry-validate-proposal — validates allowlisted industry provision recipes; ' +
        'validates phases and enrich event_types against the selected industry manifest. No DDL or arbitrary SQL.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: z.string().optional().describe('Industry (default travel)'),
        phases: z.array(z.enum(['phase1', 'phase2', 'phase3', 'profile', 'events', 'enrichment'])).optional(),
        event_types: z
          .array(z.enum(SNOWFLAKE_ENRICH_EVENT_TYPES))
          .optional(),
        count: z.number().int().min(1).max(1000).optional().describe('generate-full profile count'),
        recipe_id: z
          .string()
          .optional()
          .describe('Governed provision recipe id (e.g. travel.base_profiles.v1)'),
        proposed_tables: z
          .array(z.string())
          .optional()
          .describe('Retail draft net-new table proposals (read-only validation)'),
      },
    },
    async ({ sandbox, industry, phases, event_types, count, recipe_id, proposed_tables }) => {
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
        recipe_id,
        proposed_tables,
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
      const provision = validation.provision || validation;
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        valid: validation.valid === true || provision.valid === true,
        errors: validation.errors || provision.errors || [],
        warnings: validation.warnings || provision.warnings || [],
        resolved: validation.resolved || provision.resolved || null,
        provisionRecipes: provision.recipesForIndustry || null,
        runnerConfigured: result.runner?.configured === true,
        manifest: result.manifest || null,
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_provision',
    {
      title: 'Governed Snowflake table provision (allowlisted recipes)',
      description:
        'POST /api/snowflake/provision — executes CREATE TABLE IF NOT EXISTS or preinstalled table checks ' +
        'for allowlisted recipe_id values only. Supports dry_run. Requires user MCP key. No DROP/ALTER/arbitrary SQL.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: z.string().optional().describe('Industry (default travel)'),
        recipe_id: z
          .string()
          .describe('Allowlisted recipe id, e.g. fsi.all.v1 or travel.agentic_all.preinstalled.v1'),
        dry_run: z
          .boolean()
          .optional()
          .describe('When true, return planned SQL / table checks without executing DDL'),
        approval_id: z.string().optional().describe('Optional approval reference for audit log'),
      },
    },
    async ({ sandbox, industry, recipe_id, dry_run, approval_id }) => {
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

      const proposal = await snowflakeValidateProposal({
        sandbox: allowed.sandbox,
        industry: industry || 'travel',
        recipe_id,
      });
      const proposalValidation = proposal.data?.result?.validation;
      const proposalErrors =
        proposalValidation?.errors ||
        proposalValidation?.provision?.errors ||
        [];
      if (!proposal.ok || (proposalErrors.length && !dry_run)) {
        return toolError('provision recipe failed validation', { errors: proposalErrors });
      }

      const apiResult = await snowflakeProvision({
        sandbox: allowed.sandbox,
        industry: industry || 'travel',
        recipe_id,
        dry_run: dry_run === true,
        approval_id,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_provision',
        sandbox: allowed.sandbox,
        recipe_id,
        dry_run: dry_run === true,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        recipe_id,
        dry_run: result.dry_run === true,
        provisionMode: result.provisionMode || null,
        plannedSql: result.plannedSql || null,
        plannedStatements: result.plannedStatements || null,
        table: result.table || null,
        tables: result.tables || null,
        tableResults: result.tableResults || null,
        tableCheck: result.tableCheck || null,
        executed: result.executed === true,
        coworkerNextSteps: [
          'lab_snowflake_industry_catalog — confirm tableCheck after create_if_not_exists',
          'fsi|retail|telecom|media|sports.all.v1 — create all six selected-industry tables before enrichment',
          'travel.base_profiles.v1 then lab_snowflake_generate_base_profiles for Node batch rows',
          'travel.agentic_all.preinstalled.v1 — verify Agentic tables before generate-full',
        ],
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
      title: 'Snowflake industry enrich profiles',
      description:
        'POST /api/snowflake/agentic/enrich-profiles — add event/enrichment rows for existing CRM profiles. ' +
        'Travel uses the Python runner; fsi, retail, telecom, media, and sports use governed Firebase generators. ' +
        'Requires a user MCP key. event_types must belong to the selected industry manifest.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: snowflakeProfileIndustryInputSchema(),
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
            z.enum(SNOWFLAKE_ENRICH_EVENT_TYPES),
          )
          .min(1),
      },
    },
    async ({ sandbox, industry, profiles, event_types }) => {
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
        industry,
        event_types,
      });
      if (!proposal.ok || proposal.data?.result?.validation?.valid === false) {
        const errors = proposal.data?.result?.validation?.errors || [proposal.error || 'Invalid event_types'];
        return toolError('enrich proposal failed manifest validation', { errors });
      }

      const apiResult = await snowflakeEnrichProfiles({
        sandbox: allowed.sandbox,
        industry,
        profiles,
        event_types,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_enrich_profiles',
        sandbox: allowed.sandbox,
        industry,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      const result = apiResult.data?.result || {};
      const runnerNotConfigured =
        !apiResult.ok && result.error && result.error.code === 'RUNNER_NOT_CONFIGURED';
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        profileCount: profiles.length,
        industry,
        eventTypes: event_types,
        data: result.data || null,
        runnerNotConfigured,
      });
    },
  );

  mcpServer.registerTool(
    'lab_snowflake_get_profile_bundle',
    {
      title: 'Get Snowflake profile with industry activity',
      description:
        'Returns one non-travel CRM profile plus bounded, allowlisted rows from all five industry event/enrichment tables. ' +
        'Use after lab_snowflake_enrich_profiles to validate joined data without raw SQL.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        industry: z.enum(['fsi', 'retail', 'telecom', 'media', 'sports']),
        email: z.string().email().optional(),
        ecid: z.string().optional(),
        crm_id: z.string().optional(),
        event_limit: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ sandbox, industry, email, ecid, crm_id, event_limit }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      if (!email && !ecid && !crm_id) {
        return toolError('email, ecid, or crm_id is required');
      }
      const userKey = requireUserMcpKeyForSnowflake();
      if (!userKey.ok) {
        return toolError(userKey.message, { code: userKey.code, coworkerPrompt: userKey.coworkerPrompt });
      }
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }
      const apiResult = await snowflakeProfileBundle({
        sandbox: allowed.sandbox,
        industry,
        email,
        ecid,
        crm_id,
        event_limit,
      });
      writeAuditLog({
        keyId,
        tool: 'lab_snowflake_get_profile_bundle',
        sandbox: allowed.sandbox,
        industry,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        industry,
        profile: apiResult.data?.result?.profile || null,
        tables: apiResult.data?.result?.tables || null,
        totalReturnedRows: apiResult.data?.result?.totalReturnedRows || 0,
      });
    },
  );
}
