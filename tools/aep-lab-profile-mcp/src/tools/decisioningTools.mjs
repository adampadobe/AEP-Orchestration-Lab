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
  decisioningSchemaExtendPreview,
  decisioningSchemaExtendApply,
  decisioningTagBulkPreview,
  decisioningTagBulkApply,
  audienceList,
  audienceAudit,
} from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { createBatchJob, getBatchJob } from '../batchJobStore.mjs';
import { processDecisioningBulkJob } from '../decisioningBulkProcessor.mjs';
import { processDecisioningTagBulkJob } from '../decisioningTagBulkProcessor.mjs';
import { checkBatchJobRate } from '../rateLimiter.mjs';
import {
  extractEcidFromProfileTable,
  resolveEventIdentities,
} from '../framework/eventIdentity.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const WRITABLE_ENTITY_TYPES = ['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements', 'tags'];
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

const SCHEMA_FIELD_TYPES = ['string', 'number', 'integer', 'boolean', 'date', 'date-time', 'string-array', 'number-array'];

const schemaFieldSchema = z.object({
  name: z.string().min(1).describe('Leaf field name, e.g. discountPct'),
  type: z.enum(SCHEMA_FIELD_TYPES),
  title: z.string().optional(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional().describe('Allowed values'),
});

const offerSelectorSchema = z
  .object({
    ids: z.array(z.string().min(1)).optional().describe('Explicit offer ids or exact names'),
    name_prefix: z.string().optional().describe('Matches offer-items by name prefix, e.g. "BlackFriday-"'),
    collection: z.string().optional().describe('Item-collection id or name — only works when the collection carries an explicit member-id list, not an opaque predicate'),
  })
  .describe('Exactly one of ids, name_prefix, or collection.');

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
            tags: { label: 'Tags', requires_x_schema_id: false, read: true, write: true, delete: true },
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
          clone: {
            tool: 'lab_decisioning_catalog_clone_preview',
            note: 'Duplicates any entity type with recursive find/replace substitutions, then hands off to the existing change_apply — no separate apply tool.',
          },
          compound_builders: {
            tools: ['lab_decisioning_ranking_formula_preview', 'lab_decisioning_selection_strategy_preview'],
            note: 'Build the correct raw DPS payload from simpler params, then hand off to the existing change_apply. selection_strategy_preview enforces the same offer-vs-strategy-level eligibility guard as lab_decisioning_attach_offer_eligibility_preview.',
          },
          offer_eligibility: {
            tool: 'lab_decisioning_attach_offer_eligibility_preview',
            note: 'Attaches or detaches offer-level eligibility, from an eligibility rule or directly from an RT-CDP audience (auto-wrapped into a reused-by-name eligibility rule — see audience_to_eligibility_rule below). Requires the caller to have explicitly stated offer-level vs strategy-level — refuses and returns the exact question otherwise.',
          },
          audience_to_eligibility_rule: {
            tools: ['lab_decisioning_attach_offer_eligibility_preview', 'lab_decisioning_selection_strategy_preview'],
            note: 'audience_id_or_name on either tool auto-wraps an RT-CDP audience into an "Audience: <name>" eligibility rule (PQL segment-membership condition), reusing it by name on repeat calls rather than duplicating. If no such rule exists yet, returns a ready-to-run lab_decisioning_catalog_change_preview payload to create it first — never creates it silently. The PQL shape is Adobe\'s documented pattern, not yet confirmed live in this codebase; verify the created rule. Requires the same user-generated MCP key (X-AEP-Lab-Mcp-Key) as lab_audience_list/lab_audience_audit — 401s under pure Adobe IMS Coworker auth.',
          },
          schema_extend: {
            tools: ['lab_decisioning_schema_extend_preview', 'lab_decisioning_schema_extend_apply'],
            note: 'Add-only tenant field-group extension for the offer-items schema (Schema Registry PATCH) — never removes or retypes existing fields. Apply gate is preview_hash + confirmed:true, not a confirmation phrase.',
          },
          tag_bulk: {
            tools: ['lab_decisioning_tag_bulk_preview', 'lab_decisioning_tag_bulk_apply'],
            note: 'Resumable async attach/detach/replace of 1-20 tags across up to 200 offer-items. itemTags write format is auto-detected against the real first write per sandbox and cached — see resolved_tag_format in the preview output. Poll with lab_batch_job_status; resume_token = job_id.',
          },
          id_or_name_resolution: 'Every write/delete/get tool accepts an exact DPS id or an exact display name; a name matching more than one entity fails with a disambiguation list instead of guessing.',
          audience_discovery: 'Use lab_audience_list / lab_audience_audit (Audiences context) for RT-CDP audiences — not duplicated here.',
          credentials: 'Server-side Adobe IMS token; never accepted as a tool argument.',
          known_gaps: [
            'offer_selector.collection only works when the item-collection happens to carry an explicit member-id list — most collections use an opaque predicate instead; use ids or name_prefix in that case.',
          ],
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
          .enum(['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements', 'tags'])
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
        entity_type: z.enum(['offer-items', 'item-collections', 'selection-strategies', 'offer-rules', 'ranking-formulas', 'placements', 'tags']),
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

  const SERVER_ASSIGNED_FIELDS = ['id', 'etag', 'created', 'modified', 'createdBy', 'lastModifiedBy', 'instanceId', 'sandboxId', 'createdByClientId', 'lastModifiedByClientId'];

  function applySubstitutions(value, substitutions) {
    if (!substitutions || Object.keys(substitutions).length === 0) return value;
    if (typeof value === 'string') {
      let result = value;
      for (const [find, replace] of Object.entries(substitutions)) {
        result = result.split(find).join(replace);
      }
      return result;
    }
    if (Array.isArray(value)) return value.map((v) => applySubstitutions(v, substitutions));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applySubstitutions(v, substitutions)]));
    }
    return value;
  }

  mcpServer.registerTool(
    'lab_decisioning_catalog_clone_preview',
    {
      title: 'Preview cloning a Decisioning catalog entity',
      description:
        'Fetches one entity by id or name, strips server-assigned fields, sets new_name, applies recursive literal ' +
        'find/replace substitutions across every remaining string value (covers nested condition/segmentModel/expression ' +
        'for rules and formulas), and returns the same preflight_id/required_confirmation shape as ' +
        'lab_decisioning_catalog_change_preview action=create. Apply with the existing lab_decisioning_catalog_change_apply ' +
        '(action=create) — there is no separate clone-apply tool. Works across all seven entity types.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        entity_type: z.enum(WRITABLE_ENTITY_TYPES),
        source_id_or_name: idOrNameSchema,
        new_name: z.string().min(1),
        description: z.string().optional().describe('Override description; omit to keep the source description (with substitutions applied)'),
        substitutions: z.record(z.string()).optional().describe('Literal (not regex), case-sensitive find/replace pairs applied recursively, e.g. {"C3": "C4"}'),
        schema_id: z.string().optional().describe('Override x-schema-id for offer-items'),
        auto_detect: z.boolean().optional(),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const sourceResult = await decisioningCatalogGet({
        sandbox: allowed.sandbox,
        entity_type: params.entity_type,
        id: params.source_id_or_name,
        schema_id: params.schema_id,
        auto_detect: params.auto_detect,
      });
      if (!sourceResult.ok) {
        return fromLabApi(sourceResult, { sandbox: allowed.sandbox, entity_type: params.entity_type });
      }

      const raw = sourceResult.data?.raw;
      if (!raw || typeof raw !== 'object') {
        return toolError('Source entity has no raw payload to clone.');
      }

      const stripped = Object.fromEntries(Object.entries(raw).filter(([key]) => !SERVER_ASSIGNED_FIELDS.includes(key)));
      const substituted = applySubstitutions(stripped, params.substitutions);
      const item = { ...substituted, name: params.new_name, ...(params.description !== undefined ? { description: params.description } : {}) };

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_catalog_clone_preview',
        sandbox: allowed.sandbox,
        entityType: params.entity_type,
        identifier: params.source_id_or_name,
      });

      const apiResult = await decisioningCatalogChangePreview({ entity_type: params.entity_type, action: 'create', item });
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        entity_type: params.entity_type,
        cloned_from: params.source_id_or_name,
        applyTool: 'lab_decisioning_catalog_change_apply',
      });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_ranking_formula_preview',
    {
      title: 'Preview creating a ranking formula',
      description:
        'Builds the raw DPS ranking-formula payload (returnType/expression/definedOn — confirmed live against sandbox ' +
        'apalmer) from simpler params and returns the same shape as lab_decisioning_catalog_change_preview action=create. ' +
        'Apply with lab_decisioning_catalog_change_apply.',
      inputSchema: {
        name: z.string().min(1),
        formula_type: z.enum(['static_priority', 'custom_field', 'recency_priority_hybrid', 'custom_pql']),
        custom_field_name: z.string().optional().describe('Required for formula_type=custom_field'),
        custom_pql: z.string().optional().describe('Required for formula_type=custom_pql — full PQL expression'),
        description: z.string().optional(),
      },
    },
    async (params) => {
      let value;
      if (params.formula_type === 'static_priority') {
        value = 'if(offer.rank.priority.isNotNull(), offer.rank.priority, 0)';
      } else if (params.formula_type === 'custom_field') {
        if (!params.custom_field_name) return toolError('custom_field_name is required for formula_type=custom_field.');
        value = `offer.${params.custom_field_name}`;
      } else if (params.formula_type === 'recency_priority_hybrid') {
        value = 'if(offer.rank.priority.isNotNull(), offer.rank.priority, 0) * daysSince(offer.modified)';
      } else {
        if (!params.custom_pql) return toolError('custom_pql is required for formula_type=custom_pql.');
        value = params.custom_pql;
      }

      const item = {
        name: params.name,
        description: params.description || '',
        exdFunction: true,
        returnType: { type: 'integer' },
        expression: { type: 'PQL', format: 'pql/text', value },
        definedOn: { offer: { schema: { altId: '_experience.offer-management.personalized-offer', version: '0' } } },
      };

      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_decisioning_ranking_formula_preview', formulaType: params.formula_type });

      const apiResult = await decisioningCatalogChangePreview({ entity_type: 'ranking-formulas', action: 'create', item });
      return fromLabApi(apiResult, { entity_type: 'ranking-formulas', applyTool: 'lab_decisioning_catalog_change_apply' });
    },
  );

  const AUDIENCE_RULE_PREFIX = 'Audience: ';

  /** Id-or-name resolution for RT-CDP audiences, mirroring resolveEntityIdOrName's shape (audiences live behind a separate MCP-key-scoped API, not the sandbox-allowlisted decisioning one). */
  async function resolveAudienceIdOrName(sandbox, idOrName) {
    const direct = await audienceAudit({ sandbox, audience_id: idOrName });
    if (direct.ok) {
      const audience = direct.data?.audience || {};
      return { ok: true, id: audience.audienceId || audience.id, name: audience.name };
    }
    if (direct.status !== 404 && direct.status !== 400) return direct;

    const listResult = await audienceList({ sandbox, name: idOrName, limit: 100 });
    if (!listResult.ok) return listResult;
    const needle = String(idOrName).toLowerCase();
    const matches = (listResult.data?.audiences || []).filter((a) => String(a.name || '').toLowerCase() === needle);
    if (matches.length === 0) {
      return { ok: false, status: 404, error: `No audience found with id or exact name "${idOrName}".` };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        status: 409,
        error: `Name "${idOrName}" matches ${matches.length} audiences — specify the exact id.`,
        matches: matches.map((m) => ({ id: m.audienceId || m.id, name: m.name })),
      };
    }
    return { ok: true, id: matches[0].audienceId || matches[0].id, name: matches[0].name };
  }

  /**
   * Resolves eligibility_rule_id_or_name OR audience_id_or_name (mutually exclusive) to a rule id
   * for the offer-level / strategy-level eligibility tools. For an audience, reuses an existing
   * "Audience: <name>" eligibility rule by exact name if one exists (never duplicates on repeat
   * calls); otherwise returns a ready-to-run change_preview so the caller creates the rule first
   * through the normal governed path — this helper never writes anything itself.
   *
   * PQL shape note: the segmentMembership condition below (and wrapping it the same
   * {type:'PQL', format:'pql/text', value} object confirmed live for ranking-formulas'
   * expression) is Adobe's documented pattern for gating on RT-CDP segment membership, but it has
   * not been confirmed live against this sandbox for an offer-rule's condition specifically —
   * verify the created rule with lab_decisioning_catalog_get before relying on it in a demo.
   */
  async function resolveEligibilityRuleId(sandbox, { eligibilityRuleIdOrName, audienceIdOrName }) {
    if (eligibilityRuleIdOrName && audienceIdOrName) {
      return { ok: false, mcpResponse: toolError('Specify only one of eligibility_rule_id_or_name or audience_id_or_name.') };
    }
    if (eligibilityRuleIdOrName) {
      const ruleResult = await decisioningCatalogGet({ sandbox, entity_type: 'offer-rules', id: eligibilityRuleIdOrName });
      if (!ruleResult.ok) return { ok: false, mcpResponse: fromLabApi(ruleResult, { sandbox, entity_type: 'offer-rules' }) };
      return { ok: true, ruleId: ruleResult.data?.id };
    }
    if (!audienceIdOrName) {
      return { ok: true, ruleId: undefined };
    }

    const audience = await resolveAudienceIdOrName(sandbox, audienceIdOrName);
    if (!audience.ok) return { ok: false, mcpResponse: fromLabApi(audience, { sandbox }) };

    const ruleName = `${AUDIENCE_RULE_PREFIX}${audience.name}`;
    const listResult = await decisioningCatalogList({ sandbox, entity_type: 'offer-rules', limit: 50 });
    if (!listResult.ok) return { ok: false, mcpResponse: fromLabApi(listResult, { sandbox, entity_type: 'offer-rules' }) };
    const needle = ruleName.toLowerCase();
    const matches = (listResult.data?.items || []).filter((r) => String(r.name || '').toLowerCase() === needle);
    if (matches.length > 1) {
      return {
        ok: false,
        mcpResponse: toolError(`"${ruleName}" matches ${matches.length} eligibility rules — specify eligibility_rule_id_or_name explicitly.`, {
          matches: matches.map((m) => ({ id: m.id, name: m.name })),
        }),
      };
    }
    if (matches.length === 1) {
      return { ok: true, ruleId: matches[0].id };
    }

    const item = {
      name: ruleName,
      description: `Auto-generated to gate eligibility on RT-CDP audience "${audience.name}" (${audience.id}). Reused by name on repeat calls.`,
      condition: { type: 'PQL', format: 'pql/text', value: `segmentMembership.ups["${audience.id}"].status == "existing"` },
    };
    const previewResult = await decisioningCatalogChangePreview({ entity_type: 'offer-rules', action: 'create', item });
    if (!previewResult.ok) return { ok: false, mcpResponse: fromLabApi(previewResult, { sandbox, entity_type: 'offer-rules' }) };

    return {
      ok: false,
      mcpResponse: jsonResult({
        ok: true,
        sandbox,
        needs_create: true,
        audience: { id: audience.id, name: audience.name },
        note:
          `No eligibility rule named "${ruleName}" exists yet. Call lab_decisioning_catalog_change_apply with the ` +
          'exact item/preflight_id/confirmation below to create it (PQL segment-membership condition — see this ' +
          'tool\'s description for the confirmed-live caveat), then re-call this tool with the same audience.',
        create: previewResult.data,
        applyTool: 'lab_decisioning_catalog_change_apply',
      }),
    };
  }

  mcpServer.registerTool(
    'lab_decisioning_selection_strategy_preview',
    {
      title: 'Preview creating a selection strategy',
      description:
        'STOP AND CHECK BEFORE setting eligibility_rule_id_or_name — this gates the WHOLE collection under one rule ' +
        '(strategy-level eligibility). The alternative, offer-level eligibility via ' +
        'lab_decisioning_attach_offer_eligibility_preview, gates each offer individually. If the colleague only named a ' +
        'scope ("target audience X for these offers"), that does not mean they chose strategy-level — ask which pattern ' +
        'they want before setting user_explicitly_chose_strategy_level:true. Builds the raw ' +
        '{rank, optionSelection, profileConstraint} payload (confirmed live) from simpler params and returns the same ' +
        'shape as lab_decisioning_catalog_change_preview action=create. Apply with lab_decisioning_catalog_change_apply. ' +
        'audience_id_or_name auto-wraps an RT-CDP audience into a reused-by-name "Audience: <name>" eligibility rule ' +
        '(PQL segment-membership condition — not yet confirmed live, verify the created rule) instead of requiring a ' +
        'manually authored rule; mutually exclusive with eligibility_rule_id_or_name.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        name: z.string().min(1),
        collection_id_or_name: idOrNameSchema,
        ranking_formula_id_or_name: z.string().optional().describe('Omit for static priority ordering'),
        priority: z.number().int().min(1).optional().describe('Static priority score (1 = highest); default 1'),
        eligibility_rule_id_or_name: z.string().optional().describe('Gates the WHOLE collection under one rule — see the ask-first guidance above. Mutually exclusive with audience_id_or_name.'),
        audience_id_or_name: z.string().optional().describe('RT-CDP audience id or exact name — auto-wraps into a reused-by-name eligibility rule. Mutually exclusive with eligibility_rule_id_or_name.'),
        user_explicitly_chose_strategy_level: z
          .boolean()
          .optional()
          .default(false)
          .describe('REQUIRED true if eligibility_rule_id_or_name or audience_id_or_name is set and the colleague already said "strategy level" / "one rule for the whole collection" in this conversation'),
      },
    },
    async (params) => {
      if ((params.eligibility_rule_id_or_name || params.audience_id_or_name) && !params.user_explicitly_chose_strategy_level) {
        return toolError(
          'Refusing to guess the eligibility attach point. Ask the colleague: "Do you want the eligibility at the ' +
          'OFFER level (each offer carries its own — allows differentiated targeting later) or at the STRATEGY level ' +
          '(one rule gates the whole collection — simpler)?" Retry with user_explicitly_chose_strategy_level:true only ' +
          'after they choose strategy-level; otherwise use lab_decisioning_attach_offer_eligibility_preview.',
        );
      }
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let profileConstraint = { profileConstraintType: 'none' };
      if (params.eligibility_rule_id_or_name || params.audience_id_or_name) {
        const resolved = await resolveEligibilityRuleId(allowed.sandbox, {
          eligibilityRuleIdOrName: params.eligibility_rule_id_or_name,
          audienceIdOrName: params.audience_id_or_name,
        });
        if (!resolved.ok) return resolved.mcpResponse;
        profileConstraint = { profileConstraintType: 'eligibilityRule', eligibilityRule: resolved.ruleId };
      }

      const collectionResult = await decisioningCatalogGet({ sandbox: allowed.sandbox, entity_type: 'item-collections', id: params.collection_id_or_name });
      if (!collectionResult.ok) return fromLabApi(collectionResult, { sandbox: allowed.sandbox, entity_type: 'item-collections' });
      const collectionId = collectionResult.data?.id;

      let rankingFunctionId;
      if (params.ranking_formula_id_or_name) {
        const rfResult = await decisioningCatalogGet({ sandbox: allowed.sandbox, entity_type: 'ranking-formulas', id: params.ranking_formula_id_or_name });
        if (!rfResult.ok) return fromLabApi(rfResult, { sandbox: allowed.sandbox, entity_type: 'ranking-formulas' });
        rankingFunctionId = rfResult.data?.id;
      }

      const item = {
        name: params.name,
        rank: {
          priority: params.priority || 1,
          order: rankingFunctionId ? { orderEvaluationType: 'scoringFunction', function: rankingFunctionId } : { orderEvaluationType: 'static' },
        },
        profileConstraint,
        optionSelection: { filter: collectionId },
      };

      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_decisioning_selection_strategy_preview', sandbox: allowed.sandbox });

      const apiResult = await decisioningCatalogChangePreview({ entity_type: 'selection-strategies', action: 'create', item });
      return fromLabApi(apiResult, { sandbox: allowed.sandbox, entity_type: 'selection-strategies', applyTool: 'lab_decisioning_catalog_change_apply' });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_attach_offer_eligibility_preview',
    {
      title: 'Preview attaching or detaching offer-level eligibility',
      description:
        'STOP AND CHECK BEFORE calling with eligibility_rule_id_or_name — verify the colleague has EXPLICITLY chosen ' +
        'offer-level (this tool) over strategy-level (lab_decisioning_selection_strategy_preview\'s eligibility_rule_id_or_name). ' +
        'If they only said "target audience X for these offers", they have NOT chosen — that phrase names the scope, not ' +
        'the attach point. Ask first, then retry with user_explicitly_chose_offer_level:true only after they say offer-level. ' +
        'Omit both eligibility_rule_id_or_name and audience_id_or_name to detach (reset to no constraint). Builds a ' +
        'JSON Patch on the offer-item\'s itemConstraints (profileConstraintType + eligibilityRule — confirmed live) and ' +
        'returns the same shape as lab_decisioning_catalog_change_preview action=update. Apply with ' +
        'lab_decisioning_catalog_change_apply. The referenced rule must have exdRule:true (lab_decisioning_catalog_change_apply ' +
        'defaults this on create). audience_id_or_name auto-wraps an RT-CDP audience into a reused-by-name ' +
        '"Audience: <name>" eligibility rule (PQL segment-membership condition — not yet confirmed live, verify the ' +
        'created rule) instead of requiring a manually authored rule; mutually exclusive with eligibility_rule_id_or_name.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        offer_id_or_name: idOrNameSchema,
        eligibility_rule_id_or_name: z.string().optional().describe('Omit to detach any existing offer-level eligibility. Mutually exclusive with audience_id_or_name.'),
        audience_id_or_name: z.string().optional().describe('RT-CDP audience id or exact name — auto-wraps into a reused-by-name eligibility rule. Mutually exclusive with eligibility_rule_id_or_name.'),
        user_explicitly_chose_offer_level: z
          .boolean()
          .optional()
          .default(false)
          .describe('REQUIRED true if the colleague already said "offer level" / "per-offer" / "attach to each offer" in this conversation'),
      },
    },
    async (params) => {
      if ((params.eligibility_rule_id_or_name || params.audience_id_or_name) && !params.user_explicitly_chose_offer_level) {
        return toolError(
          'Refusing to guess the eligibility attach point. Ask the colleague: "Do you want the eligibility at the ' +
          'OFFER level (each offer carries its own — allows differentiated targeting later) or at the STRATEGY level ' +
          '(one rule gates the whole collection — simpler)?" Retry with user_explicitly_chose_offer_level:true only ' +
          'after they choose offer-level; otherwise use lab_decisioning_selection_strategy_preview.',
        );
      }
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let patchValue = { profileConstraintType: 'none' };
      if (params.eligibility_rule_id_or_name || params.audience_id_or_name) {
        const resolved = await resolveEligibilityRuleId(allowed.sandbox, {
          eligibilityRuleIdOrName: params.eligibility_rule_id_or_name,
          audienceIdOrName: params.audience_id_or_name,
        });
        if (!resolved.ok) return resolved.mcpResponse;
        patchValue = { profileConstraintType: 'eligibilityRule', eligibilityRule: resolved.ruleId };
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_attach_offer_eligibility_preview',
        sandbox: allowed.sandbox,
        identifier: params.offer_id_or_name,
      });

      const apiResult = await decisioningCatalogChangePreview({
        entity_type: 'offer-items',
        action: 'update',
        id: params.offer_id_or_name,
        patches: [{ op: 'add', path: '/_experience/decisioning/decisionitem/itemConstraints', value: patchValue }],
      });
      return fromLabApi(apiResult, { sandbox: allowed.sandbox, entity_type: 'offer-items', applyTool: 'lab_decisioning_catalog_change_apply' });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_schema_extend_preview',
    {
      title: 'Preview add-only fields on the Decisioning offer-items schema',
      description:
        'Diffs 1-50 proposed fields against the offer-items schema\'s tenant field group (Schema Registry) — never ' +
        'removes or retypes an existing field. A requested field that already exists with a different shape is ' +
        'reported as a conflict and never included in json_patch. Returns preview_hash for ' +
        'lab_decisioning_schema_extend_apply.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        schema_id: z.string().optional().describe('Override decisioning schema $id; auto-detected from Firestore/registry when omitted'),
        field_group_id: z.string().optional().describe('Override the tenant field group $id; auto-resolved from the schema\'s allOf composition when omitted'),
        fields: z.array(schemaFieldSchema).min(1).max(50),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_schema_extend_preview',
        sandbox: allowed.sandbox,
        fieldCount: params.fields.length,
      });

      const apiResult = await decisioningSchemaExtendPreview({ ...params, sandbox: allowed.sandbox });
      return fromLabApi(apiResult, { sandbox: allowed.sandbox, applyTool: 'lab_decisioning_schema_extend_apply' });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_schema_extend_apply',
    {
      title: 'Submit a previewed add-only schema field extension',
      description:
        'Submits exactly one previewed field-group PATCH with no automatic retry. Requires the same sandbox/schema_id/' +
        'field_group_id/fields as lab_decisioning_schema_extend_preview, plus its preview_hash and confirmed:true. ' +
        'The server re-reads the field group before patching; if it changed since preview, returns error:"schema_drifted" ' +
        '— re-run the preview. Only op:add is ever issued.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        schema_id: z.string().optional(),
        field_group_id: z.string().optional(),
        fields: z.array(schemaFieldSchema).min(1).max(50),
        preview_hash: z.string().length(64),
        confirmed: z.literal(true).describe('True only after the colleague explicitly confirms the to_add list from the preview'),
      },
    },
    async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await decisioningSchemaExtendApply({ ...params, sandbox: allowed.sandbox });

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_decisioning_schema_extend_apply',
        sandbox: allowed.sandbox,
        fieldCount: params.fields.length,
        result: apiResult.ok ? 'ok' : 'error',
      });

      return fromLabApi(apiResult, { sandbox: allowed.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_tag_bulk_preview',
    {
      title: 'Preview a bulk tag attach/detach/replace across offer-items',
      description:
        'Resolves 1-20 tags (id or exact name) and an offer_selector (ids, name_prefix, or collection) against up to ' +
        '200 offer-items, and returns per-offer current_tags/after_tags plus a no_op list for offers already in the ' +
        'desired state. action=replace overwrites each offer\'s entire tag set to exactly the given tags (unlike ' +
        'attach/detach, which merge with or subtract from the existing set). resolved_tag_format reflects the itemTags ' +
        'write format cached for this sandbox from a prior apply, or null if unresolved — lab_decisioning_tag_bulk_apply ' +
        'auto-detects it against the real first write in that case. Returns preview_hash for lab_decisioning_tag_bulk_apply.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        action: z.enum(['attach', 'detach', 'replace']),
        tags: z.array(z.string().min(1)).min(1).max(20).describe('Tag id or exact name — ambiguous names fail with a disambiguation list'),
        offer_selector: offerSelectorSchema,
        schema_id: z.string().optional().describe('Override x-schema-id for offer-items'),
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
        tool: 'lab_decisioning_tag_bulk_preview',
        sandbox: allowed.sandbox,
        action: params.action,
        tagCount: params.tags.length,
      });

      const apiResult = await decisioningTagBulkPreview({ ...params, sandbox: allowed.sandbox });
      return fromLabApi(apiResult, { sandbox: allowed.sandbox, action: params.action, applyTool: 'lab_decisioning_tag_bulk_apply' });
    },
  );

  mcpServer.registerTool(
    'lab_decisioning_tag_bulk_apply',
    {
      title: 'Apply a previewed bulk tag attach/detach (async)',
      description:
        'Re-verifies the cached lab_decisioning_tag_bulk_preview plan (fails closed as preview_hash-stale if tags or ' +
        'matched offers changed since preview), then runs the attach/detach sequentially in the background — DPS has ' +
        'no batch endpoint. Each offer is re-read immediately before its own PATCH, so per-offer drift since preview ' +
        'is also caught; already-satisfied offers are no_ops, not failures. Poll with lab_batch_job_status using the ' +
        'returned job_id. Pass that same job_id back as resume_token to continue an interrupted batch instead of ' +
        'restarting it from the first offer.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        preview_hash: z.string().length(64),
        confirmed: z.literal(true).describe('True only after the colleague explicitly confirms the whole batch from the preview'),
        resume_token: z.string().uuid().optional().describe('job_id from a prior lab_decisioning_tag_bulk_apply call to resume instead of restarting'),
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

      if (params.resume_token) {
        const existing = await getBatchJob(params.resume_token);
        if (!existing) return toolError(`Batch job not found: ${params.resume_token}`);
        if (existing.jobType !== 'decisioning_tag_bulk_write') {
          return toolError(`${params.resume_token} is not a decisioning_tag_bulk_write job.`);
        }
        if (existing.params?.preview_hash !== params.preview_hash) {
          return toolError('preview_hash does not match the job being resumed — run lab_decisioning_tag_bulk_preview again.');
        }
        if (existing.status === 'running') {
          return toolError(`Job ${params.resume_token} is already running.`);
        }

        writeAuditLog({ keyId, tool: 'lab_decisioning_tag_bulk_apply', sandbox: allowed.sandbox, resumedJobId: params.resume_token });

        setImmediate(() => {
          processDecisioningTagBulkJob(params.resume_token, { keyId }).catch((err) => {
            console.error('[aep-lab-profile-mcp] decisioning tag bulk job resume failed:', params.resume_token, err);
          });
        });

        return jsonResult({
          ok: true,
          job_id: params.resume_token,
          resume_token: params.resume_token,
          job_type: 'decisioning_tag_bulk_write',
          status: 'running',
          sandbox: allowed.sandbox,
          pollTool: 'lab_batch_job_status',
          note: 'Resuming from the first unprocessed offer. Poll lab_batch_job_status with job_id.',
        });
      }

      const verifyResult = await decisioningTagBulkApply({ sandbox: allowed.sandbox, preview_hash: params.preview_hash, confirmed: params.confirmed });
      if (!verifyResult.ok) {
        return fromLabApi(verifyResult, { sandbox: allowed.sandbox });
      }

      const plan = verifyResult.data;
      const job = await createBatchJob({
        jobType: 'decisioning_tag_bulk_write',
        count: plan.offer_ids.length,
        params: {
          sandbox: allowed.sandbox,
          action: plan.action,
          tags: plan.resolved_tags,
          offerIds: plan.offer_ids,
          schema_id: plan.schema_id,
          auto_detect: plan.auto_detect,
          preview_hash: params.preview_hash,
        },
      });

      writeAuditLog({
        keyId,
        tool: 'lab_decisioning_tag_bulk_apply',
        sandbox: allowed.sandbox,
        action: plan.action,
        count: plan.offer_ids.length,
        jobId: job.jobId,
      });

      setImmediate(() => {
        processDecisioningTagBulkJob(job.jobId, { keyId }).catch((err) => {
          console.error('[aep-lab-profile-mcp] decisioning tag bulk job failed:', job.jobId, err);
        });
      });

      return jsonResult({
        ok: true,
        job_id: job.jobId,
        resume_token: job.jobId,
        job_type: 'decisioning_tag_bulk_write',
        status: job.status,
        count: plan.offer_ids.length,
        sandbox: allowed.sandbox,
        action: plan.action,
        pollTool: 'lab_batch_job_status',
        note: 'Job runs in background. Poll lab_batch_job_status with job_id. Pass job_id back as resume_token if interrupted.',
      });
    },
  );
}
