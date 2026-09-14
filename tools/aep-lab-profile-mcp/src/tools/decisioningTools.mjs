import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  decisioningEdgeEvaluate,
  explainDecisionResponse,
  getCatalogConfig,
  getDecisionLabConfig,
  lookupProfile,
  resolveDecisioningTreatmentName,
  decisioningCatalogList,
  decisioningCatalogGet,
  decisioningCatalogSchema,
  decisioningCatalogAssess,
  decisioningCatalogChangePreview,
  decisioningCatalogChangeApply,
  decisioningCatalogDeleteAudit,
  decisioningCatalogDeleteApply,
} from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { createBatchJob } from '../batchJobStore.mjs';
import { processDecisioningBulkJob } from '../decisioningBulkProcessor.mjs';
import { checkBatchJobRate } from '../rateLimiter.mjs';
import {
  extractEcidFromProfileTable,
  resolveEventIdentities,
} from '../framework/eventIdentity.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const WRITABLE_ENTITY_TYPES = ['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements'];
const BULK_MAX = 200;

const idOrNameSchema = z.string().min(1).describe('Exact entity id, or exact display name (auto-resolved; a name matching more than one entity fails with a disambiguation list).');

const jsonPatchSchema = z
  .array(
    z.object({
      op: z.enum(['add', 'replace', 'remove']),
      path: z.string().min(1).describe('JSON Pointer path, e.g. /description'),
      value: z.unknown().optional(),
    }),
  )
  .min(1)
  .describe('RFC 6902 JSON Patch operations — only the named fields are touched, unlike resending a full object.');

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerDecisioningTools(mcpServer) {
  mcpServer.registerTool(
    'lab_decisioning_capabilities',
    {
      title: 'Inspect Decisioning catalog capabilities',
      description: 'Shows the implemented Experience Decisioning surfaces, write/delete guardrails, and id-or-name resolution behavior without making an Adobe API call.',
      inputSchema: {},
    },
    async () =>
      jsonResult({
        ok: true,
        decisioning: {
          entity_types: {
            'offer-items': { label: 'Decision items', requires_x_schema_id: true, read: true, write: true, delete: true },
            'item-collections': { label: 'Item collections', requires_x_schema_id: false, read: true, write: true, delete: true },
            'selection-strategies': { label: 'Selection strategies', requires_x_schema_id: false, read: true, write: true, delete: true },
            'offer-rules': { label: 'Eligibility rules', requires_x_schema_id: false, read: true, write: true, delete: true },
            'ranking-formulas': { label: 'Ranking formulas', requires_x_schema_id: false, read: true, write: true, delete: true },
            placements: { label: 'Placements', requires_x_schema_id: false, read: true, write: true, delete: true },
          },
          personalization_and_diagnostics: [
            'lab_decision_lab_config', 'lab_decisioning_edge_evaluate', 'lab_explain_decision_response', 'lab_decisioning_resolve_treatment_name',
          ],
          catalog_read: ['lab_decisioning_catalog_list', 'lab_decisioning_catalog_get', 'lab_decisioning_catalog_schema', 'lab_decisioning_catalog_assess'],
          catalog_write: {
            tools: ['lab_decisioning_catalog_change_preview', 'lab_decisioning_catalog_change_apply'],
            create: 'POST with a full item payload',
            update: 'PATCH with an RFC 6902 JSON Patch array — only the named fields are touched, unlike resending a full object',
            guardrail: 'local hash-bound preview → exact unchanged confirmation → one non-retried request',
          },
          catalog_delete: {
            tools: ['lab_decisioning_catalog_delete_audit', 'lab_decisioning_catalog_delete_apply'],
            guardrail: 'audit (dependency scan + expected_name) → exact confirmation → re-read fails closed if changed since audit',
          },
          bulk: {
            tool: 'lab_decisioning_catalog_bulk_apply',
            note: `Resumable async create/update for 1–${BULK_MAX} items; DPS has no array-body batch endpoint, so this loops sequentially with retry. Never used for deletes.`,
          },
          id_or_name_resolution: 'Every write/delete/get tool accepts an exact DPS id or an exact display name; a name matching more than one entity fails with a disambiguation list instead of guessing.',
          audience_discovery: 'Use lab_audience_list / lab_audience_audit (Audiences context) for RT-CDP audiences — not duplicated here.',
          credentials: 'Server-side Adobe IMS token; never accepted as a tool argument.',
        },
      }),
  );

  mcpServer.registerTool(
    'lab_decision_lab_config',
    {
      title: 'Get Decision lab + catalog config',
      description:
        'Reads per-sandbox Decisioning lab Edge setup (GET /api/decision-lab/config) and decisioning catalog schema id ' +
        '(GET /api/catalog/config). Use before lab_decisioning_edge_evaluate to confirm datastream, targetPageUrl, placements, and personalization mode.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decision_lab_config',
        sandbox: allowed.sandbox,
      });

      const [decisionResult, catalogResult] = await Promise.all([
        getDecisionLabConfig({ sandbox: allowed.sandbox }),
        getCatalogConfig({ sandbox: allowed.sandbox }),
      ]);

      return jsonResult({
        ok: decisionResult.ok && catalogResult.ok,
        sandbox: allowed.sandbox,
        decisionLab: decisionResult.ok ? decisionResult.data : { error: decisionResult.error, data: decisionResult.data },
        catalog: catalogResult.ok ? catalogResult.data : { error: catalogResult.error, data: catalogResult.data },
        routes: ['/api/decision-lab/config', '/api/catalog/config'],
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_edge_evaluate',
    {
      title: 'Evaluate Edge decisioning (Decision lab)',
      description:
        'POST /api/decisioning/edge-evaluate — server-side Edge interact with personalization (surfaces or decisionScopes) ' +
        'using Decision lab Firestore config. Pass email + ecid from lab_generate_profile; ECID is primary when both present. ' +
        'Does not expose /api/aep. Sandbox is allowlist-gated.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().optional(),
        ecid: z.string().optional().describe('10+ digit ECID from lab_generate_profile'),
        namespace: z.string().optional().describe('Identifier namespace when email omitted — default email'),
        mode: z.enum(['surfaces', 'decisionScopes']).optional().describe('Override edgePersonalizationMode from Decision lab config'),
        datastream_id: z.string().optional().describe('Override datastream id from Decision lab config'),
        target_page_url: z.string().optional().describe('Override targetPageUrl for surface URI building'),
        decision_scopes: z.array(z.string()).optional().describe('Explicit decisionScopes (decisionScopes mode)'),
        view_url: z.string().optional(),
        view_name: z.string().optional(),
        auto_fetch_ecid: z.boolean().optional().describe('When true (default), lookup UPS ecid by email if ecid omitted'),
      },
    },
    async (params) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let email = params.email != null ? String(params.email).trim() : '';
      let ecid = params.ecid != null ? String(params.ecid).trim() : '';
      let warnings = [];

      if (params.auto_fetch_ecid !== false && email && !ecid) {
        const profileResult = await lookupProfile({
          sandbox: allowed.sandbox,
          namespace: 'email',
          identifier: email,
        });
        if (profileResult.ok) {
          const fetched = extractEcidFromProfileTable(profileResult.data);
          if (fetched) {
            ecid = fetched;
            warnings.push('ecid auto-fetched from profile table.');
          }
        }
      }

      const identityResult = resolveEventIdentities({ email, ecid });
      if (!identityResult.ok) {
        return toolError(identityResult.error);
      }
      email = identityResult.email;
      ecid = identityResult.ecid;
      if (identityResult.warnings?.length) warnings.push(...identityResult.warnings);

      const apiResult = await decisioningEdgeEvaluate({
        sandbox: allowed.sandbox,
        email: email || undefined,
        ecid: ecid || undefined,
        namespace: params.namespace,
        mode: params.mode,
        datastream_id: params.datastream_id,
        target_page_url: params.target_page_url,
        decision_scopes: params.decision_scopes,
        view_url: params.view_url,
        view_name: params.view_name,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_decisioning_edge_evaluate',
        sandbox: allowed.sandbox,
        email: email || null,
        identifier: ecid || null,
        result: apiResult.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox, warnings: warnings.length ? warnings : undefined });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        warnings: warnings.length ? warnings : undefined,
        evaluate: apiResult.data,
        next_step: 'Call lab_explain_decision_response with propositions from evaluate.propositions (or pass email/ecid to re-evaluate).',
      });
    },
  );

  mcpServer.registerTool(
    'lab_explain_decision_response',
    {
      title: 'Explain Edge decision propositions',
      description:
        'POST /api/decisioning/explain — maps proposition scopes to Decision lab placement mounts, summarizes item content, ' +
        'batch-resolves offer-item ids via GET /api/decisioning/treatment-name, and returns a zero-proposition checklist. ' +
        'Pass propositions from lab_decisioning_edge_evaluate, or provide email/ecid to evaluate first.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        propositions: z.array(z.record(z.unknown())).optional().describe('Propositions from edge evaluate — omit to evaluate first'),
        email: z.string().email().optional(),
        ecid: z.string().optional(),
        mode: z.enum(['surfaces', 'decisionScopes']).optional(),
        datastream_id: z.string().optional(),
        target_page_url: z.string().optional(),
        decision_scopes: z.array(z.string()).optional(),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_explain_decision_response',
        sandbox: allowed.sandbox,
      });

      let propositions = Array.isArray(params.propositions) ? params.propositions : null;
      /** @type {Record<string, unknown> | null} */
      let evaluateData = null;

      if (!propositions || !propositions.length) {
        if (!params.email && !params.ecid) {
          return toolError('Provide propositions from lab_decisioning_edge_evaluate, or email/ecid to evaluate first.');
        }
        const evalResult = await decisioningEdgeEvaluate({
          sandbox: allowed.sandbox,
          email: params.email,
          ecid: params.ecid,
          mode: params.mode,
          datastream_id: params.datastream_id,
          target_page_url: params.target_page_url,
          decision_scopes: params.decision_scopes,
        });
        if (!evalResult.ok) {
          return fromLabApi(evalResult, { sandbox: allowed.sandbox, phase: 'edge-evaluate' });
        }
        evaluateData = evalResult.data;
        propositions = Array.isArray(evalResult.data?.propositions) ? evalResult.data.propositions : [];
      }

      const explainResult = await explainDecisionResponse({
        sandbox: allowed.sandbox,
        propositions,
        evaluate_context: evaluateData
          ? {
              mode: evaluateData.mode,
              surfaces: evaluateData.surfaces,
              decisionScopes: evaluateData.decisionScopes,
              datastreamId: evaluateData.datastreamId,
              identityMap: evaluateData.identityMap,
            }
          : {
              mode: params.mode,
              datastreamId: params.datastream_id,
            },
      });

      if (!explainResult.ok) {
        return fromLabApi(explainResult, { sandbox: allowed.sandbox });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        evaluate: evaluateData,
        explain: explainResult.data,
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_resolve_treatment_name',
    {
      title: 'Resolve AJO offer-item / treatment name',
      description: 'GET /api/decisioning/treatment-name?id= — resolves DPS offer-item id to human-readable itemName for a sandbox.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        id: z.string().describe('Offer-item / treatment UUID from proposition scopeDetails or items'),
      },
    },
    async ({ sandbox, id }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const treatmentId = String(id || '').trim();
      if (!treatmentId) {
        return toolError('id is required.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_resolve_treatment_name',
        sandbox: allowed.sandbox,
      });

      const apiResult = await resolveDecisioningTreatmentName({
        sandbox: allowed.sandbox,
        id: treatmentId,
      });

      return fromLabApi(apiResult, { sandbox: allowed.sandbox, id: treatmentId });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_list',
    {
      title: 'List Decisioning catalog entities (DPS)',
      description:
        'POST /api/decisioning/catalog/list — allowlisted DPS list for offer-items, item-collections, or selection-strategies. ' +
        'Normalized rows mirror Profile Viewer decisioning-catalog.js. offer-items requires x-schema-id from Firestore /api/catalog/config (auto-detect when omitted). ' +
        'Sandbox allowlist required. Does not expose /api/aep.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z
          .enum(['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements'])
          .describe('DPS entity type to list. offer-rules = eligibility rules.'),
        limit: z.number().int().min(1).max(50).optional().describe('Page size (default 50, max 50)'),
        schema_id: z.string().optional().describe('Override x-schema-id for offer-items'),
        auto_detect: z.boolean().optional().describe('Auto-detect offer schema when not in Firestore (default true)'),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_list',
        sandbox: allowed.sandbox,
      });

      const apiResult = await decisioningCatalogList({
        sandbox: allowed.sandbox,
        entity_type: params.entity_type,
        limit: params.limit,
        schema_id: params.schema_id,
        auto_detect: params.auto_detect,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        entity_type: params.entity_type,
        next_step: 'Call lab_decisioning_catalog_assess for health report or lab_decisioning_catalog_get for a single id.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_get',
    {
      title: 'Get Decisioning catalog entity by id or name',
      description:
        'POST /api/decisioning/catalog/get — allowlisted DPS GET by id, or by exact display name (auto-resolved; ' +
        'a name matching more than one entity fails with a disambiguation list). offer-items requires x-schema-id. ' +
        'Sandbox allowlist required.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z.enum(['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements']),
        id: idOrNameSchema,
        schema_id: z.string().optional(),
        auto_detect: z.boolean().optional(),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const id = String(params.id || '').trim();
      if (!id) return toolError('id is required.');

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_get',
        sandbox: allowed.sandbox,
      });

      const apiResult = await decisioningCatalogGet({
        sandbox: allowed.sandbox,
        entity_type: params.entity_type,
        id,
        schema_id: params.schema_id,
        auto_detect: params.auto_detect,
      });

      return fromLabApi(apiResult, { sandbox: allowed.sandbox, entity_type: params.entity_type, id });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_schema',
    {
      title: 'Resolve Decisioning offer-items schema id',
      description:
        'GET /api/decisioning/catalog/schema — reads Firestore /api/catalog/config and optionally auto-detects ' +
        '"Personalized Offer Items - Experience Decisioning" schema. Use before listing offer-items.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        auto_detect: z.boolean().optional().describe('Run schema registry auto-detect when Firestore empty (default true)'),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_schema',
        sandbox: allowed.sandbox,
      });

      const apiResult = await decisioningCatalogSchema({
        sandbox: allowed.sandbox,
        auto_detect: params.auto_detect,
      });

      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        next_step: 'Pass schemaId to lab_decisioning_catalog_list entity_type offer-items if auto-detect failed.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_assess',
    {
      title: 'Assess Decisioning catalog health',
      description:
        'POST /api/decisioning/catalog/assess — fetches offers, collections, and strategies then returns rule-based health findings ' +
        '(expired/scheduled offers, empty collections, missing ranking, duplicate priorities, tag gaps) plus suggestions[] for Coworker.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        schema_id: z.string().optional(),
        auto_detect: z.boolean().optional(),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_assess',
        sandbox: allowed.sandbox,
      });

      const apiResult = await decisioningCatalogAssess({
        sandbox: allowed.sandbox,
        schema_id: params.schema_id,
        auto_detect: params.auto_detect,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        assess: apiResult.data,
        suggestions: apiResult.data?.suggestions,
        healthy: apiResult.data?.summary?.healthy,
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_change_preview',
    {
      title: 'Preview a Decisioning catalog create/update',
      description:
        'Local hash-bound preview (no Adobe call) for creating or updating one offer-item, item-collection, ' +
        'selection-strategy, offer-rule (eligibility rule), ranking-formula, or placement. action=create takes a full ' +
        'item; action=update takes patches (JSON Patch — only the named fields are touched). Returns preflight_id and ' +
        'the exact confirmation phrase required by lab_decisioning_catalog_change_apply. Use lab_audience_list first ' +
        'if an offer-rule condition needs to reference an RT-CDP audience id.',
      inputSchema: {
        entity_type: z.enum(WRITABLE_ENTITY_TYPES),
        action: z.enum(['create', 'update']),
        id: idOrNameSchema.optional().describe('Required for action=update; id or exact display name'),
        item: z.record(z.unknown()).optional().describe('Required for action=create — proposed entity payload (DPS shape for the chosen entity_type)'),
        patches: jsonPatchSchema.optional().describe('Required for action=update'),
      },
    },
    async (params) => {
      if (params.action === 'create' && !params.item) {
        return toolError('item is required for action=create.');
      }
      if (params.action === 'update' && (!params.patches || params.patches.length === 0)) {
        return toolError('patches is required for action=update — a non-empty array of {op, path, value?}.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_change_preview',
        entityType: params.entity_type,
        action: params.action,
      });
      const apiResult = await decisioningCatalogChangePreview(params);
      return fromLabApi(apiResult, { entity_type: params.entity_type, action: params.action });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_change_apply',
    {
      title: 'Submit a previewed Decisioning catalog create/update',
      description:
        'Submits exactly one previewed create or update with no automatic retry. Requires an unchanged item/patches, ' +
        'preflight_id, and exact confirmation from lab_decisioning_catalog_change_preview. Update sends a JSON Patch ' +
        '(PATCH) — only the named fields are touched, unlike resending a full object. Sandbox allowlist required.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z.enum(WRITABLE_ENTITY_TYPES),
        action: z.enum(['create', 'update']),
        id: idOrNameSchema.optional().describe('Required for action=update; id or exact display name'),
        item: z.record(z.unknown()).optional().describe('Required for action=create'),
        patches: jsonPatchSchema.optional().describe('Required for action=update'),
        schema_id: z.string().optional().describe('Override x-schema-id for offer-items'),
        auto_detect: z.boolean().optional(),
        preflight_id: z.string().length(64),
        confirmation: z.string().min(1),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }
      if (params.action === 'create' && !params.item) {
        return toolError('item is required for action=create.');
      }
      if (params.action === 'update' && (!params.patches || params.patches.length === 0)) {
        return toolError('patches is required for action=update — a non-empty array of {op, path, value?}.');
      }

      const apiResult = await decisioningCatalogChangeApply({ ...params, sandbox: allowed.sandbox });

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_change_apply',
        sandbox: allowed.sandbox,
        entityType: params.entity_type,
        action: params.action,
        result: apiResult.ok ? 'ok' : 'error',
      });

      return fromLabApi(apiResult, { sandbox: allowed.sandbox, entity_type: params.entity_type, action: params.action });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_delete_audit',
    {
      title: 'Audit one Decisioning catalog entity before deletion',
      description:
        'DESTRUCTIVE actions require this first. Read-only: returns current state, a best-effort dependency scan ' +
        '(referencedBy — e.g. selection-strategies referencing an item-collection or ranking-formula), preflight_id, ' +
        'and the exact expected_name needed for lab_decisioning_catalog_delete_apply. Show the result to the colleague ' +
        'and get explicit confirmation before calling delete_apply.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z.enum(WRITABLE_ENTITY_TYPES),
        id: idOrNameSchema,
        schema_id: z.string().optional(),
        auto_detect: z.boolean().optional(),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_delete_audit',
        sandbox: allowed.sandbox,
        entityType: params.entity_type,
        identifier: params.id,
      });

      const apiResult = await decisioningCatalogDeleteAudit({ ...params, sandbox: allowed.sandbox });
      return fromLabApi(apiResult, { sandbox: allowed.sandbox, entity_type: params.entity_type, id: params.id });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_delete_apply',
    {
      title: 'Delete one explicitly confirmed Decisioning catalog entity',
      description:
        'DESTRUCTIVE AND IRREVERSIBLE. Call only after lab_decisioning_catalog_delete_audit and explicit colleague ' +
        'confirmation of the exact entity_type, id, and expected_name. The server re-reads the entity and fails ' +
        'closed if it changed since audit. Never infer confirmation from a general cleanup request and never batch-delete.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z.enum(WRITABLE_ENTITY_TYPES),
        id: idOrNameSchema.describe('Exact id or display name returned by lab_decisioning_catalog_delete_audit'),
        expected_name: z.string().min(1).describe('Exact current name returned by lab_decisioning_catalog_delete_audit'),
        schema_id: z.string().optional(),
        auto_detect: z.boolean().optional(),
        preflight_id: z.string().length(64),
        confirmation: z.string().min(1),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await decisioningCatalogDeleteApply({ ...params, sandbox: allowed.sandbox });

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_delete_apply',
        sandbox: allowed.sandbox,
        entityType: params.entity_type,
        identifier: params.id,
        result: apiResult.ok ? 'ok' : 'error',
      });

      return fromLabApi(apiResult, { sandbox: allowed.sandbox, entity_type: params.entity_type, id: params.id });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_catalog_bulk_apply',
    {
      title: 'Bulk create/update Decisioning catalog entities (async)',
      description:
        `Resumable async bulk create or update for 1–${BULK_MAX} entities of one entity_type. DPS has no batch ` +
        'endpoint, so this runs sequentially in the background with retry on transient failures and per-item progress. ' +
        'action=create: each item carries item (full payload). action=update: each item carries id (or exact display ' +
        'name) plus patches (JSON Patch). No per-item preview/confirmation — this single call is the confirmation for ' +
        'the whole batch. Poll with lab_batch_job_status using the returned job_id. Never use for deletes.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z.enum(WRITABLE_ENTITY_TYPES),
        action: z.enum(['create', 'update']),
        items: z
          .array(
            z.object({
              id: idOrNameSchema.optional().describe('Required when action=update'),
              item: z.record(z.unknown()).optional().describe('Required when action=create'),
              patches: jsonPatchSchema.optional().describe('Required when action=update'),
            }),
          )
          .min(1)
          .max(BULK_MAX),
        schema_id: z.string().optional(),
        auto_detect: z.boolean().optional(),
        delay_ms: z.number().int().min(0).max(5000).optional().describe('Delay between items in ms (default 500)'),
        confirmed: z.literal(true).describe('True only after the colleague explicitly confirms this whole batch'),
      },
    },
    async (params) => {
      const keyId = getRequestKeyId();

      const rate = checkBatchJobRate(keyId);
      if (!rate.ok) {
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      if (params.action === 'create' && params.items.some((op) => !op.item)) {
        return toolError('Every item requires item when action=create.');
      }
      if (params.action === 'update' && params.items.some((op) => !op.id || !op.patches || op.patches.length === 0)) {
        return toolError('Every item requires id and a non-empty patches array when action=update.');
      }

      const job = await createBatchJob({
        jobType: 'decisioning_bulk_write',
        count: params.items.length,
        params: {
          sandbox: allowed.sandbox,
          entity_type: params.entity_type,
          action: params.action,
          items: params.items,
          schema_id: params.schema_id,
          auto_detect: params.auto_detect,
          delay_ms: params.delay_ms,
        },
      });

      writeAuditLog({
        keyId,
        tool: 'lab_decisioning_catalog_bulk_apply',
        sandbox: allowed.sandbox,
        entityType: params.entity_type,
        action: params.action,
        count: params.items.length,
        jobId: job.jobId,
      });

      setImmediate(() => {
        processDecisioningBulkJob(job.jobId, { keyId }).catch((err) => {
          console.error('[aep-lab-profile-mcp] decisioning bulk job failed:', job.jobId, err);
        });
      });

      return jsonResult({
        ok: true,
        job_id: job.jobId,
        job_type: 'decisioning_bulk_write',
        status: job.status,
        count: params.items.length,
        sandbox: allowed.sandbox,
        entity_type: params.entity_type,
        action: params.action,
        pollTool: 'lab_batch_job_status',
        note: 'Job runs in background. Poll lab_batch_job_status with job_id.',
      });
    },
  );
}
